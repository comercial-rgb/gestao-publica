import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naturezasRoute } from './naturezas.js'
import { tiposRoute } from './tipos.js'
import { lancamentosRoute } from './lancamentos.js'
import { arrecadacoesRoute } from './arrecadacoes.js'
import { anulacoesRoute } from './anulacoes.js'
import { relatoriosRoute } from './relatorios.js'

export const tenantReceitasRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('receitas')
  })

  await app.register(naturezasRoute,    { prefix: '/naturezas' })
  await app.register(tiposRoute,        { prefix: '/tipos' })
  await app.register(lancamentosRoute,  { prefix: '/lancamentos' })
  await app.register(arrecadacoesRoute, { prefix: '/arrecadacoes' })
  await app.register(anulacoesRoute,    { prefix: '/anulacoes' })
  await app.register(relatoriosRoute,   { prefix: '/relatorios' })
}
