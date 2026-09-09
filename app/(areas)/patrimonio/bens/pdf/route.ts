import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarPatrimonio, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — PATRIMÔNIO (TRAVA-3): posição por classe (5.86) + dívida consolidada. Autenticada.
 * Mesmo motor/rodapé da publicação (7.15).
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const { exercicio } = recorteDe(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarPatrimonio({ exercicio });
  const r = await emitir(doc, `patrimonio-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
