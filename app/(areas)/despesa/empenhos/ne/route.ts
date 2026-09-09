import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarNotaEmpenho, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO — NOTA DE EMPENHO (S8-b, F2): documento individual (TR 5.17/5.19), lido do dono via porta.
 * Autenticada. `?id=` identifica o empenho; exercício/unidade vêm do recorte da lista de origem.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "parâmetro 'id' do empenho é obrigatório." }, { status: 400 });
  const { exercicio, unidadeCodigo } = recorteDe(sp);
  const doc = await montarNotaEmpenho({ exercicio, unidadeCodigo, id });
  if (doc === null) return NextResponse.json({ erro: `empenho não encontrado no exercício ${exercicio}.` }, { status: 404 });
  const r = await emitir(doc, `nota-empenho-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
