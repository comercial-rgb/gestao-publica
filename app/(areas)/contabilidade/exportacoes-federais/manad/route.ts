import { type NextRequest, NextResponse } from "next/server";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import {
  ArquivoFederalIndisponivelError,
  arquivoDoManadPara,
  exercicioDoManadDaUrl,
  PedidoDeExportacaoInvalidoError,
} from "../../../../../lib/portas/exportacoes-federais";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { anoCivil } from "../../../../../packages/datas/index";

/**
 * DOWNLOAD DO MANAD — o arquivo do exercício, em ISO 8859-1, para conferência.
 *
 * ⚠️ NADA É TRANSMITIDO: a rota só devolve o arquivo a quem pediu. `GET` não muda estado — o
 * arquivo é derivado a cada pedido. A autorização é no servidor, aqui e na porta
 * (`CONSULTAR_CONTABILIDADE`, concessão global: o MANAD é do ente inteiro).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sessao = await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    const exercicio = exercicioDoManadDaUrl(Object.fromEntries(req.nextUrl.searchParams), anoCivil(new Date()));
    const arq = await arquivoDoManadPara(sessao, exercicio);
    return new NextResponse(new Uint8Array(arq.bytes), {
      status: 200,
      headers: {
        "content-type": arq.tipoDeConteudo,
        "content-disposition": `attachment; filename="${arq.nome}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    if (e instanceof PedidoDeExportacaoInvalidoError) {
      return NextResponse.json({ erro: e.message }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    if (e instanceof ArquivoFederalIndisponivelError) {
      return NextResponse.json({ erro: e.message }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    throw e;
  }
}
