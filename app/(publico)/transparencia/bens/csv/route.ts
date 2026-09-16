import { paraCsv } from "../../../../../lib/csv/csv";
import { listarBensPublicos, PortaSemBancoError } from "../../../../../lib/portas/bens-publicos";

/**
 * O CSV DA CONSULTA PÚBLICA DE BENS (V9 N2).
 *
 * ⚠️ O CSV É A MESMA CONSULTA, e não uma segunda. Ele lê os MESMOS parâmetros de filtro da
 * lista e chama a MESMA porta pública — então não há como o arquivo trazer um campo que a tela
 * não mostra, nem um bem que o filtro excluiu. Uma exportação que monta a própria consulta é
 * onde reaparece, meses depois, a coluna que alguém tirou da tela.
 *
 * ⚠️ E ELE NÃO PAGINA. Quem baixa quer o recorte inteiro, não a página 3 de 40. O teto existe e
 * é declarado no rodapé do arquivo: acima dele, o CSV diz que foi truncado, em vez de entregar
 * um arquivo incompleto que parece completo.
 *
 * `GET` aqui é leitura pura: nada é gravado, nenhum estado muda.
 */
export const dynamic = "force-dynamic";

const TETO_DE_LINHAS = 5000;

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const p = (k: string): string => (u.searchParams.get(k) ?? "").trim();

  let dados;
  try {
    dados = await listarBensPublicos({
      q: p("q"),
      classe: p("classe"),
      especie: p("especie"),
      situacao: p("situacao"),
      anoAquisicao: p("ano"),
      ordem: (["tombamento", "aquisicao", "descricao"] as const).find((o) => o === p("ordem")) ?? "tombamento",
      direcao: p("direcao") === "desc" ? "desc" : "asc",
      pagina: 1,
      porPagina: TETO_DE_LINHAS,
    });
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    return new Response("A consulta esta indisponivel agora: o banco de dados nao respondeu.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const colunas = [
    "Tombamento",
    "Descrição",
    "Classe (código)",
    "Classe (descrição)",
    "Espécie",
    "Data de aquisição",
    "Tipo de incorporação",
    "Situação",
    "Estado de conservação",
    "Localização",
  ];
  const linhas = dados.linhas.map((b) => [
    b.numeroTombamento,
    b.descricao,
    b.classeCodigo,
    b.classeDescricao,
    b.especie ?? "",
    b.dataAquisicao,
    b.tipoDeIncorporacao ?? "",
    b.situacao ?? "",
    b.estado ?? "",
    // ⚠️ A MESMA REGRA DA TELA, e escrita uma vez só na porta: localização não divulgável não
    // vira célula vazia (que se lê como "não tem"), vira a frase que diz o que houve.
    b.localizacaoDivulgada ? (b.localizacao ?? "") : "não divulgada",
  ]);

  const truncado = dados.total > dados.linhas.length;
  const corpo =
    paraCsv(colunas, linhas) +
    (truncado
      ? `\r\n"⚠️ ARQUIVO TRUNCADO: a consulta tem ${dados.total} bens e este arquivo traz os primeiros ${dados.linhas.length}. Estreite os filtros."\r\n`
      : "");

  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bens-publicos.csv"`,
      // Consulta pública muda quando o cadastro muda; um cache de borda entregaria o acervo de
      // ontem a quem conferir hoje.
      "cache-control": "no-store",
    },
  });
}
