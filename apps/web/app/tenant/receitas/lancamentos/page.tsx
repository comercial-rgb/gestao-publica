'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface Lancamento {
  id: string; exercicioAno: number; naturezaCodigo: string; naturezaDescricao: string
  entidadeNome: string; valorPrevistoInicial: string; valorAtualizado: string; ativo: boolean
}

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [exercicio, setExercicio] = useState(new Date().getFullYear())
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null); setLancamentos(await api<Lancamento[]>(`/tenant/receitas/lancamentos?exercicioAno=${exercicio}`)) }
    catch (err) { setError((err as Error).message) }
  }

  useEffect(() => { load() }, [exercicio])
  const total = lancamentos.reduce((acc, l) => acc + Number(l.valorAtualizado), 0)

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <Link href="/tenant/receitas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Receitas</Link>
          <h1 className="font-display text-4xl tracking-tight mt-3">Lançamentos (previsão)</h1>
          <p className="text-sm text-carvao-600 mt-2">Exercício {exercicio}. Total: <strong className="tabular">{formatBRL(total)}</strong></p>
        </div>
        <div className="flex gap-2">
          <select value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} className="input w-32">
            {[exercicio - 1, exercicio, exercicio + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link href="/tenant/receitas/lancamentos/novo" className="btn-primary">+ Novo lançamento</Link>
        </div>
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Natureza</th>
              <th className="text-left px-4 py-3 font-semibold">Entidade</th>
              <th className="text-right px-4 py-3 font-semibold">Inicial</th>
              <th className="text-right px-4 py-3 font-semibold">Atualizado</th>
              <th className="text-right px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {lancamentos.length === 0 && <tr><td colSpan={5} className="text-center text-carvao-500 py-12">Nenhum lançamento.</td></tr>}
            {lancamentos.map((l) => (
              <tr key={l.id} className="hover:bg-areia-50">
                <td className="px-4 py-3"><div className="font-mono text-xs text-carvao-500">{l.naturezaCodigo}</div><div className="text-carvao-900">{l.naturezaDescricao}</div></td>
                <td className="px-4 py-3 text-carvao-700">{l.entidadeNome}</td>
                <td className="px-4 py-3 text-right tabular text-carvao-700">{formatBRL(l.valorPrevistoInicial)}</td>
                <td className="px-4 py-3 text-right tabular font-medium text-carvao-900">{formatBRL(l.valorAtualizado)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/tenant/receitas/lancamentos/${l.id}`} className="text-xs text-verde-700 hover:underline">detalhes →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
