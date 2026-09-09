import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarPdfArrecadacao, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — lista de ARRECADAÇÃO (S8-b, F1). Autenticada: `exigirSessao` roda AQUI (a rota não
 * herda o shell). Mesmo motor/rodapé da publicação (7.15). Os filtros da tela (exercício) refletem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const { exercicio } = recorteDe(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarPdfArrecadacao({ exercicio });
  const r = await emitir(doc, `arrecadacoes-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
