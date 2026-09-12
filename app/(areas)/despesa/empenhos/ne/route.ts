import { type NextRequest, NextResponse } from "next/server";
import {
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { montarNotaEmpenho, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO — NOTA DE EMPENHO (S8-b, F2): documento individual (TR 5.17/5.19), lido do dono via porta.
 * Autenticada. `?id=` identifica o empenho; exercício/unidade vêm do recorte da lista de origem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ⚠️ AUTORIZA ANTES DE VALIDAR O `id`, e a ordem é deliberada: fail-closed responde
  // "você não tem acesso a esta unidade" antes de opinar sobre a forma do pedido de quem
  // não deveria estar lendo aqui.
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "parâmetro 'id' do empenho é obrigatório." }, { status: 400 });

  // ⚠️ E O DOCUMENTO INDIVIDUAL FICA AUTORIZADO **DE GRAÇA** — isto foi MEDIDO, e a medição
  // evitou uma frente inteira. `montarNotaEmpenho` (lib/pdf/operacionais.ts:242-244) chama
  // `listarEmpenhosDaExecucao({ exercicio, unidadeCodigo })` e procura o `id` DENTRO da
  // lista já recortada — não faz `findUnique` por id. Logo `?id=<empenho de outra unidade>`
  // cai no 404 que a rota já tinha. Quem NÃO tem esse desenho é o dossiê
  // (`lerDossieDoEmpenho` -> `findUnique`), e por isso ele é pendência nomeada e não um
  // conserto silencioso aqui.
  const { exercicio, unidadeCodigo } = recorte;
  const doc = await montarNotaEmpenho({ exercicio, unidadeCodigo, id });
  if (doc === null) return NextResponse.json({ erro: `empenho não encontrado no exercício ${exercicio}.` }, { status: 404 });
  const r = await emitir(doc, `nota-empenho-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
