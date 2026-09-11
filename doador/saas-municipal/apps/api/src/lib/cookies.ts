import type { CookieSerializeOptions } from '@fastify/cookie'
import { randomBytes } from 'node:crypto'
import { env } from '../env.js'

/**
 * Configuração padrão de cookies de autenticação.
 * - httpOnly: JS do browser não acessa (anti-XSS)
 * - secure: só HTTPS em produção
 * - sameSite=strict: navegador só envia em requests do mesmo site (anti-CSRF base)
 */
export const ACCESS_COOKIE_OPTS = (path: string): CookieSerializeOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path,
  maxAge: env.AUTH_JWT_EXPIRES_IN,
})

export const REFRESH_COOKIE_OPTS = (path: string): CookieSerializeOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path,
  maxAge: env.AUTH_REFRESH_EXPIRES_IN,
})

// CSRF cookie NÃO é httpOnly (JS precisa ler para mandar no header)
export const CSRF_COOKIE_OPTS: CookieSerializeOptions = {
  httpOnly: false,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: env.AUTH_JWT_EXPIRES_IN,
}

export const COOKIE_NAMES = {
  adminAccess:  'sm_admin_access',
  adminRefresh: 'sm_admin_refresh',
  tenantAccess:  'sm_tenant_access',
  tenantRefresh: 'sm_tenant_refresh',
  csrf:         'sm_csrf',
} as const

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}
