/**
 * Conexoes compartilhadas: Redis (BullMQ + pub/sub) e PG (schema public).
 *
 * Para PG do TENANT, use TenantPool (cache de pools por slug do tenant).
 */

import { Redis } from 'ioredis'
import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { config } from './config.js'

// ============================================================
// Redis -- singleton compartilhado
// ============================================================

/**
 * Conexao Redis principal -- usada pelo BullMQ.
 *
 * IMPORTANTE: BullMQ exige `maxRetriesPerRequest: null` pra blocking commands.
 */
export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
})

redisConnection.on('error', (err) => {
  console.error('[Redis] erro de conexao:', err)
})

redisConnection.on('connect', () => {
  console.log(`[Redis] conectado em ${config.REDIS_URL}`)
})

/**
 * Conexao separada pra pub/sub (Redis nao permite usar mesma conexao).
 */
export const redisPubSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
})

// ============================================================
// PG public -- pool compartilhado
// ============================================================

const publicSql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const publicDb: PostgresJsDatabase<any> = drizzle(publicSql)

// ============================================================
// Cleanup gracioso
// ============================================================

export async function closeConnections(): Promise<void> {
  console.log('[Worker] fechando conexoes...')
  await Promise.allSettled([
    redisConnection.quit(),
    redisPubSub.quit(),
    publicSql.end({ timeout: 5 }),
  ])
  console.log('[Worker] conexoes fechadas')
}
