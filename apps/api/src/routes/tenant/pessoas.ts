/**
 * Cadastro base de Pessoas (PF/PJ).
 * Exemplo canônico de CRUD usando RBAC (permissions cadastros:read/write/delete).
 *
 *   GET    /tenant/pessoas
 *   POST   /tenant/pessoas
 *   GET    /tenant/pessoas/:id
 *   PATCH  /tenant/pessoas/:id
 *   DELETE /tenant/pessoas/:id
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, or, lt, isNull } from '@saas-municipal/database'
import { env } from '../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../lib/pagination.js'

const pessoaPF = z.object({
  tipo: z.literal('PF'),
  documento: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  nome: z.string().min(3).max(200),
  rg: z.string().max(20).optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sexo: z.enum(['M', 'F', 'O']).optional(),
  estadoCivil: z.string().max(20).optional(),
})

const pessoaPJ = z.object({
  tipo: z.literal('PJ'),
  documento: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
  nome: z.string().min(3).max(200),
  nomeFantasia: z.string().max(200).optional(),
  inscricaoEstadual: z.string().max(30).optional(),
  inscricaoMunicipal: z.string().max(30).optional(),
})

const enderecoEContato = z.object({
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
  cep: z.string().regex(/^\d{8}$/).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().length(2).optional(),
  observacoes: z.string().optional(),
})

const createPessoaBody = z.discriminatedUnion('tipo', [
  pessoaPF.merge(enderecoEContato),
  pessoaPJ.merge(enderecoEContato),
])

const updatePessoaBody = z.object({
  nome: z.string().min(3).max(200).optional(),
  nomeFantasia: z.string().max(200).nullable().optional(),
  rg: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  telefone: z.string().max(20).nullable().optional(),
  cep: z.string().regex(/^\d{8}$/).nullable().optional(),
  logradouro: z.string().max(200).nullable().optional(),
  numero: z.string().max(20).nullable().optional(),
  complemento: z.string().max(100).nullable().optional(),
  bairro: z.string().max(100).nullable().optional(),
  cidade: z.string().max(100).nullable().optional(),
  uf: z.string().length(2).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

const pessoaOut = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  documento: z.string(),
  nome: z.string(),
  nomeFantasia: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
})

export const tenantPessoasRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('cadastros')
  })

  // ─── GET /tenant/pessoas ────────────────────────────────
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('cadastros:read'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        querystring: z.object({
          tipo: z.enum(['PF', 'PJ']).optional(),
          search: z.string().optional(),
          active: z.coerce.boolean().optional(),
        }).merge(paginationQuery),
        response: {
          200: z.object({
            items: z.array(pessoaOut),
            pagination: z.object({
              nextCursor: z.string().nullable(),
              limit: z.number(),
            }),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const { tipo, search, active, cursor: rawCursor, limit } = req.query
      const cursor = decodeCursor(rawCursor)

      const rows = await db.query.pessoas.findMany({
        where: (p, { eq, and, isNull, or, ilike }) => {
          const conds = [isNull(p.deletedAt)]
          if (tipo) conds.push(eq(p.tipo, tipo))
          if (typeof active === 'boolean') conds.push(eq(p.active, active))
          if (search) {
            conds.push(
              or(ilike(p.nome, `%${search}%`), ilike(p.documento, `%${search}%`))!,
            )
          }
          if (cursor) {
            conds.push(
              or(
                lt(p.createdAt, new Date(cursor.createdAt)),
                and(eq(p.createdAt, new Date(cursor.createdAt)), lt(p.id, cursor.id)),
              )!,
            )
          }
          return and(...conds)
        },
        orderBy: (p, { desc }) => [desc(p.createdAt), desc(p.id)],
        limit: limit + 1,
      })

      const result = paginatedResponse(rows, limit)
      return {
        items: result.items.map(serializePessoa),
        pagination: result.pagination,
      }
    },
  )

  // ─── POST /tenant/pessoas ───────────────────────────────
  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('cadastros:write'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: createPessoaBody,
        response: {
          201: pessoaOut,
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exists = await db.query.pessoas.findFirst({
        where: (p, { eq }) => eq(p.documento, req.body.documento),
      })
      if (exists) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `Já existe pessoa com documento ${req.body.documento}`,
        })
      }

      const [inserted] = await db
        .insert(tenantSchema.pessoas)
        .values({
          ...req.body,
          createdBy: req.tenantAuth!.sub,
        } as any)
        .returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar pessoa')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'pessoa.create',
        resource: 'pessoa',
        resourceId: inserted.id,
        after: { tipo: inserted.tipo, documento: inserted.documento, nome: inserted.nome },
        ipAddress: req.ip,
      })

      return reply.status(201).send(serializePessoa(inserted))
    },
  )

  // ─── GET /tenant/pessoas/:id ────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:read'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: pessoaOut.extend({
          rg: z.string().nullable(),
          dataNascimento: z.string().nullable(),
          cep: z.string().nullable(),
          logradouro: z.string().nullable(),
          numero: z.string().nullable(),
          bairro: z.string().nullable(),
          observacoes: z.string().nullable(),
        }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const row = await db.query.pessoas.findFirst({
        where: (p, { eq, and, isNull }) => and(eq(p.id, req.params.id), isNull(p.deletedAt)),
      })
      if (!row) throw app.httpErrors.notFound('Pessoa não encontrada')
      return {
        ...serializePessoa(row),
        rg: row.rg,
        dataNascimento: row.dataNascimento?.toString() ?? null,
        cep: row.cep,
        logradouro: row.logradouro,
        numero: row.numero,
        bairro: row.bairro,
        observacoes: row.observacoes,
      }
    },
  )

  // ─── PATCH /tenant/pessoas/:id ──────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:write'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: updatePessoaBody,
        response: { 200: pessoaOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db
        .update(tenantSchema.pessoas)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(tenantSchema.pessoas.id, req.params.id), isNull(tenantSchema.pessoas.deletedAt)))
        .returning()

      if (!updated) throw app.httpErrors.notFound('Pessoa não encontrada')
      return serializePessoa(updated)
    },
  )

  // ─── DELETE /tenant/pessoas/:id (soft) ──────────────────
  app.delete(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:delete'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const result = await db
        .update(tenantSchema.pessoas)
        .set({ deletedAt: new Date(), active: false })
        .where(and(eq(tenantSchema.pessoas.id, req.params.id), isNull(tenantSchema.pessoas.deletedAt)))
        .returning({ id: tenantSchema.pessoas.id })

      if (result.length === 0) throw app.httpErrors.notFound('Pessoa não encontrada')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'pessoa.delete',
        resource: 'pessoa',
        resourceId: req.params.id,
        ipAddress: req.ip,
      })

      return reply.status(204).send(null)
    },
  )
}

function serializePessoa(row: any) {
  return {
    id: row.id,
    tipo: row.tipo,
    documento: row.documento,
    nome: row.nome,
    nomeFantasia: row.nomeFantasia,
    email: row.email,
    telefone: row.telefone,
    cidade: row.cidade,
    uf: row.uf,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}
