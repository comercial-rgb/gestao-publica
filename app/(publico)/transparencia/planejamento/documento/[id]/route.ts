import { NextResponse } from "next/server";
import { entregarDocumentoPublicoDaLoa } from "../../../../../../lib/portas/planejamento-publico";

import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
/**
 * V35 C9 — O DOCUMENTO DA LOA APROVADA, SEM SESSÃO. Só o anexo de LOA com lei de aprovação; qualquer outro anexo
 * responde 404, igual a "não existe" (a mesma regra da rota interna: um 403 confirmaria a existência).
 * `attachment` e `nosniff` pelos mesmos motivos da rota interna (`app/(areas)/documentos/anexos/[id]/route.ts`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nomeNoCabecalho(nome: string): string {
  return nome.replace(/["\\\r\n]/g, "_");
}

export async function GET(_req: Request, { params }: { readonly params: Promise<{ readonly id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  let anexo: Awaited<ReturnType<typeof entregarDocumentoPublicoDaLoa>>;
  try {
    anexo = await entregarDocumentoPublicoDaLoa(id);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao ler o documento." }, { status: 500 });
  }
  if (anexo === null) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404, headers: { "cache-control": "no-store" } });
  return new NextResponse(new Uint8Array(anexo.conteudo), {
    status: 200,
    headers: {
      "content-type": anexo.mimeType,
      "content-disposition": `attachment; filename="${nomeNoCabecalho(anexo.nomeOriginal)}"`,
      "content-length": String(anexo.tamanhoBytes),
      "x-content-type-options": "nosniff",
      "x-anexo-sha256": anexo.sha256,
      "cache-control": "no-store",
    },
  });
}
