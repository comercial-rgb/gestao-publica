import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { leisRoute } from './leis.js'
import { programasRoute } from './programas.js'
import { acoesRoute } from './acoes.js'
import { catalogosRoute } from './catalogos.js'
import { dotacoesRoute } from './dotacoes.js'
import { creditosRoute } from './creditos.js'
import { importarRoute } from './importar.js'

export const tenantOrcamentoRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('orcamento')
  })

  await app.register(leisRoute,       { prefix: '/leis' })
  await app.register(programasRoute,  { prefix: '/programas' })
  await app.register(acoesRoute,      { prefix: '/acoes' })
  await app.register(catalogosRoute,  { prefix: '/catalogos' })
  await app.register(dotacoesRoute,   { prefix: '/dotacoes' })
  await app.register(creditosRoute,   { prefix: '/creditos' })
  await app.register(importarRoute,  { prefix: '/importar' })
}
