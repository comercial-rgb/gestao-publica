import type { DocumentoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import type { MovimentoDoDia } from "../portas/receita-e-despesa-do-periodo";

/**
 * V36 — O PDF DO DEMONSTRATIVO DIÁRIO DA RECEITA ARRECADADA E DA DESPESA PAGA (TR 5.10.2.58): o mesmo resultado da
 * tela (`lerMovimentoDoDia`). Montagem pura.
 */
const brl = (v: string): string => formatarMoeda(v).texto;

export function documentoDoMovimentoDiario(p: { readonly ente: string; readonly m: MovimentoDoDia }): DocumentoPdf {
  const m = p.m;
  return {
    ente: p.ente,
    titulo: "Demonstrativo diário da receita e da despesa",
    subtitulo: "Receita arrecadada e despesa paga no dia",
    periodo: m.dia.split("-").reverse().join("/"),
    filtros: [],
    secoes: [
      {
        titulo: "Receita arrecadada",
        colunas: [{ rotulo: "Natureza" }, { rotulo: "Descrição" }, { rotulo: "Fonte" }, { rotulo: "Arrecadado", alinhamento: "direita" }],
        linhas: [
          ...m.receitas.map((r) => [r.naturezaCodigo, r.naturezaDescricao, r.fonteCodigo, brl(r.arrecadado)]),
          ["", "Total", "", brl(m.totalDaReceita)],
        ],
        totais: [m.receitas.length],
      },
      {
        titulo: "Despesa paga",
        colunas: [
          { rotulo: "Pagamento" }, { rotulo: "Empenho" }, { rotulo: "Credor" }, { rotulo: "Fonte" }, { rotulo: "Origem" },
          { rotulo: "Pago", alinhamento: "direita" }, { rotulo: "Retido", alinhamento: "direita" }, { rotulo: "Líquido", alinhamento: "direita" },
        ],
        linhas: [
          ...m.pagamentos.map((x) => [x.numero, x.empenhoNumero, x.credor, x.fonteCodigo, x.origem === "RESTOS" ? "Restos a pagar" : "Exercício", brl(x.pago), brl(x.retido), brl(x.liquido)]),
          ["", "", "Total", "", "", brl(m.totaisDaDespesa.pago), brl(m.totaisDaDespesa.retido), brl(m.totaisDaDespesa.liquido)],
        ],
        totais: [m.pagamentos.length],
      },
    ],
    notas: [
      "Receita líquida das anulações do dia; a guia repartida entre fontes aparece em cada fonte.",
      "Despesa paga = pagamentos do dia, do exercício e de restos a pagar, menos as anulações; retido = retenções vivas; líquido = pago menos retido.",
    ],
  };
}
