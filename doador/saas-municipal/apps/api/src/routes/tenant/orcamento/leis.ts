import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

const leiOut = z.object({
  id: z.string().uuid(), tipo: z.enum(['ppa', 'loa']), numero: z.string(),
  descricao: z.string(), anoInicio: z.number(), anoFim: z.number(),
  dataSancao: z.string().nullable(), dataPublicacao: z.string().nullable(),
  valorTotal: z.string().nullable(), status: z.string(),
  observacoes: z.string().nullable(), ppaVigenteId: z.string().uuid().nullable(),
  createdAt: z.string(),
})

export const leisRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ tipo: z.enum(['ppa', 'loa']).optional(), ano: z.coerce.number().int().optional(), status: z.string().optional() }),
      response: { 200: z.array(leiOut) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.leisOrcamentarias.findMany({
      where: (l, { eq, and, lte, gte }) => {
        const c = []
        if (req.query.tipo) c.push(eq(l.tipo, req.query.tipo))
        if (req.query.status) c.push(eq(l.status, req.query.status as 'em_elaboracao'))
        if (req.query.ano) { c.push(lte(l.anoInicio, req.query.ano)); c.push(gte(l.anoFim, req.query.ano)) }
        return c.length > 0 ? and(...c) : undefined
      },
      orderBy: (l, { desc, asc }) => [desc(l.anoInicio), asc(l.tipo)],
    })
    return rows.map((r) => ({
      id: r.id, tipo: r.tipo, numero: r.numero, descricao: r.descricao,
      anoInicio: r.anoInicio, anoFim: r.anoFim,
      dataSancao: r.dataSancao?.toString() ?? null, dataPublicacao: r.dataPublicacao?.toString() ?? null,
      valorTotal: r.valorTotal, status: r.status, observacoes: r.observacoes,
      ppaVigenteId: r.ppaVigenteId, createdAt: r.createdAt.toISOString(),
    }))
  })

  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: leiOut.extend({
        programas: z.array(z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string() })).optional(),
        estatisticas: z.object({ qtdProgramas: z.number(), qtdAcoes: z.number(), qtdDotacoes: z.number(), valorDotacoesAtualizado: z.string() }),
      })},
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const lei = await db.query.leisOrcamentarias.findFirst({ where: (l, { eq }) => eq(l.id, req.params.id) })
    if (!lei) throw app.httpErrors.notFound('Lei nao encontrada')

    const programasList = lei.tipo === 'ppa'
      ? await db.query.programas.findMany({ where: (p, { eq }) => eq(p.ppaId, lei.id), orderBy: (p, { asc }) => asc(p.codigo), columns: { id: true, codigo: true, nome: true } })
      : []

    const stats = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM programas WHERE ppa_id = ${lei.id})::int AS qtd_programas,
        (SELECT COUNT(*) FROM acoes a INNER JOIN programas p ON p.id = a.programa_id WHERE p.ppa_id = ${lei.id})::int AS qtd_acoes,
        (SELECT COUNT(*) FROM dotacoes WHERE lei_orcamentaria_id = ${lei.id})::int AS qtd_dotacoes,
        (SELECT COALESCE(SUM(valor_atualizado::numeric), 0) FROM dotacoes WHERE lei_orcamentaria_id = ${lei.id})::text AS valor_dot
    `)
    const s = (stats as unknown as Array<Record<string, unknown>>)[0]

    return {
      id: lei.id, tipo: lei.tipo, numero: lei.numero, descricao: lei.descricao,
      anoInicio: lei.anoInicio, anoFim: lei.anoFim,
      dataSancao: lei.dataSancao?.toString() ?? null, dataPublicacao: lei.dataPublicacao?.toString() ?? null,
      valorTotal: lei.valorTotal, status: lei.status, observacoes: lei.observacoes,
      ppaVigenteId: lei.ppaVigenteId, createdAt: lei.createdAt.toISOString(),
      programas: programasList,
      estatisticas: {
        qtdProgramas: Number(s?.qtd_programas ?? 0), qtdAcoes: Number(s?.qtd_acoes ?? 0),
        qtdDotacoes: Number(s?.qtd_dotacoes ?? 0), valorDotacoesAtualizado: String(s?.valor_dot ?? '0'),
      },
    }
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        tipo: z.enum(['ppa', 'loa']), numero: z.string().min(3).max(50), descricao: z.string().min(3).max(300),
        anoInicio: z.number().int().min(2000).max(2100), anoFim: z.number().int().min(2000).max(2100),
        dataSancao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dataPublicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        valorTotal: z.coerce.number().nonnegative().optional(),
        observacoes: z.string().max(2000).optional(), ppaVigenteId: z.string().uuid().optional(),
      }),
      response: { 201: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    if (req.body.tipo === 'ppa' && req.body.anoFim - req.body.anoInicio !== 3) {
      return reply.status(422).send({ error: 'PPAInvalido', message: 'PPA tem vigencia de 4 anos. anoFim = anoInicio + 3' })
    }
    if (req.body.tipo === 'loa' && req.body.anoInicio !== req.body.anoFim) {
      return reply.status(422).send({ error: 'LOAInvalida', message: 'LOA e anual. anoInicio deve ser igual a anoFim' })
    }

    const [inserted] = await db.insert(tenantSchema.leisOrcamentarias).values({
      tipo: req.body.tipo, numero: req.body.numero, descricao: req.body.descricao,
      anoInicio: req.body.anoInicio, anoFim: req.body.anoFim,
      dataSancao: req.body.dataSancao ?? null, dataPublicacao: req.body.dataPublicacao ?? null,
      valorTotal: req.body.valorTotal?.toFixed(2) ?? null, observacoes: req.body.observacoes ?? null,
      ppaVigenteId: req.body.ppaVigenteId ?? null, status: 'em_elaboracao', createdBy: req.tenantAuth!.sub,
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar lei')

    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: `orcamento.lei.${req.body.tipo}.create`,
      resource: 'lei_orcamentaria', resourceId: inserted.id,
      after: { tipo: req.body.tipo, numero: req.body.numero }, ipAddress: req.ip,
    })
    return reply.status(201).send({ id: inserted.id })
  })

  app.patch('/:id/status', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ status: z.enum(['em_elaboracao', 'em_tramitacao', 'sancionada', 'em_execucao', 'encerrada']) }),
      response: { 204: z.null() },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const before = await db.query.leisOrcamentarias.findFirst({ where: (l, { eq }) => eq(l.id, req.params.id) })
    if (!before) throw app.httpErrors.notFound('Lei nao encontrada')
    await db.update(tenantSchema.leisOrcamentarias).set({ status: req.body.status, updatedAt: new Date() }).where(eq(tenantSchema.leisOrcamentarias.id, req.params.id))
    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.lei.status.change', resource: 'lei_orcamentaria', resourceId: req.params.id,
      before: { status: before.status }, after: { status: req.body.status }, ipAddress: req.ip,
    })
    return reply.status(204).send(null)
  })
}
