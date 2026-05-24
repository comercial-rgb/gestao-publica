/**
 * Definicao da Queue BullMQ "folha" + tipos dos jobs.
 *
 * Estrategia de concorrencia:
 *   - Worker tem concorrencia global alta (configuravel WORKER_CONCURRENCY)
 *   - Lock por (tenant + competencia) via Redis evita duplo processamento
 *   - Falha de lock -> job re-enfileira com delay (backoff exponencial)
 */

import { Queue, type JobsOptions } from 'bullmq'
import { redisConnection } from '../connection.js'

// ============================================================
// Nomes
// ============================================================

export const FOLHA_QUEUE_NAME = 'folha'

// ============================================================
// Tipos de jobs
// ============================================================

export type ProcessarFolhaMensalPayload = {
  tipo: 'PROCESSAR_FOLHA_MENSAL'
  tenantSlug: string
  tenantConnectionString: string
  folhaId: string
  competencia: string // YYYY-MM-DD
  /** Quem disparou (auditoria) */
  iniciadoPor: string
  /** Opcional: lista de vinculos pra processar (default: todos ativos) */
  vinculosFiltrados?: string[]
}

export type RecalcularHoleritePayload = {
  tipo: 'RECALCULAR_HOLERITE'
  tenantSlug: string
  tenantConnectionString: string
  folhaId: string
  vinculoId: string
  competencia: string
  motivo: string
  iniciadoPor: string
}

export type GerarEmpenhosFolhaPayload = {
  tipo: 'GERAR_EMPENHOS_FOLHA'
  tenantSlug: string
  tenantConnectionString: string
  folhaId: string
  competencia: string
  iniciadoPor: string
}

export type EnviarEsocialS1200Payload = {
  tipo: 'ENVIAR_ESOCIAL_S1200'
  tenantSlug: string
  tenantConnectionString: string
  folhaId: string
  vinculoId: string
  ambiente: 'PRODUCAO' | 'PRODUCAO_RESTRITA' | 'TESTE'
  iniciadoPor: string
}

export type FolhaJobPayload =
  | ProcessarFolhaMensalPayload
  | RecalcularHoleritePayload
  | GerarEmpenhosFolhaPayload
  | EnviarEsocialS1200Payload

// ============================================================
// Singleton Queue
// ============================================================

export const folhaQueue = new Queue<FolhaJobPayload>(FOLHA_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 }, // 7 dias / 1000 jobs
    removeOnFail: { age: 30 * 24 * 3600 }, // 30 dias pra debug
  },
})

// ============================================================
// Helpers de enfileiramento (API consome)
// ============================================================

export async function enfileirarProcessarFolha(
  payload: Omit<ProcessarFolhaMensalPayload, 'tipo'>,
  opts: JobsOptions = {},
): Promise<string> {
  const job = await folhaQueue.add(
    'processar-folha-mensal',
    { ...payload, tipo: 'PROCESSAR_FOLHA_MENSAL' },
    {
      jobId: `folha:${payload.tenantSlug}:${payload.folhaId}`, // deduplica
      ...opts,
    },
  )
  return job.id!
}

export async function enfileirarRecalcularHolerite(
  payload: Omit<RecalcularHoleritePayload, 'tipo'>,
  opts: JobsOptions = {},
): Promise<string> {
  const job = await folhaQueue.add(
    'recalcular-holerite',
    { ...payload, tipo: 'RECALCULAR_HOLERITE' },
    opts,
  )
  return job.id!
}

export async function enfileirarGerarEmpenhos(
  payload: Omit<GerarEmpenhosFolhaPayload, 'tipo'>,
  opts: JobsOptions = {},
): Promise<string> {
  const job = await folhaQueue.add(
    'gerar-empenhos-folha',
    { ...payload, tipo: 'GERAR_EMPENHOS_FOLHA' },
    opts,
  )
  return job.id!
}

export async function enfileirarEnvioEsocial(
  payload: Omit<EnviarEsocialS1200Payload, 'tipo'>,
  opts: JobsOptions = {},
): Promise<string> {
  const job = await folhaQueue.add(
    'enviar-esocial-s1200',
    { ...payload, tipo: 'ENVIAR_ESOCIAL_S1200' },
    opts,
  )
  return job.id!
}
