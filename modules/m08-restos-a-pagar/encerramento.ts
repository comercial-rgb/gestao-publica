import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { calcularInscricoes, type SituacaoDoEmpenho } from "./dominio.js";
import type { Tx } from "./guard-exercicio.js";

/**
 * ENCERRAMENTO DE EXERCÍCIO — inscreve os restos a pagar (Lei 4.320/64, art. 36).
 *
 * TUDO NUMA TRANSAÇÃO SÓ: ou o exercício encerra COM todas as inscrições, ou não
 * encerra. Um encerramento que grava metade das inscrições seria pior que um que
 * não grava nenhuma — o TCE receberia um retrato inventado.
 *
 * OS SUMs SÃO A VERDADE. Nenhum cache é lido para calcular o que inscrever.
 */

export const zEncerrarExercicioComRPInput = z.object({
  ano: z.number().int().min(1900).max(2999),
  encerradoPor: z.string().min(1),
});

export type EncerrarExercicioComRPInput = z.input<
  typeof zEncerrarExercicioComRPInput
>;

export interface ResultadoEncerramento {
  readonly encerramentoId: string;
  readonly ano: number;
  readonly inscricoes: readonly {
    readonly id: string;
    readonly empenhoId: string;
    readonly numeroEmpenho: string;
    readonly tipo: "PROCESSADO" | "NAO_PROCESSADO";
    readonly valorInscrito: Money;
  }[];
}

/** SUM líquido: originais menos os que foram estornados. */
function somaLiquida(
  linhas: readonly {
    readonly id: string;
    readonly valor: { toFixed(n: number): string };
    readonly estornoDeId: string | null;
  }[]
): Money {
  const estornados = new Set(
    linhas.filter((l) => l.estornoDeId !== null).map((l) => l.estornoDeId!)
  );

  let total = toMoney("0.00");
  for (const l of linhas) {
    if (l.estornoDeId !== null) continue; // o estorno em si não soma
    if (estornados.has(l.id)) continue; // o estornado, tampouco
    total = toMoney(total.plus(toMoney(l.valor.toFixed(2))));
  }
  return total;
}

/**
 * O retrato de cada empenho do exercício, TODO ele por SUM.
 * Empenho anulado tem `empenhado = 0` e não gera inscrição.
 */
async function situacaoDosEmpenhos(
  tx: Tx,
  ano: number
): Promise<readonly SituacaoDoEmpenho[]> {
  const empenhos = await tx.empenho.findMany({
    where: {
      ficha: { exercicio: ano },
      estornoDeId: null, // a anulação em si não é um empenho a inscrever
    },
    select: {
      id: true,
      numero: true,
      valor: true,
      estornos: { select: { id: true } },
      liquidacoes: {
        select: {
          id: true,
          valor: true,
          estornoDeId: true,
          pagamentos: { select: { id: true, valor: true, estornoDeId: true } },
        },
      },
    },
  });

  const situacoes: SituacaoDoEmpenho[] = [];
  for (const e of empenhos) {
    // empenho anulado: nada a inscrever
    const empenhado =
      e.estornos.length > 0 ? toMoney("0.00") : toMoney(e.valor.toFixed(2));

    const liquidado = somaLiquida(e.liquidacoes);

    // pagamentos das liquidações VIVAS (uma liquidação anulada não tem
    // pagamento vivo — o M05 já barra isso)
    const anuladas = new Set(
      e.liquidacoes.filter((l) => l.estornoDeId !== null).map((l) => l.estornoDeId!)
    );
    let pago = toMoney("0.00");
    for (const l of e.liquidacoes) {
      if (l.estornoDeId !== null) continue;
      if (anuladas.has(l.id)) continue;
      pago = toMoney(pago.plus(somaLiquida(l.pagamentos)));
    }

    situacoes.push({
      empenhoId: e.id,
      numero: e.numero,
      empenhado,
      liquidado,
      pago,
    });
  }

  return situacoes;
}

/**
 * Encerra o exercício E inscreve os restos a pagar. Tudo ou nada.
 *
 * NÃO toca `MovimentoDotacao`: RP não consome dotação do exercício corrente. A
 * dotação do ano que fecha já foi consumida pelo empenho — inscrever RP não é
 * gastar de novo, é reconhecer o que ficou pendente.
 */
export async function encerrarExercicioComRestos(
  prisma: PrismaClient,
  input: EncerrarExercicioComRPInput
): Promise<ResultadoEncerramento> {
  const dados = zEncerrarExercicioComRPInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: varre as fichas de TODAS as unidades e inscreve os restos de todas. É o MESMO ato
    // administrativo do `encerrarExercicio` — e por isso a MESMA ação (ver o censo).
    await autorizarNo(tx, dados.encerradoPor, ACAO_DO_SERVICO.encerrarExercicioComRestos, "ENTE");

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

    const situacoes = await situacaoDosEmpenhos(tx, dados.ano);

    const inscricoes: ResultadoEncerramento["inscricoes"][number][] = [];

    for (const s of situacoes) {
      // Domínio PURO: processado = liquidado − pago; não processado =
      // empenhado − liquidado. Só entra o que for > 0.
      for (const calc of calcularInscricoes(s)) {
        const criada = await tx.inscricaoRestosAPagar.create({
          data: {
            empenhoId: calc.empenhoId,
            exercicioOrigem: dados.ano,
            tipo: calc.tipo,
            valorInscrito: calc.valorInscrito.toFixed(2),
            criadoPor: dados.encerradoPor,
          },
          select: { id: true },
        });
        inscricoes.push({
          id: criada.id,
          empenhoId: calc.empenhoId,
          numeroEmpenho: s.numero,
          tipo: calc.tipo,
          valorInscrito: calc.valorInscrito,
        });
      }
    }

    const enc = await tx.encerramentoExercicio.create({
      data: {
        exercicioId: exercicio.id,
        encerradoPor: dados.encerradoPor,
      },
      select: { id: true },
    });

    return { encerramentoId: enc.id, ano: dados.ano, inscricoes };
  });
}
