import { type NextRequest, NextResponse } from "next/server";
import { exercicioAutorizado } from "../../../../../lib/recorte";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerLoa } from "../../../../../lib/portas/loa";
import { montarPdfLoa } from "../../../../../lib/pdf/loa";
import { gerarPdfDoDemonstrativo } from "../../../../../lib/pdf/gerar";

/**
 * EMISSÃO PDF — LEI ORÇAMENTÁRIA ANUAL (M02b): o resumo e os anexos da Lei 4.320/64. Autenticada,
 * pelo mesmo motor e rodapé dos demais demonstrativos.
 *
 * ⚠️ LEITURA DO ENTE, ANTES DE QUALQUER PARSE: a LOA não tem recorte de unidade (a receita prevista
 * é do ente). Depois, só o exercício — `?exercicio=abc` é recusado, nunca vira o ano corrente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  let exercicio: number;
  try {
    await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    exercicio = exercicioAutorizado(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e; // o que não é recusa de leitura SOBE.
  }
  const loa = await lerLoa({ exercicio });
  const r = await gerarPdfDoDemonstrativo(await montarPdfLoa(loa), { nomeBase: "lei-orcamentaria-anual" });
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
