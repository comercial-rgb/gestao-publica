import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { agrupadoresRoute } from './agrupadores.js'
import { empenhosRoute } from './empenhos.js'
import { liquidacoesRoute } from './liquidacoes.js'

export const tenantDespesasRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('despesas')
  })

  await app.register(agrupadoresRoute, { prefix: '/agrupadores' })
  await app.register(empenhosRoute,    { prefix: '/empenhos' })
  await app.register(liquidacoesRoute, { prefix: '/liquidacoes' })
}
