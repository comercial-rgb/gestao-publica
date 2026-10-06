import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import {
  agruparPagamentos,
  pagamentosEfetuados,
  totaisDosPagamentos,
  type AgrupamentoDosPagamentos,
  type OrigemDoPagamento,
} from "../../modules/m05-despesa/pagamentos-efetuados";

/**
 * V36 — PORTA DO RELATÓRIO DE PAGAMENTOS EFETUADOS. O filtro é lido da URL pela tela e pelo PDF do mesmo jeito
 * (`filtroDosPagamentos`), a leitura é a do M05 e o resultado vai em strings de dinheiro.
 */

export interface FiltroDosPagamentos {
  readonly desde: string;
  readonly ate: string;
  readonly credor: string;
  readonly fonte: string;
  readonly conta: string;
  readonly agrupar: "" | AgrupamentoDosPagamentos;
  readonly comRetencoes: boolean;
}

const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const ehDia = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Período padrão: o exercício inteiro. Dia malformado vira o padrão, nunca um corte inventado. */
export function filtroDosPagamentos(sp: Record<string, string | string[] | undefined>, exercicio: number): FiltroDosPagamentos {
  const desde = um(sp["desde"]);
  const ate = um(sp["ate"]);
  const agrupar = um(sp["agrupar"]);
  return {
    desde: ehDia(desde) ? desde : `${String(exercicio)}-01-01`,
    ate: ehDia(ate) ? ate : `${String(exercicio)}-12-31`,
    credor: um(sp["credor"]).replace(/\D/g, ""),
    fonte: um(sp["fonte"]),
    conta: um(sp["conta"]),
    agrupar: agrupar === "credor" || agrupar === "fonte" || agrupar === "conta" ? agrupar : "",
    comRetencoes: um(sp["retencoes"]) !== "nao",
  };
}

export interface PagamentoEfetuadoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly origem: OrigemDoPagamento;
  readonly exercicioDaDotacao: number;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly liquidacaoNumero: string;
  readonly credorCpfCnpj: string;
  readonly credorNome: string | null;
  readonly fonteCodigo: string;
  readonly contaBancaria: string;
  readonly pagoVivo: string;
  readonly retido: string;
  readonly liquido: string;
  readonly anulado: boolean;
}

export interface TotaisDaTela {
  readonly pagoVivo: string;
  readonly retido: string;
  readonly liquido: string;
}

export interface PagamentosEfetuadosDaTela {
  readonly linhas: readonly PagamentoEfetuadoDaTela[];
  readonly grupos: readonly { readonly chave: string; readonly rotulo: string; readonly linhas: readonly PagamentoEfetuadoDaTela[]; readonly totais: TotaisDaTela }[];
  readonly totais: TotaisDaTela;
  readonly opcoes: { readonly credores: readonly { readonly documento: string; readonly nome: string | null }[]; readonly fontes: readonly string[]; readonly contas: readonly string[] };
}

export async function lerPagamentosEfetuados(f: FiltroDosPagamentos, unidadeCodigo: string | undefined): Promise<PagamentosEfetuadosDaTela> {
  const prisma = cliente();
  const periodo = { de: inicioDoDiaCivil(f.desde), ate: fimDoDiaCivil(f.ate), ...(unidadeCodigo !== undefined ? { unidadeCodigo } : {}) };
  const filtrado = f.credor !== "" || f.fonte !== "" || f.conta !== "";
  const [linhas, todas] = await Promise.all([
    pagamentosEfetuados(prisma, {
      ...periodo,
      ...(f.credor !== "" ? { credorCpfCnpj: f.credor } : {}),
      ...(f.fonte !== "" ? { fonteCodigo: f.fonte } : {}),
      ...(f.conta !== "" ? { contaBancaria: f.conta } : {}),
    }),
    // As opções dos filtros ignoram os próprios filtros (senão o select colapsaria na opção escolhida).
    filtrado ? pagamentosEfetuados(prisma, periodo) : null,
  ]);
  const base = todas ?? linhas;
  const nomes = await nomesDosCredores([...new Set(base.map((l) => l.credorCpfCnpj))]);
  const tela = linhas.map((l) => ({
    id: l.id,
    numero: l.numero,
    data: l.data,
    origem: l.origem,
    exercicioDaDotacao: l.exercicioDaDotacao,
    empenhoId: l.empenhoId,
    empenhoNumero: l.empenhoNumero,
    liquidacaoNumero: l.liquidacaoNumero,
    credorCpfCnpj: l.credorCpfCnpj,
    credorNome: nomes.get(l.credorCpfCnpj) ?? null,
    fonteCodigo: l.fonteCodigo,
    contaBancaria: l.contaBancaria,
    pagoVivo: l.pagoVivo.toFixed(2),
    retido: l.retido.toFixed(2),
    liquido: l.liquido.toFixed(2),
    anulado: l.anulado,
  }));
  const porId = new Map(tela.map((t) => [t.id, t]));
  const emTexto = (t: ReturnType<typeof totaisDosPagamentos>): TotaisDaTela => ({ pagoVivo: t.pagoVivo.toFixed(2), retido: t.retido.toFixed(2), liquido: t.liquido.toFixed(2) });
  const grupos =
    f.agrupar === ""
      ? []
      : agruparPagamentos(linhas, f.agrupar).map((g) => ({
          chave: g.chave,
          rotulo: f.agrupar === "credor" ? (nomes.get(g.chave) ?? g.chave) : f.agrupar === "fonte" ? `fonte ${g.chave}` : `conta ${g.chave}`,
          linhas: g.linhas.map((l) => porId.get(l.id)).filter((x): x is PagamentoEfetuadoDaTela => x !== undefined),
          totais: emTexto({ pagoVivo: g.pagoVivo, retido: g.retido, liquido: g.liquido }),
        }));
  return {
    linhas: tela,
    grupos,
    totais: emTexto(totaisDosPagamentos(linhas)),
    opcoes: {
      credores: [...new Set(base.map((l) => l.credorCpfCnpj))].map((d) => ({ documento: d, nome: nomes.get(d) ?? null })).sort((a, b) => (a.nome ?? a.documento).localeCompare(b.nome ?? b.documento)),
      fontes: [...new Set(base.map((l) => l.fonteCodigo))].sort(),
      contas: [...new Set(base.map((l) => l.contaBancaria))].sort(),
    },
  };
}
