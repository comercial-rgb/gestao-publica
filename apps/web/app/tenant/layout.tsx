'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useTenantSession } from '@/lib/use-tenant-session'
import clsx from 'clsx'

const NAV_BASE = [
  { href: '/tenant/dashboard', label: 'Dashboard', icon: '◇', module: null },
  { href: '/tenant/pessoas',   label: 'Pessoas',   icon: '○', module: 'cadastros' },
  { href: '/tenant/usuarios',  label: 'Usuários',  icon: '◐', module: 'usuarios' },
  { href: '/tenant/fiscal',    label: 'Calendário Fiscal', icon: '◈', module: null },
  { href: '/tenant/receitas',  label: 'Receitas',  icon: '▲', module: 'receitas' },
  { href: '/tenant/despesas',  label: 'Despesas',  icon: '▼', module: 'despesas' },
  { href: '/tenant/folha',     label: 'Folha',     icon: '◆', module: 'folha' },
] as const

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, loading, error, hasModule } = useTenantSession()

  if (loading) return <div className="p-10 text-carvao-500">Carregando…</div>
  if (error || !session) {
    router.replace('/login')
    return null
  }

  const items = NAV_BASE.filter((n) => !n.module || hasModule(n.module))

  return (
    <div className="min-h-screen flex bg-areia-50">
      <aside className="w-64 bg-carvao-900 text-white flex flex-col">
        <div className="p-6 border-b border-carvao-800">
          <div className="font-display text-lg tracking-tight">{session.tenant.name}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-areia-300 mt-1">
            {session.tenant.slug}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                pathname?.startsWith(item.href)
                  ? 'bg-verde-700/30 text-white'
                  : 'text-carvao-300 hover:bg-carvao-800 hover:text-white',
              )}
            >
              <span className="font-mono text-areia-300">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-carvao-800">
          <div className="text-sm font-medium">{session.name}</div>
          <div className="text-xs text-carvao-400">
            {session.roles.join(', ')}
          </div>
          <button
            onClick={async () => {
              try { await fetch('/api/proxy/tenant/auth/logout', { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
              sessionStorage.clear()
              window.location.href = '/login'
            }}
            className="mt-3 text-xs text-carvao-400 hover:text-white underline"
          >
            sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
