import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../../lib/pagination.js'

const naturezaOut = z.object({
  id: z.string().uuid(),
  codigoCompleto: z.string(),
  codigoReduzido: z.string(),
  descricao: z.string(),
  nivel: z.number(),
  parentId: z.string().uuid().nullable(),
  analitica: z.boolean(),
  identificadorMsc: z.string().nullable(),
  ativo: z.boolean(),
})

export const naturezasRoute: FastifyPluginAsyncZod = async (app) => {
  // ─── GET / ───────────────────────────────────────────
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: paginationQuery.extend({
          nivel: z.coerce.number().int().min(1).max(7).optional(),
          analitica: z.coerce.boolean().optional(),
          ativo: z.coerce.boolean().optional(),
          search: z.string().optional(),
        }),
        response: {
          200: z.object({
            items: z.array(naturezaOut.extend({ createdAt: z.string() })),
            pagination: z.object({ nextCursor: z.string().nullable(), limit: z.number() }),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const { cursor, limit, nivel, analitica, ativo, search } = req.query
      const cursorData = decodeCursor(cursor)

      const rows = await db.query.receitasNaturezas.findMany({
        where: (n, { eq, and, or, ilike, lt }) => {
          const conds = []
          if (nivel !== undefined) conds.push(eq(n.nivel, nivel))
          if (analitica !== undefined) conds.push(eq(n.analitica, analitica))
          if (ativo !== undefined) conds.push(eq(n.ativo, ativo))
          if (search) {
            conds.push(
              or(ilike(n.descricao, `%${search}%`), ilike(n.codigoCompleto, `%${search}%`))!,
            )
          }
          if (cursorData) {
            conds.push(
              or(
                lt(n.createdAt, new Date(cursorData.createdAt)),
                and(eq(n.createdAt, new Date(cursorData.createdAt)), lt(n.id, cursorData.id)),
              )!,
            )
          }
          return conds.length > 0 ? and(...conds) : undefined
        },
        orderBy: (n, { asc }) => [asc(n.codigoReduzido)],
        limit: limit + 1,
      })

      const paginated = paginatedResponse(rows, limit)

      return {
        items: paginated.items.map((n) => ({
          id: n.id,
          codigoCompleto: n.codigoCompleto,
          codigoReduzido: n.codigoReduzido,
          descricao: n.descricao,
          nivel: n.nivel,
          parentId: n.parentId,
          analitica: n.analitica,
          identificadorMsc: n.identificadorMsc,
          ativo: n.ativo,
          createdAt: n.createdAt.toISOString(),
        })),
        pagination: paginated.pagination,
      }
    },
  )

  // ─── GET /tree ────────────────────────────────────────
  app.get(
    '/tree',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          onlyActive: z.coerce.boolean().default(true),
          onlyAnaliticas: z.coerce.boolean().default(false),
        }),
        response: { 200: z.array(z.any()) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const all = await db.query.receitasNaturezas.findMany({
        where: (n, { eq, and }) => {
          const conds = []
          if (req.query.onlyActive) conds.push(eq(n.ativo, true))
          if (req.query.onlyAnaliticas) conds.push(eq(n.analitica, true))
          return conds.length > 0 ? and(...conds) : undefined
        },
        orderBy: (n, { asc }) => asc(n.codigoReduzido),
      })

      type Node = (typeof all)[number] & { children: Node[] }
      const map = new Map<string, Node>()
      const roots: Node[] = []

      for (const item of all) map.set(item.id, { ...item, children: [] })
      for (const item of all) {
        const node = map.get(item.id)!
        if (item.parentId && map.has(item.parentId)) {
          map.get(item.parentId)!.children.push(node)
        } else {
          roots.push(node)
        }
      }

      const serialize = (n: Node): Record<string, unknown> => ({
        id: n.id, codigoCompleto: n.codigoCompleto, codigoReduzido: n.codigoReduzido,
        descricao: n.descricao, nivel: n.nivel, parentId: n.parentId,
        analitica: n.analitica, identificadorMsc: n.identificadorMsc, ativo: n.ativo,
        children: n.children.map(serialize),
      })

      return roots.map(serialize)
    },
  )

  // ─── GET /:id ─────────────────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: naturezaOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const row = await db.query.receitasNaturezas.findFirst({
        where: (n, { eq }) => eq(n.id, req.params.id),
      })
      if (!row) throw app.httpErrors.notFound('Natureza não encontrada')
      return {
        id: row.id, codigoCompleto: row.codigoCompleto, codigoReduzido: row.codigoReduzido,
        descricao: row.descricao, nivel: row.nivel, parentId: row.parentId,
        analitica: row.analitica, identificadorMsc: row.identificadorMsc, ativo: row.ativo,
      }
    },
  )

  // ─── POST / ───────────────────────────────────────────
  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:gerir_naturezas'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          codigoCompleto: z.string().regex(/^\d\.\d\.\d\.\d\.\d{2}\.\d\.\d$/, 'Formato: X.X.X.X.XX.X.X'),
          descricao: z.string().min(3).max(300),
          parentId: z.string().uuid().nullable().optional(),
          analitica: z.boolean().default(false),
          identificadorMsc: z.string().max(50).optional(),
          contaContabilCorrespondente: z.string().max(30).optional(),
        }),
        response: { 201: naturezaOut },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const codigoReduzido = req.body.codigoCompleto.replace(/\./g, '')

      const partes = req.body.codigoCompleto.split('.')
      let nivel = 7
      if (partes[6] === '0') nivel = 6
      if (partes[5] === '0' && nivel === 6) nivel = 5
      if (partes[4] === '00' && nivel === 5) nivel = 4
      if (partes[3] === '0' && nivel === 4) nivel = 3
      if (partes[2] === '0' && nivel === 3) nivel = 2
      if (partes[1] === '0' && nivel === 2) nivel = 1

      const exists = await db.query.receitasNaturezas.findFirst({
        where: (n, { eq }) => eq(n.codigoCompleto, req.body.codigoCompleto),
      })
      if (exists) throw app.httpErrors.conflict(`Natureza ${req.body.codigoCompleto} já existe`)

      const [inserted] = await db.insert(tenantSchema.receitasNaturezas).values({
        codigoCompleto: req.body.codigoCompleto,
        codigoReduzido,
        descricao: req.body.descricao,
        nivel,
        parentId: req.body.parentId ?? null,
        analitica: req.body.analitica,
        identificadorMsc: req.body.identificadorMsc ?? null,
        contaContabilCorrespondente: req.body.contaContabilCorrespondente ?? null,
        ativo: true,
      }).returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar natureza')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.natureza.create',
        resource: 'receita_natureza',
        resourceId: inserted.id,
        after: { codigo: inserted.codigoCompleto, descricao: inserted.descricao },
        ipAddress: req.ip,
      })

      return reply.status(201).send({
        id: inserted.id, codigoCompleto: inserted.codigoCompleto,
        codigoReduzido: inserted.codigoReduzido, descricao: inserted.descricao,
        nivel: inserted.nivel, parentId: inserted.parentId, analitica: inserted.analitica,
        identificadorMsc: inserted.identificadorMsc, ativo: inserted.ativo,
      })
    },
  )

  // ─── PATCH /:id ───────────────────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('receitas:gerir_naturezas'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          descricao: z.string().min(3).max(300).optional(),
          ativo: z.boolean().optional(),
          identificadorMsc: z.string().max(50).nullable().optional(),
        }),
        response: { 200: naturezaOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db.update(tenantSchema.receitasNaturezas)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(tenantSchema.receitasNaturezas.id, req.params.id))
        .returning()

      if (!updated) throw app.httpErrors.notFound('Natureza não encontrada')

      return {
        id: updated.id, codigoCompleto: updated.codigoCompleto,
        codigoReduzido: updated.codigoReduzido, descricao: updated.descricao,
        nivel: updated.nivel, parentId: updated.parentId, analitica: updated.analitica,
        identificadorMsc: updated.identificadorMsc, ativo: updated.ativo,
      }
    },
  )
}
