import { type NextRequest, NextResponse } from "next/server";
import { paraCsv } from "../../../../../../lib/csv/csv";
import { emitir } from "../../../../../../lib/pdf/operacionais";
import { exigirLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { colunasDasObrigacoes, demonstrativoInternoDasObrigacoes, lerObrigacoesDaFolha, linhasDasObrigacoes } from "../../../../../../lib/portas/recursos/obrigacoes-dos-encargos";
import { cliente } from "../../../../../../lib/portas/cliente";
import { respostaDaRecusaDeLeitura } from "../../../../../../lib/rotas/recusa";

/**
 * O DEMONSTRATIVO INTERNO DAS OBRIGAÇÕES DOS ENCARGOS (V7 M1 U3.2), em PDF ou CSV — a MESMA leitura da tela.
 * ⚠️ NÃO É GUIA: o título e as notas dizem, e nada pagável é gerado. Leitura da folha do ENTE; `no-store`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SEM_CACHE = { "cache-control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: { readonly params: Promise<{ readonly id: string }> }): Promise<NextResponse> {
  try {
    await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const { id } = await ctx.params;
  const formato = req.nextUrl.searchParams.get("formato") ?? "pdf";
  if (formato !== "pdf" && formato !== "csv") return NextResponse.json({ erro: "formato deve ser pdf ou csv." }, { status: 400, headers: SEM_CACHE });
  const folha = await cliente().folhaDePagamento.findUnique({ where: { id }, select: { competencia: true, fechamento: { select: { id: true } } } });
  if (folha === null || folha.fechamento === null) return NextResponse.json({ erro: "folha não encontrada ou ainda não fechada." }, { status: 404, headers: SEM_CACHE });
  const o = await lerObrigacoesDaFolha(id);
  if (formato === "csv") {
    return new NextResponse(paraCsv(colunasDasObrigacoes(), linhasDasObrigacoes(o)), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="obrigacoes-encargos-${folha.competencia}.csv"`, ...SEM_CACHE } });
  }
  const pdf = await emitir(await demonstrativoInternoDasObrigacoes(folha.competencia, o), `demonstrativo-interno-obrigacoes-${folha.competencia}`);
  return new NextResponse(Buffer.from(pdf.pdf), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.nomeArquivo}"`, ...SEM_CACHE } });
}
