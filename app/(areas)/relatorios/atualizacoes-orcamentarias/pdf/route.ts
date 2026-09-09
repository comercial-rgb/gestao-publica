import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarPdfAtualizacoesOrcamentarias, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — RELATÓRIO DE ATUALIZAÇÕES ORÇAMENTÁRIAS (TR 4.40). Autenticada.
 *
 * ⚠️ OS FILTROS VÊM DA MESMA QUERY STRING DA TELA (ficha/decreto/fonte/unidade). É por isso que o
 * botão "Imprimir PDF" da página é só um link com a URL dela: o recorte atravessa sozinho, e o
 * papel sai igual ao que estava na tela. Um filtro que morasse no estado do React não chegaria
 * até aqui, e o PDF sairia sempre completo — mentindo sobre o que o usuário pediu.
 *
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const sp = req.nextUrl.searchParams;
  const { exercicio } = recorteDe(Object.fromEntries(sp));
  const doc = await montarPdfAtualizacoesOrcamentarias({
    exercicio,
    filtro: {
      ficha: sp.get("ficha") ?? undefined,
      decreto: sp.get("decreto") ?? undefined,
      fonte: sp.get("fonte") ?? undefined,
      unidade: sp.get("unidade") ?? undefined,
    },
  });
  const r = await emitir(doc, `atualizacoes-orcamentarias-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
