import { type NextRequest, NextResponse } from "next/server";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { montarPdfOrdemDeCompra, emitir } from "../../../../../lib/pdf/operacionais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeitura("CONSULTAR_LICITACOES");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") {
    return NextResponse.json({ erro: "parâmetro 'id' da ordem é obrigatório." }, { status: 400 });
  }
  const doc = await montarPdfOrdemDeCompra({ id });
  if (doc === null) {
    return NextResponse.json({ erro: "ordem de compra não encontrada." }, { status: 404 });
  }
  const r = await emitir(doc, `ordem-compra-${id.slice(0, 8)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
