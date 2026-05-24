import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const agrupadoresRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('despesas:read'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ ativo: z.coerce.boolean().optional(), search: z.string().max(100).optional() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), descricao: z.string(), numeroExterno: z.string().nullable(), ativo: z.boolean(), qtdEmpenhos: z.number(), createdAt: z.string() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`
      SELECT a.id, a.descricao, a.numero_externo, a.ativo, a.created_at, COUNT(e.id)::int AS qtd_empenhos
      FROM empenhos_agrupadores a LEFT JOIN empenhos e ON e.agrupador_id = a.id
      WHERE 1=1
        ${req.query.ativo !== undefined ? sql`AND a.ativo = ${req.query.ativo}` : sql``}
        ${req.query.search ? sql`AND (a.descricao ILIKE ${'%' + req.query.search + '%'} OR a.numero_externo ILIKE ${'%' + req.query.search + '%'})` : sql``}
      GROUP BY a.id ORDER BY a.created_at DESC LIMIT 200
    `)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), descricao: String(r.descricao), numeroExterno: r.numero_externo ? String(r.numero_externo) : null,
      ativo: Boolean(r.ativo), qtdEmpenhos: Number(r.qtd_empenhos), createdAt: new Date(r.created_at as string).toISOString(),
    }))
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('despesas:empenhar'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ descricao: z.string().min(3).max(300), numeroExterno: z.string().max(50).optional(), observacoes: z.string().max(2000).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [created] = await db.insert(tenantSchema.empenhosAgrupadores).values({
      descricao: req.body.descricao, numeroExterno: req.body.numeroExterno ?? null, observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
    }).returning({ id: tenantSchema.empenhosAgrupadores.id })
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'despesas.agrupador.criar', resource: 'empenho_agrupador', resourceId: created!.id, after: { descricao: req.body.descricao }, ipAddress: req.ip })
    return reply.status(201).send({ id: created!.id })
  })

  app.patch('/:id', {
    preHandler: async (req) => req.requirePermission('despesas:empenhar'),
    schema: {
      tags: ['tenant-despesas'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ descricao: z.string().min(3).max(300).optional(), numeroExterno: z.string().max(50).optional(), ativo: z.boolean().optional() }),
      response: { 200: z.object({ id: z.string().uuid() }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [updated] = await db.update(tenantSchema.empenhosAgrupadores).set({ ...req.body, updatedAt: new Date() }).where(eq(tenantSchema.empenhosAgrupadores.id, req.params.id)).returning({ id: tenantSchema.empenhosAgrupadores.id })
    if (!updated) throw app.httpErrors.notFound('Agrupador nao encontrado')
    return { id: updated.id }
  })
}
