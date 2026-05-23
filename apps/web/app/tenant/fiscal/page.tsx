'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import clsx from 'clsx'

interface Exercicio {
  id: string
  ano: number
  status: string
  dataInicio: string
  dataFim: string
  encerradoEm: string | null
}

interface MesFiscal {
  id: string
  mes: number
  status: string
  dataInicio: string
  dataFim: string
  fechadoEm: string | null
  reaberturas: number
}

const MESES_NOMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const STATUS_MES_STYLE: Record<string, string> = {
  aberto:    'bg-verde-100 text-verde-800 border-verde-300',
  fechado:   'bg-areia-200 text-areia-800 border-areia-400',
  bloqueado: 'bg-red-100 text-red-800 border-red-300',
}

export default function FiscalPage() {
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [meses, setMeses] = useState<MesFiscal[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadExercicios() {
    try {
      const list = await api<Exercicio[]>('/tenant/fiscal/exercicios')
      setExercicios(list)
      if (list.length > 0 && !selected && list[0]) setSelected(list[0].id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function loadMeses(exercicioId: string) {
    const list = await api<MesFiscal[]>(`/tenant/fiscal/exercicios/${exercicioId}/meses`)
    setMeses(list)
  }

  useEffect(() => { loadExercicios() }, [])
  useEffect(() => { if (selected) loadMeses(selected) }, [selected])

  async function fecharMes(mesId: string) {
    if (!confirm('Confirma o fechamento deste mês? Nenhum novo lançamento será aceito.')) return
    try {
      await api(`/tenant/fiscal/meses/${mesId}/fechar`, { method: 'POST' })
      if (selected) loadMeses(selected)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function reabrirMes(mesId: string) {
    const motivo = prompt('Motivo da reabertura (mínimo 20 caracteres):')
    if (!motivo || motivo.length < 20) return
    try {
      await api(`/tenant/fiscal/meses/${mesId}/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      })
      if (selected) loadMeses(selected)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function novoExercicio() {
    const input = prompt('Ano do novo exercício (ex: 2027):')
    if (!input) return
    const ano = Number(input)
    if (!ano || ano < 2000 || ano > 2100) return
    try {
      await api('/tenant/fiscal/exercicios', {
        method: 'POST',
        body: JSON.stringify({ ano }),
      })
      loadExercicios()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const exercicio = exercicios.find((e) => e.id === selected)

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">
            Governança fiscal
          </div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Calendário Fiscal</h1>
          <p className="text-sm text-carvao-600 mt-2">
            Controle de exercícios e fechamento de meses contábeis.
          </p>
        </div>
        <button onClick={novoExercicio} className="btn-primary">+ Novo exercício</button>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-8">
        {exercicios.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e.id)}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium border transition',
              selected === e.id
                ? 'bg-carvao-900 text-white border-carvao-900'
                : 'bg-white text-carvao-700 border-carvao-200 hover:border-carvao-400',
            )}
          >
            {e.ano}
            <span className={clsx(
              'ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono',
              e.status === 'aberto' ? 'bg-verde-200 text-verde-800' : 'bg-carvao-200',
            )}>{e.status}</span>
          </button>
        ))}
      </div>

      {exercicio && (
        <div className="grid grid-cols-4 gap-4">
          {meses.map((m) => (
            <div
              key={m.id}
              className={clsx('card p-4 border-2', STATUS_MES_STYLE[m.status])}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-display text-xl">{MESES_NOMES[m.mes - 1]}</div>
                  <div className="text-xs text-carvao-500 tabular">
                    {String(m.mes).padStart(2, '0')}/{exercicio.ano}
                  </div>
                </div>
                <span className="badge font-mono text-[10px] bg-white">{m.status}</span>
              </div>

              {m.reaberturas > 0 && (
                <div className="text-[10px] text-red-700 font-mono mb-1">
                  reaberto {m.reaberturas}x
                </div>
              )}

              <div className="text-[11px] text-carvao-600 mb-3 tabular">
                {new Date(m.dataInicio).toLocaleDateString('pt-BR')} → {new Date(m.dataFim).toLocaleDateString('pt-BR')}
              </div>

              {m.status === 'aberto' && (
                <button onClick={() => fecharMes(m.id)} className="text-xs text-carvao-700 hover:text-red-700 underline">
                  fechar mês →
                </button>
              )}
              {m.status === 'fechado' && (
                <button onClick={() => reabrirMes(m.id)} className="text-xs text-carvao-700 hover:text-verde-700 underline">
                  reabrir →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
