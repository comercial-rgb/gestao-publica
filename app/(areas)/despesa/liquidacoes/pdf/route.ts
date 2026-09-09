import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarPdfLiquidacoes, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — lista de LIQUIDAÇÕES (S8-b, F1). Autenticada. Filtros (exercício/unidade) refletem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const { exercicio, unidadeCodigo } = recorteDe(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarPdfLiquidacoes({ exercicio, unidadeCodigo });
  const r = await emitir(doc, `liquidacoes-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
