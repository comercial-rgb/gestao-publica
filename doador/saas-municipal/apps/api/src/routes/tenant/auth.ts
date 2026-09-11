/**
 * Rotas de autenticação para usuários do TENANT (servidores da prefeitura).
 *
 *   POST /tenant/auth/login    → header X-Tenant-Slug + { email, password }
 *   POST /tenant/auth/refresh
 *   POST /tenant/auth/logout
 *   GET  /tenant/auth/me
 *   POST /tenant/auth/change-password
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  verifyPassword,
  hashPassword,
  signTenantToken,
  generateRefreshToken,
  hashRefreshToken,
  validatePasswordStrength,
} from '@saas-municipal/auth'
import {
  createMasterDatabase,
  createTenantDatabase,
  publicSchema,
  tenantSchema,
  eq,
  and,
  isNull,
  sql,
} from '@saas-municipal/database'
import { env } from '../../env.js'
import {
  COOKIE_NAMES,
  ACCESS_COOKIE_OPTS,
  REFRESH_COOKIE_OPTS,
  CSRF_COOKIE_OPTS,
  generateCsrfToken,
} from '../../lib/cookies.js'
import { getTenantActiveModules } from '../../lib/tenant-modules-cache.js'

const loginBody = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(256),
})

export const tenantAuthRoute: FastifyPluginAsyncZod = async (app) => {
  const masterDb = createMasterDatabase(env.DATABASE_URL)

  // ─── POST /login ────────────────────────────────────────
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['tenant-auth'],
        security: [{ tenantSlug: [] }],
        body: loginBody,
        headers: z.object({ 'x-tenant-slug': z.string().min(1) }),
        response: {
          200: z.object({
            tenant: z.object({ slug: z.string(), name: z.string() }),
            user: z.object({
              id: z.string().uuid(),
              email: z.string(),
              name: z.string(),
              roles: z.array(z.string()),
              permissions: z.array(z.string()),
            }),
          }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const tenantDb = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const { email, password } = req.body

      const user = await tenantDb.query.users.findFirst({
        where: (u, { eq, and, isNull }) =>
          and(eq(u.email, email), isNull(u.deletedAt)),
      })

      // Timing-safe even when user doesn't exist
      const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXlo'
      const passwordValid =
        user && user.passwordHash
          ? await verifyPassword(password, user.passwordHash)
          : await verifyPassword(password, dummyHash) && false

      if (!user || !passwordValid || user.status !== 'active') {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Credenciais inválidas ou usuário inativo',
        })
      }

      // Carrega roles + permissions
      const { roles, permissions } = await loadUserAuthz(tenantDb, user.id)

      const accessToken = await signTenantToken(
        {
          sub: user.id,
          tid: tenant.id,
          sch: tenant.schemaName,
          name: user.name,
          email: user.email,
          rol: roles,
          prm: permissions,
        },
        { secret: env.AUTH_SECRET, accessExpiresIn: env.AUTH_JWT_EXPIRES_IN },
      )

      const { token: refreshToken, tokenHash } = generateRefreshToken()
      const expiresAt = new Date(Date.now() + env.AUTH_REFRESH_EXPIRES_IN * 1000)

      await masterDb.insert(publicSchema.refreshTokens).values({
        tokenHash,
        userId: user.id,
        tenantId: tenant.id,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt,
      })

      await tenantDb
        .update(tenantSchema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(tenantSchema.users.id, user.id))

      await tenantDb.insert(tenantSchema.tenantAuditLog).values({
        userId: user.id,
        action: 'login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })

      const csrfToken = generateCsrfToken()
      reply.setCookie(COOKIE_NAMES.tenantAccess, accessToken, ACCESS_COOKIE_OPTS('/'))
      reply.setCookie(COOKIE_NAMES.tenantRefresh, refreshToken, REFRESH_COOKIE_OPTS('/tenant/auth'))
      reply.setCookie(COOKIE_NAMES.csrf, csrfToken, CSRF_COOKIE_OPTS)

      return {
        tenant: { slug: tenant.slug, name: tenant.name },
        user: { id: user.id, email: user.email, name: user.name, roles, permissions },
      }
    },
  )

  // ─── POST /refresh ──────────────────────────────────────
  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['tenant-auth'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        response: {
          200: z.object({ success: z.boolean() }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const refreshTokenRaw = req.cookies[COOKIE_NAMES.tenantRefresh]
      if (!refreshTokenRaw) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Refresh token ausente' })
      }
      const tokenHash = hashRefreshToken(refreshTokenRaw)

      const row = await masterDb.query.refreshTokens.findFirst({
        where: (t, { eq, and, isNull, gt, isNotNull }) =>
          and(
            eq(t.tokenHash, tokenHash),
            isNull(t.revokedAt),
            isNotNull(t.tenantId),
            gt(t.expiresAt, new Date()),
          ),
      })

      if (!row || !row.tenantId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Refresh token inválido' })
      }

      const tenant = await masterDb.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, row.tenantId!), isNull(t.deletedAt)),
      })
      if (!tenant || tenant.status !== 'active') {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Tenant inativo' })
      }

      const tenantDb = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const user = await tenantDb.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, row.userId),
      })
      if (!user || user.status !== 'active') {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Usuário inativo' })
      }

      const { roles, permissions } = await loadUserAuthz(tenantDb, user.id)

      // Rotate
      await masterDb
        .update(publicSchema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(publicSchema.refreshTokens.id, row.id))

      const accessToken = await signTenantToken(
        {
          sub: user.id,
          tid: tenant.id,
          sch: tenant.schemaName,
          name: user.name,
          email: user.email,
          rol: roles,
          prm: permissions,
        },
        { secret: env.AUTH_SECRET, accessExpiresIn: env.AUTH_JWT_EXPIRES_IN },
      )

      const { token: newRefreshToken, tokenHash: newHash } = generateRefreshToken()
      const expiresAt = new Date(Date.now() + env.AUTH_REFRESH_EXPIRES_IN * 1000)

      await masterDb.insert(publicSchema.refreshTokens).values({
        tokenHash: newHash,
        userId: user.id,
        tenantId: tenant.id,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt,
      })

      reply.setCookie(COOKIE_NAMES.tenantAccess, accessToken, ACCESS_COOKIE_OPTS('/'))
      reply.setCookie(COOKIE_NAMES.tenantRefresh, newRefreshToken, REFRESH_COOKIE_OPTS('/tenant/auth'))

      return { success: true }
    },
  )

  // ─── POST /logout ───────────────────────────────────────
  app.post(
    '/logout',
    {
      schema: {
        tags: ['tenant-auth'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const refreshTokenRaw = req.cookies[COOKIE_NAMES.tenantRefresh]
      if (refreshTokenRaw) {
        const tokenHash = hashRefreshToken(refreshTokenRaw)
        await masterDb
          .update(publicSchema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(publicSchema.refreshTokens.tokenHash, tokenHash),
              isNull(publicSchema.refreshTokens.revokedAt),
            ),
          )
      }

      reply.clearCookie(COOKIE_NAMES.tenantAccess, { path: '/' })
      reply.clearCookie(COOKIE_NAMES.tenantRefresh, { path: '/tenant/auth' })
      reply.clearCookie(COOKIE_NAMES.csrf, { path: '/' })

      return reply.status(204).send(null)
    },
  )

  // ─── GET /me ────────────────────────────────────────────
  app.get(
    '/me',
    {
      schema: {
        tags: ['tenant-auth'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        response: {
          200: z.object({
            id: z.string().uuid(),
            email: z.string(),
            name: z.string(),
            roles: z.array(z.string()),
            permissions: z.array(z.string()),
            activeModules: z.array(z.string()),
            tenant: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
          }),
        },
      },
      preHandler: async (req) => req.authenticateTenant(),
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const tenantDb = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const user = await tenantDb.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, req.tenantAuth!.sub),
      })
      if (!user) throw app.httpErrors.notFound('Usuário não encontrado')

      const { roles, permissions } = await loadUserAuthz(tenantDb, user.id)
      const activeModules = await getTenantActiveModules(tenant.id)

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions,
        activeModules: [...activeModules],
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      }
    },
  )

  // ─── POST /change-password ──────────────────────────────
  app.post(
    '/change-password',
    {
      preHandler: async (req) => req.authenticateTenant(),
      schema: {
        tags: ['tenant-auth'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          currentPassword: z.string().min(8),
          newPassword: z.string().min(8).max(256),
        }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const strength = validatePasswordStrength(req.body.newPassword)
      if (!strength.valid) {
        throw app.httpErrors.badRequest(`Senha fraca: ${strength.reason}`)
      }

      const tenant = await req.resolveTenant()
      const tenantDb = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const user = await tenantDb.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, req.tenantAuth!.sub),
      })
      if (!user || !user.passwordHash) {
        throw app.httpErrors.notFound('Usuário sem senha definida (login só via gov.br)')
      }

      const ok = await verifyPassword(req.body.currentPassword, user.passwordHash)
      if (!ok) throw app.httpErrors.unauthorized('Senha atual incorreta')

      const newHash = await hashPassword(req.body.newPassword)
      await tenantDb
        .update(tenantSchema.users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(tenantSchema.users.id, user.id))

      // Revoga todos os refresh tokens do usuário (força re-login em outros devices)
      await masterDb
        .update(publicSchema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(publicSchema.refreshTokens.userId, user.id),
            isNull(publicSchema.refreshTokens.revokedAt),
          ),
        )

      await tenantDb.insert(tenantSchema.tenantAuditLog).values({
        userId: user.id,
        action: 'password.change',
        ipAddress: req.ip,
      })

      return reply.status(204).send(null)
    },
  )
}

/**
 * Carrega roles + permissions efetivas de um usuário.
 * Permissions são deduplicadas (mesma permission via 2 roles → 1 entrada).
 */
async function loadUserAuthz(
  tenantDb: ReturnType<typeof createTenantDatabase>,
  userId: string,
): Promise<{ roles: string[]; permissions: string[] }> {
  const rows = await tenantDb
    .select({
      roleSlug: tenantSchema.roles.slug,
      permissionSlug: tenantSchema.permissions.slug,
    })
    .from(tenantSchema.userRoles)
    .innerJoin(tenantSchema.roles, eq(tenantSchema.userRoles.roleId, tenantSchema.roles.id))
    .leftJoin(
      tenantSchema.rolePermissions,
      eq(tenantSchema.rolePermissions.roleId, tenantSchema.roles.id),
    )
    .leftJoin(
      tenantSchema.permissions,
      eq(tenantSchema.permissions.id, tenantSchema.rolePermissions.permissionId),
    )
    .where(eq(tenantSchema.userRoles.userId, userId))

  const roles = [...new Set(rows.map((r) => r.roleSlug))]
  const permissions = [...new Set(rows.map((r) => r.permissionSlug).filter((p): p is string => !!p))]

  return { roles, permissions }
}
