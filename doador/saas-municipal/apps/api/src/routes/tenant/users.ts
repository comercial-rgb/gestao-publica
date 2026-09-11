/**
 * Rotas de gestão de usuários DENTRO de um tenant.
 *
 *   GET    /tenant/users               → lista
 *   POST   /tenant/users               → cria (envia senha temporária por e-mail no futuro)
 *   GET    /tenant/users/:id           → detalhe
 *   PATCH  /tenant/users/:id           → atualiza
 *   DELETE /tenant/users/:id           → soft delete
 *   POST   /tenant/users/:id/roles     → atribui role
 *   DELETE /tenant/users/:id/roles/:roleId → remove role
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  createTenantDatabase,
  tenantSchema,
  eq,
  and,
  or,
  lt,
  isNull,
} from '@saas-municipal/database'
import { hashPassword, generateTemporaryPassword, validatePasswordStrength } from '@saas-municipal/auth'
import { env } from '../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../lib/pagination.js'

const userOut = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  cpf: z.string().nullable(),
  status: z.string(),
  entidadeId: z.string().uuid().nullable(),
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  roles: z.array(z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() })),
})

export const tenantUsersRoute: FastifyPluginAsyncZod = async (app) => {
  // Todas as rotas exigem usuário do tenant autenticado + módulo ativo
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('usuarios')
  })

  // ─── GET /tenant/users ──────────────────────────────────
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('users:read'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        querystring: z.object({
          status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
          search: z.string().optional(),
        }).merge(paginationQuery),
        response: {
          200: z.object({
            items: z.array(userOut),
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
      const { status, search, cursor: rawCursor, limit } = req.query
      const cursor = decodeCursor(rawCursor)

      const rows = await db.query.users.findMany({
        where: (u, { eq, and, isNull, or, ilike }) => {
          const conds = [isNull(u.deletedAt)]
          if (status) conds.push(eq(u.status, status))
          if (search) {
            conds.push(or(ilike(u.name, `%${search}%`), ilike(u.email, `%${search}%`))!)
          }
          if (cursor) {
            conds.push(
              or(
                lt(u.createdAt, new Date(cursor.createdAt)),
                and(eq(u.createdAt, new Date(cursor.createdAt)), lt(u.id, cursor.id)),
              )!,
            )
          }
          return and(...conds)
        },
        orderBy: (u, { desc }) => [desc(u.createdAt), desc(u.id)],
        limit: limit + 1,
        with: { roles: { with: { role: true } } },
      })

      const result = paginatedResponse(rows, limit)
      return {
        items: result.items.map(serializeUser),
        pagination: result.pagination,
      }
    },
  )

  // ─── POST /tenant/users ─────────────────────────────────
  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('users:write'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          email: z.string().email().toLowerCase().trim(),
          name: z.string().min(3).max(200),
          cpf: z.string().regex(/^\d{11}$/).optional(),
          password: z.string().min(8).max(256).optional(),  // se omitido, gera temporária
          entidadeId: z.string().uuid().optional(),
          roleIds: z.array(z.string().uuid()).default([]),
        }),
        response: {
          201: userOut.extend({ temporaryPassword: z.string().optional() }),
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exists = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.email, req.body.email), req.body.cpf ? eq(u.cpf, req.body.cpf) : undefined),
      })
      if (exists) {
        return reply.status(409).send({ error: 'Conflict', message: 'Já existe usuário com este e-mail ou CPF' })
      }

      let temporaryPassword: string | undefined
      let plainPassword = req.body.password
      if (!plainPassword) {
        plainPassword = generateTemporaryPassword(16)
        temporaryPassword = plainPassword
      } else {
        const strength = validatePasswordStrength(plainPassword)
        if (!strength.valid) throw app.httpErrors.badRequest(`Senha fraca: ${strength.reason}`)
      }

      const passwordHash = await hashPassword(plainPassword)

      const [inserted] = await db
        .insert(tenantSchema.users)
        .values({
          email: req.body.email,
          name: req.body.name,
          cpf: req.body.cpf ?? null,
          passwordHash,
          status: temporaryPassword ? 'pending' : 'active',
          entidadeId: req.body.entidadeId ?? null,
        })
        .returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar usuário')

      // Atribui roles
      if (req.body.roleIds.length > 0) {
        await db.insert(tenantSchema.userRoles).values(
          req.body.roleIds.map((roleId) => ({
            userId: inserted.id,
            roleId,
            grantedBy: req.tenantAuth!.sub,
          })),
        )
      }

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'user.create',
        resource: 'user',
        resourceId: inserted.id,
        after: { email: inserted.email, name: inserted.name, status: inserted.status },
        ipAddress: req.ip,
      })

      const full = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, inserted.id),
        with: { roles: { with: { role: true } } },
      })

      return reply.status(201).send({
        ...serializeUser(full!),
        temporaryPassword,
      })
    },
  )

  // ─── GET /tenant/users/:id ──────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('users:read'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: userOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const row = await db.query.users.findFirst({
        where: (u, { eq, and, isNull }) => and(eq(u.id, req.params.id), isNull(u.deletedAt)),
        with: { roles: { with: { role: true } } },
      })
      if (!row) throw app.httpErrors.notFound('Usuário não encontrado')
      return serializeUser(row)
    },
  )

  // ─── PATCH /tenant/users/:id ────────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('users:write'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().min(3).max(200).optional(),
          status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
          entidadeId: z.string().uuid().nullable().optional(),
        }),
        response: { 200: userOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db
        .update(tenantSchema.users)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(tenantSchema.users.id, req.params.id), isNull(tenantSchema.users.deletedAt)))
        .returning()

      if (!updated) throw app.httpErrors.notFound('Usuário não encontrado')

      const full = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, updated.id),
        with: { roles: { with: { role: true } } },
      })
      return serializeUser(full!)
    },
  )

  // ─── DELETE /tenant/users/:id (soft) ────────────────────
  app.delete(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('users:write'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const result = await db
        .update(tenantSchema.users)
        .set({ deletedAt: new Date(), status: 'inactive' })
        .where(and(eq(tenantSchema.users.id, req.params.id), isNull(tenantSchema.users.deletedAt)))
        .returning({ id: tenantSchema.users.id })

      if (result.length === 0) throw app.httpErrors.notFound('Usuário não encontrado')
      return reply.status(204).send(null)
    },
  )

  // ─── POST /tenant/users/:id/roles ───────────────────────
  app.post(
    '/:id/roles',
    {
      preHandler: async (req) => req.requirePermission('users:assign_role'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ roleId: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      await db
        .insert(tenantSchema.userRoles)
        .values({
          userId: req.params.id,
          roleId: req.body.roleId,
          grantedBy: req.tenantAuth!.sub,
        })
        .onConflictDoNothing()

      return reply.status(204).send(null)
    },
  )

  // ─── DELETE /tenant/users/:id/roles/:roleId ─────────────
  app.delete(
    '/:id/roles/:roleId',
    {
      preHandler: async (req) => req.requirePermission('users:assign_role'),
      schema: {
        tags: ['tenant-users'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      await db
        .delete(tenantSchema.userRoles)
        .where(
          and(
            eq(tenantSchema.userRoles.userId, req.params.id),
            eq(tenantSchema.userRoles.roleId, req.params.roleId),
          ),
        )
      return reply.status(204).send(null)
    },
  )
}

function serializeUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    cpf: row.cpf,
    status: row.status,
    entidadeId: row.entidadeId,
    twoFactorEnabled: row.twoFactorEnabled,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    roles: (row.roles ?? []).map((ur: any) => ({
      id: ur.role.id,
      slug: ur.role.slug,
      name: ur.role.name,
    })),
  }
}
