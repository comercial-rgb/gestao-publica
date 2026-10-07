import { type NextRequest, NextResponse } from "next/server";
import { emitir } from "../../../../../lib/pdf/operacionais";
import { documentoDoBorderoDeMovimentos } from "../../../../../lib/pdf/bordero-de-movimentos";
import { nomeDoEnteParaDocumentos } from "../../../../../lib/pdf/ente";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerBorderoDosMovimentos } from "../../../../../lib/portas/tesouraria";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";

/**
 * V36 (TR 5.10.2.22) — EMISSÃO DO BORDERÔ DOS MOVIMENTOS BANCÁRIOS: `?conta=&desde=&ate=` (dias civis). Leitura do
 * financeiro no ente, como a tela de movimentação. Dia malformado é 400; conta inexistente, 404. nodejs (puppeteer).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ehDia = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const q = req.nextUrl.searchParams;
  const conta = q.get("conta") ?? "";
  const desde = q.get("desde") ?? "";
  const ate = q.get("ate") ?? "";
  if (conta === "" || !ehDia(desde) || !ehDia(ate) || desde > ate) {
    return NextResponse.json({ erro: "Informe a conta e o período (o início não pode ser depois do fim)." }, { status: 400 });
  }
  const bordero = await lerBorderoDosMovimentos(conta, desde, ate);
  if (bordero === null) return NextResponse.json({ erro: "Conta bancária não encontrada." }, { status: 404 });
  const doc = documentoDoBorderoDeMovimentos({ ente: await nomeDoEnteParaDocumentos(), desde, ate, bordero });
  const r = await emitir(doc, `bordero-${bordero.conta.codigo}-${desde}-a-${ate}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
