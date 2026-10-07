import { NextResponse } from "next/server";
import { entregarAnexoPublicoDaObra } from "../../../../../../lib/portas/obras-no-portal";
import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";

/**
 * V36 (TR 5.10.1.54) — O DOCUMENTO DE UMA OBRA PUBLICADA, SEM SESSÃO. Anexo de obra não publicada, de outro dono ou
 * inexistente responde 404 (um 403 confirmaria a existência). `attachment` e `nosniff` como a rota da LOA.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nomeNoCabecalho(nome: string): string {
  return nome.replace(/["\\\r\n]/g, "_");
}

export async function GET(_req: Request, { params }: { readonly params: Promise<{ readonly id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  let anexo: Awaited<ReturnType<typeof entregarAnexoPublicoDaObra>>;
  try {
    anexo = await entregarAnexoPublicoDaObra(id);
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
