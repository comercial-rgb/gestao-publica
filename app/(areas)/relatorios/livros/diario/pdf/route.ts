import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { montarPdfDiario } from "../../../../../../lib/pdf/livros";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { lerPeriodo } from "../../periodo";

/**
 * V36 — EMISSÃO PDF DO LIVRO DIÁRIO do período, com termo de abertura e de encerramento. O período é lido pelo
 * mesmo `lerPeriodo` da tela. Autenticada; a leitura é cobrada antes de tudo. nodejs: o puppeteer é Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarPdfDiario({ desde, ate, desdeStr, ateStr });
  const r = await emitir(doc, `livro-diario-${desdeStr}-a-${ateStr}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
