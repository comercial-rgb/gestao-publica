import { signMasterToken, signTenantToken } from '@saas-municipal/auth'
import { env } from '../../src/env.js'

const jwtConfig = {
  secret: env.AUTH_SECRET,
  accessExpiresIn: env.AUTH_JWT_EXPIRES_IN,
}

/**
 * Assina JWT de tenant user direto, sem passar pelo fluxo de login.
 */
export async function signTestTenantToken(opts: {
  userId: string
  tenantId: string
  schemaName: string
  roles: string[]
  permissions: string[]
  email?: string
  name?: string
}): Promise<string> {
  return signTenantToken(
    {
      sub: opts.userId,
      tid: opts.tenantId,
      sch: opts.schemaName,
      name: opts.name ?? 'Admin Test',
      email: opts.email ?? 'admin@test.local',
      rol: opts.roles,
      prm: opts.permissions,
    },
    jwtConfig,
  )
}

export async function signTestMasterToken(opts: {
  userId: string
  email: string
  role: 'super_admin' | 'admin' | 'support' | 'readonly'
  name?: string
}): Promise<string> {
  return signMasterToken(
    {
      sub: opts.userId,
      email: opts.email,
      name: opts.name ?? 'Test Master',
      mrl: opts.role,
    },
    jwtConfig,
  )
}

export function buildTenantCookieHeader(accessToken: string, csrfToken = 'test-csrf'): string {
  return `sm_tenant_access=${accessToken}; sm_csrf=${csrfToken}`
}

export function buildMasterCookieHeader(accessToken: string, csrfToken = 'test-csrf'): string {
  return `sm_admin_access=${accessToken}; sm_csrf=${csrfToken}`
}
