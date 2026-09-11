/**
 * Gera empenhos da folha agregando por dotacao orcamentaria.
 *
 * Algoritmo:
 *   1. Lista todos holerites mais recentes (maior versao) da folha
 *   2. Pra cada holerite, busca vinculo_dotacoes vigente
 *   3. Agrega valores por (dotacaoId, natureza) -- chave do empenho
 *   4. Insere registros em folhas_empenhos
 *
 * Decisao G2 (B32): no MVP, este job NAO cria empenho real automaticamente.
 *                   Ele PREPARA os valores agregados. Usuario confirma no
 *                   modulo Despesas pra empenhar de fato.
 */

import type { Job } from 'bullmq'
import { and, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import { sql as sqlOp } from 'drizzle-orm'
import { Redis } from 'ioredis'

import {
  folhaProcessamentoLog,
  vinculoDotacoes,
} from '@saas-municipal/database/schema/folha-calculo'

import type { GerarEmpenhosFolhaPayload } from '../queues/folha.js'
import { tenantPool } from '../utils/tenant-pool.js'
import { logger } from '../utils/logger.js'
import { redisConnection, redisPubSub } from '../connection.js'
import { config } from '../config.js'

async function acquireLock(redis: Redis, key: string, ttl: number): Promise<boolean> {
  return (await redis.set(key, config.WORKER_ID, 'EX', ttl, 'NX')) === 'OK'
}

async function releaseLock(redis: Redis, key: string): Promise<void> {
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`,
    1,
    key,
    config.WORKER_ID,
  )
}

export async function gerarEmpenhosFolha(
  job: Job<GerarEmpenhosFolhaPayload>,
): Promise<{ empenhosPreparados: number; valorTotal: number; duracaoMs: number }> {
  const inicio = Date.now()
  const { tenantSlug, tenantConnectionString, folhaId, competencia, iniciadoPor } = job.data

  logger.info('Iniciando geracao de empenhos', { tenantSlug, folhaId, competencia })

  const lockKey = `folha:lock:empenhos:${tenantSlug}:${folhaId}`
  if (!(await acquireLock(redisConnection, lockKey, 600))) {
    throw new Error(`Empenhos da folha ${folhaId} ja sendo gerados`)
  }

  try {
    const { db: tenantDb } = tenantPool.get(tenantConnectionString, tenantSlug)
    const compIso = competencia.slice(0, 10)

    // 1) Busca holerites mais recentes (maior versao por vinculo)
    const holeritesMaisRecentes = await tenantDb.execute(sqlOp`
      SELECT DISTINCT ON (vinculo_id)
        id, folha_id, vinculo_id, competencia, versao, snapshot
      FROM folha_processamento_log
      WHERE folha_id = ${folhaId}
      ORDER BY vinculo_id, versao DESC
    `) as unknown as Array<{
      id: string
      vinculo_id: string
      snapshot: Record<string, unknown>
    }>

    if (holeritesMaisRecentes.length === 0) {
      throw new Error(`Folha ${folhaId} sem holerites processados`)
    }

    const vinculoIds = holeritesMaisRecentes.map((r) => r.vinculo_id)

    // 2) Busca vinculo_dotacoes vigentes em batch
    const dotacoesVigentes = await tenantDb
      .select()
      .from(vinculoDotacoes)
      .where(
        and(
          inArray(vinculoDotacoes.vinculoId, vinculoIds),
          isNull(vinculoDotacoes.deletedAt),
          lte(vinculoDotacoes.vigenciaInicio, compIso),
          or(isNull(vinculoDotacoes.vigenciaFim), gte(vinculoDotacoes.vigenciaFim, compIso)),
        ),
      )

    // Indexa: (vinculoId, natureza) -> [{dotacaoId, percentual}]
    const dotPorChave = new Map<string, Array<{ dotacaoId: string; percentual: number }>>()
    for (const d of dotacoesVigentes) {
      const k = `${d.vinculoId}:${d.natureza}`
      const lista = dotPorChave.get(k) ?? []
      lista.push({ dotacaoId: d.dotacaoId, percentual: Number(d.percentual) })
      dotPorChave.set(k, lista)
    }

    // 3) Agrega valores por (dotacaoId, natureza)
    const agregados = new Map<string, { dotacaoId: string; natureza: string; valor: number; vinculoIds: Set<string> }>()
    let vinculosSemDotacao = 0

    for (const row of holeritesMaisRecentes) {
      const snap = row.snapshot
      const totais = snap?.totais as Record<string, unknown> | undefined
      if (!totais) continue

      // Simplificacao MVP: agrega proventos brutos como "VENCIMENTOS"
      const proventos = Number(totais.proventos ?? 0)
      if (proventos <= 0) continue

      const dots = dotPorChave.get(`${row.vinculo_id}:VENCIMENTOS`) ?? []

      if (dots.length === 0) {
        vinculosSemDotacao++
        continue
      }

      for (const d of dots) {
        const valorRateado = Number((proventos * d.percentual).toFixed(2))
        const k = `${d.dotacaoId}|VENCIMENTOS`
        const atual = agregados.get(k) ?? { dotacaoId: d.dotacaoId, natureza: 'VENCIMENTOS', valor: 0, vinculoIds: new Set() }
        atual.valor = Number((atual.valor + valorRateado).toFixed(2))
        atual.vinculoIds.add(row.vinculo_id)
        agregados.set(k, atual)
      }
    }

    // 4) Insere em folhas_empenhos (vincula folha -> empenho futuro)
    // No MVP, grava como observacao os valores preparados pra revisao manual
    const empenhosPreparados = agregados.size

    if (empenhosPreparados > 0) {
      const resumo = [...agregados.values()].map((a) => ({
        dotacaoId: a.dotacaoId,
        natureza: a.natureza,
        valor: a.valor,
        vinculos: a.vinculoIds.size,
      }))

      // Atualiza folha com resumo de empenhos preparados
      await tenantDb.execute(sqlOp`
        UPDATE folhas SET
          observacoes = COALESCE(observacoes, '') || ${`\n[EMPENHOS] ${resumo.length} dotacoes preparadas, total R$ ${resumo.reduce((s, r) => s + r.valor, 0).toFixed(2)}`},
          updated_at = NOW()
        WHERE id = ${folhaId}
      `)
    }

    const valorTotal = [...agregados.values()].reduce((s, a) => s + a.valor, 0)

    // 5) Publica evento
    await redisPubSub.publish(
      `folha:progresso:${folhaId}`,
      JSON.stringify({
        tipo: 'EMPENHOS_GERADOS',
        folhaId,
        empenhosPreparados,
        valorTotal,
        vinculosSemDotacao,
        timestamp: new Date().toISOString(),
      }),
    )

    const duracao = Date.now() - inicio
    logger.info('Empenhos preparados', { folhaId, empenhosPreparados, valorTotal, vinculosSemDotacao, duracaoMs: duracao })

    return { empenhosPreparados, valorTotal, duracaoMs: duracao }
  } finally {
    await releaseLock(redisConnection, lockKey)
  }
}
