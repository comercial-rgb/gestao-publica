'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual } from '@/lib/formato'

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
  porMes: Array<{ mes: number; status: string; arrecadado: string; anulado: string; liquido: string }>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function RelatoriosPage() {
  const [data, setData] = useState<ResumoData | null>(null)
  const [exercicio, setExercicio] = useState(new Date().getFullYear())
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null); setData(await api<ResumoData>(`/tenant/receitas/relatorios/resumo-exercicio?exercicioAno=${exercicio}`)) }
    catch (err) { setError((err as Error).message) }
  }

  useEffect(() => { load() }, [exercicio])

  if (!data) return <div className="p-10 text-carvao-500">Carregando…</div>

  const mensalChart = data.porMes.map((m) => ({
    mes: MESES[m.mes - 1],
    arrecadado: Number(m.arrecadado),
    anulado: Number(m.anulado),
    liquido: Number(m.liquido),
  }))

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <Link href="/tenant/receitas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Receitas</Link>
          <h1 className="font-display text-4xl tracking-tight mt-3">Relatórios de Receita</h1>
          <p className="text-sm text-carvao-600 mt-2">Exercício {exercicio} — {data.exercicio.status}</p>
        </div>
        <select value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} className="input w-32">
          {[exercicio - 1, exercicio, exercicio + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      {/* Resumo geral */}
      <div className="card p-6 mb-8">
        <div className="font-display text-xl mb-4">Resumo do exercício</div>
        <div className="grid grid-cols-6 gap-4 text-sm">
          <div><div className="label">Previsto inicial</div><div className="font-mono tabular text-carvao-900">{formatBRL(data.totais.previstoInicial)}</div></div>
          <div><div className="label">Atualizado</div><div className="font-mono tabular text-carvao-900">{formatBRL(data.totais.atualizado)}</div></div>
          <div><div className="label">Arrecadado bruto</div><div className="font-mono tabular text-carvao-900">{formatBRL(data.totais.arrecadado)}</div></div>
          <div><div className="label">Anulado</div><div className="font-mono tabular text-red-700">{formatBRL(data.totais.anulado)}</div></div>
          <div><div className="label">Líquido</div><div className="font-mono tabular font-medium text-verde-800">{formatBRL(data.totais.liquido)}</div></div>
          <div><div className="label">Execução</div><div className="font-mono tabular text-carvao-900">{formatPercentual(data.totais.percentualExecucao)}</div></div>
        </div>
      </div>

      {/* Gráfico mensal */}
      <div className="card p-6 mb-8">
        <div className="font-display text-xl mb-4">Arrecadação mensal</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={mensalChart} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cfcfca" />
            <XAxis dataKey="mes" stroke="#565651" fontSize={12} />
            <YAxis stroke="#565651" fontSize={11} tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatBRL(Number(v ?? 0))} contentStyle={{ background: '#fff', border: '1px solid #cfcfca', borderRadius: 4, fontSize: 12 }} />
            <Bar dataKey="arrecadado" name="Bruto" fill="#719c6d" radius={[2, 2, 0, 0]} />
            <Bar dataKey="anulado" name="Anulado" fill="#dc2626" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela por categoria */}
      <div className="card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-carvao-100 font-display text-xl">Por categoria PCASP</div>
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Código</th>
              <th className="text-left px-4 py-2.5 font-semibold">Categoria</th>
              <th className="text-right px-4 py-2.5 font-semibold">Previsto</th>
              <th className="text-right px-4 py-2.5 font-semibold">Arrecadado</th>
              <th className="text-right px-4 py-2.5 font-semibold">Líquido</th>
              <th className="text-right px-4 py-2.5 font-semibold">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {data.porCategoria.map((c, i) => (
              <tr key={i} className="hover:bg-areia-50">
                <td className="px-4 py-2.5 font-mono text-xs text-carvao-500">{c.categoriaCodigo}</td>
                <td className="px-4 py-2.5 text-carvao-900">{c.categoria}</td>
                <td className="px-4 py-2.5 text-right tabular text-carvao-700">{formatBRL(c.previsto)}</td>
                <td className="px-4 py-2.5 text-right tabular font-medium text-carvao-900">{formatBRL(c.arrecadado)}</td>
                <td className="px-4 py-2.5 text-right tabular font-medium text-verde-800">{formatBRL(c.liquido)}</td>
                <td className="px-4 py-2.5 text-right tabular text-carvao-700">{formatPercentual(c.percentual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabela mensal */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-carvao-100 font-display text-xl">Por mês fiscal</div>
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Mês</th>
              <th className="text-left px-4 py-2.5 font-semibold">Status</th>
              <th className="text-right px-4 py-2.5 font-semibold">Arrecadado</th>
              <th className="text-right px-4 py-2.5 font-semibold">Anulado</th>
              <th className="text-right px-4 py-2.5 font-semibold">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {data.porMes.map((m) => (
              <tr key={m.mes} className="hover:bg-areia-50">
                <td className="px-4 py-2.5 text-carvao-900">{MESES[m.mes - 1]}</td>
                <td className="px-4 py-2.5"><span className="badge bg-areia-100 text-areia-800 font-mono text-[10px]">{m.status}</span></td>
                <td className="px-4 py-2.5 text-right tabular text-carvao-700">{formatBRL(m.arrecadado)}</td>
                <td className="px-4 py-2.5 text-right tabular text-red-700">{formatBRL(m.anulado)}</td>
                <td className="px-4 py-2.5 text-right tabular font-medium text-carvao-900">{formatBRL(m.liquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
