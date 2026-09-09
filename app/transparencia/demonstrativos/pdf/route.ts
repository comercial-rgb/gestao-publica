import { type NextRequest, NextResponse } from "next/server";
import { gerarPdfPublico } from "../../../../lib/pdf/demonstrativos";

/**
 * ROTA PÚBLICA DE PDF (LC 131/2009 · TR 7.5). GET, SEM sessão — o relatório oficial é público. Ela
 * mora fora de `(areas)`, então não há layout autenticado; e ela mesma NÃO chama `exigirSessao`.
 *
 * ⚠️ nodejs runtime: o puppeteer é Node (Chromium por arquivo), nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug") ?? "";
  const exercicio = Number.parseInt(sp.get("exercicio") ?? "", 10);
  const bimestre = Number.parseInt(sp.get("bimestre") ?? "", 10);

  if (!Number.isInteger(exercicio) || !Number.isInteger(bimestre)) {
    return NextResponse.json({ erro: "exercicio e bimestre são obrigatórios (inteiros)." }, { status: 400 });
  }

  let resultado;
  try {
    resultado = await gerarPdfPublico(slug, { exercicio, bimestre });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao gerar o PDF." }, { status: 500 });
  }
  if (resultado === null) {
    return NextResponse.json({ erro: `Demonstrativo desconhecido: "${slug}".` }, { status: 404 });
  }

  return new NextResponse(Buffer.from(resultado.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      // `inline` — abre no navegador; o nome canônico vai no download.
      "content-disposition": `inline; filename="${resultado.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
