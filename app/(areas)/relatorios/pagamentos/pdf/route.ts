import { type NextRequest, NextResponse } from "next/server";
import { recorteDePagina, type RecorteDaPagina } from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../lib/pdf/operacionais";
import { documentoDosPagamentosEfetuados } from "../../../../../lib/pdf/pagamentos-efetuados";
import { nomeDoEnteParaDocumentos } from "../../../../../lib/pdf/ente";
import { filtroDosPagamentos, lerPagamentosEfetuados } from "../../../../../lib/portas/pagamentos-efetuados";
import { descreverRecorte } from "../../../../../lib/recorte";

/**
 * V36 — EMISSÃO PDF do relatório de pagamentos efetuados. Mesma URL e mesmo leitor da tela (`filtroDosPagamentos`
 * e `lerPagamentosEfetuados`). Autenticada pelo recorte; nodejs (puppeteer).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const filtro = filtroDosPagamentos(sp, recorte.exercicio);
  const dados = await lerPagamentosEfetuados(filtro, recorte.unidadeCodigo);
  const doc = documentoDosPagamentosEfetuados({ ente: await nomeDoEnteParaDocumentos(), periodoDoRecorte: descreverRecorte(recorte), filtro, dados });
  const r = await emitir(doc, `pagamentos-${filtro.desde}-a-${filtro.ate}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
