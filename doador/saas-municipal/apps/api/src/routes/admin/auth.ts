/**
 * Rotas de autenticação para usuários MASTER (admin do SaaS).
 *
 *   POST   /admin/auth/login    → { email, password }            → { accessToken, refreshToken }
 *   POST   /admin/auth/refresh  → { refreshToken }               → { accessToken, refreshToken }
 *   POST   /admin/auth/logout   → revoga refresh token
 *   GET    /admin/auth/me       → dados do master autenticado
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  verifyPassword,
  signMasterToken,
  generateRefreshToken,
  hashRefreshToken,
} from '@saas-municipal/auth'
import {
  createMasterDatabase,
  publicSchema,
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

const loginBody = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(256),
})

export const adminAuthRoute: FastifyPluginAsyncZod = async (app) => {
  const db = createMasterDatabase(env.DATABASE_URL)

  // ─── POST /login ────────────────────────────────────────
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin-auth'],
        body: loginBody,
        response: {
          200: z.object({
            user: z.object({
              id: z.string().uuid(),
              email: z.string(),
              name: z.string(),
              role: z.string(),
            }),
          }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body

      const user = await db.query.masterUsers.findFirst({
        where: (u, { eq }) => eq(u.email, email),
      })

      // Tempo constante para evitar enumeration por timing
      const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXlo'
      const ok = user
        ? await verifyPassword(password, user.passwordHash)
        : await verifyPassword(password, dummyHash) && false

      if (!user || !ok || !user.active) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Credenciais inválidas',
        })
      }

      const accessToken = await signMasterToken(
        {
          sub: user.id,
          name: user.name,
          email: user.email,
          mrl: user.role,
        },
        { secret: env.AUTH_SECRET, accessExpiresIn: env.AUTH_JWT_EXPIRES_IN },
      )

      const { token: refreshToken, tokenHash } = generateRefreshToken()
      const expiresAt = new Date(Date.now() + env.AUTH_REFRESH_EXPIRES_IN * 1000)

      await db.insert(publicSchema.refreshTokens).values({
        tokenHash,
        userId: user.id,
        tenantId: null,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt,
      })

      // Atualiza last_login_at
      await db
        .update(publicSchema.masterUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(publicSchema.masterUsers.id, user.id))

      // Log
      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: user.id,
        action: 'login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })

      const csrfToken = generateCsrfToken()
      reply.setCookie(COOKIE_NAMES.adminAccess, accessToken, ACCESS_COOKIE_OPTS('/'))
      reply.setCookie(COOKIE_NAMES.adminRefresh, refreshToken, REFRESH_COOKIE_OPTS('/admin/auth'))
      reply.setCookie(COOKIE_NAMES.csrf, csrfToken, CSRF_COOKIE_OPTS)

      return {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      }
    },
  )

  // ─── POST /refresh ──────────────────────────────────────
  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin-auth'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        response: {
          200: z.object({ success: z.boolean() }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const refreshTokenRaw = req.cookies[COOKIE_NAMES.adminRefresh]
      if (!refreshTokenRaw) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Refresh token ausente' })
      }
      const tokenHash = hashRefreshToken(refreshTokenRaw)

      const row = await db.query.refreshTokens.findFirst({
        where: (t, { eq, and, isNull, gt }) =>
          and(
            eq(t.tokenHash, tokenHash),
            isNull(t.revokedAt),
            isNull(t.tenantId),  // master apenas
            gt(t.expiresAt, new Date()),
          ),
      })

      if (!row) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Refresh token inválido ou expirado' })
      }

      const user = await db.query.masterUsers.findFirst({
        where: (u, { eq }) => eq(u.id, row.userId),
      })
      if (!user || !user.active) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Usuário inativo' })
      }

      // Rotate: revoga o atual + cria novo (refresh token rotation)
      await db
        .update(publicSchema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(publicSchema.refreshTokens.id, row.id))

      const accessToken = await signMasterToken(
        { sub: user.id, name: user.name, email: user.email, mrl: user.role },
        { secret: env.AUTH_SECRET, accessExpiresIn: env.AUTH_JWT_EXPIRES_IN },
      )

      const { token: newRefreshToken, tokenHash: newHash } = generateRefreshToken()
      const expiresAt = new Date(Date.now() + env.AUTH_REFRESH_EXPIRES_IN * 1000)

      await db.insert(publicSchema.refreshTokens).values({
        tokenHash: newHash,
        userId: user.id,
        tenantId: null,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt,
      })

      reply.setCookie(COOKIE_NAMES.adminAccess, accessToken, ACCESS_COOKIE_OPTS('/'))
      reply.setCookie(COOKIE_NAMES.adminRefresh, newRefreshToken, REFRESH_COOKIE_OPTS('/admin/auth'))

      return { success: true }
    },
  )

  // ─── POST /logout ───────────────────────────────────────
  app.post(
    '/logout',
    {
      schema: {
        tags: ['admin-auth'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const refreshTokenRaw = req.cookies[COOKIE_NAMES.adminRefresh]
      if (refreshTokenRaw) {
        const tokenHash = hashRefreshToken(refreshTokenRaw)
        await db
          .update(publicSchema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(publicSchema.refreshTokens.tokenHash, tokenHash),
              isNull(publicSchema.refreshTokens.revokedAt),
            ),
          )
      }

      reply.clearCookie(COOKIE_NAMES.adminAccess, { path: '/' })
      reply.clearCookie(COOKIE_NAMES.adminRefresh, { path: '/admin/auth' })
      reply.clearCookie(COOKIE_NAMES.csrf, { path: '/' })

      return reply.status(204).send(null)
    },
  )

  // ─── GET /me ────────────────────────────────────────────
  app.get(
    '/me',
    {
      schema: {
        tags: ['admin-auth'],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          200: z.object({
            id: z.string().uuid(),
            email: z.string(),
            name: z.string(),
            role: z.string(),
            lastLoginAt: z.string().nullable(),
          }),
        },
      },
      preHandler: async (req) => req.authenticateMaster(),
    },
    async (req) => {
      const user = await db.query.masterUsers.findFirst({
        where: (u, { eq }) => eq(u.id, req.master!.sub),
      })
      if (!user) throw app.httpErrors.notFound('Usuário não encontrado')

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      }
    },
  )
}
