import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import { aprovarFatorAcidentario, cadastrarFatorAcidentario, registrarEstabelecimentoDaLotacao } from "../../modules/m33-folha/encargos-servico";
import { instanteCivilBr } from "../../packages/datas/index";

/**
 * PORTA — O FATOR ACIDENTÁRIO DE PREVENÇÃO (V24). Cadastro e aprovação do FAP de cada CNPJ, por ano, e
 * (V25) o estabelecimento (CNPJ) de cada lotação, que diz qual FAP vale para quem está nela.
 * As regras (intervalo, casas, quem aprova) são do M33; a mensagem dele sobe como veio.
 */

export interface FapDaTela {
  readonly id: string;
  readonly cnpj: string;
  readonly ano: number;
  readonly fator: string;
  readonly fonte: string;
  readonly cadastro: string;
  readonly aprovacao: string | null;
  /** É o que a apuração usa: o aprovado mais recente daquele CNPJ no ano. */
  readonly vigente: boolean;
}

export interface EstabelecimentoDaTela {
  readonly id: string;
  readonly lotacao: string;
  readonly cnpj: string;
  readonly desde: string;
  readonly fundamento: string;
  readonly cadastro: string;
}

export interface LotacaoDaTela {
  readonly id: string;
  readonly rotulo: string;
}

export async function lerFaps(): Promise<{
  readonly cnpjDoEnte: string | null;
  readonly faps: readonly FapDaTela[];
  readonly estabelecimentos: readonly EstabelecimentoDaTela[];
  readonly lotacoes: readonly LotacaoDaTela[];
}> {
  await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  const [ente, linhas, registros, lotacoes] = await Promise.all([
    cliente().enteConfig.findFirst({ select: { cnpj: true } }),
    cliente().fatorAcidentarioDePrevencao.findMany({
      orderBy: [{ ano: "desc" }, { criadoEm: "desc" }],
      select: { id: true, cnpj: true, ano: true, fator: true, fonte: true, criadoEm: true, criadoPor: true, aprovacao: { select: { criadoEm: true, criadoPor: true } } },
    }),
    cliente().estabelecimentoDaLotacao.findMany({
      orderBy: [{ competenciaInicio: "desc" }, { criadoEm: "desc" }],
      select: { id: true, cnpj: true, competenciaInicio: true, fundamento: true, criadoEm: true, criadoPor: true, lotacao: { select: { codigo: true, nome: true } } },
    }),
    cliente().lotacao.findMany({ where: { dataExtincao: null }, orderBy: { nome: "asc" }, select: { id: true, codigo: true, nome: true } }),
  ]);
  const cnpjDoEnte = ente?.cnpj ?? null;
  // O vigente de cada CNPJ em cada ano: o primeiro aprovado na ordem (mais recente primeiro).
  const vistos = new Set<string>();
  return {
    cnpjDoEnte,
    faps: linhas.map((f) => {
      const chave = `${f.cnpj} ${String(f.ano)}`;
      const vigente = f.aprovacao !== null && !vistos.has(chave);
      if (vigente) vistos.add(chave);
      return {
        id: f.id,
        cnpj: f.cnpj,
        ano: f.ano,
        fator: f.fator.toFixed(4).replace(".", ","),
        fonte: f.fonte,
        cadastro: `${f.criadoPor}, ${instanteCivilBr(f.criadoEm)}`,
        aprovacao: f.aprovacao === null ? null : `${f.aprovacao.criadoPor}, ${instanteCivilBr(f.aprovacao.criadoEm)}`,
        vigente,
      };
    }),
    estabelecimentos: registros.map((r) => ({
      id: r.id,
      lotacao: `${r.lotacao.codigo} — ${r.lotacao.nome}`,
      cnpj: r.cnpj,
      desde: `${r.competenciaInicio.slice(5, 7)}/${r.competenciaInicio.slice(0, 4)}`,
      fundamento: r.fundamento,
      cadastro: `${r.criadoPor}, ${instanteCivilBr(r.criadoEm)}`,
    })),
    lotacoes: lotacoes.map((l) => ({ id: l.id, rotulo: `${l.codigo} — ${l.nome}` })),
  };
}

export async function registrarFap(input: { readonly cnpj: string; readonly ano: number; readonly fator: string; readonly fonte: string }): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_ENCARGO_DA_FOLHA", (criadoPor) => cadastrarFatorAcidentario(cliente(), { ...input, criadoPor }));
  return r.fatorId;
}

export async function registrarEstabelecimento(input: { readonly lotacaoId: string; readonly cnpj: string; readonly competenciaInicio: string; readonly fundamento: string }): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_ENCARGO_DA_FOLHA", (criadoPor) => registrarEstabelecimentoDaLotacao(cliente(), { ...input, criadoPor }));
  return r.registroId;
}

export async function aprovarFap(fatorId: string): Promise<string> {
  const r = await comEscritaAutenticada("APROVAR_ENCARGO_DA_FOLHA", (criadoPor) => aprovarFatorAcidentario(cliente(), { fatorId, criadoPor }));
  return r.aprovacaoId;
}
