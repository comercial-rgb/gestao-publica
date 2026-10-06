import { NextResponse } from "next/server";
import { documentoDaSolicitacaoPara } from "../../../../../../lib/portas/carta-de-servicos";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
/**
 * O DOCUMENTO DE UMA SOLICITAÇÃO PARA O REQUERENTE (V6.2 P3).
 *
 * ⚠️ NÃO É A ROTA DE ANEXOS DO PROCESSO. Aquela exige CONSULTAR_PROTOCOLO e a visão do processo — que o
 * requerente não tem, e não deve ter: ela entregaria os anexos internos. Esta entrega SÓ o que está em
 * `AnexoDaSolicitacao` (o que ele enviou e as respostas liberadas), de solicitação que a sessão alcança HOJE.
 *
 * ⚠️ 404 PARA "NÃO EXISTE" E PARA "NÃO É SEU", `attachment` + `nosniff`, `no-store` — a mesma disciplina da
 * rota de anexos (ver `app/(areas)/documentos/anexos/[id]/route.ts`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nomeNoCabecalho = (nome: string): string => nome.replace(/["\\\r\n]/g, "_");

export async function GET(_req: Request, { params }: { readonly params: Promise<{ readonly id: string; readonly anexo: string }> }): Promise<NextResponse> {
  let sessao;
  try {
    sessao = await exigirLeituraDoEnte("CONSULTAR_MEUS_SERVICOS");
  } catch {
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const { id, anexo } = await params;
  let doc: Awaited<ReturnType<typeof documentoDaSolicitacaoPara>>;
  try {
    doc = await documentoDaSolicitacaoPara(sessao, id, anexo);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao ler o documento." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  if (doc === null) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404, headers: { "cache-control": "no-store" } });
  return new NextResponse(new Uint8Array(doc.conteudo), {
    status: 200,
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `attachment; filename="${nomeNoCabecalho(doc.nomeOriginal)}"`,
      "content-length": String(doc.tamanhoBytes),
      "x-content-type-options": "nosniff",
      "x-anexo-sha256": doc.sha256,
      "cache-control": "no-store, private",
    },
  });
}
