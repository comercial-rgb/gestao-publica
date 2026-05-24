/**
 * Configuracao do worker BullMQ.
 *
 * Variaveis de ambiente:
 *   - REDIS_URL: ex. redis://localhost:6380 (dev) ou redis://prod-host:6379
 *   - DATABASE_URL: PG do schema public (resolve metadados de tenants)
 *   - WORKER_CONCURRENCY: quantos jobs paralelos (default 5)
 *   - BATCH_SIZE: tamanho do batch de holerites (default 200)
 *   - WORKER_ID: identificador desta instancia (default hostname)
 *   - LOG_LEVEL: error | warn | info | debug (default info)
 *   - NODE_ENV: development | production | test
 */

import { z } from 'zod'
import { hostname } from 'node:os'

const ConfigSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6380'),
  DATABASE_URL: z.string().default('postgres://saas:saas@localhost:5434/saas_municipal'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  BATCH_SIZE: z.coerce.number().int().positive().default(200),
  WORKER_ID: z.string().default(`worker-${hostname()}-${process.pid}`),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** TTL do lock por (tenant + competencia) em segundos -- protege contra duplo processamento */
  LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 30), // 30 min

  /** Limite maximo de retries para falhas transientes */
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env)
  if (!result.success) {
    console.error('[ERRO] Configuracao invalida:', result.error.format())
    process.exit(1)
  }
  return result.data
}

export const config = loadConfig()
