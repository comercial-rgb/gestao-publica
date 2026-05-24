/**
 * Recalcula 1 holerite individual de uma folha existente.
 *
 * Casos de uso:
 *   - Alteracao retroativa de rubrica
 *   - Correcao manual de evento funcional
 *   - Override de salario base
 *
 * Diferencas vs processarFolhaMensal:
 *   - Lock granular por vinculo+competencia (nao bloqueia folha inteira)
 *   - Versao do calculo incrementa em folha_processamento_log
 *   - Nao mexe em outros vinculos da folha
 */

import type { Job } from 'bullmq'
import { and, eq, desc, isNull } from 'drizzle-orm'
import { sql as sqlOp } from 'drizzle-orm'
import { Redis } from 'ioredis'

import {
  calcularHolerite,
  montarContextoCalculo,
  type RubricaParaCalcular,
} from '@saas-municipal/folha-engine'
import {
  folhaProcessamentoLog,
} from '@saas-municipal/database/schema/folha-calculo'

import type { RecalcularHoleritePayload } from '../queues/folha.js'
import { tenantPool } from '../utils/tenant-pool.js'
import { logger } from '../utils/logger.js'
import { publicDb, redisConnection, redisPubSub } from '../connection.js'
import { resolverRubricasParaVinculos } from '../utils/resolver-rubricas-vinculo.js'
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

export async function recalcularHolerite(
  job: Job<RecalcularHoleritePayload>,
): Promise<{ holeriteId: string; versao: number; duracaoMs: number; hashSha256: string }> {
  const inicio = Date.now()
  const { tenantSlug, tenantConnectionString, folhaId, vinculoId, competencia, motivo, iniciadoPor } = job.data

  const compDate = new Date(competencia + 'T00:00:00.000Z')
  const compIso = competencia.slice(0, 10)
  const lockKey = `folha:lock:vinculo:${tenantSlug}:${vinculoId}:${competencia}`

  logger.info('Iniciando recalculo de holerite', { tenantSlug, folhaId, vinculoId, competencia, motivo })

  if (!(await acquireLock(redisConnection, lockKey, 60))) {
    throw new Error(`Holerite ${vinculoId}/${competencia} ja esta sendo recalculado`)
  }

  try {
    const { db: tenantDb } = tenantPool.get(tenantConnectionString, tenantSlug)

    // 1) Busca vinculo pra validar existencia
    const vinculoCheck = await tenantDb.execute(sqlOp`
      SELECT id, pessoa_id, regime_previdenciario FROM vinculos_funcionais
      WHERE id = ${vinculoId} AND deleted_at IS NULL LIMIT 1
    `) as unknown as Array<Record<string, unknown>>

    if (vinculoCheck.length === 0) throw new Error(`Vinculo ${vinculoId} nao encontrado`)
    const vinculo = vinculoCheck[0]!

    // 2) Descobre proxima versao
    const [ultimo] = await tenantDb
      .select({ versao: folhaProcessamentoLog.versao })
      .from(folhaProcessamentoLog)
      .where(
        and(
          eq(folhaProcessamentoLog.folhaId, folhaId),
          eq(folhaProcessamentoLog.vinculoId, vinculoId),
        ),
      )
      .orderBy(desc(folhaProcessamentoLog.versao))
      .limit(1)

    const proximaVersao = (ultimo?.versao ?? 0) + 1

    // 3) Monta contexto (resolve tabelas + eventos + dependentes)
    const contexto = await montarContextoCalculo({
      publicDb,
      tenantDb,
      vinculoId,
      pessoaId: String(vinculo.pessoa_id),
      competencia: compDate,
      regimePrevidenciario: String(vinculo.regime_previdenciario) as any,
      workerId: config.WORKER_ID,
    })

    // 4) Resolve rubricas
    const rubricasIndexadas = await resolverRubricasParaVinculos({
      tenantDb,
      vinculoIds: [vinculoId],
      competencia: compDate,
    })
    const rubricasParaCalcular: RubricaParaCalcular[] = rubricasIndexadas.get(vinculoId) ?? []

    // 5) Calcula
    const holerite = calcularHolerite({
      contexto,
      rubricas: rubricasParaCalcular,
      versao: proximaVersao,
      workerId: config.WORKER_ID,
    })

    // 6) Grava nova versao no log
    const snapshotComMotivo = {
      ...holerite.snapshot,
      _recalculo: { motivo, iniciadoPor, versaoAnterior: ultimo?.versao ?? null },
    }

    const rows = await tenantDb
      .insert(folhaProcessamentoLog)
      .values({
        folhaId,
        vinculoId,
        competencia: compIso,
        versao: proximaVersao,
        snapshot: snapshotComMotivo,
        duracaoMs: holerite.duracaoMs,
        workerId: config.WORKER_ID,
        hashSha256: holerite.hashSha256,
      })
      .returning({ id: folhaProcessamentoLog.id })

    // 7) Publica evento no canal da folha (UI atualiza)
    await redisPubSub.publish(
      `folha:progresso:${folhaId}`,
      JSON.stringify({
        tipo: 'HOLERITE_RECALCULADO',
        folhaId,
        vinculoId,
        versao: proximaVersao,
        timestamp: new Date().toISOString(),
        motivo,
      }),
    )

    const duracao = Date.now() - inicio
    logger.info('Recalculo concluido', { vinculoId, versao: proximaVersao, duracaoMs: duracao })

    return { holeriteId: rows[0]!.id, versao: proximaVersao, duracaoMs: duracao, hashSha256: holerite.hashSha256 }
  } finally {
    await releaseLock(redisConnection, lockKey)
  }
}
