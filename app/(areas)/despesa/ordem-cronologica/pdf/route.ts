import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { montarPdfFilaPagamentos, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — ORDEM CRONOLÓGICA (art. 141), com o FILTRO DE FONTE da tela. Autenticada.
 * Mesmo motor/rodapé da publicação (7.15): hash SHA-256 do conteúdo + "não assinado".
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 *
 * ⚠️ O FILTRO DESCE ATÉ A PORTA. `montarPdfFilaPagamentos({ fonteCodigo })` repassa a fonte a
 * `lerFilasDePagamento`, que a resolve na leitura: o banco devolve só a fila pedida. É o MESMO
 * montador que `/despesa/pagamentos/pdf` usa sem fonte — um documento só para o art. 141, não dois.
 *
 * ⚠️ O HASH MUDA COM O FILTRO, e isso é correto: a fila da fonte 500 é outro documento que a fila
 * inteira. Dois PDFs com conteúdos diferentes têm de ter hashes diferentes, ou o hash não confere nada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();

  const fonte = req.nextUrl.searchParams.get("fonte")?.trim() ?? "";
  const doc = await montarPdfFilaPagamentos(fonte !== "" ? { fonteCodigo: fonte } : {});

  const r = await emitir(doc, fonte === "" ? "ordem-cronologica" : `ordem-cronologica-fonte-${fonte}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
