'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function DashboardPage() {
  const [stats, setStats] = useState<{ total: number; active: number; pending: number } | null>(null)

  useEffect(() => {
    api<{ items: any[] }>('/admin/tenants')
      .then((res) => {
        const tenants = res.items ?? []
        setStats({
          total: tenants.length,
          active: tenants.filter((t) => t.status === 'active').length,
          pending: tenants.filter((t) => t.status === 'pending').length,
        })
      })
      .catch(() => setStats({ total: 0, active: 0, pending: 0 }))
  }, [])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">
        Visão Geral
      </div>
      <h1 className="font-display text-4xl tracking-tight mt-1 mb-10">Dashboard</h1>

      <div className="grid grid-cols-3 gap-6">
        <Card label="Prefeituras totais" value={stats?.total ?? '—'} tone="carvao" />
        <Card label="Ativas" value={stats?.active ?? '—'} tone="verde" />
        <Card label="Aguardando provisioning" value={stats?.pending ?? '—'} tone="areia" />
      </div>

      <div className="mt-10 card p-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-carvao-500 font-semibold mb-3">
          Próximos passos do roadmap
        </div>
        <ol className="space-y-2 text-sm text-carvao-700">
          <li><span className="font-mono text-verde-700">✓</span> Camada 1 — Cadastros base + Auth + RBAC</li>
          <li><span className="font-mono text-areia-600">○</span> Camada 2 — Receitas, Despesas, Folha</li>
          <li><span className="font-mono text-carvao-300">○</span> Camada 3 — RREO/RGF, Índices, Audiência Pública</li>
        </ol>
      </div>
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: number | string; tone: 'carvao' | 'verde' | 'areia' }) {
  const styles = {
    carvao: 'border-carvao-200',
    verde:  'border-verde-300 bg-verde-50/40',
    areia:  'border-areia-300 bg-areia-50',
  }[tone]

  return (
    <div className={`card p-6 border ${styles}`}>
      <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">
        {label}
      </div>
      <div className="font-display text-5xl tabular text-carvao-900">{value}</div>
    </div>
  )
}
