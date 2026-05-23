'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'

interface ResumoData {
  exercicio: { ano: number; status: string }
  totais: {
    previstoInicial: string
    atualizado: string
    arrecadado: string
    anulado: string
    liquido: string
    percentualExecucao: number
    qtdArrecadacoes: number
    qtdContribuintes: number
  }
  porCategoria: Array<{
    categoria: string
    categoriaCodigo: string
    previsto: string
    arrecadado: string
    liquido: string
    percentual: number
  }>
  porMes: Array<{
    mes: number
    status: string
    arrecadado: string
    anulado: string
    liquido: string
  }>
}

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES = ['#385435','#719c6d','#b09660','#c4ad7a','#878781','#5a8556']

export default function DashboardReceitas() {
  const [data, setData] = useState<ResumoData | null>(null)
  const [exercicio, setExercicio] = useState(new Date().getFullYear())
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      const r = await api<ResumoData>(`/tenant/receitas/relatorios/resumo-exercicio?exercicioAno=${exercicio}`)
      setData(r)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => { load() }, [exercicio])

  if (error) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      </div>
    )
  }

  if (!data) return <div className="p-10 text-carvao-500">Carregando…</div>

  const mensalChart = data.porMes.map((m) => ({
    mes: MESES_LABELS[m.mes - 1],
    liquido: Number(m.liquido),
    arrecadado: Number(m.arrecadado),
  }))

  const categoriaChart = data.porCategoria.slice(0, 6).map((c) => ({
    name: c.categoria.length > 25 ? c.categoria.slice(0, 22) + '…' : c.categoria,
    value: Number(c.arrecadado),
  }))

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">Camada 2 · Registro</div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Receitas</h1>
          <p className="text-sm text-carvao-600 mt-2">Visão consolidada do exercício {exercicio}.</p>
        </div>
        <div className="flex gap-2">
          <select value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} className="input w-32">
            {[exercicio - 1, exercicio, exercicio + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link href="/tenant/receitas/arrecadar" className="btn-primary">+ Arrecadação rápida</Link>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Previsto atualizado" value={formatBRL(data.totais.atualizado)} hint={`Inicial: ${formatBRL(data.totais.previstoInicial)}`} />
        <MetricCard label="Arrecadado líquido" value={formatBRL(data.totais.liquido)} tone="positive"
          hint={`Bruto: ${formatBRL(data.totais.arrecadado)} · Anulado: ${formatBRL(data.totais.anulado)}`} />
        <MetricCard label="Execução" value={formatPercentual(data.totais.percentualExecucao)}
          hint={`${data.totais.qtdArrecadacoes} arrecadações`}
          tone={data.totais.percentualExecucao >= 70 ? 'positive' : data.totais.percentualExecucao >= 40 ? 'warning' : 'danger'} />
        <MetricCard label="Contribuintes únicos" value={String(data.totais.qtdContribuintes)} />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="card p-6 col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-1">Evolução mensal</div>
          <div className="font-display text-lg mb-4">Arrecadação por mês</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={mensalChart} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cfcfca" />
              <XAxis dataKey="mes" stroke="#565651" fontSize={12} />
              <YAxis stroke="#565651" fontSize={11} tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatBRL(Number(v ?? 0))} contentStyle={{ background: '#fff', border: '1px solid #cfcfca', borderRadius: 4, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="arrecadado" name="Bruto" stroke="#878781" strokeWidth={1} dot={false} />
              <Line type="monotone" dataKey="liquido" name="Líquido" stroke="#385435" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-6">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-1">Top categorias</div>
          <div className="font-display text-lg mb-4">Composição da receita</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={categoriaChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {categoriaChart.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatBRL(Number(v ?? 0))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1 text-[11px]">
            {categoriaChart.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-carvao-700">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CORES[i % CORES.length] }} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="tabular text-carvao-500">{formatBRL(c.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-carvao-100 flex items-center justify-between">
          <div className="font-display text-lg">Execução por categoria PCASP</div>
          <Link href="/tenant/receitas/relatorios" className="text-xs text-verde-700 hover:underline">relatórios completos →</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Categoria</th>
              <th className="text-right px-4 py-2.5 font-semibold">Previsto</th>
              <th className="text-right px-4 py-2.5 font-semibold">Arrecadado</th>
              <th className="text-right px-4 py-2.5 font-semibold">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {data.porCategoria.map((c, i) => (
              <tr key={i} className="hover:bg-areia-50">
                <td className="px-4 py-2.5 text-carvao-900">{c.categoria}</td>
                <td className="px-4 py-2.5 text-right tabular text-carvao-700">{formatBRL(c.previsto)}</td>
                <td className="px-4 py-2.5 text-right tabular font-medium text-carvao-900">{formatBRL(c.arrecadado)}</td>
                <td className="px-4 py-2.5 text-right tabular text-carvao-700">{formatPercentual(c.percentual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { href: '/tenant/receitas/naturezas', label: 'PCASP', desc: 'Plano de contas' },
          { href: '/tenant/receitas/tipos', label: 'Tipos', desc: 'Vinculações' },
          { href: '/tenant/receitas/lancamentos', label: 'Lançamentos', desc: 'Previsões orçamentárias' },
          { href: '/tenant/receitas/relatorios', label: 'Relatórios', desc: 'Análises' },
        ].map((s) => (
          <Link key={s.href} href={s.href as Route} className="card p-4 border border-carvao-100 hover:border-verde-400 transition">
            <div className="font-display text-base">{s.label}</div>
            <div className="text-xs text-carvao-500 mt-0.5">{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
