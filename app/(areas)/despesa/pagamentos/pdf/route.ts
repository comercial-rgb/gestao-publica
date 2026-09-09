import { NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { montarPdfFilaPagamentos, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — FILA DE PAGAMENTOS (S8-b, F1): a ordem cronológica (art. 141), por fonte/categoria.
 * Autenticada. A fila é a posição atual (sem recorte de exercício — é a foto da exigibilidade).
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  await exigirSessao();
  const doc = await montarPdfFilaPagamentos();
  const r = await emitir(doc, "fila-pagamentos");
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
