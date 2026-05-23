/**
 * Plugin de resolução de tenant.
 *
 * Decora `request.resolveTenant()` que:
 *   1. Se houver tenantAuth (já autenticado), usa o tid/sch dele
 *   2. Senão, lê X-Tenant-Slug do header e busca em public.tenants
 *
 * Popula `request.tenant` com a row completa do tenant (sem expor passwordHash).
 */
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createMasterDatabase, publicSchema, eq, and, isNull } from '@saas-municipal/database'
import { env } from '../env.js'

type TenantContext = {
  id: string
  slug: string
  schemaName: string
  name: string
  cnpj: string
  state: string
  city: string
  status: 'pending' | 'active' | 'suspended' | 'archived'
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantContext
    resolveTenant(): Promise<TenantContext>
  }
}

async function tenantResolverFn(app: FastifyInstance) {
  app.decorateRequest('tenant', undefined)

  app.decorateRequest('resolveTenant', async function (this: FastifyRequest) {
    // 1. Já resolvido na request (cache)
    if (this.tenant) return this.tenant

    const db = createMasterDatabase(env.DATABASE_URL)

    // 2. Via token autenticado
    if (this.tenantAuth) {
      const row = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) =>
          and(eq(t.id, this.tenantAuth!.tid), isNull(t.deletedAt)),
      })
      if (!row) throw this.server.httpErrors.notFound('Tenant não encontrado')
      this.tenant = pick(row)
      return this.tenant
    }

    // 3. Via header X-Tenant-Slug (em rotas públicas como /tenant/auth/login)
    const slug = this.headers['x-tenant-slug']
    if (typeof slug !== 'string' || !slug) {
      throw this.server.httpErrors.badRequest('Header X-Tenant-Slug ausente')
    }

    const row = await db.query.tenants.findFirst({
      where: (t, { eq, and, isNull }) => and(eq(t.slug, slug), isNull(t.deletedAt)),
    })
    if (!row) throw this.server.httpErrors.notFound(`Tenant "${slug}" não encontrado`)
    if (row.status !== 'active') {
      throw this.server.httpErrors.forbidden(`Tenant está com status "${row.status}"`)
    }

    this.tenant = pick(row)
    return this.tenant
  })
}

function pick(row: typeof publicSchema.tenants.$inferSelect): TenantContext {
  return {
    id: row.id,
    slug: row.slug,
    schemaName: row.schemaName,
    name: row.name,
    cnpj: row.cnpj,
    state: row.state,
    city: row.city,
    status: row.status,
  }
}

export const tenantResolverPlugin = fp(tenantResolverFn, {
  name: 'tenant-resolver',
  fastify: '5.x',
  dependencies: ['auth-plugin'],
})
