'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface TenantMeResponse {
  name: string
  email: string
  roles: string[]
  permissions: string[]
  tenant: { name: string; slug: string }
}

export default function TenantDashboardPage() {
  const [data, setData] = useState<TenantMeResponse | null>(null)

  useEffect(() => {
    api<TenantMeResponse>('/tenant/auth/me').then(setData).catch(() => {})
  }, [])

  const proximasAreas = [
    'Pessoas',
    'Receitas',
    'Licitações',
    'Contratos',
    'Transparência',
    'Relatórios',
  ]

  return (
    <main className="min-h-screen bg-areia-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Boas-vindas */}
        <div>
          <h1 className="font-display text-4xl text-carvao-900">
            Olá, {data?.name ?? '…'}
          </h1>
          <p className="mt-1 text-carvao-600">
            Prefeitura:{' '}
            <span className="font-semibold text-carvao-900">
              {data?.tenant.name ?? '…'}
            </span>
          </p>
        </div>

        {/* Perfil do usuário */}
        <div className="card p-6 space-y-4">
          <h2 className="font-display text-xl text-carvao-900">Seu perfil de acesso</h2>

          <div>
            <span className="label">Funções (roles)</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {data?.roles?.length ? (
                data.roles.map((role) => (
                  <span key={role} className="badge bg-verde-100 text-verde-800">
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-sm text-carvao-500">Nenhuma função atribuída</span>
              )}
            </div>
          </div>

          <div>
            <span className="label">Permissões</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {data?.permissions?.length ? (
                data.permissions.map((perm) => (
                  <span key={perm} className="badge bg-areia-200 text-carvao-700">
                    {perm}
                  </span>
                ))
              ) : (
                <span className="text-sm text-carvao-500">Nenhuma permissão atribuída</span>
              )}
            </div>
          </div>
        </div>

        {/* Módulos em construção */}
        <div className="card p-6">
          <h2 className="font-display text-xl text-carvao-900 mb-1">Módulos</h2>
          <p className="text-sm text-carvao-500 mb-4">
            As telas abaixo serão liberadas nas próximas entregas.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {proximasAreas.map((area) => (
              <div
                key={area}
                className="card p-4 opacity-50 cursor-not-allowed select-none"
                title="Em breve"
              >
                <span className="text-sm font-medium text-carvao-700">{area}</span>
                <span className="block mt-1 badge bg-areia-200 text-carvao-500 text-[10px]">
                  Em breve
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
