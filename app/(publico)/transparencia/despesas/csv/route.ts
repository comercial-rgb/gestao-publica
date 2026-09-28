import { paraCsv } from "../../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { listarDespesasPublicas, PortaSemBancoError } from "../../../../../lib/portas/despesas-publicas";

/**
 * O CSV DA CONSULTA PÚBLICA DE DESPESAS (V9 N2).
 *
 * ⚠️ A MESMA PORTA E OS MESMOS FILTROS DA TELA — um arquivo que monta a própria consulta é onde
 * reaparece, meses depois, a coluna que alguém tirou da tela.
 *
 * ⚠️ E ELE NÃO TRAZ UMA COLUNA "TOTAL". As três fases vão em colunas separadas, como na tela:
 * quem abrir na planilha e somar "empenhado + liquidado + pago" estará somando a mesma despesa
 * três vezes, e não é o arquivo que deve sugerir isso.
 */
export const dynamic = "force-dynamic";

const TETO_DE_LINHAS = 5000;

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const p = (k: string): string => (u.searchParams.get(k) ?? "").trim();

  let dados;
  try {
    dados = await listarDespesasPublicas({
      q: p("q"), exercicio: p("exercicio"), unidade: p("unidade"), de: p("de"), ate: p("ate"),
      // ⚠️ A FASE VAI PARA A PORTA (V10 T3). Ela era filtrada AQUI, depois de a consulta trazer
      // as primeiras 5.000 linhas — e então o arquivo trazia "as primeiras 5.000 de todas as
      // fases, filtradas depois", que não é o mesmo recorte que a tela mostrava nem o que o
      // rodapé somava. Agora o filtro é o mesmo em toda parte.
      fase: p("fase"),
      ordem: (["data", "valor", "numero"] as const).find((o) => o === p("ordem")) ?? "data",
      direcao: p("direcao") === "asc" ? "asc" : "desc",
      pagina: 1, porPagina: TETO_DE_LINHAS,
    });
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    return new Response("A consulta está temporariamente indisponível. Tente novamente mais tarde.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const linhas = dados.linhas.map((d) => [
    d.numero, d.data, String(d.exercicio), d.unidade, d.funcao, d.naturezaDespesa, d.fonte,
    d.credorNome, d.credorDocumento, d.historico, d.contrato ?? "",
    formatarMoeda(d.empenhadoOriginal).texto, formatarMoeda(d.anulado).texto, formatarMoeda(d.empenhado).texto,
    formatarMoeda(d.liquidado).texto, formatarMoeda(d.pago).texto, d.fase,
  ]);

  const colunas = [
    "Empenho", "Data", "Exercício", "Unidade orçamentária", "Função", "Natureza da despesa", "Fonte de recurso",
    "Credor", "Documento do credor", "Histórico", "Contrato",
    "Empenhado (original)", "Anulado", "Empenhado (vigente)", "Liquidado", "Pago", "Fase alcançada",
  ];

  const truncado = dados.total > dados.linhas.length;
  const corpo =
    paraCsv(colunas, linhas) +
    (truncado ? `\r\n"Arquivo parcial: a consulta tem ${dados.total} empenhos e este arquivo traz os primeiros ${dados.linhas.length}. Refine os filtros para obter o conjunto completo."\r\n` : "") +
    // ⚠️ O RODAPÉ DIZ O QUE NÃO SOMAR. Uma planilha aberta por quem não acompanhou a decisão é
    // exatamente onde as três fases viram três despesas.
    `\r\n"As colunas Empenhado, Liquidado e Pago são etapas da mesma despesa e não devem ser somadas."\r\n` +
    // ⚠️ OS TOTAIS DO RECORTE INTEIRO — inclusive quando o ARQUIVO foi truncado. São coisas
    // diferentes: o arquivo traz as primeiras N linhas, e o rodapé diz quanto vale o recorte
    // todo. Somar as linhas do arquivo truncado daria outro número, menor, sem aviso.
    `"Totais da consulta: empenhado ${formatarMoeda(dados.totais.empenhado).texto}; liquidado ${formatarMoeda(dados.totais.liquidado).texto}; pago ${formatarMoeda(dados.totais.pago).texto}."\r\n`;

  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="despesas-publicas.csv"`,
      "cache-control": "no-store",
    },
  });
}
