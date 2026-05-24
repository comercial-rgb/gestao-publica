/**
 * Boot do worker BullMQ.
 *
 * Inicia 1 Worker que processa todos os tipos de jobs da queue "folha".
 * O Worker roteia por job.name pro processor correto.
 *
 * Lifecycle:
 *   - SIGTERM/SIGINT -> drain (espera jobs atuais terminarem) -> fecha conexoes
 *   - Job error -> registra em logger, BullMQ trata retry
 *   - Job stalled -> BullMQ re-enfileira automaticamente
 */

import { Worker } from 'bullmq'
import { redisConnection, closeConnections } from './connection.js'
import { FOLHA_QUEUE_NAME, type FolhaJobPayload } from './queues/folha.js'
import { processarFolhaMensal } from './jobs/processar-folha-mensal.js'
import { tenantPool } from './utils/tenant-pool.js'
import { logger } from './utils/logger.js'
import { config } from './config.js'

logger.info(`Worker iniciando`, {
  workerId: config.WORKER_ID,
  concurrency: config.WORKER_CONCURRENCY,
  batchSize: config.BATCH_SIZE,
  redis: config.REDIS_URL,
  nodeEnv: config.NODE_ENV,
})

// ============================================================
// Roteador de jobs
// ============================================================

const worker = new Worker<FolhaJobPayload>(
  FOLHA_QUEUE_NAME,
  async (job) => {
    logger.info(`Job recebido`, { jobId: job.id, name: job.name, tipo: job.data.tipo })

    switch (job.data.tipo) {
      case 'PROCESSAR_FOLHA_MENSAL':
        return await processarFolhaMensal(job as any)

      // B35.3B
      case 'RECALCULAR_HOLERITE':
      case 'GERAR_EMPENHOS_FOLHA':
      case 'ENVIAR_ESOCIAL_S1200':
        throw new Error(`Job ${job.data.tipo} ainda nao implementado (B35.3B)`)

      default: {
        const _exhaustive: never = job.data
        throw new Error(`Tipo de job desconhecido: ${JSON.stringify(_exhaustive)}`)
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: config.WORKER_CONCURRENCY,
    autorun: true,
  },
)

// ============================================================
// Event listeners
// ============================================================

worker.on('completed', (job, result) => {
  logger.info(`Job concluido`, {
    jobId: job.id,
    name: job.name,
    resultado: result,
  })
})

worker.on('failed', (job, err) => {
  logger.error(`Job falhou`, {
    jobId: job?.id,
    name: job?.name,
    erro: err.message,
    tentativa: job?.attemptsMade,
  })
})

worker.on('error', (err) => {
  logger.error(`Worker error`, { erro: err.message })
})

worker.on('stalled', (jobId) => {
  logger.warn(`Job stalled`, { jobId })
})

// ============================================================
// Graceful shutdown
// ============================================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`Sinal ${signal} recebido -- iniciando shutdown gracioso`)
  try {
    await worker.close() // drain jobs atuais
    await tenantPool.closeAll()
    await closeConnections()
    logger.info(`Shutdown completo`)
    process.exit(0)
  } catch (err) {
    logger.error(`Erro durante shutdown`, { erro: String(err) })
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Erros nao tratados -> log + shutdown
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection`, { reason: String(reason) })
})

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception`, { erro: err.message, stack: err.stack })
  shutdown('uncaughtException')
})

logger.info(`Worker pronto -- aguardando jobs na queue "${FOLHA_QUEUE_NAME}"`)
