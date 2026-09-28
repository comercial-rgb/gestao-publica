import { type NextRequest, NextResponse } from "next/server";
import { paraCsv } from "../../../../../../lib/csv/csv";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { colunasDoResumo, documentoDoResumo, lerResumoDaFolha, linhasDoResumo } from "../../../../../../lib/portas/recursos/resumo-da-folha";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";

/**
 * O RESUMO DA FOLHA EM CSV OU PDF (V6.2 U1) — a MESMA consulta nas duas saídas, autorizada aqui.
 * ⚠️ Leitura da folha do ENTE: só a concessão global de CONSULTAR_FOLHA. O portal do servidor não abre isto.
 * ⚠️ `no-store`: a resposta é da sessão que pediu.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_CACHE = { "cache-control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: { readonly params: Promise<{ readonly id: string }> }): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const formato = sp.get("formato") ?? "pdf";
  if (formato !== "pdf" && formato !== "csv") return NextResponse.json({ erro: "formato deve ser pdf ou csv." }, { status: 400, headers: SEM_CACHE });
  const regime = sp.get("regime") ?? "";
  if (regime !== "" && !["RGPS", "RPPS", "ISENTO"].includes(regime)) return NextResponse.json({ erro: "regime deve ser RGPS, RPPS ou ISENTO." }, { status: 400, headers: SEM_CACHE });
  const r = await lerResumoDaFolha(id, { regime, lotacao: (sp.get("lotacao") ?? "").slice(0, 80) });
  if (r === null) return NextResponse.json({ erro: "Folha não encontrada ou ainda não fechada." }, { status: 404, headers: SEM_CACHE });
  if (formato === "csv") {
    return new NextResponse(paraCsv(colunasDoResumo(), linhasDoResumo(r)), {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="resumo-folha-${r.competencia}.csv"`, ...SEM_CACHE },
    });
  }
  const pdf = await emitir(await documentoDoResumo(r), `resumo-folha-${r.competencia}`);
  return new NextResponse(Buffer.from(pdf.pdf), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.nomeArquivo}"`, ...SEM_CACHE } });
}
