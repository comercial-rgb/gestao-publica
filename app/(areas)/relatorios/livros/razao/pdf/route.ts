import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { montarPdfRazao } from "../../../../../../lib/pdf/livros";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { tituloDaConta } from "../../../../../../lib/portas/livros";
import { lerPeriodo } from "../../periodo";

/**
 * V36 — EMISSÃO PDF DO RAZÃO de uma conta no período, com termo de abertura e de encerramento. Conta e período
 * lidos como na tela. Conta ausente é recusada com o motivo. nodejs: o puppeteer é Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const conta = (sp["conta"] ?? "").trim();
  if (conta === "") return NextResponse.json({ erro: "informe a conta ('conta=') do razão." }, { status: 400 });
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);
  const doc = await montarPdfRazao({ conta, contaTitulo: await tituloDaConta(conta), desde, ate, desdeStr, ateStr });
  const r = await emitir(doc, `razao-${conta}-${desdeStr}-a-${ateStr}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
