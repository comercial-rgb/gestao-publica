import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { documentoDoExtratoImportado } from "../../../../../../lib/pdf/extrato-importado";
import { nomeDoEnteParaDocumentos } from "../../../../../../lib/pdf/ente";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { lerExtratoParaImpressao } from "../../../../../../lib/portas/conciliacao";
import { diaCivil } from "../../../../../../packages/datas/index";

/**
 * V36 — IMPRESSÃO DO EXTRATO IMPORTADO (`?id=`). Mesmo leitor da tela. Extrato inexistente responde 404 com o
 * motivo, nunca um papel vazio. nodejs: o puppeteer é Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "informe o extrato ('id=')." }, { status: 400 });
  const extrato = await lerExtratoParaImpressao(id);
  if (extrato === null) {
    return new NextResponse("O extrato pedido não existe. Nada foi emitido.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const doc = documentoDoExtratoImportado({ ente: await nomeDoEnteParaDocumentos(), extrato });
  const r = await emitir(doc, `extrato-${extrato.conta.codigo}-${diaCivil(extrato.periodoInicio)}-a-${diaCivil(extrato.periodoFim)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
