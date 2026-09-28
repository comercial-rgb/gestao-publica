import { type NextRequest, NextResponse } from "next/server";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import {
  ArquivoFederalIndisponivelError,
  arquivoDaMscPara,
  PedidoDeExportacaoInvalidoError,
  pedidoDaMscDaUrl,
} from "../../../../../lib/portas/exportacoes-federais";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { anoCivil, competenciaCivil } from "../../../../../packages/datas/index";

/**
 * DOWNLOAD DA MATRIZ DE SALDOS CONTÁBEIS — o .zip com o CSV do leiaute, para conferência.
 *
 * ⚠️ NADA É TRANSMITIDO. A rota só devolve o arquivo a quem pediu; o envio ao SICONFI é feito
 * fora do sistema, por quem responde por ele.
 *
 * ⚠️ `GET` NÃO MUDA ESTADO: a matriz é derivada do razão a cada pedido e não é gravada em lugar
 * nenhum (ver `modules/m14-exports-federais/MODULO.md`).
 *
 * ⚠️ A AUTORIZAÇÃO É NO SERVIDOR, AQUI E NA PORTA: a rota entrega o arquivo por `GET` direto, sem
 * menu. `CONSULTAR_CONTABILIDADE` na concessão global (a matriz é do ente inteiro).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sessao = await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    const agora = new Date();
    const pedido = pedidoDaMscDaUrl(Object.fromEntries(req.nextUrl.searchParams), {
      exercicio: anoCivil(agora),
      mes: Number(competenciaCivil(agora).slice(5, 7)),
    });
    const arq = await arquivoDaMscPara(sessao, pedido);
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
    throw e; // o que não é recusa SOBE — um 500 genérico engoliria defeito real.
  }
}
