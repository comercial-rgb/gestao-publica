import { formatarMoeda } from "../format/moeda";
import type { Anexo9 } from "../portas/rreo";
import type { TabelasDoDocumento } from "./tabelas-dos-demonstrativos";

/** V35 — as tabelas do RREO Anexo 9 (regra de ouro) para a tela e o CSV. Os valores vêm do motor. */
const brl = (v: string): string => formatarMoeda(v).texto;
const D = { alinhamento: "direita" } as const;

export function tabelasDoRreoAnexo9(a: Anexo9): TabelasDoDocumento {
  return {
    titulo: "Demonstrativo das Receitas de Operações de Crédito e Despesas de Capital",
    subtitulo: "Regra de ouro (CF, art. 167, III; LRF, art. 53, § 1º, I)",
    periodo: `${String(a.bimestre)}º bimestre de ${String(a.exercicio)}`,
    secoes: [
      {
        titulo: "Receitas",
        colunas: [{ rotulo: "Receitas" }, { rotulo: "Previsão atualizada (a)", ...D }, { rotulo: "Receitas realizadas (b)", ...D }, { rotulo: "Saldo não realizado (c) = (a − b)", ...D }],
        linhas: [["RECEITAS DE OPERAÇÕES DE CRÉDITO (I)", brl(a.operacoesDeCredito.previsaoAtualizada), brl(a.operacoesDeCredito.realizada), brl(a.operacoesDeCredito.saldoNaoRealizado)]],
        totais: [0],
      },
      {
        titulo: "Despesas",
        colunas: [{ rotulo: "Despesas" }, { rotulo: "Dotação atualizada (d)", ...D }, { rotulo: "Despesas empenhadas (e)", ...D }, { rotulo: "Saldo não executado (f) = (d − e)", ...D }],
        linhas: [
          ["DESPESAS DE CAPITAL", "", "", ""],
          ...a.despesasDeCapital.map((l) => [`  ${l.rotulo}`, brl(l.dotacaoAtualizada), brl(l.empenhada), brl(l.saldoNaoExecutado)]),
          ["  (−) Incentivos Fiscais a Contribuinte", brl("0.00"), brl("0.00"), brl("0.00")],
          ["  (−) Incentivos Fiscais a Contribuinte por Instituições Financeiras", brl("0.00"), brl("0.00"), brl("0.00")],
          [a.despesaDeCapitalLiquida.rotulo, brl(a.despesaDeCapitalLiquida.dotacaoAtualizada), brl(a.despesaDeCapitalLiquida.empenhada), brl(a.despesaDeCapitalLiquida.saldoNaoExecutado)],
        ],
        totais: [a.despesasDeCapital.length + 3],
      },
      {
        titulo: "Resultado",
        colunas: [{ rotulo: "Especificação" }, { rotulo: "Previsto (d − a)", ...D }, { rotulo: "Executado (e − b)", ...D }],
        linhas: [["RESULTADO PARA APURAÇÃO DA REGRA DE OURO (III) = (II − I)", brl(a.resultado.previsto), brl(a.resultado.executado)]],
        totais: [0],
      },
    ],
    notas: [a.cumpreRegraDeOuro ? "As operações de crédito não excedem a despesa de capital." : "As operações de crédito excedem a despesa de capital.", ...a.notas, "Valores em R$."],
  };
}
