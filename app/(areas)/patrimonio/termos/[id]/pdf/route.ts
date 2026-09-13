import { type NextRequest, NextResponse } from "next/server";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { documentoDoTermoPara } from "../../../../../../lib/portas/recursos/termos-dados";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";

/**
 * O PDF DO TERMO PATRIMONIAL (TR 5.19.36/5.19.37) — autenticado, mesmo motor e rodapé dos
 * demonstrativos. A leitura é do ENTE (o termo é do ente; o setor é dado do termo, não
 * recorte de quem lê). nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { readonly params: Promise<{ readonly id: string }> }): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { id } = await ctx.params;
  const doc = await documentoDoTermoPara(id);
  if (doc === null) return NextResponse.json({ erro: "Termo não encontrado." }, { status: 404 });
  const r = await emitir(doc, `termo-${doc.numeroArquivo}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
