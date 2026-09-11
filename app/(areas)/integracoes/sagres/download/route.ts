import { type NextRequest, NextResponse } from "next/server";
import { baixarPacoteSagres } from "../../../../../lib/portas/sagres";
import { POC_SAGRES } from "../../../../../lib/portas/sagres-poc";
import { inicioDoDiaCivil, janelaCivilDoMes } from "../../../../../packages/datas/index";

/**
 * DOWNLOAD DO PACOTE SAGRES (ZIP diário/mensal + manifesto). GET autenticado — a porta chama
 * `exigirSessao`. O ZIP é determinístico (mesma massa = mesmo byte). Runtime Node (Buffer/zlib).
 *
 * ⚠️ Isto é "formato oficial GERADO LOCALMENTE" (DIRETIVA §7) — NÃO é transmissão ao TCE.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const diaParam = req.nextUrl.searchParams.get("dia");
  const dia = diaParam !== null && diaParam !== "" ? inicioDoDiaCivil(diaParam) : POC_SAGRES.dia;
  if (Number.isNaN(dia.getTime())) {
    return NextResponse.json({ erro: "parâmetro 'dia' inválido (aaaa-mm-dd)." }, { status: 400 });
  }

  // ⚠️ O MÊS É PARÂMETRO PRÓPRIO — o pacote MENSAL (Dotacao §4.4 e SaldoMensal §4.26) tem
  // periodicidade diferente do diário, e a tela deixa a Comissão escolher os dois separadamente.
  // Este endpoint TEM de aceitar a mesma escolha: se ele derivasse o mês do dia (como fazia), o ZIP
  // baixado divergiria em silêncio da prévia que a Comissão acabou de conferir na tela.
  // Ausente, cai no mês do próprio dia — o comportamento anterior, preservado para links antigos.
  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam !== null && mesParam !== "" ? janelaCivilDoMes(mesParam).inicio : undefined;
  if (mes !== undefined && Number.isNaN(mes.getTime())) {
    return NextResponse.json({ erro: "parâmetro 'mes' inválido (aaaa-mm)." }, { status: 400 });
  }

  try {
    const pacote = await baixarPacoteSagres({ codUnidadeGestora: POC_SAGRES.codUnidadeGestora, cnpjGerenciadora: POC_SAGRES.cnpjGerenciadora, codContaArrecadadora: POC_SAGRES.codContaArrecadadora, codFonteRecursoExtra: POC_SAGRES.codFonteRecursoExtra, dia, ...(mes !== undefined ? { mes } : {}) });
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
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao gerar o pacote." }, { status: 500 });
  }
}
