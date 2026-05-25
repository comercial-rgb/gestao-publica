import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { cargosRoute } from './cargos.js'
import { rubricasRoute } from './rubricas.js'
import { vinculosRoute } from './vinculos.js'
import { folhasRoutes } from './folhas/index.js'

export const tenantFolhaRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('folha')
  })

  await app.register(cargosRoute,   { prefix: '/cargos' })
  await app.register(rubricasRoute, { prefix: '/rubricas' })
  await app.register(vinculosRoute, { prefix: '/vinculos' })
  await app.register(folhasRoutes,  { prefix: '/folhas' })
}
