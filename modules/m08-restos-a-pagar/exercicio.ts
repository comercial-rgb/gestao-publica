import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { estaEncerrado } from "./guard-exercicio.js";

/**
 * Abertura e encerramento de exercício (bloco 1).
 *
 * O encerramento que INSCREVE restos a pagar vem no bloco 2 — aqui ele só
 * registra o fato e liga o guard.
 */

export const zAbrirExercicioInput = z.object({
  ano: z.number().int().min(1900).max(2999),
  criadoPor: z.string().min(1),
});

export const zEncerrarExercicioInput = z.object({
  ano: z.number().int().min(1900).max(2999),
  encerradoPor: z.string().min(1),
});

export type AbrirExercicioInput = z.input<typeof zAbrirExercicioInput>;
export type EncerrarExercicioInput = z.input<typeof zEncerrarExercicioInput>;

/** Abre um exercício. Idempotência é do banco (`ano @unique`). */
export async function abrirExercicio(
  prisma: PrismaClient,
  input: AbrirExercicioInput
): Promise<string> {
  const dados = zAbrirExercicioInput.parse(input);
  // SEM UG: abrir o exercício é ato do ENTE — ninguém abre "o ano da Secretaria de Saúde".
  await autorizarNo(prisma, dados.criadoPor, ACAO_DO_SERVICO.abrirExercicio, "ENTE");

  const e = await prisma.exercicio.create({
    data: { ano: dados.ano, criadoPor: dados.criadoPor },
    select: { id: true },
  });
  return e.id;
}

/** "Está encerrado?" — DERIVADO da existência do fato, nunca de coluna. */
export async function exercicioEstaEncerrado(
  prisma: PrismaClient,
  ano: number
): Promise<boolean> {
  return estaEncerrado(prisma, ano);
}

/**
 * Encerra o exercício. APPEND-ONLY: cria o FATO do encerramento.
 *
 * Encerrar duas vezes é barrado pelo `exercicioId @unique` — a garantia é do
 * banco, não de um `if`. O recheck aqui existe só para dar mensagem limpa.
 */
export async function encerrarExercicio(
  prisma: PrismaClient,
  input: EncerrarExercicioInput
): Promise<string> {
  const dados = zEncerrarExercicioInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG, e é do CONTROLE (6.4): encerrar o ano fecha a porta de TODAS as unidades de uma vez.
    //
    // ⚠️ A identidade aqui chama-se `encerradoPor` (como `importadoPor` no M09). É o mesmo papel —
    // quem assina o ato — e o rollout não renomeou campo de input nenhum para uniformizar: o nome
    // do campo é contrato com o chamador, e trocá-lo por estética quebraria todos eles.
    await autorizarNo(tx, dados.encerradoPor, ACAO_DO_SERVICO.encerrarExercicio, "ENTE");

    const exercicio = await tx.exercicio.findUnique({
      where: { ano: dados.ano },
      select: { id: true, encerramento: { select: { id: true } } },
    });

    if (exercicio === null) {
      throw new Error(`Exercício ${dados.ano} não existe.`);
    }
    if (exercicio.encerramento !== null) {
      throw new Error(`Exercício ${dados.ano} já está encerrado.`);
    }

    const enc = await tx.encerramentoExercicio.create({
      data: {
        exercicioId: exercicio.id,
        encerradoPor: dados.encerradoPor,
      },
      select: { id: true },
    });
    return enc.id;
  });
}
