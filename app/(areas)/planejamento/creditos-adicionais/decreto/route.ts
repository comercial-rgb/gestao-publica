import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { montarDecreto, emitir } from "../../../../../lib/pdf/operacionais";
import { anoCivil } from "../../../../../packages/datas/index";

/**
 * EMISSÃO — DECRETO DE CRÉDITO ADICIONAL (TRAVA-1, F3): documento individual, lido do M03 via porta.
 * Autenticada. `?id=` identifica o decreto; `?ano=` o exercício. Mesmo motor/rodapé da publicação (7.15).
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return NextResponse.json({ erro: "parâmetro 'id' do decreto é obrigatório." }, { status: 400 });
  const anoBruto = Number.parseInt(req.nextUrl.searchParams.get("ano") ?? "", 10);
  const ano = Number.isInteger(anoBruto) ? anoBruto : anoCivil(new Date());
  const doc = await montarDecreto({ ano, id });
  if (doc === null) return NextResponse.json({ erro: `decreto não encontrado no exercício ${ano}.` }, { status: 404 });
  const r = await emitir(doc, `decreto-credito-${ano}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
