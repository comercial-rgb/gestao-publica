'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface LoginResponse {
  user: { name: string; email: string; role: string }
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await api<LoginResponse>('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      // Cookies httpOnly setados pelo backend via proxy.
      sessionStorage.setItem('adminUserName', data.user.name)
      sessionStorage.setItem('adminUserRole', data.user.role)

      window.location.href = '/admin/tenants'
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-carvao-900 p-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(0deg, transparent 24%, rgba(255,255,255,.5) 25%, rgba(255,255,255,.5) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.5) 75%, rgba(255,255,255,.5) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px',
        }}
      />

      <div className="w-full max-w-md relative">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-carvao-400 hover:text-areia-200 transition"
        >
          ← SaaS Municipal
        </Link>

        <div className="card mt-6 p-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-verde-700 mb-2">
            Área Restrita
          </div>
          <h1 className="font-display text-3xl text-carvao-900 mb-1">Master Admin</h1>
          <p className="text-sm text-carvao-600 mb-8">
            Acesso da equipe interna da plataforma.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">E-mail</label>
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
        </div>

        <div className="text-center mt-6 text-xs text-carvao-500 font-mono">
          rate-limited · auditado · 2FA opcional
        </div>
      </div>
    </main>
  )
}
