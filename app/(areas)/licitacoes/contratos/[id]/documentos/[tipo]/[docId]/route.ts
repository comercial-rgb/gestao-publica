import { type NextRequest, NextResponse } from "next/server";
import { documentoDaExecucaoParaImprimir } from "../../../../../../../../lib/portas/documentos-da-execucao";
import { emitir } from "../../../../../../../../lib/pdf/operacionais";

/**
 * OS DOCUMENTOS DA EXECUÇÃO DO CONTRATO EM PDF (V7 M2 U4) — ordem de serviço emitida, termo de recebimento provisório,
 * decisão da controvérsia e termo de recebimento definitivo, IMPRESSOS DO MANIFESTO gravado no ato.
 * ⚠️ `GET` não pratica ato nenhum: imprimir não recebe, não assina e não dá ciência. A porta decide o alcance (404 para
 * "não pode" e "não existe") e confere que o documento é deste contrato. `no-store`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SEM_CACHE = { "cache-control": "no-store" } as const;

export async function GET(_req: NextRequest, ctx: { readonly params: Promise<{ readonly id: string; readonly tipo: string; readonly docId: string }> }): Promise<NextResponse> {
  const { id, tipo, docId } = await ctx.params;
  const doc = await documentoDaExecucaoParaImprimir(id, tipo, docId);
  if (doc === null) return NextResponse.json({ erro: "documento não encontrado." }, { status: 404, headers: SEM_CACHE });
  const pdf = await emitir(doc.documento, doc.nomeBase);
  return new NextResponse(Buffer.from(pdf.pdf), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.nomeArquivo}"`, ...SEM_CACHE } });
}
