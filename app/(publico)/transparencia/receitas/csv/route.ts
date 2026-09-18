import { paraCsv } from "../../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { listarReceitasPublicas, PortaSemBancoError } from "../../../../../lib/portas/receitas-publicas";

/**
 * O CSV DA CONSULTA PÚBLICA DE RECEITAS (V11 V4).
 *
 * ⚠️ A MESMA PORTA E OS MESMOS FILTROS DA TELA. Um arquivo que monta a própria consulta é onde
 * reaparece, meses depois, a coluna que alguém tirou da tela — ou o filtro que deixou de valer.
 *
 * ⚠️ E ELE NÃO TRAZ O CRÉDITO CONSTITUÍDO. A constituição é agregada por exercício e não tem
 * linha; enfiá-la numa coluna ao lado da arrecadação convidaria quem abre a planilha a somar as
 * duas — que é exatamente contar a receita do município duas vezes.
 */
export const dynamic = "force-dynamic";

const TETO_DE_LINHAS = 5000;

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const p = (k: string): string => (u.searchParams.get(k) ?? "").trim();

  let dados;
  try {
    dados = await listarReceitasPublicas({
      q: p("q"), exercicio: p("exercicio"), fonte: p("fonte"), natureza: p("natureza"),
      // ⚠️ A SITUAÇÃO VAI PARA A PORTA, como a fase da despesa no V10 T3. Filtrá-la aqui, depois
      // de a consulta trazer as primeiras N linhas, daria "as primeiras N de todas as situações,
      // filtradas depois" — outro recorte do que a tela mostra e do que o rodapé soma.
      situacao: p("situacao"),
      de: p("de"), ate: p("ate"),
      ordem: (["data", "valor", "numero"] as const).find((o) => o === p("ordem")) ?? "data",
      direcao: p("direcao") === "asc" ? "asc" : "desc",
      pagina: 1, porPagina: TETO_DE_LINHAS,
    });
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    return new Response("A consulta esta indisponivel agora: o banco de dados nao respondeu.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const linhas = dados.linhas.map((l) => [
    l.numero, l.data, String(l.exercicio), l.natureza, l.fonte, l.codigoAcompanhamento ?? "",
    formatarMoeda(l.arrecadado).texto, formatarMoeda(l.anulado).texto, formatarMoeda(l.liquido).texto,
    l.situacao,
  ]);

  const colunas = [
    "Guia", "Data", "Exercício", "Natureza da receita", "Fonte de recurso", "Código de acompanhamento",
    "Arrecadado", "Anulado", "Líquido", "Situação",
  ];

  const truncado = dados.total > dados.linhas.length;
  const corpo =
    paraCsv(colunas, linhas) +
    (truncado
      ? `\r\n"⚠️ ARQUIVO TRUNCADO: a consulta tem ${dados.total} guias e este arquivo traz as primeiras ${dados.linhas.length}. Estreite os filtros."\r\n`
      : "") +
    // ⚠️ O RODAPÉ DIZ O QUE NÃO SOMAR, porque a planilha é aberta por quem não acompanhou a decisão.
    `\r\n"Arrecadado menos Anulado e o Liquido: somar Arrecadado e Liquido conta a mesma guia duas vezes."\r\n` +
    // ⚠️ OS TOTAIS SÃO DO RECORTE INTEIRO, inclusive quando o ARQUIVO foi truncado. Somar as
    // linhas de um arquivo truncado daria outro número, menor, sem aviso nenhum.
    `"Totais do recorte: arrecadado ${formatarMoeda(dados.totais.arrecadado).texto}; anulado ${formatarMoeda(dados.totais.anulado).texto}; liquido ${formatarMoeda(dados.totais.liquido).texto}."\r\n` +
    (dados.constituido === null
      ? ""
      : `"Credito constituido no exercicio: ${formatarMoeda(dados.constituido).texto}. Ele NAO se soma a arrecadacao: e o credito que nasceu, e a arrecadacao o baixa."\r\n`);

  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="receitas-publicas.csv"`,
      "cache-control": "no-store",
    },
  });
}
