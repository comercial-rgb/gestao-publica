'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface LoginResponse {
  user: { name: string; email: string }
  tenant: { name: string; slug: string }
}

export default function TenantLoginPage() {
  const [tenantSlug, setTenantSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await api<LoginResponse>('/tenant/auth/login', {
        method: 'POST',
        tenantSlug: tenantSlug.trim(),
        body: JSON.stringify({ email, password }),
      })

      // Cookies httpOnly setados pelo backend via proxy.
      // Guardar SÓ info não-sensível em sessionStorage para UI:
      sessionStorage.setItem('tenantUserName', data.user.name)
      sessionStorage.setItem('tenantName', data.tenant.name)
      sessionStorage.setItem('tenantSlug', data.tenant.slug)

      window.location.href = '/tenant/dashboard'
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex">
      {/* Lado esquerdo: visual editorial */}
      <aside className="hidden lg:flex lg:w-2/5 bg-verde-900 text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'linear-gradient(135deg, transparent 49%, currentColor 49%, currentColor 51%, transparent 51%)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative p-12 flex flex-col justify-between w-full">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight">
            ← SaaS Municipal
          </Link>

          <div>
            <div className="text-areia-300 text-xs uppercase tracking-[0.3em] mb-6">
              Conformidade · Auditoria · Transparência
            </div>
            <h2 className="font-display text-5xl leading-[1.05] tracking-tight">
              Acesso da<br />
              <span className="italic text-areia-200">Prefeitura.</span>
            </h2>
            <p className="mt-6 text-verde-100 max-w-md leading-relaxed">
              Sistema homologado para Lei 14.133/2021 e LC 101/2000.
              Logs imutáveis, segregação de funções e relatórios fiscais automáticos.
            </p>
          </div>

          <div className="font-mono text-xs text-verde-200 tracking-wider">
            v0.1.0 · sa-east-1
          </div>
        </div>
      </aside>

      {/* Lado direito: form */}
      <section className="flex-1 flex items-center justify-center p-8 bg-areia-50">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl text-carvao-900 mb-2">Entrar</h1>
          <p className="text-sm text-carvao-600 mb-8">
            Informe o identificador da sua prefeitura e suas credenciais.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="tenant" className="label">Prefeitura</label>
              <input
                id="tenant"
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="santa-izabel-oeste"
                className="input"
                required
                autoComplete="organization"
              />
              <p className="mt-1 text-xs text-carvao-500">Identificador único da entidade.</p>
            </div>

            <div>
              <label htmlFor="email" className="label">E-mail funcional</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
                autoComplete="current-password"
                minLength={8}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Autenticando…' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-carvao-100 text-xs text-carvao-500">
            Problemas com acesso? Contate o administrador municipal.
          </div>
        </div>
      </section>
    </main>
  )
}
