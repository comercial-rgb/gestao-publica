import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const programasRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ ppaId: z.string().uuid().optional(), ativo: z.coerce.boolean().optional(), search: z.string().optional() }),
      response: { 200: z.array(z.object({
        id: z.string().uuid(), ppaId: z.string().uuid(), codigo: z.string(), nome: z.string(),
        objetivo: z.string().nullable(), publicoAlvo: z.string().nullable(), horizonteTemporal: z.string().nullable(), ativo: z.boolean(),
      })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.programas.findMany({
      where: (p, { eq, and, or, ilike }) => {
        const c = []
        if (req.query.ppaId) c.push(eq(p.ppaId, req.query.ppaId))
        if (req.query.ativo !== undefined) c.push(eq(p.ativo, req.query.ativo))
        if (req.query.search) c.push(or(ilike(p.nome, `%${req.query.search}%`), ilike(p.codigo, `%${req.query.search}%`))!)
        return c.length > 0 ? and(...c) : undefined
      },
      orderBy: (p, { asc }) => asc(p.codigo),
    })
    return rows.map((p) => ({
      id: p.id, ppaId: p.ppaId, codigo: p.codigo, nome: p.nome,
      objetivo: p.objetivo, publicoAlvo: p.publicoAlvo, horizonteTemporal: p.horizonteTemporal, ativo: p.ativo,
    }))
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('orcamento:gerir_programas'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        ppaId: z.string().uuid(), codigo: z.string().regex(/^\d{4}$/), nome: z.string().min(3).max(300),
        objetivo: z.string().max(2000).optional(), publicoAlvo: z.string().max(300).optional(), horizonteTemporal: z.string().max(50).optional(),
      }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const ppa = await db.query.leisOrcamentarias.findFirst({ where: (l, { eq, and: a }) => a(eq(l.id, req.body.ppaId), eq(l.tipo, 'ppa')) })
    if (!ppa) throw app.httpErrors.notFound('PPA nao encontrado')
    const [inserted] = await db.insert(tenantSchema.programas).values({
      ppaId: req.body.ppaId, codigo: req.body.codigo, nome: req.body.nome,
      objetivo: req.body.objetivo ?? null, publicoAlvo: req.body.publicoAlvo ?? null,
      horizonteTemporal: req.body.horizonteTemporal ?? null, ativo: true,
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar programa')
    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.programa.create', resource: 'programa', resourceId: inserted.id,
      after: { ppaId: req.body.ppaId, codigo: req.body.codigo }, ipAddress: req.ip,
    })
    return reply.status(201).send({ id: inserted.id })
  })

  app.patch('/:id', {
    preHandler: async (req) => req.requirePermission('orcamento:gerir_programas'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ nome: z.string().min(3).max(300).optional(), objetivo: z.string().max(2000).nullable().optional(), ativo: z.boolean().optional() }),
      response: { 204: z.null() },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.update(tenantSchema.programas).set({ ...req.body, updatedAt: new Date() }).where(eq(tenantSchema.programas.id, req.params.id)).returning({ id: tenantSchema.programas.id })
    if (result.length === 0) throw app.httpErrors.notFound('Programa nao encontrado')
    return reply.status(204).send(null)
  })
}
