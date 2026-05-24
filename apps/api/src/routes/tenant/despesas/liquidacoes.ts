import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { resolverPeriodoFiscal, assertPeriodoAberto } from '../../../lib/fiscal.js'

export const liquidacoesRoute: FastifyPluginAsyncZod = async (app) => {

  // GET /
  app.get('/', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ empenhoId: z.string().uuid().optional(), status: z.enum(['vigente', 'cancelada']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      response: { 200: z.array(z.object({
        id: z.string().uuid(), numero: z.string(), status: z.string(), empenhoId: z.string().uuid(), empenhoNumero: z.string(),
        dataLiquidacao: z.string(), valor: z.string(), valorPago: z.string(), documentoComprovante: z.string().nullable(), fornecedorNome: z.string(),
      })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = []
    if (req.query.empenhoId) f.push(sql`l.empenho_id = ${req.query.empenhoId}`)
    if (req.query.status) f.push(sql`l.status = ${req.query.status}`)
    const where = f.length > 0 ? sql`WHERE ${sql.join(f, sql` AND `)}` : sql``
    const result = await db.execute(sql`
      SELECT l.id, l.numero, l.status, l.empenho_id, l.data_liquidacao, l.valor::text AS valor, l.valor_pago::text AS valor_pago,
        l.documento_comprovante, e.numero AS empenho_numero, p.nome AS fornecedor_nome
      FROM liquidacoes l INNER JOIN empenhos e ON e.id = l.empenho_id INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id
      ${where} ORDER BY l.data_liquidacao DESC, l.created_at DESC LIMIT ${req.query.limit}
    `)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), numero: String(r.numero), status: String(r.status), empenhoId: String(r.empenho_id), empenhoNumero: String(r.empenho_numero),
      dataLiquidacao: String(r.data_liquidacao), valor: String(r.valor), valorPago: String(r.valor_pago),
      documentoComprovante: r.documento_comprovante ? String(r.documento_comprovante) : null, fornecedorNome: String(r.fornecedor_nome),
    }))
  })

  // POST / -- criar liquidacao
  app.post('/', {
    preHandler: async (req) => req.requirePermission('despesas:liquidar'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        empenhoId: z.string().uuid(), dataLiquidacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.coerce.number().positive(),
        documentoComprovante: z.string().max(100).optional(), dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), observacoes: z.string().max(2000).optional(),
      }),
      response: { 201: z.object({ id: z.string().uuid(), numero: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const eResult = await db.execute(sql`SELECT e.id, e.numero, e.status, e.dotacao_id, e.exercicio_id, e.data_empenho, e.valor::text AS valor, e.valor_anulado::text AS valor_anulado, e.valor_liquidado::text AS valor_liquidado FROM empenhos e WHERE e.id = ${req.body.empenhoId}`)
    const eRows = eResult as unknown as Array<Record<string, unknown>>
    if (eRows.length === 0) return reply.status(422).send({ error: 'EmpenhoNaoEncontrado', message: 'Empenho nao encontrado' })
    const e = eRows[0]!

    if (e.status !== 'vigente' && e.status !== 'restos_processados' && e.status !== 'restos_nao_processados') return reply.status(422).send({ error: 'EmpenhoNaoVigente', message: `Empenho esta em status "${e.status}"` })
    if (new Date(req.body.dataLiquidacao) < new Date(e.data_empenho as string)) return reply.status(422).send({ error: 'DataInvalida', message: `Data anterior ao empenho (${e.data_empenho})` })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataLiquidacao)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const saldoALiq = Number(e.valor) - Number(e.valor_anulado) - Number(e.valor_liquidado)
    if (req.body.valor > saldoALiq + 0.001) return reply.status(422).send({ error: 'ValorExcedeSaldo', message: `Liquidacao de ${req.body.valor.toFixed(2)} excede saldo a liquidar (${saldoALiq.toFixed(2)})` })

    const seqResult = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM liquidacoes INNER JOIN empenhos emp ON emp.id = liquidacoes.empenho_id WHERE emp.exercicio_id = ${e.exercicio_id}`)
    const prox = (((seqResult as unknown as Array<Record<string, unknown>>)[0]?.qtd as number) ?? 0) + 1
    const anoResult = await db.execute(sql`SELECT ano FROM exercicios WHERE id = ${e.exercicio_id}`)
    const ano = ((anoResult as unknown as Array<Record<string, unknown>>)[0]?.ano as number)
    const numero = `${ano}/L${prox.toString().padStart(5, '0')}`

    const valorStr = req.body.valor.toFixed(2)
    const liquidacaoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.liquidacoes).values({
        numero, status: 'vigente', empenhoId: req.body.empenhoId, mesFiscalId: periodo.mes.id,
        dataLiquidacao: req.body.dataLiquidacao, valor: valorStr,
        documentoComprovante: req.body.documentoComprovante ?? null, dataDocumento: req.body.dataDocumento ?? null,
        observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.liquidacoes.id })
      await tx.execute(sql`UPDATE empenhos SET valor_liquidado = valor_liquidado + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${req.body.empenhoId}`)
      await tx.execute(sql`UPDATE dotacoes SET valor_liquidado = valor_liquidado + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${e.dotacao_id}`)
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.liquidacao.criar', resource: 'liquidacao', resourceId: liquidacaoId, after: { numero, valor: valorStr, empenhoNumero: e.numero }, ipAddress: req.ip })
    return reply.status(201).send({ id: liquidacaoId, numero })
  })

  // POST /:id/anular
  app.post('/:id/anular', {
    preHandler: async (req) => req.requirePermission('despesas:anular'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ dataAnulacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.coerce.number().positive(), motivo: z.string().min(20).max(2000), confirmNumero: z.string() }),
      response: { 200: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const lResult = await db.execute(sql`SELECT id, numero, status, empenho_id, valor::text AS valor, valor_pago::text AS valor_pago FROM liquidacoes WHERE id = ${req.params.id}`)
    const lRows = lResult as unknown as Array<Record<string, unknown>>
    if (lRows.length === 0) throw app.httpErrors.notFound('Liquidacao nao encontrada')
    const l = lRows[0]!
    if (req.body.confirmNumero !== l.numero) return reply.status(422).send({ error: 'ConfirmacaoIncorreta', message: 'Numero nao confere' })
    if (l.status !== 'vigente') return reply.status(422).send({ error: 'NaoVigente', message: 'Liquidacao nao esta vigente' })

    const saldoLivre = Number(l.valor) - Number(l.valor_pago)
    if (req.body.valor > saldoLivre + 0.001) return reply.status(422).send({ error: 'ValorExcede', message: `Excede saldo nao-pago (${saldoLivre.toFixed(2)})` })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataAnulacao)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const valorStr = req.body.valor.toFixed(2)
    const anulacaoTotal = req.body.valor >= Number(l.valor)

    const anulacaoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.liquidacoesAnulacoes).values({ liquidacaoId: req.params.id, mesFiscalId: periodo.mes.id, dataAnulacao: req.body.dataAnulacao, valor: valorStr, motivo: req.body.motivo, createdBy: req.tenantAuth!.sub }).returning({ id: tenantSchema.liquidacoesAnulacoes.id })
      if (anulacaoTotal) await tx.execute(sql`UPDATE liquidacoes SET status = 'cancelada', cancelada_em = NOW(), cancelada_por_user_id = ${req.tenantAuth!.sub}::uuid, motivo_cancelamento = ${req.body.motivo}, updated_at = NOW() WHERE id = ${req.params.id}`)
      await tx.execute(sql`UPDATE empenhos SET valor_liquidado = valor_liquidado - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${l.empenho_id}`)
      const empDot = await tx.execute(sql`SELECT dotacao_id FROM empenhos WHERE id = ${l.empenho_id}`)
      const dotId = ((empDot as unknown as Array<Record<string, unknown>>)[0]?.dotacao_id as string)
      await tx.execute(sql`UPDATE dotacoes SET valor_liquidado = valor_liquidado - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${dotId}`)
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.liquidacao.anular', resource: 'liquidacao', resourceId: req.params.id, after: { anulacaoId, valor: valorStr, total: anulacaoTotal }, ipAddress: req.ip })
    return { id: anulacaoId }
  })
}
