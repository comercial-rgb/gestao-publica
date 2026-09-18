import { paraCsv } from "../../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { demonstrativoDePessoal, PortaSemBancoError } from "../../../../../lib/portas/pessoal-publico";

/**
 * O CSV DO DEMONSTRATIVO PÚBLICO DE PESSOAL (V11 V4.2).
 *
 * ⚠️ A MESMA PORTA DA TELA, e portanto a MESMA política. Um arquivo que montasse a própria
 * consulta seria o lugar onde, meses depois, reapareceria a coluna que a política não autoriza —
 * e ninguém perceberia, porque quase ninguém abre o CSV para conferir.
 *
 * ⚠️ SEM POLÍTICA APROVADA, O ARQUIVO TRAZ SÓ O AGREGADO e diz por quê. Não é arquivo vazio.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const competencia = (u.searchParams.get("competencia") ?? "").trim();

  let d;
  try {
    d = await demonstrativoDePessoal(competencia);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    return new Response("A consulta esta indisponivel agora: o banco de dados nao respondeu.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const agregado = paraCsv(
    ["Lotacao", "Regime", "Vinculos", "Bruto", "Descontos", "Liquido"],
    d.agregado.map((g) => [g.lotacao, g.regime, String(g.vinculos), formatarMoeda(g.bruto).texto, formatarMoeda(g.descontos).texto, formatarMoeda(g.liquido).texto]),
  );

  const individual =
    d.politica === null
      ? `\r\n"${(d.pendencia ?? "").replace(/"/g, "'")}"\r\n`
      : `\r\n"Por servidor — publicado sob a politica ${d.politica.versao}, vigente ${d.politica.vigencia}. Fundamento: ${d.politica.fundamentacaoLegal.replace(/"/g, "'")}."\r\n` +
        paraCsv([...d.cabecalho], d.linhas.map((l) => l.celulas.map((c) => (c.coluna === "PROVENTOS" || c.coluna === "DESCONTOS" || c.coluna === "LIQUIDO" ? formatarMoeda(c.valor).texto : c.valor))));

  const corpo =
    `"Demonstrativo de pessoal — competencia ${d.competencia}. Apenas folhas fechadas."\r\n\r\n` +
    agregado +
    individual;

  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pessoal-${d.competencia || "sem-competencia"}.csv"`,
      "cache-control": "no-store",
    },
  });
}
