import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { exercicioAutorizado } from "../../../../../lib/recorte";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { montarPdfArrecadacao, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — lista de ARRECADAÇÃO (S8-b, F1). Autenticada: `exigirSessao` roda AQUI (a rota não
 * herda o shell). Mesmo motor/rodapé da publicação (7.15). Os filtros da tela (exercício) refletem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  // ⚠️ SÓ O EXERCÍCIO — esta rota entrega leitura do ENTE, e nenhum montador dela recebe
  // unidade. O que morre aqui é o `?exercicio=abc` virando 2026 em silêncio: um PDF, com o
  // rodapé do ente, afirmando ser de um ano que ninguém pediu. Papel emitido sobrevive à
  // sessão que o pediu.
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e; // o que não é recusa de leitura SOBE.
  }
  const doc = await montarPdfArrecadacao({ exercicio });
  const r = await emitir(doc, `arrecadacoes-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
