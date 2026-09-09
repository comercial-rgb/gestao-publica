import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { toMoney } from "../../packages/contracts/index.js";
import type { Partida } from "../../packages/ledger/index.js";
import {
  criarContaRepositoryPrisma,
  idsUuid,
} from "../m01-core-contabil/adapter-prisma.js";
import { criarClassificacaoRepositoryPrisma } from "../m02-planejamento/adapter-prisma.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import type {
  AoAnularArrecadacaoPort,
  ArrecadacaoParaPersistir,
  ArrecadacaoPersistida,
  ContaReservadaPort,
  LancamentoDaReceita,
  M04Deps,
  ReceitaClassificacaoPort,
  ReceitaRepositoryPort,
} from "./ports.js";

/**
 * ADAPTERS do M04 — a única camada que conhece Prisma.
 *
 * O PrismaClient vem de `criarPrismaClient()` do M01. Dinheiro cruza a fronteira
 * como STRING de 2 casas (`Prisma.Decimal` != `Decimal` do domínio).
 */

/**
 * Classificação da receita arrecadada. DELEGA natureza+fonte ao adapter do M02
 * (nada é reimplementado) e acrescenta só o CO, que a port do M02 não resolve
 * para a receita.
 */
export function criarReceitaClassificacaoPrisma(
  prisma: Tx
): ReceitaClassificacaoPort {
  const m02 = criarClassificacaoRepositoryPrisma(prisma);

  return {
    async resolver(c) {
      const [receita, co] = await Promise.all([
        m02.resolverReceita({
          naturezaReceita: c.naturezaReceita,
          fonte: c.fonte,
        }),
        c.co === undefined
          ? Promise.resolve(null)
          : prisma.codigoAcompanhamento.findUnique({
              where: { codigo: c.co },
              select: { id: true },
            }),
      ]);

      return {
        naturezaReceita: receita.naturezaReceita,
        fonte: receita.fonte,
        co,
      };
    },
  };
}

/**
 * O CORPO da persistência, JÁ DENTRO de uma transação.
 *
 * Extraído para que a OPERAÇÃO COMPOSTA do M10 (arrecadação + movimento de dívida,
 * indivisíveis) possa rodá-lo na SUA transação — a mesma mecânica com que o M05
 * chama a retenção do M07 e a amortização do M10 dentro do `pagar()`. A alternativa
 * seria recopiar a persistência: duas verdades sobre o mesmo INSERT.
 *
 * ⚠️ `aoAnular` (M10) roda AQUI DENTRO, na mesma transação: anular a arrecadação e
 * estornar o que ela quitou é UM fato, não dois.
 */
export async function persistirArrecadacaoNaTx(
  tx: Tx,
  arrecadacao: ArrecadacaoParaPersistir,
  lancamento: LancamentoDaReceita,
  aoAnular?: AoAnularArrecadacaoPort
): Promise<string> {
  {
    {
        // FAIL-CLOSED dentro da transação (última barreira): entre a checagem do
        // serviço e o INSERT, o plano de contas pode ter mudado.
        const contaIds = [
          ...new Set(lancamento.partidas.map((p) => p.contaId)),
        ];
        const contas = await tx.contaPcasp.findMany({
          where: { id: { in: contaIds } },
          select: { id: true, codigo: true, analitica: true },
        });
        if (contas.length !== contaIds.length) {
          throw new Error(
            `Conta(s) inexistente(s) no PCASP ao persistir a receita ` +
              `${arrecadacao.numeroReceita}.`
          );
        }
        const sinteticas = contas.filter((c) => !c.analitica);
        if (sinteticas.length > 0) {
          throw new Error(
            `Conta sintética não recebe partida: ` +
              `${sinteticas.map((c) => c.codigo).join(", ")}.`
          );
        }

        // INVARIANTE 2: uma receita só é anulada UMA vez. A garantia dura é o
        // índice único parcial uq_estorno_receita_unico; este recheck existe
        // para dar mensagem limpa antes de o banco falar.
        if (arrecadacao.estornoDeId !== undefined) {
          const jaAnulada = await tx.receitaArrecadada.count({
            where: { estornoDeId: arrecadacao.estornoDeId },
          });
          if (jaAnulada > 0) {
            throw new Error(
              `Receita ${arrecadacao.estornoDeId} já foi anulada.`
            );
          }
        }

        // O lançamento contábil primeiro — a receita aponta para ele. Pelo FUNIL.
        await lancarNoRazao(tx, {
          id: lancamento.id,
          numeroControle: lancamento.numeroControle,
          dataTransacao: lancamento.dataTransacao,
          historico: lancamento.historico,
          origemTipo: lancamento.origemTipo,
          origemId: lancamento.origemId ?? null,
          estornoDeId: lancamento.estornoDeId ?? null,
          criadoPor: lancamento.criadoPor,
          partidas: lancamento.partidas.map((p) => ({
            contaId: p.contaId,
            tipo: p.tipo,
            subsistema: p.subsistema,
            valor: p.valor.toFixed(2),
          })),
        });

        const criada = await tx.receitaArrecadada.create({
          data: {
            id: arrecadacao.id,
            exercicio: arrecadacao.exercicio,
            naturezaReceitaId: arrecadacao.naturezaReceitaId,
            fonteId: arrecadacao.fonteId,
            coId: arrecadacao.coId ?? null,
            exercicioFonte: arrecadacao.exercicioFonte,
            tipo: arrecadacao.tipo,
            valor: arrecadacao.valor.toFixed(2),
            dataArrecadacao: arrecadacao.dataArrecadacao,
            numeroReceita: arrecadacao.numeroReceita,
            lancamentoId: lancamento.id,
            estornoDeId: arrecadacao.estornoDeId ?? null,
            criadoPor: arrecadacao.criadoPor,
          },
          select: { id: true },
        });

        // ═══ A CASCATA (M10) — DENTRO da mesma transação ═══
        // Se esta persistência é uma ANULAÇÃO, tudo que a receita original quitou
        // tem de ser desfeito AGORA. Sem isto, o dinheiro volta ao contribuinte e a
        // dívida dele continua baixada — ele teria "pago" sem ter pago.
        if (arrecadacao.estornoDeId !== undefined && aoAnular !== undefined) {
          await aoAnular.aoAnular(tx, arrecadacao.estornoDeId);
        }

        return criada.id;
  }
  }
}

/**
 * As LEITURAS do repositório — servem ao client E a uma transação (só fazem SELECT).
 * Extraídas para que o repositório "na tx" (usado pela operação composta do M10) não
 * recopie uma linha sequer: o que muda é o `db`, não a consulta.
 */
function leiturasDaReceita(prisma: Tx): Omit<ReceitaRepositoryPort, "persistir"> {
  return {
    async buscar(id: string): Promise<ArrecadacaoPersistida | null> {
      const r = await prisma.receitaArrecadada.findUnique({
        where: { id },
        select: {
          id: true,
          exercicio: true,
          naturezaReceitaId: true,
          naturezaReceita: { select: { codigo: true } },
          fonteId: true,
          fonte: { select: { codigo: true } },
          coId: true,
          exercicioFonte: true,
          tipo: true,
          valor: true,
          dataArrecadacao: true,
          numeroReceita: true,
          lancamentoId: true,
          estornoDeId: true,
          // "já foi anulada?" sai DAQUI — não de um campo mutável.
          estornos: { select: { id: true } },
          lancamento: {
            select: {
              id: true,
              numeroControle: true,
              dataTransacao: true,
              historico: true,
              estornoDeId: true,
              estornos: { select: { id: true } },
              partidas: {
                select: {
                  tipo: true,
                  subsistema: true,
                  valor: true,
                  conta: { select: { codigo: true } },
                },
              },
            },
          },
        },
      });

      if (r === null) return null;

      const partidas: readonly Partida[] = r.lancamento.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      }));

      return {
        id: r.id,
        exercicio: r.exercicio,
        naturezaReceitaId: r.naturezaReceitaId,
        naturezaReceitaCodigo: r.naturezaReceita.codigo,
        fonteId: r.fonteId,
        fonteCodigo: r.fonte.codigo,
        coId: r.coId,
        exercicioFonte: r.exercicioFonte,
        tipo: r.tipo,
        valor: toMoney(r.valor.toFixed(2)),
        dataArrecadacao: r.dataArrecadacao,
        numeroReceita: r.numeroReceita,
        lancamentoId: r.lancamentoId,
        estornoDeId: r.estornoDeId,
        estornos: r.estornos.map((e) => e.id),
        lancamento: {
          id: r.lancamento.id,
          numeroControle: r.lancamento.numeroControle,
          partidas,
          dataTransacao: r.lancamento.dataTransacao,
          historico: r.lancamento.historico,
          ...(r.lancamento.estornoDeId !== null
            ? { estornoDeId: r.lancamento.estornoDeId }
            : {}),
          estornos: r.lancamento.estornos.map((e) => e.id),
        },
      };
    },

    async acumuladoLiquido(exercicio, naturezaReceitaId) {
      const [arrecadado, anulado] = await Promise.all([
        prisma.receitaArrecadada.aggregate({
          where: { exercicio, naturezaReceitaId, tipo: "ARRECADACAO" },
          _sum: { valor: true },
        }),
        prisma.receitaArrecadada.aggregate({
          where: { exercicio, naturezaReceitaId, tipo: "ANULACAO" },
          _sum: { valor: true },
        }),
      ]);

      const somaArrecadado = toMoney(
        arrecadado._sum.valor?.toFixed(2) ?? "0.00"
      );
      const somaAnulado = toMoney(anulado._sum.valor?.toFixed(2) ?? "0.00");
      return toMoney(somaArrecadado.minus(somaAnulado));
    },

    async previsaoTotal(exercicio, naturezaReceitaId) {
      const previsto = await prisma.receitaPrevista.aggregate({
        where: { exercicio, naturezaReceitaId },
        _sum: { valorPrevisto: true },
      });
      return toMoney(previsto._sum.valorPrevisto?.toFixed(2) ?? "0.00");
    },
  };
}

/** O repositório sobre o CLIENT: `persistir` abre a sua própria transação. */
export function criarReceitaRepositoryPrisma(
  prisma: PrismaClient,
  aoAnular?: AoAnularArrecadacaoPort
): ReceitaRepositoryPort {
  return {
    persistir: (arrecadacao, lancamento) =>
      prisma.$transaction((tx) =>
        persistirArrecadacaoNaTx(tx, arrecadacao, lancamento, aoAnular)
      ),
    ...leiturasDaReceita(prisma),
  };
}

/**
 * O repositório sobre uma TRANSAÇÃO JÁ ABERTA: `persistir` grava NELA.
 *
 * Não existe transação aninhada no Prisma — e não é isso que se quer: a operação
 * composta do M10 (arrecadação + movimento de dívida) é UM fato, e ou os dois
 * gravam, ou nenhum.
 */
export function criarReceitaRepositoryNaTx(tx: Tx): ReceitaRepositoryPort {
  return {
    persistir: (arrecadacao, lancamento) =>
      persistirArrecadacaoNaTx(tx, arrecadacao, lancamento),
    ...leiturasDaReceita(tx),
  };
}

/**
 * As deps do M04 sobre uma TRANSAÇÃO JÁ ABERTA.
 *
 * É o que a operação COMPOSTA do M10 usa: ela abre a transação, arrecada por AQUI e
 * grava os movimentos da dívida — tudo indivisível. `persistir` NÃO abre transação
 * nova (não existe transação aninhada no Prisma); ela grava na que já existe.
 *
 * ⚠️ SEM `contasReservadas`: a composta É a dona da conta reservada. Wire-lo aqui
 * faria a operação autorizada barrar a si mesma.
 */
export function criarM04DepsNaTx(tx: Tx): M04Deps {
  return {
    // ⚠️ A PORTA MONTADA SOBRE A **TX** — e é isto que faz a OPERAÇÃO COMPOSTA (M10 × M04)
    // autorizar DENTRO da transação dela. Ver `criarAutorizacaoPortPrisma`.
    autz: criarAutorizacaoPortPrisma(tx),
    contas: criarContaRepositoryPrisma(tx),
    classificacao: criarReceitaClassificacaoPrisma(tx),
    receitas: criarReceitaRepositoryNaTx(tx),
    ids: idsUuid,
  };
}

/**
 * Monta as deps do M04 sobre um PrismaClient.
 *
 * `ports` liga o M10 (contas reservadas + cascata da anulação). AUSENTE = ninguém
 * reserva nada e a anulação não cascateia — o comportamento de sempre. Quem usa
 * dívidas monta as deps por `criarM04DepsComDividas()` (M10).
 */
export function criarM04Deps(
  prisma: PrismaClient,
  ports?: {
    readonly contasReservadas?: ContaReservadaPort | undefined;
    readonly aoAnular?: AoAnularArrecadacaoPort | undefined;
  }
): M04Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    contas: criarContaRepositoryPrisma(prisma),
    classificacao: criarReceitaClassificacaoPrisma(prisma),
    receitas: criarReceitaRepositoryPrisma(prisma, ports?.aoAnular),
    ids: idsUuid,
    ...(ports?.contasReservadas !== undefined
      ? { contasReservadas: ports.contasReservadas }
      : {}),
  };
}
