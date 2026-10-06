import { type NextRequest, NextResponse } from "next/server";
import { exercicioAutorizado } from "../../../../../../lib/recorte";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { montarPdfComposicao } from "../../../../../../lib/pdf/balancos";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { linhaPedidaDaUrl } from "../../../../../../lib/portas/composicao";

import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
/**
 * V34 — EMISSÃO PDF: composição de uma linha. A mesma apuração da tela e do CSV (`lib/relatorios/tabelas-dos-demonstrativos.ts`).
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
  const linha = linhaPedidaDaUrl(req.nextUrl.searchParams.get("linha") ?? undefined);
  if (linha === null) return new NextResponse("Linha não reconhecida: abra a composição pelo link da própria linha.", { status: 400 });
  // A recusa do motor (sem rol de caixa, item sem atividade, fluxo que não fecha) volta com o motivo, não como erro.
  let doc: Awaited<ReturnType<typeof montarPdfComposicao>>;
  try {
    doc = await montarPdfComposicao({ exercicio, linha });
  } catch (e) {
    return new NextResponse(`O documento não foi emitido: ${e instanceof Error ? mensagemDoErro(e, "") : "erro desconhecido"}`, { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const r = await emitir(doc, `composicao-${String(exercicio)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
