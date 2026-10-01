import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import { aprovarFatorAcidentario, cadastrarFatorAcidentario } from "../../modules/m33-folha/encargos-servico";
import { instanteCivilBr } from "../../packages/datas/index";

/**
 * PORTA — O FATOR ACIDENTÁRIO DE PREVENÇÃO (V24). Cadastro e aprovação do FAP do CNPJ do ente, por ano.
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
  /** É o que a apuração usa: o aprovado mais recente do CNPJ do ente no ano. */
  readonly vigente: boolean;
}

export async function lerFaps(): Promise<{ readonly cnpjDoEnte: string | null; readonly faps: readonly FapDaTela[] }> {
  await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  const [ente, linhas] = await Promise.all([
    cliente().enteConfig.findFirst({ select: { cnpj: true } }),
    cliente().fatorAcidentarioDePrevencao.findMany({
      orderBy: [{ ano: "desc" }, { criadoEm: "desc" }],
      select: { id: true, cnpj: true, ano: true, fator: true, fonte: true, criadoEm: true, criadoPor: true, aprovacao: { select: { criadoEm: true, criadoPor: true } } },
    }),
  ]);
  const cnpjDoEnte = ente?.cnpj ?? null;
  // O vigente de cada ano: o primeiro aprovado na ordem (mais recente primeiro), do CNPJ do ente.
  const vistos = new Set<number>();
  return {
    cnpjDoEnte,
    faps: linhas.map((f) => {
      const vigente = f.aprovacao !== null && f.cnpj === cnpjDoEnte && !vistos.has(f.ano);
      if (vigente) vistos.add(f.ano);
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
  };
}

export async function registrarFap(input: { readonly cnpj: string; readonly ano: number; readonly fator: string; readonly fonte: string }): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_ENCARGO_DA_FOLHA", (criadoPor) => cadastrarFatorAcidentario(cliente(), { ...input, criadoPor }));
  return r.fatorId;
}

export async function aprovarFap(fatorId: string): Promise<string> {
  const r = await comEscritaAutenticada("APROVAR_ENCARGO_DA_FOLHA", (criadoPor) => aprovarFatorAcidentario(cliente(), { fatorId, criadoPor }));
  return r.aprovacaoId;
}
