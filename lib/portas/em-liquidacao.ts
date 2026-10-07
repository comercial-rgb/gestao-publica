import { empenhosEmLiquidacao, totalEmLiquidacao } from "../../modules/m05-despesa/em-liquidacao.js";
import { diaCivil } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";

/**
 * V36 — EMPENHOS E RESTOS EM LIQUIDAÇÃO na tela. A regra é do módulo (`modules/m05-despesa/em-liquidacao.ts`); aqui o
 * nome do credor e o recorte de origem. Quem chama passa o recorte JÁ AUTORIZADO (`recorteDePagina(sp,
 * "CONSULTAR_DESPESA")`): a unidade de quem lê só uma desce ao SQL.
 */

export type OrigemEmLiquidacao = "" | "exercicio" | "restos";
export const origemEmLiquidacao = (v: string): OrigemEmLiquidacao => (v === "exercicio" || v === "restos" ? v : "");

export interface LinhaEmLiquidacao {
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly origem: string;
  readonly credor: string;
  readonly fonteCodigo: string;
  readonly saldoALiquidar: string;
  readonly emLiquidacao: string;
  readonly notas: readonly { readonly id: string; readonly rotulo: string; readonly recebidaEm: string; readonly aLiquidar: string }[];
}

export interface TelaEmLiquidacao {
  readonly linhas: readonly LinhaEmLiquidacao[];
  readonly totais: { readonly exercicio: string; readonly restos: string };
  readonly notasSemAtribuicao: number;
}

export async function lerEmLiquidacao(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined; readonly origem: OrigemEmLiquidacao }): Promise<TelaEmLiquidacao> {
  const r = await empenhosEmLiquidacao(cliente(), { exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo });
  const es = r.empenhos.filter((e) => p.origem === "" || (p.origem === "exercicio" ? e.situacao === "EXERCICIO" : e.situacao === "RP_NAO_PROCESSADO"));
  const nomes = await nomesDosCredores([...new Set(es.map((e) => e.credorCpfCnpj))]);
  const t = totalEmLiquidacao(es);
  const br = (d: Date): string => diaCivil(d).split("-").reverse().join("/");
  return {
    linhas: es.map((e) => ({
      empenhoId: e.empenhoId,
      empenhoNumero: e.empenhoNumero,
      origem: e.situacao === "EXERCICIO" ? "Exercício" : `Restos de ${String(e.exercicioOrigem)}`,
      credor: nomes.get(e.credorCpfCnpj) ?? e.credorCpfCnpj,
      fonteCodigo: e.fonteCodigo,
      saldoALiquidar: e.saldoALiquidar.toFixed(2),
      emLiquidacao: e.emLiquidacao.toFixed(2),
      notas: e.notas.map((n) => ({ id: n.id, rotulo: n.rotulo, recebidaEm: br(n.dataRecebimento), aLiquidar: n.aLiquidar.toFixed(2) })),
    })),
    totais: { exercicio: t.exercicio.toFixed(2), restos: t.restos.toFixed(2) },
    notasSemAtribuicao: r.notasSemAtribuicao,
  };
}
