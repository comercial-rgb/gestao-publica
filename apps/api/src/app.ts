/**
 * Build da app Fastify.
 * Separado de server.ts para permitir testes (Vitest, supertest, etc).
 */
import Fastify, { FastifyInstance, FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { serializerCompiler, validatorCompiler, ZodTypeProvider, jsonSchemaTransform } from 'fastify-type-provider-zod'
import { ZodError } from 'zod'

import { env } from './env.js'
import { healthRoute } from './routes/health.js'
import { adminTenantsRoute } from './routes/admin/tenants.js'
import { adminAuthRoute } from './routes/admin/auth.js'
import { tenantAuthRoute } from './routes/tenant/auth.js'
import { tenantUsersRoute } from './routes/tenant/users.js'
import { tenantPessoasRoute } from './routes/tenant/pessoas.js'
import { tenantFiscalRoute } from './routes/tenant/fiscal.js'
import { tenantReceitasRoute } from './routes/tenant/receitas/index.js'
import { adminPlansRoute } from './routes/admin/plans.js'
import { authPlugin } from './plugins/auth.js'
import { tenantResolverPlugin } from './plugins/tenant.js'
import { redisPlugin } from './plugins/redis.js'
import { csrfPlugin } from './plugins/csrf.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { modulesPlugin } from './plugins/modules.js'
import { websocketPlugin } from './plugins/websocket.js'
import { tenantContribuintesRoute } from './routes/tenant/contribuintes.js'
import { tenantOrcamentoRoute } from './routes/tenant/orcamento/index.js'
import { tenantDespesasRoute } from './routes/tenant/despesas/index.js'
import { tenantFolhaRoute } from './routes/tenant/folha/index.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    disableRequestLogging: env.NODE_ENV === 'production',
    requestIdHeader: 'x-request-id',
    bodyLimit: 10 * 1024 * 1024, // 10 MB
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>()

  // Zod como validador e serializer
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // ── Swagger (antes de tudo para coletar schemas) ────────────
  await app.register(swaggerPlugin)

  // ── Plugins de infraestrutura ──────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  })

  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? [/\.saas-municipal\.com\.br$/]  // ajuste para seu domínio real
      : true,
    credentials: true,
  })

  await app.register(cookie, {
    secret: env.AUTH_SECRET,
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })

  await app.register(redisPlugin)

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: app.redis ?? undefined,
    nameSpace: 'sm:rl:',
    allowList: env.RATE_LIMIT_ALLOWLIST.length > 0 ? env.RATE_LIMIT_ALLOWLIST : undefined,
    keyGenerator: (req) => req.ip,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Limite excedido. Tente novamente em ${Math.ceil(ctx.ttl / 1000)}s`,
      retryAfter: Math.ceil(ctx.ttl / 1000),
    }),
  })

  await app.register(sensible)

  // ── Plugins de domínio ─────────────────────────────────────
  await app.register(authPlugin)            // decora request com authenticate*
  await app.register(modulesPlugin)         // requireActiveModule() + cache de módulos
  await app.register(csrfPlugin)            // valida CSRF em mutations com cookie
  await app.register(tenantResolverPlugin)  // resolve tenant pelo header / token
  await app.register(websocketPlugin)       // WS folha:progresso (pub/sub Redis)

  // ── Error handler global ───────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Dados inválidos',
        details: error.flatten().fieldErrors,
      })
    }

    const httpError = error as FastifyError

    // 402 Payment Required: módulo não contratado
    if (httpError.statusCode === 402) {
      return reply.status(402).send({
        error: 'ModuleNotActive',
        message: httpError.message,
        code: (httpError as unknown as Record<string, unknown>).code,
        moduleSlug: (httpError as unknown as Record<string, unknown>).moduleSlug,
      })
    }

    // Rate-limit já vem com statusCode 429. Preserva.
    if (httpError.statusCode === 429) {
      return reply.status(429).send({
        error: 'TooManyRequests',
        message: httpError.message,
      })
    }

    if (httpError.statusCode && httpError.statusCode < 500) {
      return reply.status(httpError.statusCode).send({
        error: httpError.name,
        message: httpError.message,
      })
    }

    req.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({
      error: 'InternalServerError',
      message: env.NODE_ENV === 'production'
        ? 'Erro interno do servidor'
        : httpError.message ?? 'Erro interno',
    })
  })

  // ── Rotas ──────────────────────────────────────────────────
  await app.register(healthRoute)

  // Admin (master)
  await app.register(adminAuthRoute,    { prefix: '/admin/auth' })
  await app.register(adminTenantsRoute, { prefix: '/admin/tenants' })
  await app.register(adminPlansRoute,   { prefix: '/admin/plans' })

  // Tenant (escopado pelo header X-Tenant-Slug)
  await app.register(tenantAuthRoute,    { prefix: '/tenant/auth' })
  await app.register(tenantUsersRoute,   { prefix: '/tenant/users' })
  await app.register(tenantPessoasRoute, { prefix: '/tenant/pessoas' })
  await app.register(tenantFiscalRoute,  { prefix: '/tenant/fiscal' })
  await app.register(tenantReceitasRoute,      { prefix: '/tenant/receitas' })
  await app.register(tenantContribuintesRoute, { prefix: '/tenant/contribuintes' })
  await app.register(tenantOrcamentoRoute,    { prefix: '/tenant/orcamento' })
  await app.register(tenantDespesasRoute,    { prefix: '/tenant/despesas' })
  await app.register(tenantFolhaRoute,      { prefix: '/tenant/folha' })

  return app
}
