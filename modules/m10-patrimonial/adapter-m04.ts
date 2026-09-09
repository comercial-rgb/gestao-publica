import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { criarM04Deps, criarM04DepsNaTx } from "../m04-receita/adapter-prisma.js";
import type {
  RegistrarArrecadacaoInput,
  RoteiroContabil,
} from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type {
  AoAnularArrecadacaoPort,
  ContaReservadaPort,
  M04Deps,
  TxDaReceita,
} from "../m04-receita/ports.js";
import { estornarIngressoNaTx, ingressoNaTx } from "./divida.js";
import { estornarRecebimentoNaTx, receberNaTx } from "./divida-ativa.js";

/**
 * M10 × M04 — O ÚNICO LUGAR ONDE OS DOIS MÓDULOS SE ENCONTRAM.
 *
 * ═══ O FATO PERMUTATIVO TEM DUAS PERNAS, E ELAS SÃO INDIVISÍVEIS ═══
 * Receber dívida ativa (ou tomar um empréstimo) é UM fato com duas faces: o dinheiro
 * entra (no RAZÃO, pelo M04) e o crédito/passivo se move (nos MOVIMENTOS, pelo M10).
 * Enquanto as duas pernas foram operações SEPARADAS, o sistema teve dois furos — e
 * eles foram NOMEADOS em a98f0a5:
 *   · vinculação PARCIAL: a arrecadação creditava a conta pelo valor INTEIRO da guia,
 *     mas só parte virava movimento — e a amarração razão×movimentos passava a acusar
 *     para sempre;
 *   · anulação da receita: desfazia o dinheiro e deixava a dívida baixada — o
 *     contribuinte teria "pago" sem ter pago.
 *
 * A cura é a MESMA da retenção do M07 dentro do `pagar()`: a OPERAÇÃO COMPOSTA é a
 * DONA das duas pernas. Ou as duas gravam, ou nenhuma.
 *
 * ═══ E AS DUAS PORTAS QUE FECHAM OS DESVIOS ═══
 * `ContaReservadaPort` fecha a ENTRADA LATERAL (arrecadar avulso numa conta de dívida)
 * e `AoAnularArrecadacaoPort` fecha o CAMINHO DE VOLTA (anular a receita sem desfazer
 * o movimento). Os dois são declarados pelo M04 — o dono da PERGUNTA — e implementados
 * aqui, pelo dono da RESPOSTA. Mesmo desenho do `ContratoPort` (M11): a seta aponta só
 * de m10 → m04, e não há ciclo.
 */

const zVinculo = z.object({
  dividaAtivaId: z.string().min(1),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "Valor deve ser > 0" }),
});

/**
 * Σ DOS VÍNCULOS == VALOR DA GUIA, EXATO.
 *
 * ⚠️ NÃO EXISTE MAIS VINCULAÇÃO PARCIAL. O roteiro da arrecadação credita a conta da
 * dívida pelo valor INTEIRO da guia; se só parte virasse movimento, o RAZÃO baixaria o
 * que os MOVIMENTOS não baixaram — exatamente o furo do a98f0a5. Fail-closed, com a
 * diferença nomeada.
 */
function exigirSomaExata(
  vinculos: readonly { readonly valor: Money }[],
  valorDaGuia: Money
): void {
  let soma = toMoney("0.00");
  for (const v of vinculos) soma = toMoney(soma.plus(v.valor));

  if (!soma.equals(valorDaGuia)) {
    throw new Error(
      `VINCULAÇÃO NÃO FECHA COM A GUIA: os vínculos somam ${soma.toFixed(2)} e a guia ` +
        `arrecadou ${valorDaGuia.toFixed(2)}. Diferença: ` +
        `${valorDaGuia.minus(soma).toFixed(2)}. A arrecadação credita a conta da ` +
        `dívida pelo valor INTEIRO — vincular menos deixaria o RAZÃO baixando o que os ` +
        `MOVIMENTOS não baixaram, e a amarração razão×movimentos passaria a acusar ` +
        `para sempre. Vincule a guia inteira (uma guia pode quitar VÁRIAS dívidas).`
    );
  }
}

export interface ArrecadarRecebimentoInput {
  readonly arrecadacao: RegistrarArrecadacaoInput;
  readonly roteiro: RoteiroContabil;
  /** Uma guia pode quitar VÁRIAS dívidas — mas a soma tem de fechar com ela. */
  readonly vinculos: readonly {
    readonly dividaAtivaId: string;
    readonly valor: string;
  }[];
}

/** ARRECADAR + RECEBER DÍVIDA ATIVA — uma transação, um fato (TR 4.63). */
export async function arrecadarRecebimentoDividaAtiva(
  prisma: PrismaClient,
  input: ArrecadarRecebimentoInput
): Promise<{
  readonly receitaId: string;
  readonly movimentoIds: readonly string[];
}> {
  const vinculos = input.vinculos.map((v) => zVinculo.parse(v));
  const valorDaGuia = toMoney(String(input.arrecadacao.valor));
  exigirSomaExata(vinculos, valorDaGuia);

  return prisma.$transaction(async (tx) => {
    // A arrecadação, NA MESMA TRANSAÇÃO. `interno` identifica a composta: ela É a
    // dona da conta reservada, e o guard da entrada lateral não pode barrá-la.
    const r = await registrarArrecadacao(
      input.arrecadacao,
      input.roteiro,
      criarM04DepsNaTx(tx),
      { origem: "OPERACAO_COMPOSTA_M10" }
    );

    const movimentoIds: string[] = [];
    for (const v of vinculos) {
      const m = await receberNaTx(tx, {
        dividaAtivaId: v.dividaAtivaId,
        receitaArrecadadaId: r.receitaId,
        valor: v.valor.toFixed(2),
        dataMovimento: input.arrecadacao.dataArrecadacao,
        criadoPor: input.arrecadacao.criadoPor,
      });
      movimentoIds.push(m.movimentoId);
    }

    return { receitaId: r.receitaId, movimentoIds };
  });
}

export interface ArrecadarIngressoInput {
  readonly arrecadacao: RegistrarArrecadacaoInput;
  readonly roteiro: RoteiroContabil;
  readonly dividaId: string;
  readonly motivo: string;
}

/**
 * ARRECADAR + INGRESSO DE OPERAÇÃO DE CRÉDITO — uma transação, um fato (TR 4.64).
 *
 * O ingresso é o valor INTEIRO da guia, pelo mesmo motivo do recebimento: a
 * arrecadação credita o passivo pelo total, e um ingresso menor deixaria o razão à
 * frente dos movimentos.
 */
export async function arrecadarIngressoOperacaoCredito(
  prisma: PrismaClient,
  input: ArrecadarIngressoInput
): Promise<{ readonly receitaId: string; readonly movimentoId: string }> {
  const valorDaGuia = toMoney(String(input.arrecadacao.valor));

  return prisma.$transaction(async (tx) => {
    const r = await registrarArrecadacao(
      input.arrecadacao,
      input.roteiro,
      criarM04DepsNaTx(tx),
      { origem: "OPERACAO_COMPOSTA_M10" }
    );

    const m = await ingressoNaTx(tx, {
      dividaId: input.dividaId,
      receitaArrecadadaId: r.receitaId,
      valor: valorDaGuia.toFixed(2),
      dataMovimento: input.arrecadacao.dataArrecadacao,
      motivo: input.motivo,
      criadoPor: input.arrecadacao.criadoPor,
    });

    return { receitaId: r.receitaId, movimentoId: m.movimentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OS PORTS DO M04, IMPLEMENTADOS AQUI
// ═══════════════════════════════════════════════════════════════════════════

export function criarContaReservadaPort(prisma: PrismaClient): ContaReservadaPort {
  return {
    async quemGere(contaId: string): Promise<string | null> {
      const [divida, dividaAtiva] = await Promise.all([
        prisma.dividaConsolidada.findFirst({
          where: { contaContabilId: contaId },
          select: { identificador: true },
        }),
        prisma.dividaAtiva.findFirst({
          where: { contaContabilId: contaId },
          select: { identificador: true },
        }),
      ]);

      if (divida !== null) {
        return `M10 (dívida consolidada ${divida.identificador})`;
      }
      if (dividaAtiva !== null) {
        return `M10 (dívida ativa ${dividaAtiva.identificador})`;
      }
      return null;
    },
  };
}

/**
 * A CASCATA — estorna TUDO que a receita anulada tinha quitado, na transação DELA.
 *
 * ⚠️ ORDEM DOS LOCKS: dívida CONSOLIDADA (posto 5) ANTES da dívida ATIVA (posto 6). O
 * `packages/locks` recusa a inversão em tempo de execução — e é por isso que os
 * ingressos vêm antes dos recebimentos aqui, e não por acaso.
 */
export function criarAoAnularArrecadacaoPort(): AoAnularArrecadacaoPort {
  return {
    async aoAnular(tx: TxDaReceita, receitaArrecadadaId: string): Promise<void> {
      await estornarIngressoNaTx(tx, receitaArrecadadaId);
      await estornarRecebimentoNaTx(tx, receitaArrecadadaId);
    },
  };
}

/** As deps do M04 COM o M10 ligado: as duas portas fechadas. */
export function criarM04DepsComDividas(prisma: PrismaClient): M04Deps {
  return criarM04Deps(prisma, {
    contasReservadas: criarContaReservadaPort(prisma),
    aoAnular: criarAoAnularArrecadacaoPort(),
  });
}
