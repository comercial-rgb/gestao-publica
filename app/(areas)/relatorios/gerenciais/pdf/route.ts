import { type NextRequest, NextResponse } from "next/server";
import {
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../../lib/portas/contexto";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir, montarPdfGerencialEmpenhos } from "../../../../../lib/pdf/operacionais";
import { descreverRecorte } from "../../../../../lib/recorte";
import { recorteGerencialDe } from "../filtro";

/**
 * EMISSÃO PDF — RELATÓRIO GERENCIAL DE EMPENHOS (por credor e por fonte). Autenticada.
 *
 * ⚠️ OS FILTROS VÊM DA MESMA QUERY STRING DA TELA (exercicio/ug/credor/fonte), lidos pelo MESMO
 * módulo (`../filtro`). É por isso que o botão "Imprimir PDF" da página é só um link com a URL
 * dela: o recorte atravessa sozinho e o papel sai igual ao que estava na tela. Um filtro que
 * morasse no estado do React não chegaria até aqui, e o PDF sairia sempre completo — mentindo
 * sobre o que o usuário pediu.
 *
 * O documento é montado por `montarPdfGerencialEmpenhos`, junto dos demais montadores em
 * `lib/pdf/operacionais.ts`: é lá que mora a definição de cada papel que o sistema emite, e é lá
 * que o recorte é impresso nas notas.
 *
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = Object.fromEntries(req.nextUrl.searchParams);

  // ⚠️ AQUI O RECORTE NÃO AFETA SÓ O QUE SE LÊ — ELE VAI IMPRESSO NO PAPEL. Abaixo,
  // `descreverRecorte(recorte)` entra no documento como a linha de período ("Exercício 2026
  // · unidade 01003"). Um recorte não autorizado não produziria apenas uma lista indevida:
  // sairia um PDF, assinado pelo ente, AFIRMANDO ser daquela unidade — e papel emitido é o
  // que sobrevive à sessão que o pediu.
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(sp);
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const filtro = recorteGerencialDe(sp);

  const doc = await montarPdfGerencialEmpenhos({
    exercicio: recorte.exercicio,
    unidadeCodigo: recorte.unidadeCodigo,
    credorCpfCnpj: filtro.credorCpfCnpj,
    fonteCodigo: filtro.fonteCodigo,
    periodo: descreverRecorte(recorte),
  });

  const sufixo =
    (filtro.credorCpfCnpj !== undefined ? `-credor-${filtro.credorCpfCnpj}` : "") +
    (filtro.fonteCodigo !== undefined ? `-fonte-${filtro.fonteCodigo}` : "");
  const r = await emitir(doc, `gerencial-empenhos-${recorte.exercicio}${sufixo}`);

  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.nomeArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
