import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { idsUuid } from "../m01-core-contabil/adapter-prisma.js";
import { calcularSaldos } from "../m05-despesa/dominio.js";
import {
  garantirDotacaoInicial,
  recalcularCache,
  totaisPorTipo,
  travarFichas,
  type Tx,
} from "../m05-despesa/adapter-prisma.js";
import { estornarMovimentoDotacao, registrarMovimentoDotacao } from "../m05-despesa/dotacao-razao.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { conferirLimiteDaRealocacao } from "./limite-de-suplementacao.js";
import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import type {
  AtoParaAnular,
  RealocacaoDeps,
  RealocacaoParaPersistir,
  RealocacaoRepositoryPort,
} from "./realocacao.js";

/** O `origemTipo` dos movimentos e lançamentos da realocação — é por ele que o razão volta ao ato. */
export const ORIGEM_REALOCACAO = "REALOCACAO_DE_DOTACAO";

/**
 * O saldo que a ficha pode CEDER agora: o disponível CORRENTE (autorizado − reservado −
 * empenhado), pelo SUM real, dentro da transação e depois do lock.
 *
 * ⚠️ CORRENTE, e não cortado por competência: a pergunta é "há saldo para tirar AGORA?". Cortado
 * na data do ato, ele ignoraria um empenho posterior e deixaria ceder o que já foi gasto.
 */
async function disponivelCorrente(tx: Tx, fichaId: string, criadoPor: string) {
  await garantirDotacaoInicial(tx, fichaId, criadoPor);
  return calcularSaldos(await totaisPorTipo(tx, fichaId, { eixo: "CORRENTE" })).disponivel;
}

export function criarRealocacaoRepositoryPrisma(prisma: PrismaClient): RealocacaoRepositoryPort {
  return {
    async registrar(p: RealocacaoParaPersistir) {
      return prisma.$transaction(async (tx) => {
        const fichaIds = p.pernas.map((x) => x.fichaId);
        // ⚠️ O LOCK ANTES DE QUALQUER SOMA. Ceder dotação consome disponível — a mesma corrida do
        // empenho. `travarFichas` ordena por id: dois atos com as mesmas fichas não se abraçam.
        await travarFichas(tx, fichaIds);

        const ano = anoCivil(p.data);

        // ── AS PRÉ-CONDIÇÕES, TODAS ANTES DO PRIMEIRO `create` ──────────────────────────────
        // Um ato gravado antes de uma guarda que depois recusa deixaria o número ocupado para
        // sempre, e a próxima tentativa tropeçaria num ato que nunca deveria ter nascido.

        const repetido = await tx.atoDeRealocacao.findUnique({
          where: { ano_numero: { ano, numero: p.numero } },
          select: { id: true },
        });
        if (repetido !== null) {
          throw new Error(
            `Já existe o ato ${p.numero}/${String(ano)} de realocação. Um número identifica um ato só ` +
              `— se é o mesmo, ele já foi gravado; se é outro, confira o número. Nada foi gravado.`
          );
        }

        const fichas = await tx.fichaOrcamentaria.findMany({
          where: { id: { in: fichaIds } },
          select: { id: true, numero: true, fonteId: true, exercicio: true },
        });
        if (fichas.length !== fichaIds.length) {
          throw new Error(`Ficha inexistente na realocação. Nada foi gravado.`);
        }
        const porId = new Map(fichas.map((f) => [f.id, f]));

        for (const f of fichas) {
          // O ato é do exercício da DATA dele. Uma ficha de outro ano não se move por este ato.
          if (f.exercicio !== ano) {
            throw new Error(
              `A ficha ${String(f.numero)} é do exercício ${String(f.exercicio)}, e o ato é de ` +
                `${diaCivil(p.data)}. Uma realocação move dotação do próprio exercício. Nada foi gravado.`
            );
          }
          // M08 — fail-closed: exercício encerrado não tem orçamento a mover.
          await exigirExercicioAberto(tx, f.exercicio, `realocação na ficha ${String(f.numero)}`);
        }

        for (const perna of p.pernas) {
          const f = porId.get(perna.fichaId)!;
          if (f.fonteId !== perna.fonteId) {
            throw new Error(
              `A fonte informada na perna da ficha ${String(f.numero)} não é a fonte da ficha. ` +
                `A fonte de cada perna é a da ficha — sem isso, o fechamento por fonte conferiria ` +
                `uma ficção. Nada foi gravado.`
            );
          }
        }

        // ⚠️ NÃO SE CEDE O QUE JÁ FOI EMPENHADO OU RESERVADO.
        for (const perna of p.pernas) {
          if (perna.tipo !== "REDUCAO") continue;
          const disponivel = await disponivelCorrente(tx, perna.fichaId, p.criadoPor);
          if (perna.valor.greaterThan(disponivel)) {
            const f = porId.get(perna.fichaId)!;
            throw new Error(
              `A ficha ${String(f.numero)} não tem saldo para ceder ${perna.valor.toFixed(2)}: o ` +
                `disponível agora é ${disponivel.toFixed(2)}. Dotação empenhada ou reservada não se ` +
                `remaneja. Nada foi gravado.`
            );
          }
        }

        // V35 — sob a autorização percentual da LOA, os acréscimos correm contra o mesmo percentual (limite-de-suplementacao.ts).
        if (p.autorizacaoDaLoaId !== null) {
          const acrescimo = p.pernas.filter((x) => x.tipo === "ACRESCIMO").reduce((a, x) => toMoney(a.plus(x.valor)), toMoney("0.00"));
          await conferirLimiteDaRealocacao(tx, { autorizacaoId: p.autorizacaoDaLoaId, exercicio: ano, acrescimoAgora: acrescimo });
        }

        // ── A GRAVAÇÃO ──────────────────────────────────────────────────────────────────────
        await tx.atoDeRealocacao.create({
          data: {
            id: p.atoId,
            especie: p.especie,
            numero: p.numero,
            ano,
            data: p.data,
            leiNumero: p.leiNumero,
            leiDataPublicacao: p.leiDataPublicacao,
            autorizacaoDaLoaId: p.autorizacaoDaLoaId,
            justificativa: p.justificativa,
            criadoPor: p.criadoPor,
          },
        });

        for (const perna of p.pernas) {
          await garantirDotacaoInicial(tx, perna.fichaId, p.criadoPor);
          // O movimento E a perna no razão, na mesma transação (5.2.2.1.9.02 contra o crédito
          // disponível, pelo roteiro do tipo — ver `CONTA_REALOCACAO_ACRESCIMO`).
          const mov = await registrarMovimentoDotacao(tx, {
            fichaId: perna.fichaId,
            tipo: perna.tipo === "ACRESCIMO" ? "REALOCACAO_ACRESCIMO" : "REALOCACAO_REDUCAO",
            valor: perna.valor.toFixed(2),
            origemTipo: ORIGEM_REALOCACAO,
            origemId: p.atoId,
            criadoPor: p.criadoPor,
            data: p.data,
            historico:
              `${perna.tipo === "ACRESCIMO" ? "Recebe" : "Cede"} dotação — ato ${p.numero}/${String(ano)}, ` +
              `lei ${p.leiNumero}`,
          });
          await tx.itemDeRealocacao.create({
            data: {
              id: perna.itemId,
              atoId: p.atoId,
              fichaId: perna.fichaId,
              tipo: perna.tipo,
              valor: perna.valor.toFixed(2),
              fonteId: perna.fonteId,
              movimentoDotacaoId: mov.movimentoId,
              criadoPor: p.criadoPor,
            },
          });
        }

        for (const fichaId of fichaIds) {
          await recalcularCache(tx, fichaId);
        }
        return { atoId: p.atoId, ano };
      });
    },

    async buscarParaAnular(atoId: string): Promise<AtoParaAnular | null> {
      const ato = await prisma.atoDeRealocacao.findUnique({
        where: { id: atoId },
        select: {
          id: true,
          numero: true,
          ano: true,
          anulacao: { select: { id: true } },
          itens: { where: { estornoDeId: null }, select: { id: true, fichaId: true } },
        },
      });
      if (ato === null) return null;
      return {
        id: ato.id,
        numero: ato.numero,
        ano: ato.ano,
        anulado: ato.anulacao !== null,
        pernasVivas: ato.itens,
      };
    },

    async anular(p) {
      return prisma.$transaction(async (tx) => {
        const ato = await tx.atoDeRealocacao.findUniqueOrThrow({
          where: { id: p.atoId },
          select: {
            numero: true,
            ano: true,
            data: true,
            anulacao: { select: { id: true } },
            itens: {
              where: { estornoDeId: null },
              orderBy: { id: "asc" },
              select: {
                id: true,
                fichaId: true,
                tipo: true,
                valor: true,
                fonteId: true,
                movimentoDotacaoId: true,
                ficha: { select: { numero: true, exercicio: true } },
              },
            },
          },
        });
        await travarFichas(tx, ato.itens.map((i) => i.fichaId));

        // ── PRÉ-CONDIÇÕES ───────────────────────────────────────────────────────────────────
        // ⚠️ RELIDA DEPOIS DO LOCK. A leitura acima veio antes dele: duas anulações simultâneas a
        // leriam vazia, a segunda esperaria o lock e seguiria com o dado velho. (O índice único de
        // `atoId` recusaria a segunda de qualquer jeito — com "unique constraint" na tela, e não
        // com a frase certa.)
        const anulacao = await tx.anulacaoDeRealocacao.findUnique({
          where: { atoId: p.atoId },
          select: { id: true },
        });
        if (ato.anulacao !== null || anulacao !== null) {
          throw new Error(`O ato ${ato.numero}/${String(ato.ano)} já foi anulado. Nada foi gravado.`);
        }
        if (diaCivil(p.data) < diaCivil(ato.data)) {
          throw new Error(
            `A anulação (${diaCivil(p.data)}) não pode ser anterior ao ato que ela desfaz ` +
              `(${diaCivil(ato.data)}). Nada foi gravado.`
          );
        }
        for (const item of ato.itens) {
          await exigirExercicioAberto(tx, item.ficha.exercicio, `anulação de realocação na ficha ${String(item.ficha.numero)}`);
        }
        // ⚠️ DESFAZER TIRA DOTAÇÃO DE QUEM RECEBEU — e ela pode já ter sido empenhada. A mesma regra
        // do registro, do outro lado: não se devolve o que a ficha que recebeu já comprometeu.
        for (const item of ato.itens) {
          if (item.tipo !== "ACRESCIMO") continue;
          const valor = toMoney(item.valor.toFixed(2));
          const disponivel = await disponivelCorrente(tx, item.fichaId, p.criadoPor);
          if (valor.greaterThan(disponivel)) {
            throw new Error(
              `Não dá para desfazer: a ficha ${String(item.ficha.numero)} recebeu ${valor.toFixed(2)} ` +
                `por este ato e hoje tem só ${disponivel.toFixed(2)} disponível — o resto já foi ` +
                `empenhado ou reservado. Anule antes o que foi comprometido. Nada foi gravado.`
            );
          }
        }

        if (p.idsDasPernasDeEstorno.length !== ato.itens.length) {
          throw new Error(
            `O ato mudou entre a leitura e a anulação (${String(ato.itens.length)} perna(s) viva(s), ` +
              `${String(p.idsDasPernasDeEstorno.length)} esperada(s)). Tente de novo. Nada foi gravado.`
          );
        }
        // ── A GRAVAÇÃO ──────────────────────────────────────────────────────────────────────
        await tx.anulacaoDeRealocacao.create({
          data: { atoId: p.atoId, data: p.data, motivo: p.motivo, criadoPor: p.criadoPor },
        });

        let i = 0;
        for (const item of ato.itens) {
          const mov = await estornarMovimentoDotacao(tx, {
            movimentoId: item.movimentoDotacaoId,
            data: p.data,
            origemTipo: ORIGEM_REALOCACAO,
            origemId: p.atoId,
            historico: `Anulação do ato ${ato.numero}/${String(ato.ano)} de realocação — ${p.motivo}`,
            criadoPor: p.criadoPor,
          });
          await tx.itemDeRealocacao.create({
            data: {
              id: p.idsDasPernasDeEstorno[i]!,
              atoId: p.atoId,
              fichaId: item.fichaId,
              tipo: item.tipo === "ACRESCIMO" ? "REDUCAO" : "ACRESCIMO",
              valor: item.valor,
              fonteId: item.fonteId,
              movimentoDotacaoId: mov.movimentoId,
              estornoDeId: item.id,
              criadoPor: p.criadoPor,
            },
          });
          i += 1;
        }

        for (const fichaId of new Set(ato.itens.map((x) => x.fichaId))) {
          await recalcularCache(tx, fichaId);
        }
        return { pernasEstornadas: ato.itens.length };
      });
    },
  };
}

export function criarRealocacaoDeps(prisma: PrismaClient): RealocacaoDeps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    realocacoes: criarRealocacaoRepositoryPrisma(prisma),
    ids: idsUuid,
  };
}
