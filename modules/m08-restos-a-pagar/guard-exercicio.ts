import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * GUARD DO EXERCÍCIO — fail-closed.
 *
 * Fica num arquivo SÓ DELE de propósito: o M02, o M03 e o M05 precisam dele, e o
 * resto do M08 (restos a pagar) precisa DELES. Se o guard morasse junto do resto
 * do M08, teríamos um ciclo M05 → M08 → M05. Aqui ele não importa nada além do
 * tipo do Prisma.
 *
 * "Está encerrado?" é DERIVADO: existe um `EncerramentoExercicio` apontando para
 * o exercício. Não há coluna `status` — ela exigiria UPDATE, e o encerramento é
 * um FATO (quem encerrou, quando), não um atributo.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function estaEncerrado(tx: Tx, ano: number): Promise<boolean> {
  const e = await tx.exercicio.findUnique({
    where: { ano },
    select: { encerramento: { select: { id: true } } },
  });
  return e?.encerramento != null;
}

/**
 * FAIL-CLOSED: rejeita operação em exercício INEXISTENTE ou ENCERRADO.
 *
 * Exercício inexistente também é erro — e não "cria na hora". Um exercício que
 * ninguém abriu não deveria receber empenho: se o sistema o criasse sozinho, um
 * erro de digitação (2062 em vez de 2026) viraria um exercício novo em silêncio,
 * com orçamento próprio e sem lei nenhuma por trás.
 *
 * Chamar SEMPRE dentro da transação da operação.
 */
export async function exigirExercicioAberto(
  tx: Tx,
  ano: number,
  operacao: string
): Promise<void> {
  const exercicio = await tx.exercicio.findUnique({
    where: { ano },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });

  if (exercicio === null) {
    throw new Error(
      `Exercício ${ano} não existe — ${operacao} rejeitado. Abra o exercício ` +
        `antes de operar nele (um exercício não nasce de um empenho).`
    );
  }

  if (exercicio.encerramento !== null) {
    throw new Error(
      `Exercício ${ano} está ENCERRADO (em ` +
        `${exercicio.encerramento.criadoEm.toISOString().slice(0, 10)}) — ` +
        `${operacao} rejeitado. Despesa de exercício encerrado vira RESTOS A ` +
        `PAGAR; use as operações de RP.`
    );
  }
}

/** O ano do exercício de uma ficha. Fonte única — ninguém digita o ano de novo. */
export async function anoDaFicha(tx: Tx, fichaId: string): Promise<number> {
  const f = await tx.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    select: { exercicio: true },
  });
  if (f === null) {
    throw new Error(`Ficha ${fichaId} não encontrada.`);
  }
  return f.exercicio;
}

/** Conveniência: exige que o exercício DA FICHA esteja aberto. */
export async function exigirExercicioDaFichaAberto(
  tx: Tx,
  fichaId: string,
  operacao: string
): Promise<void> {
  await exigirExercicioAberto(tx, await anoDaFicha(tx, fichaId), operacao);
}
