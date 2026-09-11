import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { resolverPeriodoFiscal, assertPeriodoAberto } from '../../../lib/fiscal.js'

const meioPagamentoEnum = z.enum(['pix', 'transferencia', 'cheque', 'boleto', 'debito_automatico', 'ordem_bancaria', 'compensacao', 'outros'])

export const pagamentosRoute: FastifyPluginAsyncZod = async (app) => {

  // GET /
  app.get('/', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ opId: z.string().uuid().optional(), empenhoId: z.string().uuid().optional(), status: z.enum(['vigente', 'estornado']).optional(), meio: meioPagamentoEnum.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), numero: z.string(), status: z.string(), dataPagamento: z.string(), valor: z.string(), meio: z.string(), numeroDocumento: z.string().nullable(), opNumero: z.string(), empenhoNumero: z.string(), fornecedorNome: z.string() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = []
    if (req.query.opId) f.push(sql`pg.ordem_pagamento_id = ${req.query.opId}`)
    if (req.query.empenhoId) f.push(sql`l.empenho_id = ${req.query.empenhoId}`)
    if (req.query.status) f.push(sql`pg.status = ${req.query.status}`)
    if (req.query.meio) f.push(sql`pg.meio = ${req.query.meio}`)
    const where = f.length > 0 ? sql`WHERE ${sql.join(f, sql` AND `)}` : sql``
    const result = await db.execute(sql`
      SELECT pg.id, pg.numero, pg.status, pg.data_pagamento, pg.valor::text AS valor, pg.meio, pg.numero_documento,
        op.numero AS op_numero, e.numero AS empenho_numero, p.nome AS fornecedor_nome
      FROM pagamentos pg INNER JOIN ordens_pagamento op ON op.id = pg.ordem_pagamento_id INNER JOIN liquidacoes l ON l.id = op.liquidacao_id
      INNER JOIN empenhos e ON e.id = l.empenho_id INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id
      ${where} ORDER BY pg.data_pagamento DESC, pg.created_at DESC LIMIT ${req.query.limit}
    `)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), numero: String(r.numero), status: String(r.status), dataPagamento: String(r.data_pagamento),
      valor: String(r.valor), meio: String(r.meio), numeroDocumento: r.numero_documento ? String(r.numero_documento) : null,
      opNumero: String(r.op_numero), empenhoNumero: String(r.empenho_numero), fornecedorNome: String(r.fornecedor_nome),
    }))
  })

  // POST / -- criar pagamento (TRANSACIONAL)
  app.post('/', {
    preHandler: async (req) => req.requirePermission('despesas:pagar'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ ordemPagamentoId: z.string().uuid(), dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.coerce.number().positive(), meio: meioPagamentoEnum, numeroDocumento: z.string().max(100).optional(), observacoes: z.string().max(2000).optional() }),
      response: { 201: z.object({ id: z.string().uuid(), numero: z.string(), opStatusNovo: z.string(), empenhoStatusNovo: z.string().nullable() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const opResult = await db.execute(sql`
      SELECT op.id, op.numero, op.status, op.data_aprovacao, op.liquidacao_id, op.valor::text AS valor, op.valor_pago::text AS valor_pago,
        l.empenho_id, e.dotacao_id, e.exercicio_id, e.numero AS empenho_numero, e.status AS empenho_status,
        e.valor::text AS empenho_valor, e.valor_anulado::text AS empenho_anulado, e.valor_pago::text AS empenho_pago
      FROM ordens_pagamento op INNER JOIN liquidacoes l ON l.id = op.liquidacao_id INNER JOIN empenhos e ON e.id = l.empenho_id
      WHERE op.id = ${req.body.ordemPagamentoId}
    `)
    const opRows = opResult as unknown as Array<Record<string, unknown>>
    if (opRows.length === 0) return reply.status(422).send({ error: 'OPNaoEncontrada', message: 'OP nao encontrada' })
    const r = opRows[0]!

    if (!['aprovada', 'paga_parcial'].includes(String(r.status))) return reply.status(422).send({ error: 'OPNaoAprovada', message: `OP em "${r.status}"` })
    if (!r.data_aprovacao) return reply.status(422).send({ error: 'OPSemDataAprovacao', message: 'OP sem data de aprovacao' })
    if (new Date(req.body.dataPagamento) < new Date(r.data_aprovacao as string)) return reply.status(422).send({ error: 'DataInvalida', message: `Pagamento anterior a aprovacao (${r.data_aprovacao})` })

    const saldoOP = Number(r.valor) - Number(r.valor_pago)
    if (req.body.valor > saldoOP + 0.001) return reply.status(422).send({ error: 'ValorExcedeOP', message: `Pagamento de R$ ${req.body.valor.toFixed(2)} excede saldo da OP (R$ ${saldoOP.toFixed(2)})` })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataPagamento)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const exInfo = (await db.execute(sql`SELECT ano FROM exercicios WHERE id = ${r.exercicio_id}`)) as unknown as Array<Record<string, unknown>>
    const seqResult = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM pagamentos pg INNER JOIN ordens_pagamento op ON op.id = pg.ordem_pagamento_id INNER JOIN liquidacoes l ON l.id = op.liquidacao_id INNER JOIN empenhos e ON e.id = l.empenho_id WHERE e.exercicio_id = ${r.exercicio_id}`)
    const prox = (((seqResult as unknown as Array<Record<string, unknown>>)[0]?.qtd as number) ?? 0) + 1
    const numero = `${exInfo[0]!.ano}/PG${prox.toString().padStart(5, '0')}`

    const valorStr = req.body.valor.toFixed(2)
    const novoOpPago = Number(r.valor_pago) + req.body.valor
    const opTotal = novoOpPago >= Number(r.valor)
    const novoOpStatus = opTotal ? 'paga_total' : 'paga_parcial'

    const novoEmpPago = Number(r.empenho_pago) + req.body.valor
    const empTotal = novoEmpPago >= (Number(r.empenho_valor) - Number(r.empenho_anulado))
    const novoEmpStatus: 'pago_total' | null = (empTotal && r.empenho_status === 'vigente') ? 'pago_total' : null

    const pagamentoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.pagamentos).values({
        numero, status: 'vigente', ordemPagamentoId: req.body.ordemPagamentoId, mesFiscalId: periodo.mes.id,
        dataPagamento: req.body.dataPagamento, valor: valorStr, meio: req.body.meio,
        numeroDocumento: req.body.numeroDocumento ?? null, observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.pagamentos.id })

      await tx.execute(sql`UPDATE ordens_pagamento SET valor_pago = valor_pago + ${valorStr}::numeric, status = ${novoOpStatus}::ordem_pagamento_status, updated_at = NOW() WHERE id = ${req.body.ordemPagamentoId}`)
      await tx.execute(sql`UPDATE liquidacoes SET valor_pago = valor_pago + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${r.liquidacao_id}`)

      if (novoEmpStatus === 'pago_total') {
        await tx.execute(sql`UPDATE empenhos SET valor_pago = valor_pago + ${valorStr}::numeric, status = 'pago_total', updated_at = NOW() WHERE id = ${r.empenho_id}`)
        await tx.insert(tenantSchema.empenhosEventos).values({ empenhoId: String(r.empenho_id), statusAnterior: String(r.empenho_status) as 'vigente', statusNovo: 'pago_total', motivo: `Empenho totalmente pago via ${numero}`, userId: req.tenantAuth!.sub })
      } else {
        await tx.execute(sql`UPDATE empenhos SET valor_pago = valor_pago + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${r.empenho_id}`)
      }

      await tx.execute(sql`UPDATE dotacoes SET valor_pago = valor_pago + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${r.dotacao_id}`)
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.pagamento.criar', resource: 'pagamento', resourceId: pagamentoId,
      after: { numero, valor: valorStr, meio: req.body.meio, opStatusNovo: novoOpStatus, empenhoStatusNovo: novoEmpStatus }, ipAddress: req.ip })
    return reply.status(201).send({ id: pagamentoId, numero, opStatusNovo: novoOpStatus, empenhoStatusNovo: novoEmpStatus })
  })

  // POST /:id/estornar
  app.post('/:id/estornar', {
    preHandler: async (req) => req.requirePermission('despesas:anular'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ dataEstorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), motivo: z.string().min(20).max(2000), documentoBancario: z.string().max(100).optional(), confirmNumero: z.string() }),
      response: { 200: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const pResult = await db.execute(sql`
      SELECT pg.id, pg.numero, pg.status, pg.ordem_pagamento_id, pg.valor::text AS valor,
        op.liquidacao_id, l.empenho_id, e.dotacao_id, e.status AS empenho_status
      FROM pagamentos pg INNER JOIN ordens_pagamento op ON op.id = pg.ordem_pagamento_id INNER JOIN liquidacoes l ON l.id = op.liquidacao_id
      INNER JOIN empenhos e ON e.id = l.empenho_id WHERE pg.id = ${req.params.id}
    `)
    const pRows = pResult as unknown as Array<Record<string, unknown>>
    if (pRows.length === 0) throw app.httpErrors.notFound('Pagamento nao encontrado')
    const p = pRows[0]!
    if (req.body.confirmNumero !== p.numero) return reply.status(422).send({ error: 'ConfirmacaoIncorreta', message: 'Numero nao confere' })
    if (p.status !== 'vigente') return reply.status(422).send({ error: 'PagamentoEstornado', message: 'Pagamento ja estornado' })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataEstorno)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const valorStr = String(p.valor)

    const anulacaoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.pagamentosAnulacoes).values({
        pagamentoId: req.params.id, mesFiscalId: periodo.mes.id, dataEstorno: req.body.dataEstorno,
        valor: valorStr, motivo: req.body.motivo, documentoBancario: req.body.documentoBancario ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.pagamentosAnulacoes.id })

      await tx.execute(sql`UPDATE pagamentos SET status = 'estornado', estornado_em = NOW(), estornado_por_user_id = ${req.tenantAuth!.sub}::uuid, motivo_estorno = ${req.body.motivo}, updated_at = NOW() WHERE id = ${req.params.id}`)
      await tx.execute(sql`UPDATE ordens_pagamento SET valor_pago = valor_pago - ${valorStr}::numeric, status = CASE WHEN (valor_pago - ${valorStr}::numeric) <= 0 THEN 'aprovada'::ordem_pagamento_status ELSE 'paga_parcial'::ordem_pagamento_status END, updated_at = NOW() WHERE id = ${p.ordem_pagamento_id}`)
      await tx.execute(sql`UPDATE liquidacoes SET valor_pago = valor_pago - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${p.liquidacao_id}`)

      if (p.empenho_status === 'pago_total') {
        await tx.execute(sql`UPDATE empenhos SET valor_pago = valor_pago - ${valorStr}::numeric, status = 'vigente', updated_at = NOW() WHERE id = ${p.empenho_id}`)
        await tx.insert(tenantSchema.empenhosEventos).values({ empenhoId: String(p.empenho_id), statusAnterior: 'pago_total', statusNovo: 'vigente', motivo: `Estorno de ${p.numero}: ${req.body.motivo.slice(0, 200)}`, userId: req.tenantAuth!.sub })
      } else {
        await tx.execute(sql`UPDATE empenhos SET valor_pago = valor_pago - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${p.empenho_id}`)
      }

      await tx.execute(sql`UPDATE dotacoes SET valor_pago = valor_pago - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${p.dotacao_id}`)
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.pagamento.estornar', resource: 'pagamento', resourceId: req.params.id, after: { anulacaoId, numero: p.numero, valor: valorStr }, ipAddress: req.ip })
    return { id: anulacaoId }
  })
}
