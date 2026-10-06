import { type NextRequest, NextResponse } from "next/server";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir } from "../../../../../lib/pdf/operacionais";
import { documentoDaDivida } from "../../../../../lib/pdf/relatorio-da-divida";
import { nomeDoEnteParaDocumentos } from "../../../../../lib/pdf/ente";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerRelatorioDaDivida, type RelatorioDaDivida } from "../../../../../lib/portas/relatorio-da-divida";
import { diaCivil, diaCivilBr } from "../../../../../packages/datas/index";

/**
 * V36 — EMISSÃO PDF do relatório da dívida fundada (todas, ou uma com `?divida=`). Mesmo leitor da tela. Dívida
 * inexistente responde 404 com o motivo. nodejs: o puppeteer é Node.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_DIVIDA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const dividaId = req.nextUrl.searchParams.get("divida") ?? "";
  let relatorio: RelatorioDaDivida;
  try {
    relatorio = await lerRelatorioDaDivida({ dividaId });
  } catch (e) {
    // Só a dívida inexistente vira 404; o que não for isso sobe (não se mascara defeito como "não existe").
    if (!(e instanceof Error) || !e.message.includes("não existe")) throw e;
    return new NextResponse(`O relatório não foi emitido: ${e instanceof Error ? e.message : "erro desconhecido"}`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const agora = new Date();
  const doc = documentoDaDivida({ ente: await nomeDoEnteParaDocumentos(), relatorio, emissao: diaCivilBr(agora) });
  const r = await emitir(doc, `divida-${relatorio.escolhida?.identificador ?? "todas"}-${diaCivil(agora)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
