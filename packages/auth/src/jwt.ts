/**
 * JWT — emissão e verificação de tokens.
 *
 * Estrutura:
 *   - Access token: short-lived (8h default), assinado HS256
 *   - Refresh token: long-lived (30d default), opaco (random 256 bits),
 *     hash armazenado no banco em refresh_tokens
 *
 * Claims:
 *   - sub: user id (UUID)
 *   - typ: 'master' | 'tenant'
 *   - tid: tenant id (apenas typ='tenant')
 *   - sch: schema name do tenant (apenas typ='tenant')
 *   - rol: array de slugs de role (apenas typ='tenant')
 *   - prm: array de slugs de permissions (apenas typ='tenant')
 *   - mrl: master role enum (apenas typ='master')
 */
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes, createHash } from 'node:crypto'

const ALG = 'HS256'

export interface MasterTokenPayload {
  typ: 'master'
  sub: string
  mrl: 'super_admin' | 'admin' | 'support' | 'readonly'
  name: string
  email: string
  iat?: number
  exp?: number
}

export interface TenantTokenPayload {
  typ: 'tenant'
  sub: string
  tid: string  // tenant id
  sch: string  // schema name
  name: string
  email: string
  rol: string[]
  prm: string[]
  iat?: number
  exp?: number
}

export type TokenPayload = MasterTokenPayload | TenantTokenPayload

interface JwtConfig {
  secret: string
  accessExpiresIn: number  // segundos
}

function secretToKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

// ─────────────────────────────────────────────────────────────
// ACCESS TOKEN
// ─────────────────────────────────────────────────────────────

export async function signMasterToken(
  payload: Omit<MasterTokenPayload, 'iat' | 'exp' | 'typ'>,
  config: JwtConfig,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...payload, typ: 'master' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + config.accessExpiresIn)
    .setSubject(payload.sub)
    .sign(secretToKey(config.secret))
}

export async function signTenantToken(
  payload: Omit<TenantTokenPayload, 'iat' | 'exp' | 'typ'>,
  config: JwtConfig,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...payload, typ: 'tenant' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + config.accessExpiresIn)
    .setSubject(payload.sub)
    .sign(secretToKey(config.secret))
}

export async function verifyToken(
  token: string,
  config: Pick<JwtConfig, 'secret'>,
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secretToKey(config.secret))

  // Narrow obrigatório — jose retorna sub como string | undefined.
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token inválido: sub ausente')
  }

  if (payload.typ !== 'master' && payload.typ !== 'tenant') {
    throw new Error('Token inválido: typ ausente ou desconhecido')
  }

  // Após os checks acima, o cast é seguro.
  return payload as unknown as TokenPayload
}

// ─────────────────────────────────────────────────────────────
// REFRESH TOKEN (opaco)
// ─────────────────────────────────────────────────────────────

/**
 * Gera refresh token opaco (string aleatória) + seu hash para persistir.
 * O token original é entregue ao cliente; só o hash fica no banco.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashRefreshToken(token)
  return { token, tokenHash }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
