import { type NextRequest, NextResponse } from "next/server";
import { montarDecreto, emitir } from "../../../../../lib/pdf/operacionais";
import { exercicioAutorizado } from "../../../../../lib/recorte";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";

/**
 * EMISSÃO — DECRETO DE CRÉDITO ADICIONAL (TRAVA-1, F3): documento individual, lido do M03 via porta.
 * Autenticada. `?id=` identifica o decreto; `?ano=` o exercício. Mesmo motor/rodapé da publicação (7.15).
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ⚠️ A AÇÃO DE LEITURA, ANTES DE QUALQUER PARSE (orquestração V3, 4.1): fail-closed
  // responde "esta consulta não está no seu acesso" antes de opinar sobre a forma do
  // pedido de quem não deveria estar lendo aqui. Leitura do ENTE: só a concessão GLOBAL.
  try {
    await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "parâmetro 'id' do decreto é obrigatório." }, { status: 400 });
  // ⚠️ O PARSE É O MESMO DAS OUTRAS ROTAS (pendência `DECRETO-COM-PARSE-PROPRIO`, fechada):
  // `?ano=abc` virava o ano corrente em silêncio. Agora recusa com 400, nomeando.
  let ano: number;
  try {
    ano = exercicioAutorizado({ exercicio: req.nextUrl.searchParams.get("ano") ?? undefined });
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const doc = await montarDecreto({ ano, id });
  if (doc === null) return NextResponse.json({ erro: `decreto não encontrado no exercício ${ano}.` }, { status: 404 });
  const r = await emitir(doc, `decreto-credito-${ano}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
