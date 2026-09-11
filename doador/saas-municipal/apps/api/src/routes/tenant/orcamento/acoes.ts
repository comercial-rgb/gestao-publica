import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const acoesRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ programaId: z.string().uuid().optional(), ativo: z.coerce.boolean().optional() }),
      response: { 200: z.array(z.object({
        id: z.string().uuid(), programaId: z.string().uuid(), codigo: z.string(), nome: z.string(),
        tipo: z.number(), descricao: z.string().nullable(), unidadeMedida: z.string().nullable(), produto: z.string().nullable(), ativo: z.boolean(),
      })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.acoes.findMany({
      where: (a, { eq, and }) => {
        const c = []
        if (req.query.programaId) c.push(eq(a.programaId, req.query.programaId))
        if (req.query.ativo !== undefined) c.push(eq(a.ativo, req.query.ativo))
        return c.length > 0 ? and(...c) : undefined
      },
      orderBy: (a, { asc }) => asc(a.codigo),
    })
    return rows.map((r) => ({
      id: r.id, programaId: r.programaId, codigo: r.codigo, nome: r.nome,
      tipo: r.tipo, descricao: r.descricao, unidadeMedida: r.unidadeMedida, produto: r.produto, ativo: r.ativo,
    }))
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('orcamento:gerir_programas'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        programaId: z.string().uuid(), codigo: z.string().regex(/^\d{4}$/), nome: z.string().min(3).max(300),
        tipo: z.number().int().refine((n) => [1, 2, 4].includes(n), 'tipo deve ser 1, 2 ou 4'),
        descricao: z.string().max(2000).optional(), unidadeMedida: z.string().max(50).optional(), produto: z.string().max(200).optional(),
      }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const programa = await db.query.programas.findFirst({ where: (p, { eq }) => eq(p.id, req.body.programaId) })
    if (!programa) throw app.httpErrors.notFound('Programa nao encontrado')
    const [inserted] = await db.insert(tenantSchema.acoes).values({
      programaId: req.body.programaId, codigo: req.body.codigo, nome: req.body.nome, tipo: req.body.tipo,
      descricao: req.body.descricao ?? null, unidadeMedida: req.body.unidadeMedida ?? null, produto: req.body.produto ?? null, ativo: true,
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar acao')
    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.acao.create', resource: 'acao', resourceId: inserted.id,
      after: { programaId: req.body.programaId, codigo: req.body.codigo }, ipAddress: req.ip,
    })
    return reply.status(201).send({ id: inserted.id })
  })
}
