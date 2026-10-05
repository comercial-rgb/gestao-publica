import { NextResponse } from "next/server";
import { anexoParaDocumento } from "../../../../../../../lib/pdf/anexos";
import { nomeDoEnteParaDocumentos } from "../../../../../../../lib/pdf/ente";
import { emitir } from "../../../../../../../lib/pdf/operacionais";
import { ehChaveDeAnexo, montarAnexoDaLdo } from "../../../../../../../lib/portas/anexos-ldo";
import { ldoEstaSancionada } from "../../../../../../../lib/portas/planejamento-publico";

/**
 * V35 C9 — OS ANEXOS DA LDO SANCIONADA, NO PORTAL (LRF, art. 48). O mesmo motor da rota interna; sem sessão, e só
 * para a LDO com sanção registrada. LDO em tramitação, id inexistente ou chave desconhecida: 404, sem distinguir.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { readonly params: Promise<{ readonly id: string; readonly anexo: string }> }): Promise<NextResponse> {
  const { id, anexo } = await ctx.params;
  if (!ehChaveDeAnexo(anexo) || !(await ldoEstaSancionada(id))) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  const r = await emitir(anexoParaDocumento(await montarAnexoDaLdo(id, anexo), await nomeDoEnteParaDocumentos()), `ldo-${anexo}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
