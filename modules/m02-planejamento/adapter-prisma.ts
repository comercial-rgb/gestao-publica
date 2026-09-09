import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { toMoney } from "../../packages/contracts/index.js";
// ⚠️ INVERSÃO DE CAMADA CONHECIDA: o M02 importa do M05. As colunas de saldo
// vivem na FichaOrcamentaria — que é model do M02 — mas o mecanismo que as
// recalcula nasceu no M05. Ver "Pendências" no MODULO.md: o mecanismo de saldo
// deveria descer para o M02 (ou para um pacote compartilhado).
import { recalcularCache } from "../m05-despesa/adapter-prisma.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { registrarMovimentoDotacao } from "../m05-despesa/dotacao-razao.js";
import type {
  ClassificacaoRepositoryPort,
  FichaParaPersistir,
  FichaRepositoryPort,
  M02Deps,
  ReceitaPrevistaParaPersistir,
  ReceitaPrevistaRepositoryPort,
  ResolucaoClassificacao,
  ResolucaoReceita,
} from "./ports.js";

/**
 * ADAPTERS do M02 — a única camada que conhece Prisma.
 *
 * O PrismaClient vem de fora: quem o constrói é `criarPrismaClient()` do M01
 * (Prisma 7 exige driver adapter). Instanciar `new PrismaClient()` aqui é
 * proibido.
 *
 * Dinheiro cruza a fronteira do Prisma como STRING de 2 casas — `Prisma.Decimal`
 * e o `Decimal` do domínio são classes distintas (mesma regra do M01).
 */

const CODIGO_UNIQUE_VIOLADO = "P2002";

function ehViolacaoDeUnicidade(e: unknown): e is { code: string; meta?: unknown } {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === CODIGO_UNIQUE_VIOLADO
  );
}

export function criarClassificacaoRepositoryPrisma(
  prisma: Tx
): ClassificacaoRepositoryPort {
  return {
    async resolver(c): Promise<ResolucaoClassificacao> {
      const [
        orgao,
        unidadeOrc,
        funcao,
        subfuncao,
        programa,
        acao,
        naturezaDespesa,
        fonte,
        co,
      ] = await Promise.all([
        prisma.orgao.findUnique({
          where: { codigo: c.orgao },
          select: { id: true },
        }),
        prisma.unidadeOrcamentaria.findUnique({
          where: { codigo: c.unidadeOrc },
          select: { id: true, orgaoId: true },
        }),
        prisma.funcao.findUnique({
          where: { codigo: c.funcao },
          select: { id: true },
        }),
        prisma.subfuncao.findUnique({
          where: { codigo: c.subfuncao },
          select: { id: true },
        }),
        prisma.programa.findUnique({
          where: { codigo: c.programa },
          select: { id: true },
        }),
        prisma.acao.findUnique({
          where: { codigo: c.acao },
          select: { id: true },
        }),
        prisma.naturezaDespesa.findUnique({
          where: { codigoCompleto: c.naturezaDespesa },
          select: { id: true },
        }),
        prisma.fonteRecurso.findUnique({
          where: { codigo: c.fonte },
          select: { id: true },
        }),
        c.co === undefined
          ? Promise.resolve(null)
          : prisma.codigoAcompanhamento.findUnique({
              where: { codigo: c.co },
              select: { id: true },
            }),
      ]);

      return {
        orgao,
        unidadeOrc,
        funcao,
        subfuncao,
        programa,
        acao,
        naturezaDespesa,
        fonte,
        co,
      };
    },

    async resolverReceita(c): Promise<ResolucaoReceita> {
      const [naturezaReceita, fonte] = await Promise.all([
        prisma.naturezaReceita.findUnique({
          where: { codigo: c.naturezaReceita },
          select: { id: true },
        }),
        prisma.fonteRecurso.findUnique({
          where: { codigo: c.fonte },
          select: { id: true },
        }),
      ]);
      return { naturezaReceita, fonte };
    },
  };
}

export function criarFichaRepositoryPrisma(
  prisma: PrismaClient
): FichaRepositoryPort {
  return {
    /**
     * Cria a ficha E a sua DOTACAO_INICIAL, na MESMA transação.
     *
     * POR QUE EAGER (e não preguiçoso): a `DOTACAO_INICIAL` costumava ser semeada
     * na PRIMEIRA operação de saldo. Consequência: uma ficha nunca
     * reservada/empenhada/creditada tinha ZERO movimento, e portanto
     * `saldoAutorizado = 0` — não o `valorDotado` que a LOA fixou. Nenhuma escrita
     * era comprometida (todo caminho de escrita semeava antes de checar), mas
     * qualquer DEMONSTRATIVO de saldo mostrava 0 para as fichas intocadas. Isso é
     * erro de conformidade num relatório que vai ao TCE.
     *
     * Agora a ficha NASCE com a dotação registrada: a dotação da LOA é um FATO do
     * momento em que a ficha passa a existir, não do momento em que alguém a usa.
     */
    async criar(ficha: FichaParaPersistir): Promise<string> {
      try {
        const id = await prisma.$transaction(async (tx) => {
          // M08 — fail-closed: não se cria ficha em exercício inexistente ou
          // encerrado. Dentro da transação, antes de qualquer INSERT.
          await exigirExercicioAberto(
            tx,
            ficha.exercicio,
            `criação da ficha ${ficha.numero}`
          );

          const criada = await tx.fichaOrcamentaria.create({
            data: {
              exercicio: ficha.exercicio,
              numero: ficha.numero,
              orgaoId: ficha.orgaoId,
              unidadeOrcId: ficha.unidadeOrcId,
              funcaoId: ficha.funcaoId,
              subfuncaoId: ficha.subfuncaoId,
              programaId: ficha.programaId,
              acaoId: ficha.acaoId,
              naturezaDespesaId: ficha.naturezaDespesaId,
              fonteId: ficha.fonteId,
              coId: ficha.coId ?? null,
              exercicioFonte: ficha.exercicioFonte,
              valorDotado: ficha.valorDotado.toFixed(2),
            },
            select: { id: true },
          });

          // INVARIANTE: ficha criada => exatamente UMA DotacaoInicial.
          // Append-only: este movimento é imutável como todos os outros.
          // ⚠️ O MOVIMENTO **E A PERNA NO RAZÃO**, na MESMA transação. Até 09406c1 a
          // dotação da LOA vivia só aqui e NUNCA tocava o razão — o crédito disponível
          // era debitado pelo empenho e nunca creditado pela LOA. Ver `dotacao-razao.ts`.
          await registrarMovimentoDotacao(tx, {
            fichaId: criada.id,
            tipo: "DOTACAO_INICIAL",
            valor: ficha.valorDotado.toFixed(2),
            origemTipo: "LOA",
            origemId: criada.id,
            // quem dota é a LEI; a ficha não carrega autor.
            criadoPor: "LOA",
            // ⚠️ A DOTAÇÃO É UM FATO DE 1º DE JANEIRO do exercício — não do dia da
            // digitação. Pela data de digitação, a MSC de março mostraria a LOA
            // "entrando" em março.
            data: new Date(Date.UTC(ficha.exercicio, 0, 1, 12, 0, 0)),
            historico: `Dotação inicial da ficha ${ficha.numero} (LOA ${ficha.exercicio})`,
          });

          // Cache = SUM dos movimentos (regra do M05). Nunca `saldo = valor`.
          await recalcularCache(tx, criada.id);

          return criada.id;
        });
        return id;
      } catch (e) {
        // A integridade é do BANCO (uq_ficha_sagres / exercicio+numero);
        // a mensagem legível é nossa.
        if (ehViolacaoDeUnicidade(e)) {
          throw new Error(
            `Ficha duplicada no exercício ${ficha.exercicio}: já existe ficha ` +
              `com este número ou com esta mesma classificação orçamentária ` +
              `(uq_ficha_sagres).`,
            { cause: e }
          );
        }
        throw e;
      }
    },

    async buscarPorNumero(exercicio, numero) {
      const f = await prisma.fichaOrcamentaria.findUnique({
        where: { exercicio_numero: { exercicio, numero } },
      });
      if (f === null) return null;

      return {
        id: f.id,
        exercicio: f.exercicio,
        numero: f.numero,
        orgaoId: f.orgaoId,
        unidadeOrcId: f.unidadeOrcId,
        funcaoId: f.funcaoId,
        subfuncaoId: f.subfuncaoId,
        programaId: f.programaId,
        acaoId: f.acaoId,
        naturezaDespesaId: f.naturezaDespesaId,
        fonteId: f.fonteId,
        ...(f.coId !== null ? { coId: f.coId } : {}),
        exercicioFonte: f.exercicioFonte,
        valorDotado: toMoney(f.valorDotado.toFixed(2)),
      };
    },
  };
}

export function criarReceitaPrevistaRepositoryPrisma(
  prisma: PrismaClient
): ReceitaPrevistaRepositoryPort {
  return {
    async criar(receita: ReceitaPrevistaParaPersistir): Promise<string> {
      try {
        const criada = await prisma.receitaPrevista.create({
          data: {
            exercicio: receita.exercicio,
            naturezaReceitaId: receita.naturezaReceitaId,
            fonteId: receita.fonteId,
            exercicioFonte: receita.exercicioFonte,
            tipoReceita: receita.tipoReceita,
            valorPrevisto: receita.valorPrevisto.toFixed(2),
          },
          select: { id: true },
        });
        return criada.id;
      } catch (e) {
        if (ehViolacaoDeUnicidade(e)) {
          throw new Error(
            `Receita prevista duplicada no exercício ${receita.exercicio}: ` +
              `já existe previsão para esta natureza + fonte + tipo.`,
            { cause: e }
          );
        }
        throw e;
      }
    },

    async reprevisar(r): Promise<string> {
      // APPEND-ONLY: cada reprevisão é uma linha nova (sem unique — corrigir é lançar outra).
      const criada = await prisma.receitaReprevista.create({
        data: {
          exercicio: r.exercicio,
          naturezaCodigo: r.naturezaCodigo,
          fonteCodigo: r.fonteCodigo,
          tipoReceita: r.tipoReceita,
          valorAjuste: r.valorAjuste.toFixed(2),
          motivo: r.motivo,
          data: r.data,
          criadoPor: r.criadoPor,
        },
        select: { id: true },
      });
      return criada.id;
    },
  };
}

/** Monta as deps do M02 sobre um PrismaClient criado por `criarPrismaClient()`. */
export function criarM02Deps(prisma: PrismaClient): M02Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    classificacao: criarClassificacaoRepositoryPrisma(prisma),
    fichas: criarFichaRepositoryPrisma(prisma),
    receitas: criarReceitaPrevistaRepositoryPrisma(prisma),
  };
}
