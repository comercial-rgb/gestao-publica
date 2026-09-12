import { type NextRequest, NextResponse } from "next/server";
import {
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { montarPdfLiquidacoes, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — lista de LIQUIDAÇÕES (S8-b, F1). Autenticada. Filtros (exercício/unidade) refletem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ⚠️ `GET` direto, sem menu: o recorte tem de vir AUTORIZADO. Ver a nota longa em
  // `despesa/empenhos/pdf/route.ts` e o tradutor em `lib/rotas/recusa.ts`.
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { exercicio, unidadeCodigo } = recorte;
  const doc = await montarPdfLiquidacoes({ exercicio, unidadeCodigo });
  const r = await emitir(doc, `liquidacoes-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
