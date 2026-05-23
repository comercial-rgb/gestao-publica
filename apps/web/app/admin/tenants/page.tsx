'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import clsx from 'clsx'

type Tenant = {
  id: string
  slug: string
  name: string
  cnpj: string
  state: string
  city: string
  status: string
  createdAt: string
}

type MigrationInfo = {
  schemaName: string
  pending: string[]
}

type MigrateResult = {
  applied: string[]
  skipped: string[]
  failed: Array<{ name: string; error: string }>
}

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-verde-100 text-verde-800',
  pending:   'bg-areia-200 text-areia-800',
  suspended: 'bg-red-100 text-red-800',
  archived:  'bg-carvao-100 text-carvao-700',
}

type TenantsResponse = {
  items: Tenant[]
  pagination: { nextCursor: string | null; limit: number }
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Migration state
  const [pendingMap, setPendingMap] = useState<Record<string, number>>({})
  const [migrateTarget, setMigrateTarget] = useState<Tenant | null>(null)
  const [migrateInfo, setMigrateInfo] = useState<MigrationInfo | null>(null)
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null)
  const [migrating, setMigrating] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const data = await api<TenantsResponse>(`/admin/tenants?${params}`)
      setTenants(data.items)
      setNextCursor(data.pagination.nextCursor)
      fetchPendingCounts(data.items)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [search])

  async function fetchPendingCounts(items: Tenant[]) {
    const active = items.filter((t) => t.status === 'active')
    const results = await Promise.allSettled(
      active.map((t) =>
        api<MigrationInfo>(`/admin/tenants/${t.id}/migrations`).then((info) => ({
          id: t.id,
          count: info.pending.length,
        })),
      ),
    )
    const map: Record<string, number> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        map[r.value.id] = r.value.count
      }
    }
    setPendingMap((prev) => ({ ...prev, ...map }))
  }

  async function loadMore() {
    if (!nextCursor) return
    try {
      setLoadingMore(true)
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('cursor', nextCursor)
      const data = await api<TenantsResponse>(`/admin/tenants?${params}`)
      setTenants((prev) => [...(prev ?? []), ...data.items])
      setNextCursor(data.pagination.nextCursor)
      fetchPendingCounts(data.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  async function openMigrateModal(tenant: Tenant) {
    setMigrateTarget(tenant)
    setMigrateResult(null)
    try {
      const info = await api<MigrationInfo>(`/admin/tenants/${tenant.id}/migrations`)
      setMigrateInfo(info)
    } catch {
      setMigrateInfo(null)
    }
  }

  async function applyMigrations() {
    if (!migrateTarget) return
    setMigrating(true)
    try {
      const result = await api<MigrateResult>(`/admin/tenants/${migrateTarget.id}/migrate`, {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      })
      setMigrateResult(result)
      setPendingMap((prev) => ({ ...prev, [migrateTarget.id]: 0 }))
    } catch (err) {
      setMigrateResult({
        applied: [],
        skipped: [],
        failed: [{ name: 'geral', error: (err as Error).message }],
      })
    } finally {
      setMigrating(false)
    }
  }

  useEffect(() => { load() }, [load])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">
            Cadastro
          </div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Prefeituras</h1>
          <p className="text-sm text-carvao-600 mt-2">
            Cada prefeitura tem seu próprio schema PostgreSQL isolado.
          </p>
        </div>
        <Link href="/admin/tenants/novo" className="btn-primary">+ Nova Prefeitura</Link>
      </header>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por nome, slug ou CNPJ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="input max-w-md"
        />
        <button onClick={load} className="btn-secondary">Buscar</button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Nome</th>
              <th className="text-left px-4 py-3 font-semibold">Localização</th>
              <th className="text-left px-4 py-3 font-semibold">CNPJ</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Migrations</th>
              <th className="text-right px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {!tenants && (
              <tr>
                <td colSpan={6} className="text-center text-carvao-400 py-12">
                  Carregando…
                </td>
              </tr>
            )}
            {tenants?.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-carvao-500 py-12">
                  Nenhuma prefeitura cadastrada ainda.
                </td>
              </tr>
            )}
            {tenants?.map((t) => {
              const pending = pendingMap[t.id]
              return (
                <tr key={t.id} className="hover:bg-areia-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-carvao-900">{t.name}</div>
                    <div className="font-mono text-xs text-carvao-500">{t.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-carvao-700">{t.city}/{t.state}</td>
                  <td className="px-4 py-3 font-mono text-xs text-carvao-700 tabular">
                    {formatCnpj(t.cnpj)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge font-mono', STATUS_STYLE[t.status] || 'bg-carvao-100')}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.status === 'active' && pending !== undefined ? (
                      <button
                        onClick={() => openMigrateModal(t)}
                        className={clsx(
                          'badge cursor-pointer font-mono',
                          pending === 0
                            ? 'bg-verde-100 text-verde-800'
                            : 'bg-yellow-100 text-yellow-800',
                        )}
                      >
                        {pending === 0 ? 'Em dia' : `${pending} pendente${pending > 1 ? 's' : ''}`}
                      </button>
                    ) : (
                      <span className="text-xs text-carvao-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link href={`/admin/tenants/${t.id}/modulos` as Route} className="text-verde-700 text-xs hover:underline">
                      módulos
                    </Link>
                    <Link href={`/admin/tenants/${t.id}` as Route} className="text-verde-700 text-xs hover:underline">
                      detalhes →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {nextCursor && (
          <div className="border-t border-carvao-100 px-4 py-3 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-secondary text-xs"
            >
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>

      {/* Modal de migrations */}
      {migrateTarget && (
        <div className="fixed inset-0 bg-carvao-900/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-auto">
            <h2 className="font-display text-xl text-carvao-900 mb-1">
              Migrations — {migrateTarget.name}
            </h2>
            <p className="text-xs text-carvao-500 font-mono mb-4">{migrateTarget.slug}</p>

            {migrateInfo && migrateInfo.pending.length > 0 && !migrateResult && (
              <>
                <div className="mb-4">
                  <span className="label">Pendentes ({migrateInfo.pending.length})</span>
                  <ul className="mt-1 space-y-1">
                    {migrateInfo.pending.map((m) => (
                      <li key={m} className="text-xs font-mono text-carvao-700 bg-areia-100 rounded px-2 py-1">
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={applyMigrations}
                  disabled={migrating}
                  className="btn-primary w-full"
                >
                  {migrating ? 'Aplicando…' : 'Aplicar migrations'}
                </button>
              </>
            )}

            {migrateInfo && migrateInfo.pending.length === 0 && !migrateResult && (
              <p className="text-sm text-verde-700">Todas as migrations estão aplicadas.</p>
            )}

            {migrateResult && (
              <div className="space-y-3">
                {migrateResult.applied.length > 0 && (
                  <div>
                    <span className="label text-verde-700">Aplicadas ({migrateResult.applied.length})</span>
                    <ul className="mt-1 space-y-1">
                      {migrateResult.applied.map((m) => (
                        <li key={m} className="text-xs font-mono text-verde-800 bg-verde-50 rounded px-2 py-1">{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {migrateResult.failed.length > 0 && (
                  <div>
                    <span className="label text-red-700">Falhas ({migrateResult.failed.length})</span>
                    <ul className="mt-1 space-y-1">
                      {migrateResult.failed.map((f) => (
                        <li key={f.name} className="text-xs font-mono text-red-800 bg-red-50 rounded px-2 py-1">
                          {f.name}: {f.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => { setMigrateTarget(null); setMigrateInfo(null); setMigrateResult(null) }}
              className="btn-secondary w-full mt-4"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`
}
