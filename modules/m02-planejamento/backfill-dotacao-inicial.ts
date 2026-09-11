import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { recalcularCache } from "../m05-despesa/adapter-prisma.js";
import { instanteCivil } from "../../packages/datas/index.js";

/**
 * BACKFILL — cria a DOTACAO_INICIAL faltante em fichas antigas.
 *
 * Fichas criadas ANTES da correção (dotação eager) podem não ter o movimento:
 * ele era semeado preguiçosamente, na primeira operação de saldo. Uma ficha
 * nunca usada ficava sem movimento nenhum e, portanto, com `saldoAutorizado = 0`
 * — mentindo em qualquer demonstrativo.
 *
 * IDEMPOTENTE: só toca fichas SEM DOTACAO_INICIAL. Rodar N vezes não duplica —
 * e o índice único parcial `uq_dotacao_inicial_unica` é a garantia dura.
 *
 * FAIL-CLOSED: ao final, se alguma ficha continuar sem DOTACAO_INICIAL, lança.
 */
export interface ResultadoBackfill {
  readonly fichas: number;
  readonly antes: number;
  readonly depois: number;
  readonly criadas: number;
}

export async function backfillDotacaoInicial(
  prisma: PrismaClient,
  aoCriar?: (ficha: { exercicio: number; numero: number; valor: string }) => void
): Promise<ResultadoBackfill> {
  const fichas = await prisma.fichaOrcamentaria.count();
  const antes = await prisma.movimentoDotacao.count({
    where: { tipo: "DOTACAO_INICIAL" },
  });

  const semDotacao = await prisma.fichaOrcamentaria.findMany({
    where: { movimentos: { none: { tipo: "DOTACAO_INICIAL" } } },
    select: { id: true, exercicio: true, numero: true, valorDotado: true },
    orderBy: [{ exercicio: "asc" }, { numero: "asc" }],
  });

  for (const ficha of semDotacao) {
    await prisma.$transaction(async (tx) => {
      await tx.movimentoDotacao.create({
        data: {
          fichaId: ficha.id,
          tipo: "DOTACAO_INICIAL",
          valor: ficha.valorDotado.toFixed(2),
          origemTipo: "LOA",
          origemId: ficha.id,
          criadoPor: "BACKFILL",
          // ⚠️ 1º DE JANEIRO DO EXERCÍCIO DA FICHA — a mesma regra do adapter do M02.
          // NÃO é `competenciaDerivada`: a data da LOA é CONHECIDA, é o exercício da
          // própria ficha. Marcar como derivada aqui esconderia dado bom entre os
          // duvidosos. Pelo instante do backfill, a MSC mostraria a LOA "entrando" no
          // dia em que alguém rodou o script.
          competencia: instanteCivil(ficha.exercicio, 1, 1, 12),
        },
      });
      // o cache também estava mentindo — recalcula do SUM.
      await recalcularCache(tx, ficha.id);
    });
    aoCriar?.({
      exercicio: ficha.exercicio,
      numero: ficha.numero,
      valor: ficha.valorDotado.toFixed(2),
    });
  }

  const depois = await prisma.movimentoDotacao.count({
    where: { tipo: "DOTACAO_INICIAL" },
  });

  if (depois !== fichas) {
    throw new Error(
      `BACKFILL INCOMPLETO: ${fichas} ficha(s), mas só ${depois} têm ` +
        `DOTACAO_INICIAL.`
    );
  }

  return { fichas, antes, depois, criadas: depois - antes };
}
