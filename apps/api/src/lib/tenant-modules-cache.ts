import type { FastifyInstance } from 'fastify'
import { createMasterDatabase, publicSchema, eq, isNull, and } from '@saas-municipal/database'
import { env } from '../env.js'

const TTL_MS = 60_000  // 60 segundos

interface CacheEntry {
  modules: Set<string>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const REDIS_CHANNEL = 'sm:tenant-modules:invalidate'

/**
 * Retorna os slugs de módulos ATIVOS de um tenant.
 * Cache de 60s. Invalidação via invalidateTenantModules() ou Redis pub/sub.
 */
export async function getTenantActiveModules(tenantId: string): Promise<Set<string>> {
  const cached = cache.get(tenantId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.modules
  }

  const db = createMasterDatabase(env.DATABASE_URL)

  const rows = await db
    .select({ slug: publicSchema.modules.slug })
    .from(publicSchema.tenantModules)
    .innerJoin(publicSchema.modules, eq(publicSchema.tenantModules.moduleId, publicSchema.modules.id))
    .where(
      and(
        eq(publicSchema.tenantModules.tenantId, tenantId),
        isNull(publicSchema.tenantModules.deactivatedAt),
        eq(publicSchema.modules.active, true),
      ),
    )

  const modules = new Set(rows.map((r) => r.slug))
  cache.set(tenantId, { modules, expiresAt: Date.now() + TTL_MS })
  return modules
}

/**
 * Invalida o cache local para um tenant.
 */
export function invalidateTenantModules(tenantId: string): void {
  cache.delete(tenantId)
}

/**
 * Publica invalidação no Redis para todos os pods limparem cache local.
 */
export async function publishInvalidation(app: FastifyInstance, tenantId: string): Promise<void> {
  invalidateTenantModules(tenantId)
  if (app.redis) {
    await app.redis.publish(REDIS_CHANNEL, tenantId)
  }
}

/**
 * Inscreve nas invalidações vindas de outros pods.
 */
export async function subscribeInvalidations(app: FastifyInstance): Promise<void> {
  if (!app.redis) {
    app.log.warn('Sem Redis — invalidação de cache de módulos não é cross-instance')
    return
  }

  const subscriber = app.redis.duplicate()
  await subscriber.subscribe(REDIS_CHANNEL)
  subscriber.on('message', (channel: string, message: string) => {
    if (channel === REDIS_CHANNEL && message) {
      invalidateTenantModules(message)
      app.log.debug({ tenantId: message }, 'cache de módulos invalidado via pub/sub')
    }
  })

  app.addHook('onClose', async () => {
    await subscriber.unsubscribe(REDIS_CHANNEL)
    await subscriber.quit()
  })

  app.log.info('Subscriber de invalidação de módulos ativo')
}
