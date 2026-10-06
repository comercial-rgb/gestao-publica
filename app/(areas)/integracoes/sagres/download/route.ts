import { type NextRequest, NextResponse } from "next/server";
import { baixarPacoteSagres, ugDaRemessa, exigirUgEscolhida } from "../../../../../lib/portas/sagres";
import { POC_SAGRES } from "../../../../../lib/portas/sagres-poc";
import { inicioDoDiaCivil, janelaCivilDoMes } from "../../../../../packages/datas/index";
import { exigirLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/**
 * DOWNLOAD DO PACOTE SAGRES (ZIP diário/mensal + manifesto). GET autenticado — a porta chama
 * `exigirSessao`. O ZIP é determinístico (mesma massa = mesmo byte). Runtime Node (Buffer/zlib).
 *
 * ⚠️ Isto é "formato oficial GERADO LOCALMENTE" (DIRETIVA §7) — NÃO é transmissão ao TCE.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ⚠️ A AÇÃO DE LEITURA, ANTES DE QUALQUER PARSE (orquestração V3, 4.1): fail-closed
  // responde "esta consulta não está no seu acesso" antes de opinar sobre a forma do
  // pedido de quem não deveria estar lendo aqui. Leitura do ENTE: só a concessão GLOBAL.
  try {
    await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const diaParam = req.nextUrl.searchParams.get("dia");
  const dia = diaParam !== null && diaParam !== "" ? inicioDoDiaCivil(diaParam) : POC_SAGRES.dia;
  if (Number.isNaN(dia.getTime())) {
    return NextResponse.json({ erro: "Data inválida (formato esperado: aaaa-mm-dd)." }, { status: 400 });
  }

  // ⚠️ O MÊS É PARÂMETRO PRÓPRIO — o pacote MENSAL (Dotacao §4.4 e SaldoMensal §4.26) tem
  // periodicidade diferente do diário, e a tela deixa a Comissão escolher os dois separadamente.
  // Este endpoint TEM de aceitar a mesma escolha: se ele derivasse o mês do dia (como fazia), o ZIP
  // baixado divergiria em silêncio da prévia que a Comissão acabou de conferir na tela.
  // Ausente, cai no mês do próprio dia — o comportamento anterior, preservado para links antigos.
  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam !== null && mesParam !== "" ? janelaCivilDoMes(mesParam).inicio : undefined;
  if (mes !== undefined && Number.isNaN(mes.getTime())) {
    return NextResponse.json({ erro: "Mês inválido (formato esperado: aaaa-mm)." }, { status: 400 });
  }

  try {
    // V26 — a mesma unidade gestora da prévia (o parâmetro `ug`), ou a de demonstração sem cadastro.
    const ug = await ugDaRemessa(dia, req.nextUrl.searchParams.get("ug") ?? undefined, POC_SAGRES);
    exigirUgEscolhida(ug);
    const pacote = await baixarPacoteSagres({ codUnidadeGestora: ug.codUnidadeGestora, cnpjGerenciadora: ug.cnpjGerenciadora, codContaArrecadadora: POC_SAGRES.codContaArrecadadora, codFonteRecursoExtra: POC_SAGRES.codFonteRecursoExtra, dia, ...(mes !== undefined ? { mes } : {}) });
    return new NextResponse(new Uint8Array(pacote.zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${pacote.nome}"`,
        "x-sagres-hash-pacote": pacote.hashPacote,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível gerar o pacote." }, { status: 500 });
  }
}
