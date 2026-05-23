import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { createMasterDatabase, publicSchema } from '@saas-municipal/database'
import { env } from '../env.js'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Lê versão do package.json uma vez no boot
let APP_VERSION = 'unknown'
try {
  const pkg = await readFile(resolve(__dirname, '../../package.json'), 'utf-8')
  APP_VERSION = (JSON.parse(pkg) as { version?: string }).version || 'unknown'
} catch { /* ignore */ }

export const healthRoute: FastifyPluginAsyncZod = async (app) => {
  // ─── /health/live ───────────────────────────────────────
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        response: {
          200: z.object({ status: z.literal('ok'), uptime: z.number() }),
        },
      },
      logLevel: 'silent',
    },
    async () => ({ status: 'ok' as const, uptime: process.uptime() }),
  )

  // ─── /health/ready ──────────────────────────────────────
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: {
          200: z.object({
            status: z.literal('ok'),
            checks: z.object({
              postgres: z.object({ ok: z.boolean(), latencyMs: z.number() }),
              redis:    z.object({ ok: z.boolean(), latencyMs: z.number() }).optional(),
            }),
          }),
          503: z.object({
            status: z.literal('not_ready'),
            checks: z.record(z.string(), z.unknown()),
          }),
        },
      },
      logLevel: 'silent',
    },
    async (_req, reply) => {
      const db = createMasterDatabase(env.DATABASE_URL)
      const checks: {
        postgres: { ok: boolean; latencyMs: number; error?: string }
        redis?: { ok: boolean; latencyMs: number; error?: string }
      } = {
        postgres: { ok: false, latencyMs: 0 },
      }

      // Postgres
      const pgStart = Date.now()
      try {
        await db.execute(sql`SELECT 1`)
        checks.postgres = { ok: true, latencyMs: Date.now() - pgStart }
      } catch (err) {
        checks.postgres = {
          ok: false,
          latencyMs: Date.now() - pgStart,
          error: (err as Error).message,
        }
      }

      // Redis (opcional)
      if (app.redis) {
        const rdStart = Date.now()
        try {
          const pong = await app.redis.ping()
          checks.redis = {
            ok: pong === 'PONG',
            latencyMs: Date.now() - rdStart,
          }
        } catch (err) {
          checks.redis = {
            ok: false,
            latencyMs: Date.now() - rdStart,
            error: (err as Error).message,
          }
        }
      }

      const allOk = Object.values(checks).every((c) => c.ok)
      if (!allOk) {
        return reply.status(503).send({
          status: 'not_ready' as const,
          checks,
        })
      }

      return { status: 'ok' as const, checks }
    },
  )

  // ─── /health/info ───────────────────────────────────────
  app.get(
    '/health/info',
    {
      schema: {
        tags: ['health'],
        response: {
          200: z.object({
            version: z.string(),
            env: z.string(),
            uptime: z.number(),
            timestamp: z.string(),
            tenants: z.object({
              total: z.number(),
              active: z.number(),
              pending: z.number(),
            }),
          }),
        },
      },
      // Em produção, proteger com auth master
      preHandler: env.NODE_ENV === 'production'
        ? async (req) => req.authenticateMaster()
        : undefined,
    },
    async () => {
      const db = createMasterDatabase(env.DATABASE_URL)

      const counts = await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where status = 'active' and deleted_at is null)::int`,
          pending: sql<number>`count(*) filter (where status = 'pending' and deleted_at is null)::int`,
        })
        .from(publicSchema.tenants)

      return {
        version: APP_VERSION,
        env: env.NODE_ENV,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        tenants: counts[0] ?? { total: 0, active: 0, pending: 0 },
      }
    },
  )

  // Backward compat: /health continua funcionando como alias de /health/live
  app.get('/health', { logLevel: 'silent' }, async () => ({
    status: 'ok' as const,
    uptime: process.uptime(),
  }))
}
