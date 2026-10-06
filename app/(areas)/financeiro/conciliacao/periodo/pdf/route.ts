import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { documentoDaConciliacao } from "../../../../../../lib/pdf/conciliacao";
import { nomeDoEnteParaDocumentos } from "../../../../../../lib/pdf/ente";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { verConciliacao } from "../../../../../../lib/portas/tesouraria";

import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — EMISSÃO PDF da conciliação de um período (`?id=`). Mesmo leitor da tela. Quando o motor recusa (conta sem
 * mapeamento contábil, diferença não explicada), a rota devolve a recusa com o motivo, nunca um papel que afirme
 * uma conciliação que não fecha. nodejs: o puppeteer é Node.
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
  if (id === "") return NextResponse.json({ erro: "informe o período da conciliação ('id=')." }, { status: 400 });
  let conciliacao: Awaited<ReturnType<typeof verConciliacao>>;
  try {
    conciliacao = await verConciliacao(id);
  } catch (e) {
    return new NextResponse(`O relatório não foi emitido: ${e instanceof Error ? mensagemDoErro(e, "") : "erro desconhecido"}`, { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const doc = documentoDaConciliacao({ ente: await nomeDoEnteParaDocumentos(), conciliacao });
  const r = await emitir(doc, `conciliacao-${conciliacao.relatorio.contaBancaria.codigo}-${conciliacao.rotulo}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
