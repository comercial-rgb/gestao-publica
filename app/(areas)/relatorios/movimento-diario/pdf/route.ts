import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../lib/pdf/operacionais";
import { documentoDoMovimentoDiario } from "../../../../../lib/pdf/movimento-diario";
import { nomeDoEnteParaDocumentos } from "../../../../../lib/pdf/ente";
import { lerMovimentoDoDia, type MovimentoDoDia } from "../../../../../lib/portas/receita-e-despesa-do-periodo";

/** V36 — EMISSÃO PDF do demonstrativo diário. Mesmo leitor da tela; dia malformado é 400, nunca outro dia. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const dia = req.nextUrl.searchParams.get("dia") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return new NextResponse("Informe o dia no formato AAAA-MM-DD.", { status: 400 });
  let m: MovimentoDoDia;
  try {
    m = await lerMovimentoDoDia(dia);
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const r = await emitir(documentoDoMovimentoDiario({ ente: await nomeDoEnteParaDocumentos(), m }), `movimento-diario-${dia}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
