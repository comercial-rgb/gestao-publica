/**
 * Subplugin do recurso /folhas no agrupador tenant/folha.
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { rotasFolhas } from './rotas-folhas.js'
import { rotasHolerites } from './rotas-holerites.js'

export const folhasRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(rotasFolhas)
  await app.register(rotasHolerites, { prefix: '/:id/holerites' })
}
