/**
 * Plugin de autenticação.
 *
 * Decora `request` com:
 *   - authenticateMaster(): exige token typ='master', popula request.master
 *   - authenticateTenant(): exige token typ='tenant', popula request.tenantAuth
 *   - requirePermission(perm): garante que request.tenantAuth.prm inclui perm
 *   - requireMasterRole(role): garante hierarquia master
 *
 * Tokens vêm via cookie httpOnly (browser) ou header Authorization: Bearer (API).
 */
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  verifyToken,
  hasPermission,
  hasMasterRole,
  type MasterTokenPayload,
  type TenantTokenPayload,
} from '@saas-municipal/auth'
import { env } from '../env.js'
import { COOKIE_NAMES } from '../lib/cookies.js'

declare module 'fastify' {
  interface FastifyRequest {
    master?: MasterTokenPayload
    tenantAuth?: TenantTokenPayload
    authenticateMaster(): Promise<void>
    authenticateTenant(): Promise<void>
    requirePermission(perm: string): Promise<void>
    requireMasterRole(role: 'super_admin' | 'admin' | 'support' | 'readonly'): Promise<void>
  }
}

function extractToken(req: FastifyRequest, cookieName: string): string | null {
  // Prioridade 1: cookie httpOnly (browser)
  const fromCookie = req.cookies[cookieName]
  if (fromCookie) return fromCookie

  // Prioridade 2: Authorization header (curl, mobile apps, integrações)
  const header = req.headers.authorization
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

async function authPluginFn(app: FastifyInstance) {
  app.decorateRequest('master', undefined)
  app.decorateRequest('tenantAuth', undefined)

  app.decorateRequest('authenticateMaster', async function (this: FastifyRequest) {
    const token = extractToken(this, COOKIE_NAMES.adminAccess)
    if (!token) throw this.server.httpErrors.unauthorized('Token ausente')

    let payload
    try {
      payload = await verifyToken(token, { secret: env.AUTH_SECRET })
    } catch (err) {
      throw this.server.httpErrors.unauthorized(`Token inválido: ${(err as Error).message}`)
    }

    if (payload.typ !== 'master') {
      throw this.server.httpErrors.forbidden('Token não é do tipo master')
    }
    this.master = payload as MasterTokenPayload
  })

  app.decorateRequest('authenticateTenant', async function (this: FastifyRequest) {
    const token = extractToken(this, COOKIE_NAMES.tenantAccess)
    if (!token) throw this.server.httpErrors.unauthorized('Token ausente')

    let payload
    try {
      payload = await verifyToken(token, { secret: env.AUTH_SECRET })
    } catch (err) {
      throw this.server.httpErrors.unauthorized(`Token inválido: ${(err as Error).message}`)
    }

    if (payload.typ !== 'tenant') {
      throw this.server.httpErrors.forbidden('Token não é do tipo tenant')
    }
    this.tenantAuth = payload as TenantTokenPayload
  })

  app.decorateRequest('requirePermission', async function (this: FastifyRequest, perm: string) {
    if (!this.tenantAuth) {
      throw this.server.httpErrors.unauthorized('Tenant não autenticado')
    }
    if (!hasPermission(this.tenantAuth.prm, perm)) {
      throw this.server.httpErrors.forbidden(`Permissão necessária: ${perm}`)
    }
  })

  app.decorateRequest('requireMasterRole', async function (
    this: FastifyRequest,
    role: 'super_admin' | 'admin' | 'support' | 'readonly',
  ) {
    if (!this.master) {
      throw this.server.httpErrors.unauthorized('Master não autenticado')
    }
    if (!hasMasterRole(this.master.mrl, role)) {
      throw this.server.httpErrors.forbidden(`Role mínima exigida: ${role}`)
    }
  })
}

export const authPlugin = fp(authPluginFn, {
  name: 'auth-plugin',
  fastify: '5.x',
})
