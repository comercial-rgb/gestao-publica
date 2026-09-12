import { type NextRequest, NextResponse } from "next/server";
import {
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { montarPdfEmpenhos, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — lista de EMPENHOS (S8-b, F1). Autenticada. Filtros (exercício/unidade) refletem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ⚠️ ESTA ROTA ENTREGA O ARQUIVO INTEIRO POR `GET` DIRETO, SEM MENU — e era por isso que
  // ela precisava disto mais que as telas. `recorteDe` era parse puro: aceitava qualquer
  // `?ug=` e, sem o parâmetro, produzia o ente inteiro.
  //
  // ⚠️ SEM `exigirSessao()` SEPARADO: `recorteDePagina` já resolve a identidade (e
  // redireciona para /login quando não há sessão). Duas chamadas seriam duas leituras de
  // sessão por request, e a segunda não acrescentaria garantia nenhuma.
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e; // o que não é recusa de leitura SOBE — 500 genérico engoliria defeito real.
  }
  const { exercicio, unidadeCodigo } = recorte;
  const doc = await montarPdfEmpenhos({ exercicio, unidadeCodigo });
  const r = await emitir(doc, `empenhos-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
