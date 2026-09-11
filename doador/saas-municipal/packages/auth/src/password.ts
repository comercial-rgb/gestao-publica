/**
 * Hash e verificação de senhas com Argon2id.
 *
 * Argon2id é o algoritmo recomendado pelo OWASP (2024+).
 * Parâmetros calibrados para ~100ms em hardware moderno.
 */
import { hash, verify } from '@node-rs/argon2'

// @node-rs/argon2 usa Argon2id por padrão; não precisamos especificar.
const ARGON2_OPTS = {
  memoryCost: 19_456,   // 19 MB
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * Gera hash de senha. Retorna a string completa do PHC
 * ($argon2id$v=19$m=19456,t=2,p=1$...$...) que já inclui salt e parâmetros.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error('Senha deve ter pelo menos 8 caracteres')
  }
  if (plain.length > 256) {
    throw new Error('Senha não pode exceder 256 caracteres')
  }
  return hash(plain, ARGON2_OPTS)
}

/**
 * Verifica senha contra hash PHC. Resistente a timing attacks (argon2 trata isso).
 */
export async function verifyPassword(plain: string, hashStr: string): Promise<boolean> {
  if (!hashStr) return false
  try {
    return await verify(hashStr, plain)
  } catch {
    return false
  }
}

/**
 * Gera senha temporária forte (para convite de novo usuário, reset, etc).
 */
export function generateTemporaryPassword(length = 16): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i]! % charset.length]
  }
  return out
}

/**
 * Valida força mínima de senha. Use no signup/reset.
 * Critérios: 8+ chars, ao menos 1 letra, 1 número, 1 não-alfanumérico.
 */
export function validatePasswordStrength(plain: string): { valid: boolean; reason?: string } {
  if (plain.length < 8) return { valid: false, reason: 'mínimo 8 caracteres' }
  if (plain.length > 256) return { valid: false, reason: 'máximo 256 caracteres' }
  if (!/[a-zA-Z]/.test(plain)) return { valid: false, reason: 'precisa conter ao menos uma letra' }
  if (!/[0-9]/.test(plain)) return { valid: false, reason: 'precisa conter ao menos um número' }
  if (!/[^a-zA-Z0-9]/.test(plain)) return { valid: false, reason: 'precisa conter ao menos um caractere especial' }
  return { valid: true }
}
