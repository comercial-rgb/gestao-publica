/**
 * RBAC — checagem de permissões.
 *
 * Padrão: cada permission é "modulo:acao" (ex. "receitas:write").
 * Wildcards suportados:
 *   - "*"               → tudo
 *   - "receitas:*"      → todas as ações do módulo
 *   - "*:read"          → ler tudo
 */

/**
 * Verifica se o conjunto de permissões do usuário inclui a permissão exigida.
 * Suporta wildcard "*" e "modulo:*" e "*:acao".
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (!userPermissions || userPermissions.length === 0) return false
  if (userPermissions.includes('*')) return true
  if (userPermissions.includes(required)) return true

  const [reqModule, reqAction] = required.split(':')
  if (!reqModule || !reqAction) return false

  if (userPermissions.includes(`${reqModule}:*`)) return true
  if (userPermissions.includes(`*:${reqAction}`)) return true

  return false
}

/**
 * Versão all() — exige TODAS as permissões.
 */
export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every((r) => hasPermission(userPermissions, r))
}

/**
 * Versão any() — basta UMA das permissões.
 */
export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((r) => hasPermission(userPermissions, r))
}

/**
 * Hierarquia das master roles (super_admin > admin > support > readonly).
 * Retorna true se a role do usuário é >= role exigida.
 */
const MASTER_ROLE_RANK: Record<string, number> = {
  super_admin: 4,
  admin: 3,
  support: 2,
  readonly: 1,
}

export function hasMasterRole(
  userRole: string,
  requiredRole: 'super_admin' | 'admin' | 'support' | 'readonly',
): boolean {
  const u = MASTER_ROLE_RANK[userRole] ?? 0
  const r = MASTER_ROLE_RANK[requiredRole] ?? 0
  return u >= r
}
