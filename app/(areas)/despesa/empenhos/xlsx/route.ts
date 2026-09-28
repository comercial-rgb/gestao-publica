import { type NextRequest, NextResponse } from "next/server";
import { recorteDePagina, type RecorteDaPagina } from "../../../../../lib/portas/contexto";
import { listarEmpenhosDaExecucao } from "../../../../../lib/portas/empenho";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { dataBr } from "../../../../../lib/recorte";
import { gerarXlsx } from "../../../../../packages/planilha/escrever-xlsx";
import { formatarDocumento } from "../../../../../packages/documento/index";
import { ROTULO_STATUS_DO_EMPENHO } from "../rotulos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A LISTA DE EMPENHOS EM EXCEL (V22) — o mesmo recorte AUTORIZADO da tela e do PDF, pela mesma
 * porta. Os valores saem como número (o Excel soma e filtra); o texto decimal do domínio é gravado
 * sem passar por `number` — ver `packages/planilha/escrever-xlsx.ts`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams), "CONSULTAR_DESPESA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e; // o que não é recusa de leitura SOBE — 500 genérico engoliria defeito real.
  }
  const { exercicio, unidadeCodigo } = recorte;
  const empenhos = await listarEmpenhosDaExecucao({ exercicio, unidadeCodigo });
  const arquivo = gerarXlsx({
    aba: `Empenhos ${exercicio}`,
    cabecalho: ["Nº", "Data", "Credor", "CPF/CNPJ", "Ficha", "Fonte", "Natureza", "Histórico", "Empenhado", "Anulações", "Liquidado", "Pago", "A liquidar", "A pagar", "Situação"],
    linhas: empenhos.map((e) => [
      { texto: e.numero },
      { texto: dataBr(e.data) },
      { texto: e.credorNome ?? "" },
      { texto: formatarDocumento(e.credorCpfCnpj) },
      { inteiro: e.fichaNumero },
      { texto: e.fonteCodigo },
      { texto: e.naturezaCodigo },
      { texto: e.historico },
      { moeda: e.empenhadoLiquido },
      { moeda: e.anulacoes },
      { moeda: e.liquidado },
      { moeda: e.pago },
      { moeda: e.saldoALiquidar },
      { moeda: e.saldoAPagar },
      { texto: ROTULO_STATUS_DO_EMPENHO[e.status] ?? e.status },
    ]),
  });
  const nome = `empenhos-${exercicio}${unidadeCodigo !== undefined ? `-ug-${unidadeCodigo}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(arquivo), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
}
