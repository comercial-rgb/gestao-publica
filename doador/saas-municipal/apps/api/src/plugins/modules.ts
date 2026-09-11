import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getTenantActiveModules, subscribeInvalidations } from '../lib/tenant-modules-cache.js'

declare module 'fastify' {
  interface FastifyRequest {
    requireActiveModule(slug: string): Promise<void>
  }
}

async function modulesPluginFn(app: FastifyInstance) {
  await subscribeInvalidations(app)

  app.decorateRequest('requireActiveModule', async function (this: FastifyRequest, slug: string) {
    if (!this.tenantAuth) {
      throw this.server.httpErrors.unauthorized('Tenant não autenticado')
    }

    const activeModules = await getTenantActiveModules(this.tenantAuth.tid)

    if (!activeModules.has(slug)) {
      const err = this.server.httpErrors.createError(
        402,
        `Módulo "${slug}" não está ativo para este tenant. Entre em contato com o administrador da plataforma para contratar.`,
      )
      ;(err as Record<string, unknown>).code = 'MODULE_NOT_ACTIVE'
      ;(err as Record<string, unknown>).moduleSlug = slug
      throw err
    }
  })
}

export const modulesPlugin = fp(modulesPluginFn, {
  name: 'modules-plugin',
  fastify: '5.x',
  dependencies: ['auth-plugin', 'redis-plugin'],
})
