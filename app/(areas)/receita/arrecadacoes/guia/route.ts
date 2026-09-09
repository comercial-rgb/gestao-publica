import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarGuiaArrecadacao, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO — GUIA DE ARRECADAÇÃO (S8-b, F3): documento individual da guia, lido do dono via porta.
 * Autenticada. `?id=` identifica a guia; o exercício vem do recorte da lista de origem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "parâmetro 'id' da guia é obrigatório." }, { status: 400 });
  const { exercicio } = recorteDe(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarGuiaArrecadacao({ exercicio, id });
  if (doc === null) return NextResponse.json({ erro: `guia não encontrada no exercício ${exercicio}.` }, { status: 404 });
  const r = await emitir(doc, `guia-arrecadacao-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
