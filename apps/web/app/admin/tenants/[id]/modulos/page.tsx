'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import clsx from 'clsx'

interface ModuleStatus {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  isActive: boolean
  activatedAt: string | null
  deactivatedAt: string | null
  inPlan: boolean
}

interface ModulesResponse {
  tenant: { id: string; name: string; planId: string | null }
  modules: ModuleStatus[]
}

interface Plan {
  id: string
  slug: string
  name: string
  monthlyPrice: string
}

export default function TenantModulosPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<ModulesResponse | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPlanModal, setShowPlanModal] = useState(false)

  async function load() {
    try {
      setError(null)
      const result = await api<ModulesResponse>(`/admin/tenants/${params.id}/modules`)
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    load()
    api<Plan[]>('/admin/plans').catch(() => [] as Plan[]).then(setPlans)
  }, [params.id])

  async function toggleModule(mod: ModuleStatus) {
    setBusy(mod.slug)
    try {
      if (mod.isActive) {
        const reason = window.prompt('Motivo da desativação (mínimo 10 caracteres):')
        if (!reason || reason.length < 10) {
          setBusy(null)
          return
        }
        await api(`/admin/tenants/${params.id}/modules/${mod.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        })
      } else {
        await api(`/admin/tenants/${params.id}/modules`, {
          method: 'POST',
          body: JSON.stringify({ moduleId: mod.id }),
        })
      }
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <div className="p-10 text-carvao-500">Carregando…</div>

  const grouped = data.modules.reduce<Record<string, ModuleStatus[]>>((acc, m) => {
    const key = m.category
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/admin/tenants" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">
        ← Prefeituras
      </Link>

      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8 mt-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">
            Configuração comercial
          </div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Módulos</h1>
          <p className="text-sm text-carvao-600 mt-2">{data.tenant.name}</p>
        </div>
        <button onClick={() => setShowPlanModal(true)} className="btn-secondary">
          Aplicar plano comercial
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(grouped).map(([category, modules]) => (
          <div key={category}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-carvao-500 mb-3 pb-1 border-b border-carvao-100">
              {categoryLabel(category)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className={clsx(
                    'card p-5 border transition',
                    mod.isActive ? 'border-verde-300 bg-verde-50/30' : 'border-carvao-100',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-carvao-900">{mod.name}</div>
                      <div className="font-mono text-xs text-carvao-500 mt-0.5">{mod.slug}</div>
                    </div>
                    <button
                      onClick={() => toggleModule(mod)}
                      disabled={busy === mod.slug}
                      className={clsx(
                        'badge font-mono',
                        mod.isActive ? 'bg-verde-700 text-white' : 'bg-carvao-200 text-carvao-700',
                        busy === mod.slug && 'opacity-50',
                      )}
                    >
                      {busy === mod.slug ? '…' : mod.isActive ? 'ATIVO' : 'inativo'}
                    </button>
                  </div>
                  {mod.description && (
                    <div className="text-xs text-carvao-600 mt-2">{mod.description}</div>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-carvao-500">
                    {mod.inPlan && <span className="text-areia-700">no plano</span>}
                    {mod.activatedAt && mod.isActive && (
                      <span>ativo desde {new Date(mod.activatedAt).toLocaleDateString('pt-BR')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showPlanModal && (
        <PlanModal
          plans={plans}
          currentPlanId={data.tenant.planId}
          onClose={() => setShowPlanModal(false)}
          onApply={async (planId, replacePlan) => {
            try {
              const result = await api<{ activated: string[]; deactivated: string[]; unchanged: string[] }>(
                `/admin/tenants/${params.id}/apply-plan`,
                {
                  method: 'POST',
                  body: JSON.stringify({ planId, replacePlan }),
                },
              )
              alert(`Ativados: ${result.activated.length}\nDesativados: ${result.deactivated.length}\nInalterados: ${result.unchanged.length}`)
              setShowPlanModal(false)
              await load()
            } catch (err) {
              setError((err as Error).message)
            }
          }}
        />
      )}
    </div>
  )
}

function categoryLabel(c: string): string {
  const labels: Record<string, string> = {
    cadastros: 'Cadastros',
    registro: 'Registro (Camada 2)',
    inteligencia: 'Inteligência (Camada 3)',
  }
  return labels[c] ?? c
}

function PlanModal({
  plans, currentPlanId, onClose, onApply,
}: {
  plans: Plan[]
  currentPlanId: string | null
  onClose: () => void
  onApply: (planId: string, replacePlan: boolean) => void | Promise<void>
}) {
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? '')
  const [replacePlan, setReplacePlan] = useState(false)

  return (
    <div className="fixed inset-0 bg-carvao-900/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card max-w-md w-full p-6 m-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl mb-4">Aplicar plano comercial</h2>

        <div className="space-y-3 mb-4">
          {plans.map((p) => (
            <label key={p.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                checked={planId === p.id}
                onChange={() => setPlanId(p.id)}
              />
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-carvao-500 tabular">
                  R$ {Number(p.monthlyPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / mês
                </div>
              </div>
            </label>
          ))}
        </div>

        <label className="flex items-start gap-2 text-sm text-carvao-700 mb-6">
          <input type="checkbox" checked={replacePlan} onChange={(e) => setReplacePlan(e.target.checked)} className="mt-1" />
          <span>
            <strong>Substituir plano atual</strong> — desativa módulos que estavam ativos mas não fazem parte do novo plano.
            (Sem marcar, apenas adiciona os faltantes.)
          </span>
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => onApply(planId, replacePlan)} className="btn-primary" disabled={!planId}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
