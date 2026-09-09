import { type NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { recorteDe } from "../../../../../lib/recorte";
import { montarProgramacaoFinanceira, emitir } from "../../../../../lib/pdf/operacionais";

/**
 * EMISSÃO PDF — PROGRAMAÇÃO FINANCEIRA (M02): os duodécimos do CMD, as metas bimestrais do MBA, o
 * confronto do art. 9º e as MINUTAS de decreto (TR 4.18/4.19). Autenticada.
 *
 * ⚠️ MESMO MOTOR/RODAPÉ da publicação (7.15): SHA-256 do conteúdo, hora de emissão e o carimbo
 * "documento não assinado — ICP-Brasil pendente". Um decreto impresso por caminho paralelo sairia sem
 * essa honestidade, e a minuta de um ato do Prefeito é exatamente o papel que não pode se passar por
 * ato publicado.
 *
 * ⚠️ SEM RECORTE DE UNIDADE: a programação financeira é do ENTE (o caixa é um só). O `recorteDe` lê o
 * exercício da URL — a UG, se vier, é ignorada de propósito, e o documento diz "consolidado".
 *
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await exigirSessao();
  const { exercicio } = recorteDe(Object.fromEntries(req.nextUrl.searchParams));
  const doc = await montarProgramacaoFinanceira({ exercicio });
  const r = await emitir(doc, `programacao-financeira-${exercicio}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
