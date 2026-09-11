import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { COOKIE_NAMES } from '../lib/cookies.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const EXEMPT_PATHS = ['/admin/auth/login', '/tenant/auth/login', '/health']

async function csrfPluginFn(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (SAFE_METHODS.has(req.method)) return
    if (EXEMPT_PATHS.some(p => req.url.startsWith(p))) return

    // Só valida CSRF se o request veio com cookie (browser).
    // Requests com Authorization header (curl, mobile) não precisam de CSRF.
    if (!req.cookies[COOKIE_NAMES.csrf]) return

    const cookieToken = req.cookies[COOKIE_NAMES.csrf]
    const headerToken = req.headers['x-csrf-token']

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw app.httpErrors.forbidden('CSRF token inválido ou ausente')
    }
  })
}

export const csrfPlugin = fp(csrfPluginFn, {
  name: 'csrf-plugin',
  fastify: '5.x',
  dependencies: ['auth-plugin'],
})
