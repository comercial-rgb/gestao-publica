import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and } from '@saas-municipal/database'
import { env } from '../../../env.js'

const tipoOut = z.object({
  id: z.string().uuid(),
  naturezaId: z.string().uuid(),
  naturezaCodigo: z.string(),
  naturezaDescricao: z.string(),
  entidadeId: z.string().uuid(),
  entidadeNome: z.string(),
  codigoInterno: z.string().nullable(),
  descricaoLocal: z.string().nullable(),
  fonteRecurso: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.string(),
})

export const tiposRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          entidadeId: z.string().uuid().optional(),
          ativo: z.coerce.boolean().optional(),
        }),
        response: { 200: z.array(tipoOut) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const rows = await db
        .select({
          id: tenantSchema.receitasTipos.id,
          naturezaId: tenantSchema.receitasTipos.naturezaId,
          naturezaCodigo: tenantSchema.receitasNaturezas.codigoCompleto,
          naturezaDescricao: tenantSchema.receitasNaturezas.descricao,
          entidadeId: tenantSchema.receitasTipos.entidadeId,
          entidadeNome: tenantSchema.entidades.nome,
          codigoInterno: tenantSchema.receitasTipos.codigoInterno,
          descricaoLocal: tenantSchema.receitasTipos.descricaoLocal,
          fonteRecurso: tenantSchema.receitasTipos.fonteRecurso,
          ativo: tenantSchema.receitasTipos.ativo,
          createdAt: tenantSchema.receitasTipos.createdAt,
        })
        .from(tenantSchema.receitasTipos)
        .innerJoin(tenantSchema.receitasNaturezas, eq(tenantSchema.receitasTipos.naturezaId, tenantSchema.receitasNaturezas.id))
        .innerJoin(tenantSchema.entidades, eq(tenantSchema.receitasTipos.entidadeId, tenantSchema.entidades.id))
        .where(
          and(
            req.query.entidadeId ? eq(tenantSchema.receitasTipos.entidadeId, req.query.entidadeId) : undefined,
            req.query.ativo !== undefined ? eq(tenantSchema.receitasTipos.ativo, req.query.ativo) : undefined,
          ),
        )

      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    },
  )

  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:gerir_naturezas'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          naturezaId: z.string().uuid(),
          entidadeId: z.string().uuid(),
          codigoInterno: z.string().max(30).optional(),
          descricaoLocal: z.string().max(200).optional(),
          fonteRecurso: z.string().max(10).optional(),
        }),
        response: {
          201: z.object({ id: z.string().uuid() }),
          422: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const natureza = await db.query.receitasNaturezas.findFirst({
        where: (n, { eq }) => eq(n.id, req.body.naturezaId),
      })
      if (!natureza) throw app.httpErrors.notFound('Natureza não encontrada')
      if (!natureza.analitica) {
        return reply.status(422).send({
          error: 'NaturezaNaoAnalitica',
          message: `Apenas naturezas analíticas podem ser vinculadas. ${natureza.codigoCompleto} é nível ${natureza.nivel}.`,
        })
      }

      const exists = await db.query.receitasTipos.findFirst({
        where: (t, { eq, and: a }) => a(eq(t.naturezaId, req.body.naturezaId), eq(t.entidadeId, req.body.entidadeId)),
      })
      if (exists) throw app.httpErrors.conflict('Já existe tipo para esta natureza + entidade')

      const [inserted] = await db.insert(tenantSchema.receitasTipos).values({
        naturezaId: req.body.naturezaId,
        entidadeId: req.body.entidadeId,
        codigoInterno: req.body.codigoInterno ?? null,
        descricaoLocal: req.body.descricaoLocal ?? null,
        fonteRecurso: req.body.fonteRecurso ?? null,
        ativo: true,
      }).returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar tipo')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.tipo.create',
        resource: 'receita_tipo',
        resourceId: inserted.id,
        after: { naturezaId: inserted.naturezaId, entidadeId: inserted.entidadeId },
        ipAddress: req.ip,
      })

      return reply.status(201).send({ id: inserted.id })
    },
  )

  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('receitas:gerir_naturezas'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          codigoInterno: z.string().max(30).nullable().optional(),
          descricaoLocal: z.string().max(200).nullable().optional(),
          fonteRecurso: z.string().max(10).nullable().optional(),
          ativo: z.boolean().optional(),
        }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const result = await db.update(tenantSchema.receitasTipos)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(tenantSchema.receitasTipos.id, req.params.id))
        .returning({ id: tenantSchema.receitasTipos.id })
      if (result.length === 0) throw app.httpErrors.notFound('Tipo não encontrado')
      return reply.status(204).send(null)
    },
  )
}
