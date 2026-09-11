'use client'

import { useEffect, useState } from 'react'
import { api } from './api'

export interface TenantSession {
  id: string
  name: string
  email: string
  roles: string[]
  permissions: string[]
  activeModules: string[]
  tenant: { id: string; slug: string; name: string }
}

export function useTenantSession() {
  const [session, setSession] = useState<TenantSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    api<TenantSession>('/tenant/auth/me')
      .then((s) => { if (!cancelled) setSession(s) })
      .catch((e: unknown) => { if (!cancelled) setError(e as Error) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return {
    session,
    loading,
    error,
    hasPermission: (perm: string) => session?.permissions.includes(perm) ?? false,
    hasModule: (slug: string) => session?.activeModules.includes(slug) ?? false,
  }
}
