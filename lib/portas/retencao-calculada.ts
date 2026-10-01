import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import {
  avaliarRetencoesDoPagamento,
  registrarPerfilFiscal,
  tabelasVigentes,
  type DadosFiscaisDaOperacao,
} from "../../modules/m07-extraorcamentario/retencao-calculada";
import { normalizarDocumento } from "../../packages/documento/index";
import { Decimal, toMoney } from "../../packages/contracts/index";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index";

export type { DadosFiscaisDaOperacao } from "../../modules/m07-extraorcamentario/retencao-calculada";

/**
 * PORTA — RETENÇÃO NA FONTE CALCULADA (V24): as opções que o formulário de pagamento oferece, a prévia
 * do cálculo e o perfil fiscal do fornecedor. Nenhuma regra mora aqui: o cálculo é do M07, e a
 * mensagem dele sobe como veio.
 */

/**
 * Coluna só de DATA (`@db.Date`): o Prisma a devolve à meia-noite UTC, e converter para o fuso do ente
 * mostraria o dia anterior. Lida no eixo UTC, que é o da coluna.
 */
const dataDaColuna = (d: Date): string => diaCivilBr(d, "UTC");

const pctBr = (s: string): string => `${new Decimal(s).times(100).toDecimalPlaces(4).toString().replace(".", ",")}%`;

export interface OpcoesDaRetencao {
  readonly naturezasIR: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly servicosINSS: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly basesMinimas: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly itensISS: readonly { readonly subitem: string; readonly rotulo: string }[];
  readonly municipioDoEnte: string | null;
  /** O que falta carregar, dito em frase; vazio quando tudo está carregado. */
  readonly faltas: readonly string[];
}

/** As tabelas vigentes hoje, no formato dos campos do formulário. */
export async function lerOpcoesDaRetencao(): Promise<OpcoesDaRetencao> {
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  // As tabelas vigentes no DIA CIVIL de hoje (ao meio-dia, longe das bordas do fuso).
  const t = await tabelasVigentes(cliente(), meioDiaCivil(diaCivil(new Date())));
  const primeiraLinha = (s: string): string => {
    const p = s.replace(/^●\s*/, "").split(/;\s*●|\.\s*●/)[0] ?? s;
    return p.length > 90 ? `${p.slice(0, 87)}...` : p;
  };
  const faltas: string[] = [];
  if (t.naturezasIR.length === 0) faltas.push("a tabela do IR (Anexo I da IN RFB 1.234/2012) não está carregada");
  if (t.parametroINSS === null) faltas.push("a alíquota da retenção previdenciária não está carregada");
  if (t.municipioDoEnte === null) faltas.push("o município do ente não está configurado");
  else if (t.itensISS.length === 0) faltas.push(`a lista de serviços do ISS do município ${t.municipioDoEnte} não está carregada`);
  return {
    naturezasIR: t.naturezasIR.map((n) => ({ codigo: n.codigoReceita, rotulo: `${n.codigoReceita} · IR ${pctBr(n.aliquota.toString())} · ${primeiraLinha(n.natureza)}` })),
    servicosINSS: t.servicosINSS.map((s) => ({ codigo: s.codigo, rotulo: `${s.descricao} (art. ${s.codigo.replace("-", ", ")}${s.somenteCessaoDeMaoDeObra ? ", só por cessão de mão de obra" : ""})` })),
    basesMinimas: t.basesMinimasINSS.map((b) => ({ codigo: b.codigo, rotulo: `${pctBr(b.percentual.toString())} — ${b.descricao} (art. ${b.codigo.startsWith("117") ? "117" : "118, II"})` })),
    itensISS: t.itensISS.map((i) => ({ subitem: i.subitem, rotulo: `${i.subitem} · ${pctBr(i.aliquota.toString())} · ${i.descricao.length > 80 ? `${i.descricao.slice(0, 77)}...` : i.descricao}` })),
    municipioDoEnte: t.municipioDoEnte,
    faltas,
  };
}

export interface LinhaDaPrevia {
  readonly tributo: "IRRF" | "INSS" | "ISS";
  readonly situacao: "Retido" | "Não retido" | "Sem cálculo" | "Informado";
  readonly base: string | null;
  readonly aliquota: string | null;
  readonly valor: string | null;
  readonly explicacao: string;
}

/** A prévia: o mesmo cálculo que o pagamento fará, sem gravar nada. */
export async function previaDasRetencoes(input: {
  readonly liquidacaoId: string;
  readonly valorDoPagamento: string;
  readonly data: Date;
  readonly operacao: DadosFiscaisDaOperacao;
}): Promise<{ readonly fornecedor: string; readonly perfil: string | null; readonly linhas: readonly LinhaDaPrevia[] }> {
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  const av = await avaliarRetencoesDoPagamento(cliente(), {
    liquidacaoId: input.liquidacaoId,
    valorDoPagamento: toMoney(input.valorDoPagamento),
    data: input.data,
    operacao: input.operacao,
  });
  return {
    fornecedor: av.documentoDoFornecedor,
    perfil: av.perfil === null ? null : `vigente desde ${dataDaColuna(av.perfil.vigenteDesde)} (${av.perfil.fundamento})`,
    linhas: av.avaliacoes.map((a) => {
      switch (a.resultado) {
        case "RETIDO":
          return { tributo: a.tributo, situacao: "Retido", base: a.base.toFixed(2), aliquota: pctBr(a.aliquota.toString()), valor: a.valor.toFixed(2), explicacao: a.fundamento };
        case "NAO_RETIDO":
          return { tributo: a.tributo, situacao: "Não retido", base: null, aliquota: null, valor: "0.00", explicacao: a.fundamento };
        case "INFORMADO":
          return { tributo: a.tributo, situacao: "Informado", base: null, aliquota: null, valor: a.valor.toFixed(2), explicacao: a.fundamento };
        case "NAO_CALCULAVEL":
          return { tributo: a.tributo, situacao: "Sem cálculo", base: null, aliquota: null, valor: null, explicacao: a.motivo };
      }
    }),
  };
}

export interface PerfilFiscalDaTela {
  readonly id: string;
  readonly vigenteDesde: string;
  readonly optanteSimplesNacional: boolean;
  readonly tributadoNoAnexoIVDoSimples: boolean;
  readonly contribuiSobreReceitaBruta: boolean;
  readonly dispensaDoIR: string | null;
  readonly municipioDoEstabelecimento: string | null;
  readonly fundamento: string;
  readonly criadoPor: string;
  readonly criadoEm: string;
}

/** O histórico do perfil fiscal de um documento, do mais recente para o mais antigo. */
export async function lerPerfisFiscais(documento: string): Promise<readonly PerfilFiscalDaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_CADASTROS");
  const linhas = await cliente().perfilFiscalDoFornecedor.findMany({
    where: { documento: normalizarDocumento(documento) },
    orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }],
  });
  return linhas.map((p) => ({
    id: p.id,
    vigenteDesde: dataDaColuna(p.vigenteDesde),
    optanteSimplesNacional: p.optanteSimplesNacional,
    tributadoNoAnexoIVDoSimples: p.tributadoNoAnexoIVDoSimples,
    contribuiSobreReceitaBruta: p.contribuiSobreReceitaBruta,
    dispensaDoIR: p.dispensaDoIR,
    municipioDoEstabelecimento: p.municipioDoEstabelecimento,
    fundamento: p.fundamento,
    criadoPor: p.criadoPor,
    criadoEm: p.criadoEm.toISOString(),
  }));
}

export async function registrarPerfilFiscalPelaTela(input: {
  readonly documento: string;
  readonly vigenteDesde: Date;
  readonly optanteSimplesNacional: boolean;
  readonly tributadoNoAnexoIVDoSimples: boolean;
  readonly contribuiSobreReceitaBruta: boolean;
  readonly dispensaDoIR: string | null;
  readonly municipioDoEstabelecimento: string | null;
  readonly fundamento: string;
}): Promise<string> {
  return comEscritaAutenticada("ALTERAR_PESSOA", async (criadoPor) => registrarPerfilFiscal(cliente(), { ...input, criadoPor }));
}
