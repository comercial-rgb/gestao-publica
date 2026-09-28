import { type NextRequest, NextResponse } from "next/server";
import { exercicioAutorizado } from "../../../../../lib/recorte";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerLoa } from "../../../../../lib/portas/loa";
import { gerarXlsx, type CelulaDeSaida } from "../../../../../packages/planilha/escrever-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UM ANEXO DA LOA EM EXCEL — `?exercicio=2026&anexo=7`. A mesma leitura da tela e do PDF, pela
 * mesma porta; os valores saem como número (o Excel soma e filtra), gravados a partir do texto
 * decimal do domínio, sem passar por `number`.
 *
 * ⚠️ UM ANEXO POR ARQUIVO: cada anexo tem colunas próprias (valor único; projetos, atividades e
 * operações especiais; ordinários e vinculados), e uma aba só não as comporta sem misturar.
 * Anexo ausente ou não emitido é recusado com o motivo — nunca uma planilha vazia.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let exercicio: number;
  try {
    await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    exercicio = exercicioAutorizado(Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const pedido = req.nextUrl.searchParams.get("anexo") ?? "";
  const loa = await lerLoa({ exercicio });
  const anexo = loa.anexos.find((a) => a.numero === pedido);
  if (anexo === undefined) {
    const indisponivel = loa.indisponiveis.find((i) => i.numero === pedido);
    return NextResponse.json(
      {
        erro:
          indisponivel !== undefined
            ? `O Anexo ${pedido} não foi emitido: ${indisponivel.motivo}`
            : `Informe o anexo a exportar (${loa.anexos.map((a) => a.numero).join(", ")}).`,
      },
      { status: indisponivel !== undefined ? 409 : 400, headers: { "cache-control": "no-store" } }
    );
  }
  const colunas = anexo.quadros[0]?.colunas ?? ["Valor"];
  const linhas: CelulaDeSaida[][] = anexo.quadros.flatMap((q) =>
    q.linhas.map((l) => [
      { texto: q.titulo },
      { texto: l.codigo },
      { texto: `${"   ".repeat(l.profundidade)}${l.especificacao}` },
      ...l.valores.map((v) => ({ moeda: v })),
    ])
  );
  const arquivo = gerarXlsx({
    aba: `Anexo ${anexo.numero} LOA ${exercicio}`,
    cabecalho: ["Quadro", "Código", "Especificação", ...colunas],
    linhas,
  });
  return new NextResponse(new Uint8Array(arquivo), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="loa-${exercicio}-anexo-${anexo.numero}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
