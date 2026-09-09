import type { Tx } from "./guard-exercicio.js";

/**
 * GUARDS CRUZADOS entre a despesa CORRENTE (M05) e os RESTOS A PAGAR (M08).
 *
 * Mora aqui, junto do `guard-exercicio.ts`, e importa APENAS o tipo `Tx`. É o que
 * permite o M05 consumi-lo sem fechar o ciclo M05 → M08 → M05 (o resto do M08
 * importa o M05 pesado: `restos.ts` mexe em Liquidacao e Pagamento).
 *
 * A REGRA: um empenho de exercício encerrado saiu do orçamento corrente. Ele não
 * se liquida nem se paga pelas operações normais — vira RESTOS A PAGAR. As
 * mensagens direcionam para o caminho certo, porque o erro típico aqui não é
 * má-fé: é alguém usando a função errada.
 */

/** O exercício da ficha do empenho está encerrado? E desde quando? */
async function encerramentoDoEmpenho(
  tx: Tx,
  empenhoId: string
): Promise<{ ano: number; encerradoEm: Date } | null> {
  const e = await tx.empenho.findUnique({
    where: { id: empenhoId },
    select: { ficha: { select: { exercicio: true } } },
  });
  if (e === null) return null;

  const ano = e.ficha.exercicio;
  const ex = await tx.exercicio.findUnique({
    where: { ano },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  if (ex?.encerramento == null) return null;

  return { ano, encerradoEm: ex.encerramento.criadoEm };
}

/**
 * `liquidar()` do M05 — rejeita empenho de exercício ENCERRADO.
 *
 * Se ele tem inscrição NÃO PROCESSADA, a mensagem manda usar
 * `liquidarRestosAPagar`. Se não tem, é um empenho que não deveria receber
 * liquidação nenhuma — nem corrente, nem de RP.
 */
export async function exigirLiquidacaoCorrente(
  tx: Tx,
  empenhoId: string
): Promise<void> {
  const enc = await encerramentoDoEmpenho(tx, empenhoId);
  if (enc === null) return; // exercício aberto: caminho normal

  const inscricao = await tx.inscricaoRestosAPagar.findFirst({
    where: { empenhoId, tipo: "NAO_PROCESSADO" },
    select: { id: true },
  });

  if (inscricao !== null) {
    throw new Error(
      `Empenho de exercício ENCERRADO (${enc.ano}): use ` +
        `liquidarRestosAPagar() — ele está inscrito em RESTOS A PAGAR NÃO ` +
        `PROCESSADOS. A liquidação corrente não se aplica.`
    );
  }

  throw new Error(
    `Empenho de exercício ENCERRADO (${enc.ano}) e NÃO INSCRITO em restos a ` +
      `pagar não processados — não há o que liquidar. Um empenho que virou o ano ` +
      `sem saldo a liquidar não recebe liquidação nova.`
  );
}

/**
 * `pagar()` do M05 — rejeita liquidação de empenho de exercício ENCERRADO.
 * O pagamento dela é pagamento de RESTOS A PAGAR.
 */
export async function exigirPagamentoCorrente(
  tx: Tx,
  liquidacaoId: string
): Promise<void> {
  const l = await tx.liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: { empenhoId: true },
  });
  if (l === null) return; // quem reclama da liquidação inexistente é o M05

  const enc = await encerramentoDoEmpenho(tx, l.empenhoId);
  if (enc === null) return; // exercício aberto: caminho normal

  throw new Error(
    `Liquidação de empenho de exercício ENCERRADO (${enc.ano}): use ` +
      `pagarRestosAPagar(). O pagamento de despesa de exercício encerrado é ` +
      `pagamento de RESTOS A PAGAR — ele baixa a inscrição, não a dotação.`
  );
}

/**
 * `anularPagamento()` do M05 — rejeita anular um pagamento de RESTOS A PAGAR.
 *
 * ═══ POR QUE ESTE GUARD EXISTE ═══
 * Sem ele, o M05 criava o `Pagamento` de estorno mas deixava o
 * `MovimentoRestosAPagar(PAGAMENTO)` ÓRFÃO: a inscrição continuava baixada, e o
 * sistema achava que tinha pago algo que foi desfeito. **Saldo de RP errado PARA
 * MENOS** — dinheiro sumindo do resto a pagar sem ter saído do caixa.
 *
 * Um pagamento é "de RP" se existe um `MovimentoRestosAPagar(PAGAMENTO)` que o
 * referencia. DERIVADO do fato, nunca de flag.
 */
export async function exigirAnulacaoDePagamentoCorrente(
  tx: Tx,
  pagamentoId: string
): Promise<void> {
  const mov = await tx.movimentoRestosAPagar.findFirst({
    where: { pagamentoId, tipo: "PAGAMENTO" },
    select: { id: true, inscricao: { select: { tipo: true, exercicioOrigem: true } } },
  });
  if (mov === null) return; // pagamento corrente: caminho normal

  throw new Error(
    `Pagamento de RESTOS A PAGAR (${mov.inscricao.tipo}, exercício ` +
      `${mov.inscricao.exercicioOrigem}): use anularPagamentoRestosAPagar(). ` +
      `A anulação do M05 não devolveria o saldo à inscrição, e o resto a pagar ` +
      `ficaria baixado sem que o dinheiro tenha saído do caixa.`
  );
}
