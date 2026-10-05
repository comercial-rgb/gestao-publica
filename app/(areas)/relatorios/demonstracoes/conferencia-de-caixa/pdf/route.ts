import { type NextRequest, NextResponse } from "next/server";
import { exercicioAutorizado } from "../../../../../../lib/recorte";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { montarPdfTermoDeCaixa } from "../../../../../../lib/pdf/balancos";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";

/**
 * V35 — EMISSÃO PDF: Termo de conferência de caixa e bancos em 31/12 (prestação de contas anual). As mesmas tabelas da tela e do CSV (`lib/relatorios/tabelas-da-pca.ts`).
 * Autenticada; a leitura é cobrada antes de qualquer parse. ⚠️ nodejs runtime: o puppeteer é Node.
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
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  // A recusa do motor volta com o motivo, não como erro.
  let doc: Awaited<ReturnType<typeof montarPdfTermoDeCaixa>>;
  try {
    doc = await montarPdfTermoDeCaixa({ exercicio });
  } catch (e) {
    return new NextResponse(`O documento não foi emitido: ${e instanceof Error ? e.message : "erro desconhecido"}`, { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const r = await emitir(doc, `conferencia-de-caixa-${String(exercicio)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
