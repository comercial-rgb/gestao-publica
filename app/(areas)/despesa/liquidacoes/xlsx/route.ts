import { type NextRequest, NextResponse } from "next/server";
import { recorteDePagina, type RecorteDaPagina } from "../../../../../lib/portas/contexto";
import { nomesDosCredores } from "../../../../../lib/portas/empenho";
import { listarLiquidacoesDaExecucao, notasDasLiquidacoes } from "../../../../../lib/portas/liquidacao";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { dataBr } from "../../../../../lib/recorte";
import { gerarXlsx } from "../../../../../packages/planilha/escrever-xlsx";
import { formatarDocumento } from "../../../../../packages/documento/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A LISTA DE LIQUIDAÇÕES EM EXCEL (V22) — o mesmo recorte autorizado da tela e do PDF. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(Object.fromEntries(req.nextUrl.searchParams), "CONSULTAR_DESPESA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { exercicio, unidadeCodigo } = recorte;
  const lista = await listarLiquidacoesDaExecucao({ exercicio, unidadeCodigo });
  const [nomes, notas] = await Promise.all([nomesDosCredores(lista.map((l) => l.credorCpfCnpj)), notasDasLiquidacoes(lista.map((l) => l.id))]);
  const arquivo = gerarXlsx({
    aba: `Liquidações ${exercicio}`,
    cabecalho: ["Nº", "Data", "Empenho", "Credor", "CPF/CNPJ", "Fonte", "Nota fiscal", "Série", "Emissão da nota", "Atesto", "Liquidado", "Pago", "A pagar", "Situação"],
    linhas: lista.map((l) => {
      const n = notas.get(l.id);
      return [
        { texto: l.numero },
        { texto: dataBr(l.data) },
        { texto: l.empenhoNumero },
        { texto: nomes.get(l.credorCpfCnpj) ?? "" },
        { texto: formatarDocumento(l.credorCpfCnpj) },
        { texto: l.fonteCodigo },
        { texto: n?.numero ?? "" },
        { texto: n?.serie ?? "" },
        { texto: n?.data != null ? dataBr(n.data) : "" },
        { texto: l.responsavelAtesto },
        { moeda: l.liquidadoLiquido },
        { moeda: l.pago },
        { moeda: l.saldoAPagar },
        { texto: l.anulado ? "Anulada" : l.saldoAPagar === "0.00" ? "Paga" : "Na fila" },
      ];
    }),
  });
  const nome = `liquidacoes-${exercicio}${unidadeCodigo !== undefined ? `-ug-${unidadeCodigo}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(arquivo), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
}
