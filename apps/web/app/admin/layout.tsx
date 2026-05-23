'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { api } from '@/lib/api'

const NAV = [
  { href: '/admin/tenants', label: 'Prefeituras', icon: '◇' },
  { href: '/admin/dashboard', label: 'Dashboard',  icon: '○' },
] as const

interface AdminUser {
  name: string
  email: string
  role: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<AdminUser | null>(null)

  useEffect(() => {
    if (pathname === '/admin/login') return
    api<AdminUser>('/admin/auth/me')
      .then(setUser)
      .catch(() => router.replace('/admin/login'))
  }, [pathname, router])

  // Páginas sem layout
  if (pathname === '/admin/login') return <>{children}</>

  async function logout() {
    try {
      await api('/admin/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    sessionStorage.clear()
    router.replace('/admin/login')
  }

  return (
    <div className="min-h-screen flex bg-areia-50">
      {/* Sidebar */}
      <aside className="w-64 bg-carvao-900 text-white flex flex-col">
        <div className="p-6 border-b border-carvao-800">
          <div className="font-display text-lg tracking-tight">SaaS Municipal</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-areia-300 mt-1">
            Master Admin
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
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

        {user && (
          <div className="p-4 border-t border-carvao-800">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-carvao-400 truncate">{user.email}</div>
            <div className="badge bg-verde-700/40 text-areia-200 mt-2 font-mono">{user.role}</div>
            <button
              onClick={logout}
              className="mt-3 text-xs text-carvao-400 hover:text-white underline"
            >
              sair
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
