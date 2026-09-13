import { NextResponse } from "next/server";
import { emitir } from "../../../../../../../lib/pdf/operacionais";
import { anexoParaDocumento } from "../../../../../../../lib/pdf/anexos";
import { nomeDoEnteParaDocumentos } from "../../../../../../../lib/pdf/ente";
import { exigirLeituraDoEnte } from "../../../../../../../lib/portas/leitura";
import { ehChaveDeAnexo, montarAnexoDaLdo } from "../../../../../../../lib/portas/anexos-ldo";
import { respostaDaRecusaDeLeitura } from "../../../../../../../lib/rotas/recusa";

/**
 * OS ANEXOS DA LDO EM PDF — uma rota, oito anexos (M02b, V4 §8; conciliado do siafic-cg c04ad5a).
 *
 * ⚠️ LEITURA DO ENTE, e não só sessão: gerar um anexo da LRF é leitura de peça de planejamento —
 * quem não pode ver a LDO não pode imprimir o anexo dela. Nenhuma entidade do M02b tem unidade.
 * ⚠️ MESMO MOTOR DA PUBLICAÇÃO: SHA-256 do conteúdo, hora e o carimbo "documento não assinado".
 * ⚠️ Chave desconhecida é 404, não um anexo improvisado. nodejs runtime: o puppeteer é Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { readonly params: Promise<{ readonly id: string; readonly anexo: string }> }): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { id, anexo } = await ctx.params;
  if (!ehChaveDeAnexo(anexo)) return NextResponse.json({ erro: `Anexo "${anexo}" não existe.` }, { status: 404 });
  let doc;
  try {
    doc = anexoParaDocumento(await montarAnexoDaLdo(id, anexo), await nomeDoEnteParaDocumentos());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não foi possível montar o anexo." }, { status: 404 });
  }
  const r = await emitir(doc, `ldo-${anexo}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
