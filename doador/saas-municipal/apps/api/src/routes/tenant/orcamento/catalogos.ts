import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const catalogosRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/modalidades', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      response: { 200: z.array(z.object({ id: z.string().uuid(), codigo: z.string(), descricao: z.string(), tipo: z.enum(['stn', 'local']), ativo: z.boolean() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.modalidadesAplicacao.findMany({ orderBy: (m, { asc }) => asc(m.codigo) })
    return rows.map((r) => ({ id: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, ativo: r.ativo }))
  })

  app.post('/modalidades', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ codigo: z.string().regex(/^\d{2}$/), descricao: z.string().min(3).max(200) }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const exists = await db.query.modalidadesAplicacao.findFirst({ where: (m, { eq }) => eq(m.codigo, req.body.codigo) })
    if (exists) throw app.httpErrors.conflict(`Modalidade ${req.body.codigo} ja existe`)
    const [inserted] = await db.insert(tenantSchema.modalidadesAplicacao).values({ codigo: req.body.codigo, descricao: req.body.descricao, tipo: 'local', ativo: true }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar modalidade')
    return reply.status(201).send({ id: inserted.id })
  })

  app.get('/fontes', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ categoria: z.string().optional(), grupo: z.string().optional() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), codigo: z.string(), descricao: z.string(), grupo: z.string().nullable(), categoria: z.string().nullable(), tipo: z.enum(['stn', 'local']), ativo: z.boolean() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.fontesRecurso.findMany({
      where: (f, { eq, and }) => {
        const c = []
        if (req.query.categoria) c.push(eq(f.categoria, req.query.categoria))
        if (req.query.grupo) c.push(eq(f.grupo, req.query.grupo))
        return c.length > 0 ? and(...c) : undefined
      },
      orderBy: (f, { asc }) => asc(f.codigo),
    })
    return rows.map((r) => ({ id: r.id, codigo: r.codigo, descricao: r.descricao, grupo: r.grupo, categoria: r.categoria, tipo: r.tipo, ativo: r.ativo }))
  })

  app.post('/fontes', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ codigo: z.string().min(3).max(20), descricao: z.string().min(3).max(300), grupo: z.string().max(5).optional(), categoria: z.string().max(50).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const exists = await db.query.fontesRecurso.findFirst({ where: (f, { eq }) => eq(f.codigo, req.body.codigo) })
    if (exists) throw app.httpErrors.conflict(`Fonte ${req.body.codigo} ja existe`)
    const [inserted] = await db.insert(tenantSchema.fontesRecurso).values({ codigo: req.body.codigo, descricao: req.body.descricao, grupo: req.body.grupo ?? null, categoria: req.body.categoria ?? null, tipo: 'local', ativo: true }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar fonte')
    return reply.status(201).send({ id: inserted.id })
  })
}
