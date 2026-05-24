import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { resolverPeriodoFiscal, assertPeriodoAberto } from '../../../lib/fiscal.js'

export const empenhosRoute: FastifyPluginAsyncZod = async (app) => {

  // GET / -- lista paginada
  app.get('/', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({
        exercicioId: z.string().uuid().optional(), status: z.string().optional(), tipo: z.string().optional(),
        fornecedorId: z.string().uuid().optional(), dotacaoId: z.string().uuid().optional(),
        search: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(25),
      }),
      response: { 200: z.object({
        items: z.array(z.object({
          id: z.string().uuid(), numero: z.string(), tipo: z.string(), status: z.string(), dataEmpenho: z.string(),
          valor: z.string(), valorLiquidado: z.string(), valorPago: z.string(), valorAnulado: z.string(), saldoAPagar: z.string(),
          objeto: z.string(), dotacaoClassificacao: z.string(), fornecedorNome: z.string(), agrupadorDescricao: z.string().nullable(),
        })),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = []
    if (req.query.exercicioId) f.push(sql`e.exercicio_id = ${req.query.exercicioId}`)
    if (req.query.status) f.push(sql`e.status = ${req.query.status}`)
    if (req.query.tipo) f.push(sql`e.tipo = ${req.query.tipo}`)
    if (req.query.fornecedorId) f.push(sql`e.fornecedor_pessoa_id = ${req.query.fornecedorId}`)
    if (req.query.dotacaoId) f.push(sql`e.dotacao_id = ${req.query.dotacaoId}`)
    if (req.query.search) { const t = `%${req.query.search}%`; f.push(sql`(e.numero ILIKE ${t} OR e.objeto ILIKE ${t} OR p.nome ILIKE ${t})`) }
    const where = f.length > 0 ? sql`WHERE ${sql.join(f, sql` AND `)}` : sql``
    const result = await db.execute(sql`
      SELECT e.id, e.numero, e.tipo, e.status, e.data_empenho, e.valor::text AS valor, e.valor_liquidado::text AS valor_liquidado,
        e.valor_pago::text AS valor_pago, e.valor_anulado::text AS valor_anulado,
        (e.valor::numeric - e.valor_anulado::numeric - e.valor_pago::numeric)::text AS saldo_a_pagar,
        e.objeto, d.classificacao_completa AS dotacao_classificacao, p.nome AS fornecedor_nome, a.descricao AS agrupador_descricao
      FROM empenhos e INNER JOIN dotacoes d ON d.id = e.dotacao_id INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id
      LEFT JOIN empenhos_agrupadores a ON a.id = e.agrupador_id ${where}
      ORDER BY e.created_at DESC LIMIT ${req.query.limit}
    `)
    return { items: (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), numero: String(r.numero), tipo: String(r.tipo), status: String(r.status), dataEmpenho: String(r.data_empenho),
      valor: String(r.valor), valorLiquidado: String(r.valor_liquidado), valorPago: String(r.valor_pago), valorAnulado: String(r.valor_anulado),
      saldoAPagar: String(r.saldo_a_pagar), objeto: String(r.objeto), dotacaoClassificacao: String(r.dotacao_classificacao),
      fornecedorNome: String(r.fornecedor_nome), agrupadorDescricao: r.agrupador_descricao ? String(r.agrupador_descricao) : null,
    })) }
  })

  // GET /:id -- detalhe
  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({
        id: z.string().uuid(), numero: z.string(), tipo: z.string(), status: z.string(), exercicioAno: z.number(), dataEmpenho: z.string(),
        valor: z.string(), valorLiquidado: z.string(), valorPago: z.string(), valorAnulado: z.string(), saldoAPagar: z.string(), saldoALiquidar: z.string(),
        objeto: z.string(), observacoes: z.string().nullable(), contratoReferencia: z.record(z.unknown()).nullable(),
        dotacaoId: z.string().uuid(), dotacaoClassificacao: z.string(), dotacaoSaldoDisponivel: z.string(),
        fornecedorId: z.string().uuid(), fornecedorNome: z.string(), fornecedorDocumento: z.string().nullable(),
        agrupadorId: z.string().uuid().nullable(), agrupadorDescricao: z.string().nullable(),
        liquidacoesQtd: z.number(), anulacoesQtd: z.number(), criadoEm: z.string(),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`
      SELECT e.*, ex.ano AS exercicio_ano, d.classificacao_completa AS dotacao_classificacao,
        (d.valor_atualizado::numeric - d.valor_empenhado::numeric - d.valor_reservado::numeric)::text AS dotacao_saldo,
        p.nome AS fornecedor_nome, p.documento AS fornecedor_documento, a.descricao AS agrupador_descricao,
        (SELECT COUNT(*) FROM liquidacoes l WHERE l.empenho_id = e.id AND l.status = 'vigente')::int AS liq_qtd,
        (SELECT COUNT(*) FROM empenhos_anulacoes ea WHERE ea.empenho_id = e.id)::int AS anul_qtd
      FROM empenhos e INNER JOIN exercicios ex ON ex.id = e.exercicio_id INNER JOIN dotacoes d ON d.id = e.dotacao_id
      INNER JOIN pessoas p ON p.id = e.fornecedor_pessoa_id LEFT JOIN empenhos_agrupadores a ON a.id = e.agrupador_id
      WHERE e.id = ${req.params.id}
    `)
    if ((result as unknown as unknown[]).length === 0) throw app.httpErrors.notFound('Empenho nao encontrado')
    const r = (result as unknown as Array<Record<string, unknown>>)[0]!
    const v = Number(r.valor); const va = Number(r.valor_anulado); const vl = Number(r.valor_liquidado); const vp = Number(r.valor_pago)
    return {
      id: String(r.id), numero: String(r.numero), tipo: String(r.tipo), status: String(r.status), exercicioAno: Number(r.exercicio_ano),
      dataEmpenho: String(r.data_empenho), valor: String(r.valor), valorLiquidado: String(r.valor_liquidado), valorPago: String(r.valor_pago),
      valorAnulado: String(r.valor_anulado), saldoAPagar: (v - va - vp).toFixed(2), saldoALiquidar: (v - va - vl).toFixed(2),
      objeto: String(r.objeto), observacoes: r.observacoes ? String(r.observacoes) : null, contratoReferencia: r.contrato_referencia as Record<string, unknown> | null,
      dotacaoId: String(r.dotacao_id), dotacaoClassificacao: String(r.dotacao_classificacao), dotacaoSaldoDisponivel: String(r.dotacao_saldo),
      fornecedorId: String(r.fornecedor_pessoa_id), fornecedorNome: String(r.fornecedor_nome), fornecedorDocumento: r.fornecedor_documento ? String(r.fornecedor_documento) : null,
      agrupadorId: r.agrupador_id ? String(r.agrupador_id) : null, agrupadorDescricao: r.agrupador_descricao ? String(r.agrupador_descricao) : null,
      liquidacoesQtd: Number(r.liq_qtd), anulacoesQtd: Number(r.anul_qtd), criadoEm: new Date(r.created_at as string).toISOString(),
    }
  })

  // POST / -- criar empenho (transacional)
  app.post('/', {
    preHandler: async (req) => req.requirePermission('despesas:empenhar'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        dotacaoId: z.string().uuid(), fornecedorPessoaId: z.string().uuid(), dataEmpenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valor: z.coerce.number().positive(), objeto: z.string().min(10).max(2000),
        tipo: z.enum(['ordinario', 'global', 'estimativo']).default('ordinario'),
        agrupadorId: z.string().uuid().optional(), contratoReferencia: z.record(z.unknown()).optional(), observacoes: z.string().max(2000).optional(),
      }),
      response: {
        201: z.object({ id: z.string().uuid(), numero: z.string() }),
        422: z.object({ error: z.string(), message: z.string(), dotacao: z.object({ classificacao: z.string(), saldoDisponivel: z.string(), solicitado: z.string() }).optional() }),
      },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    // 1. Periodo fiscal
    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataEmpenho)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    // 2. Dotacao
    const dotResult = await db.execute(sql`SELECT id, exercicio_id, classificacao_completa, valor_atualizado, valor_empenhado, valor_reservado, ativo FROM dotacoes WHERE id = ${req.body.dotacaoId}`)
    const dotRows = dotResult as unknown as Array<Record<string, unknown>>
    if (dotRows.length === 0) return reply.status(422).send({ error: 'DotacaoNaoEncontrada', message: 'Dotacao nao encontrada' })
    const dot = dotRows[0]!
    if (!dot.ativo) return reply.status(422).send({ error: 'DotacaoInativa', message: 'Dotacao inativa' })
    if (dot.exercicio_id !== periodo.exercicio.id) return reply.status(422).send({ error: 'ExercicioDiferente', message: 'Dotacao pertence a exercicio diferente' })
    const saldo = Number(dot.valor_atualizado) - Number(dot.valor_empenhado) - Number(dot.valor_reservado)
    if (saldo < req.body.valor) return reply.status(422).send({ error: 'SaldoInsuficiente', message: 'Saldo insuficiente', dotacao: { classificacao: String(dot.classificacao_completa), saldoDisponivel: saldo.toFixed(2), solicitado: req.body.valor.toFixed(2) } })

    // 3. Fornecedor
    const fornResult = await db.execute(sql`SELECT id FROM pessoas WHERE id = ${req.body.fornecedorPessoaId} AND deleted_at IS NULL`)
    if ((fornResult as unknown as unknown[]).length === 0) return reply.status(422).send({ error: 'FornecedorNaoEncontrado', message: 'Fornecedor nao encontrado' })

    // 4. Numero sequencial
    const seqResult = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM empenhos WHERE exercicio_id = ${periodo.exercicio.id}`)
    const prox = (((seqResult as unknown as Array<Record<string, unknown>>)[0]?.qtd as number) ?? 0) + 1
    const numero = `${periodo.exercicio.ano}/${prox.toString().padStart(5, '0')}`

    // 5. Transacao
    const valorStr = req.body.valor.toFixed(2)
    const empenhoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.empenhos).values({
        numero, tipo: req.body.tipo, status: 'vigente', exercicioId: periodo.exercicio.id, mesFiscalId: periodo.mes.id,
        dotacaoId: req.body.dotacaoId, fornecedorPessoaId: req.body.fornecedorPessoaId, agrupadorId: req.body.agrupadorId ?? null,
        dataEmpenho: req.body.dataEmpenho, valor: valorStr, objeto: req.body.objeto,
        contratoReferencia: req.body.contratoReferencia ?? null, observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.empenhos.id })
      await tx.execute(sql`UPDATE dotacoes SET valor_empenhado = valor_empenhado + ${valorStr}::numeric, updated_at = NOW() WHERE id = ${req.body.dotacaoId}`)
      await tx.insert(tenantSchema.empenhosEventos).values({ empenhoId: created!.id, statusAnterior: null, statusNovo: 'vigente', motivo: `Empenho criado: ${numero}`, userId: req.tenantAuth!.sub })
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.empenho.criar', resource: 'empenho', resourceId: empenhoId, after: { numero, valor: valorStr }, ipAddress: req.ip })
    return reply.status(201).send({ id: empenhoId, numero })
  })

  // POST /:id/anular -- anulacao parcial ou total
  app.post('/:id/anular', {
    preHandler: async (req) => req.requirePermission('despesas:anular'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ valor: z.coerce.number().positive(), dataAnulacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), motivo: z.string().min(20).max(2000), documentoAutorizacao: z.string().max(100).optional(), confirmNumero: z.string() }),
      response: { 200: z.object({ id: z.string().uuid(), empenhoStatusNovo: z.string(), valorAnuladoAcumulado: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const eResult = await db.execute(sql`SELECT id, numero, status, dotacao_id, valor::text AS valor, valor_anulado::text AS valor_anulado, valor_liquidado::text AS valor_liquidado FROM empenhos WHERE id = ${req.params.id}`)
    const eRows = eResult as unknown as Array<Record<string, unknown>>
    if (eRows.length === 0) throw app.httpErrors.notFound('Empenho nao encontrado')
    const e = eRows[0]!
    if (req.body.confirmNumero !== e.numero) return reply.status(422).send({ error: 'ConfirmacaoIncorreta', message: 'Numero nao confere' })
    if (e.status === 'cancelado' || e.status === 'cancelado_lrf') return reply.status(422).send({ error: 'EmpenhoCancelado', message: 'Empenho ja cancelado' })

    const saldoNaoLiq = Number(e.valor) - Number(e.valor_anulado) - Number(e.valor_liquidado)
    if (req.body.valor > saldoNaoLiq + 0.001) return reply.status(422).send({ error: 'ValorExcede', message: `Anulacao excede saldo nao-liquidado (${saldoNaoLiq.toFixed(2)})` })

    let periodo
    try { periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date(req.body.dataAnulacao)); assertPeriodoAberto(periodo) }
    catch (err) { return reply.status(422).send({ error: 'PeriodoFiscal', message: (err as Error).message }) }

    const valorStr = req.body.valor.toFixed(2)
    const novoAnulado = Number(e.valor_anulado) + req.body.valor
    const novoAnuladoStr = novoAnulado.toFixed(2)
    const anulacaoTotal = novoAnulado >= Number(e.valor)

    const anulacaoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.empenhosAnulacoes).values({
        empenhoId: req.params.id, mesFiscalId: periodo.mes.id, dataAnulacao: req.body.dataAnulacao,
        valor: valorStr, motivo: req.body.motivo, documentoAutorizacao: req.body.documentoAutorizacao ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.empenhosAnulacoes.id })

      if (anulacaoTotal) {
        await tx.execute(sql`UPDATE empenhos SET valor_anulado = ${novoAnuladoStr}, status = 'cancelado', cancelado_em = NOW(), cancelado_por_user_id = ${req.tenantAuth!.sub}::uuid, motivo_cancelamento = ${req.body.motivo}, updated_at = NOW() WHERE id = ${req.params.id}`)
        await tx.insert(tenantSchema.empenhosEventos).values({ empenhoId: req.params.id, statusAnterior: String(e.status) as 'vigente', statusNovo: 'cancelado', motivo: `Anulacao total: ${req.body.motivo.slice(0, 200)}`, userId: req.tenantAuth!.sub })
      } else {
        await tx.execute(sql`UPDATE empenhos SET valor_anulado = ${novoAnuladoStr}, updated_at = NOW() WHERE id = ${req.params.id}`)
      }
      await tx.execute(sql`UPDATE dotacoes SET valor_empenhado = valor_empenhado - ${valorStr}::numeric, updated_at = NOW() WHERE id = ${e.dotacao_id}`)
      return created!.id
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.empenho.anular', resource: 'empenho', resourceId: req.params.id, after: { anulacaoId, valor: valorStr, total: anulacaoTotal }, ipAddress: req.ip })
    return { id: anulacaoId, empenhoStatusNovo: anulacaoTotal ? 'cancelado' : String(e.status), valorAnuladoAcumulado: novoAnuladoStr }
  })

  // GET /:id/eventos -- timeline
  app.get('/:id/eventos', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), statusAnterior: z.string().nullable(), statusNovo: z.string(), motivo: z.string(), registradoEm: z.string(), userNome: z.string().nullable() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`
      SELECT ev.id, ev.status_anterior, ev.status_novo, ev.motivo, ev.registrado_em, u.name AS user_nome
      FROM empenhos_eventos ev LEFT JOIN users u ON u.id = ev.user_id
      WHERE ev.empenho_id = ${req.params.id} ORDER BY ev.registrado_em ASC
    `)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), statusAnterior: r.status_anterior ? String(r.status_anterior) : null,
      statusNovo: String(r.status_novo), motivo: String(r.motivo),
      registradoEm: new Date(r.registrado_em as string).toISOString(), userNome: r.user_nome ? String(r.user_nome) : null,
    }))
  })
}
