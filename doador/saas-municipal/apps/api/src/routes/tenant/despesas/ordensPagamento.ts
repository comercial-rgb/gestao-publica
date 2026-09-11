import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { resolverPeriodoFiscal, assertPeriodoAberto } from '../../../lib/fiscal.js'

export const ordensPagamentoRoute: FastifyPluginAsyncZod = async (app) => {

  // GET /
  app.get('/', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ status: z.string().optional(), liquidacaoId: z.string().uuid().optional(), empenhoId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }),
      response: { 200: z.object({ items: z.array(z.object({
        id: z.string().uuid(), numero: z.string(), status: z.string(), dataEmissao: z.string(), dataAprovacao: z.string().nullable(),
        valor: z.string(), valorPago: z.string(), saldoPagar: z.string(), liquidacaoNumero: z.string(), empenhoNumero: z.string(), fornecedorNome: z.string(),
      })), pagination: z.object({ nextCursor: z.string().nullable() }) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = []
    if (req.query.status) f.push(sql`op.status = ${req.query.status}`)
    if (req.query.liquidacaoId) f.push(sql`op.liquidacao_id = ${req.query.liquidacaoId}`)
    if (req.query.empenhoId) f.push(sql`l.empenho_id = ${req.query.empenhoId}`)
    const where = f.length > 0 ? sql`WHERE ${sql.join(f, sql` AND `)}` : sql``
    const limit = req.query.limit
    const result = await db.execute(sql`
      SELECT op.id, op.numero, op.status, op.data_emissao, op.data_aprovacao, op.valor::text AS valor, op.valor_pago::text AS valor_pago,
        (op.valor - op.valor_pago)::text AS saldo_pagar, l.numero AS liquidacao_numero, e.numero AS empenho_numero, p.nome AS fornecedor_nome, op.created_at
      FROM ordens_pagamento op INNER JOIN liquidacoes l ON l.id = op.liquidacao_id INNER JOIN empenhos e ON e.id = l.empenho_id INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id
      ${where} ORDER BY op.created_at DESC LIMIT ${limit + 1}
    `)
    const rows = result as unknown as Array<Record<string, unknown>>
    const items = rows.slice(0, limit).map((r) => ({
      id: String(r.id), numero: String(r.numero), status: String(r.status), dataEmissao: String(r.data_emissao),
      dataAprovacao: r.data_aprovacao ? String(r.data_aprovacao) : null, valor: String(r.valor), valorPago: String(r.valor_pago),
      saldoPagar: String(r.saldo_pagar), liquidacaoNumero: String(r.liquidacao_numero), empenhoNumero: String(r.empenho_numero), fornecedorNome: String(r.fornecedor_nome),
    }))
    return { items, pagination: { nextCursor: rows.length > limit ? new Date(rows[limit - 1]!.created_at as string).toISOString() : null } }
  })

  // GET /:id
  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({
        id: z.string().uuid(), numero: z.string(), status: z.string(), dataEmissao: z.string(), dataAprovacao: z.string().nullable(),
        aprovadaPor: z.string().nullable(), aprovadaEm: z.string().nullable(), rejeitadaPor: z.string().nullable(), rejeitadaEm: z.string().nullable(), motivoRejeicao: z.string().nullable(),
        valor: z.string(), valorPago: z.string(), saldoPagar: z.string(), observacoes: z.string().nullable(),
        liquidacaoId: z.string().uuid(), liquidacaoNumero: z.string(), empenhoId: z.string().uuid(), empenhoNumero: z.string(), empenhoObjeto: z.string(),
        fornecedorId: z.string().uuid(), fornecedorNome: z.string(), fornecedorDocumento: z.string().nullable(), dotacaoClassificacao: z.string(),
        pagamentosQtd: z.number(), criadoEm: z.string(), criadoPor: z.string().nullable(),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`
      SELECT op.*, l.numero AS liquidacao_numero, e.id AS empenho_id, e.numero AS empenho_numero, e.objeto AS empenho_objeto,
        e.fornecedor_pessoa_id, p.nome AS fornecedor_nome, p.documento AS fornecedor_documento, d.classificacao_completa AS dotacao_classificacao,
        ua.name AS aprovada_por_nome, ur.name AS rejeitada_por_nome, uc.name AS criado_por_nome,
        (SELECT COUNT(*) FROM pagamentos pg WHERE pg.ordem_pagamento_id = op.id AND pg.status = 'vigente')::int AS pag_qtd
      FROM ordens_pagamento op INNER JOIN liquidacoes l ON l.id = op.liquidacao_id INNER JOIN empenhos e ON e.id = l.empenho_id
      INNER JOIN dotacoes d ON d.id = e.dotacao_id INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id
      LEFT JOIN users ua ON ua.id = op.aprovada_por_user_id LEFT JOIN users ur ON ur.id = op.rejeitada_por_user_id LEFT JOIN users uc ON uc.id = op.created_by
      WHERE op.id = ${req.params.id}
    `)
    const rows = result as unknown as Array<Record<string, unknown>>
    if (rows.length === 0) throw app.httpErrors.notFound('OP nao encontrada')
    const r = rows[0]!
    return {
      id: String(r.id), numero: String(r.numero), status: String(r.status), dataEmissao: String(r.data_emissao),
      dataAprovacao: r.data_aprovacao ? String(r.data_aprovacao) : null, aprovadaPor: r.aprovada_por_nome ? String(r.aprovada_por_nome) : null,
      aprovadaEm: r.aprovada_em ? new Date(r.aprovada_em as string).toISOString() : null, rejeitadaPor: r.rejeitada_por_nome ? String(r.rejeitada_por_nome) : null,
      rejeitadaEm: r.rejeitada_em ? new Date(r.rejeitada_em as string).toISOString() : null, motivoRejeicao: r.motivo_rejeicao ? String(r.motivo_rejeicao) : null,
      valor: String(r.valor), valorPago: String(r.valor_pago), saldoPagar: (Number(r.valor) - Number(r.valor_pago)).toFixed(2),
      observacoes: r.observacoes ? String(r.observacoes) : null, liquidacaoId: String(r.liquidacao_id), liquidacaoNumero: String(r.liquidacao_numero),
      empenhoId: String(r.empenho_id), empenhoNumero: String(r.empenho_numero), empenhoObjeto: String(r.empenho_objeto),
      fornecedorId: String(r.fornecedor_pessoa_id), fornecedorNome: String(r.fornecedor_nome), fornecedorDocumento: r.fornecedor_documento ? String(r.fornecedor_documento) : null,
      dotacaoClassificacao: String(r.dotacao_classificacao), pagamentosQtd: Number(r.pag_qtd),
      criadoEm: new Date(r.created_at as string).toISOString(), criadoPor: r.criado_por_nome ? String(r.criado_por_nome) : null,
    }
  })

  // POST / -- criar OP
  app.post('/', {
    preHandler: async (req) => req.requirePermission('despesas:autorizar_pagamento'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ liquidacaoId: z.string().uuid(), dataEmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.coerce.number().positive(), observacoes: z.string().max(2000).optional() }),
      response: { 201: z.object({ id: z.string().uuid(), numero: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const lResult = await db.execute(sql`
      SELECT l.id, l.numero, l.status, l.empenho_id, l.valor::text AS valor,
        COALESCE((SELECT SUM(op.valor) FROM ordens_pagamento op WHERE op.liquidacao_id = l.id AND op.status NOT IN ('rejeitada', 'cancelada')), 0)::text AS valor_em_ops
      FROM liquidacoes l WHERE l.id = ${req.body.liquidacaoId}
    `)
    const lRows = lResult as unknown as Array<Record<string, unknown>>
    if (lRows.length === 0) return reply.status(422).send({ error: 'LiquidacaoNaoEncontrada', message: 'Liquidacao nao encontrada' })
    const l = lRows[0]!
    if (l.status !== 'vigente') return reply.status(422).send({ error: 'LiquidacaoNaoVigente', message: `Liquidacao esta ${l.status}` })
    const saldoLivre = Number(l.valor) - Number(l.valor_em_ops)
    if (req.body.valor > saldoLivre + 0.001) return reply.status(422).send({ error: 'ValorExcede', message: `OP de R$ ${req.body.valor.toFixed(2)} excede saldo livre (R$ ${saldoLivre.toFixed(2)})` })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataEmissao)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const exInfo = await db.execute(sql`SELECT ex.id, ex.ano FROM exercicios ex INNER JOIN empenhos e ON e.exercicio_id = ex.id WHERE e.id = ${l.empenho_id}`)
    const ex = (exInfo as unknown as Array<Record<string, unknown>>)[0]!
    const seqResult = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM ordens_pagamento op INNER JOIN liquidacoes liq ON liq.id = op.liquidacao_id INNER JOIN empenhos emp ON emp.id = liq.empenho_id WHERE emp.exercicio_id = ${ex.id}`)
    const prox = (((seqResult as unknown as Array<Record<string, unknown>>)[0]?.qtd as number) ?? 0) + 1
    const numero = `${ex.ano}/OP${prox.toString().padStart(5, '0')}`
    const valorStr = req.body.valor.toFixed(2)

    const [created] = await db.insert(tenantSchema.ordensPagamento).values({
      numero, status: 'aguardando_aprovacao', liquidacaoId: req.body.liquidacaoId, mesFiscalId: periodo.mes.id,
      valor: valorStr, dataEmissao: req.body.dataEmissao, observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
    }).returning({ id: tenantSchema.ordensPagamento.id })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.op.criar', resource: 'ordem_pagamento', resourceId: created!.id, after: { numero, valor: valorStr }, ipAddress: req.ip })
    return reply.status(201).send({ id: created!.id, numero })
  })

  // POST /:id/aprovar
  app.post('/:id/aprovar', {
    preHandler: async (req) => req.requirePermission('despesas:autorizar_pagamento'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }), body: z.object({ dataAprovacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      response: { 200: z.object({ id: z.string().uuid(), status: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const opRows = await db.execute(sql`SELECT id, numero, status FROM ordens_pagamento WHERE id = ${req.params.id}`)
    const op = (opRows as unknown as Array<Record<string, unknown>>)[0]
    if (!op) throw app.httpErrors.notFound('OP nao encontrada')
    if (op.status !== 'aguardando_aprovacao') return reply.status(422).send({ error: 'StatusInvalido', message: `OP em status "${op.status}"` })
    await db.execute(sql`UPDATE ordens_pagamento SET status = 'aprovada', data_aprovacao = ${req.body.dataAprovacao}, aprovada_em = NOW(), aprovada_por_user_id = ${req.tenantAuth!.sub}::uuid, updated_at = NOW() WHERE id = ${req.params.id}`)
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.op.aprovar', resource: 'ordem_pagamento', resourceId: req.params.id, after: { numero: op.numero }, ipAddress: req.ip })
    return { id: req.params.id, status: 'aprovada' }
  })

  // POST /:id/rejeitar
  app.post('/:id/rejeitar', {
    preHandler: async (req) => req.requirePermission('despesas:autorizar_pagamento'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }), body: z.object({ motivo: z.string().min(20).max(2000) }),
      response: { 200: z.object({ id: z.string().uuid(), status: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const opRows = await db.execute(sql`SELECT id, numero, status FROM ordens_pagamento WHERE id = ${req.params.id}`)
    const op = (opRows as unknown as Array<Record<string, unknown>>)[0]
    if (!op) throw app.httpErrors.notFound('OP nao encontrada')
    if (op.status !== 'aguardando_aprovacao') return reply.status(422).send({ error: 'StatusInvalido', message: `OP em "${op.status}"` })
    await db.execute(sql`UPDATE ordens_pagamento SET status = 'rejeitada', rejeitada_em = NOW(), rejeitada_por_user_id = ${req.tenantAuth!.sub}::uuid, motivo_rejeicao = ${req.body.motivo}, updated_at = NOW() WHERE id = ${req.params.id}`)
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.op.rejeitar', resource: 'ordem_pagamento', resourceId: req.params.id, after: { numero: op.numero }, ipAddress: req.ip })
    return { id: req.params.id, status: 'rejeitada' }
  })

  // POST /:id/cancelar
  app.post('/:id/cancelar', {
    preHandler: async (req) => req.requirePermission('despesas:autorizar_pagamento'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }), body: z.object({ motivo: z.string().min(20).max(2000), confirmNumero: z.string() }),
      response: { 200: z.object({ id: z.string().uuid(), status: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const opRows = await db.execute(sql`SELECT id, numero, status, valor_pago::text AS valor_pago FROM ordens_pagamento WHERE id = ${req.params.id}`)
    const op = (opRows as unknown as Array<Record<string, unknown>>)[0]
    if (!op) throw app.httpErrors.notFound('OP nao encontrada')
    if (req.body.confirmNumero !== op.numero) return reply.status(422).send({ error: 'ConfirmacaoIncorreta', message: 'Numero nao confere' })
    if (!['aguardando_aprovacao', 'aprovada'].includes(String(op.status))) return reply.status(422).send({ error: 'StatusInvalido', message: `OP em "${op.status}"` })
    if (Number(op.valor_pago) > 0) return reply.status(422).send({ error: 'OPComPagamentos', message: 'OP tem pagamentos. Estorne primeiro.' })
    await db.execute(sql`UPDATE ordens_pagamento SET status = 'cancelada', motivo_rejeicao = ${'CANCELADA: ' + req.body.motivo}, updated_at = NOW() WHERE id = ${req.params.id}`)
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.op.cancelar', resource: 'ordem_pagamento', resourceId: req.params.id, after: { numero: op.numero }, ipAddress: req.ip })
    return { id: req.params.id, status: 'cancelada' }
  })
}
