/**
 * Cliente HTTP via proxy Next.js.
 * Cookies httpOnly fluem automaticamente (mesma origem via /api/proxy).
 * CSRF token lido do cookie sm_csrf (não-httpOnly) e enviado no header.
 */
const PROXY_BASE = '/api/proxy'

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/sm_csrf=([^;]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { tenantSlug?: string } = {},
): Promise<T> {
  const { tenantSlug, headers = {}, method = 'GET', ...rest } = init

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }

  if (tenantSlug) finalHeaders['X-Tenant-Slug'] = tenantSlug

  // CSRF: incluir em mutations
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
  if (isMutation) {
    const csrf = getCsrfToken()
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf
  }

  const res = await fetch(`${PROXY_BASE}${path}`, {
    ...rest,
    method,
    headers: finalHeaders,
    credentials: 'include',
  })

  if (res.status === 401) {
    const refreshed = await tryRefresh(path)
    if (refreshed) {
      return api(path, init)
    }
    if (typeof window !== 'undefined') {
      const isAdmin = path.startsWith('/admin/')
      window.location.href = isAdmin ? '/admin/login' : '/login'
    }
    throw new Error('Não autenticado')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function tryRefresh(originalPath: string): Promise<boolean> {
  const refreshPath = originalPath.startsWith('/admin/')
    ? '/admin/auth/refresh'
    : '/tenant/auth/refresh'
  const csrf = getCsrfToken()
  try {
    const res = await fetch(`${PROXY_BASE}${refreshPath}`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}
