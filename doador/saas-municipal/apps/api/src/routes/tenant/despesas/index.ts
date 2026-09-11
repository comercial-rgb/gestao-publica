import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { agrupadoresRoute } from './agrupadores.js'
import { empenhosRoute } from './empenhos.js'
import { liquidacoesRoute } from './liquidacoes.js'
import { ordensPagamentoRoute } from './ordensPagamento.js'
import { pagamentosRoute } from './pagamentos.js'

export const tenantDespesasRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('despesas')
  })

  await app.register(agrupadoresRoute, { prefix: '/agrupadores' })
  await app.register(empenhosRoute,    { prefix: '/empenhos' })
  await app.register(liquidacoesRoute,       { prefix: '/liquidacoes' })
  await app.register(ordensPagamentoRoute, { prefix: '/ordens-pagamento' })
  await app.register(pagamentosRoute,      { prefix: '/pagamentos' })
}
