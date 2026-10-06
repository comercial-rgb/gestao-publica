import { type NextRequest, NextResponse } from "next/server";
import { recorteDePagina, type RecorteDaPagina } from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../lib/pdf/operacionais";
import { montarNotaDeEstorno } from "../../../../../lib/pdf/nota-de-estorno";

/**
 * EMISSÃO — NOTA DE ESTORNO (V36): o documento de uma anulação de empenho, liquidação ou pagamento.
 * `?tipo=empenho|liquidacao|pagamento&id=`; exercício e unidade vêm do recorte, como na nota de empenho, e a
 * anulação é procurada dentro da lista recortada (outra unidade: 404). Autenticada; nodejs (puppeteer).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS = ["empenho", "liquidacao", "pagamento"] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams), "CONSULTAR_DESPESA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const tipo = TIPOS.find((t) => t === req.nextUrl.searchParams.get("tipo"));
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (tipo === undefined || id === "") {
    return NextResponse.json({ erro: "informe 'tipo' (empenho, liquidacao ou pagamento) e 'id' da anulação." }, { status: 400 });
  }
  const doc = await montarNotaDeEstorno({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo, tipo, id });
  if (doc === null) return NextResponse.json({ erro: `anulação não encontrada no exercício ${recorte.exercicio}.` }, { status: 404 });
  const r = await emitir(doc, `nota-de-estorno-${recorte.exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
