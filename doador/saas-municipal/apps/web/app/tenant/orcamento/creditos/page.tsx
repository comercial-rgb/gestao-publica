'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL, formatData } from '@/lib/formato'
import clsx from 'clsx'

interface Credito { id: string; numero: string; tipo: string; origem: string; valor: string; dataDecreto: string; status: string; aplicadoEm: string | null }

const STATUS_STYLE: Record<string, string> = {
  em_elaboracao: 'bg-areia-200 text-areia-800', aprovado: 'bg-verde-100 text-verde-800',
  aplicado: 'bg-verde-700 text-white', cancelado: 'bg-red-100 text-red-800',
}

export default function CreditosPage() {
  const [creditos, setCreditos] = useState<Credito[]>([])
  const [statusFiltro, setStatusFiltro] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null); setCreditos(await api<Credito[]>(`/tenant/orcamento/creditos${statusFiltro ? `?status=${statusFiltro}` : ''}`)) }
    catch (err) { setError((err as Error).message) }
  }
  useEffect(() => { load() }, [statusFiltro])

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/orcamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Orcamento</Link>
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8 mt-3">
        <h1 className="font-display text-4xl tracking-tight">Creditos Orcamentarios</h1>
        <Link href="/tenant/orcamento/creditos/novo" className="btn-primary">+ Novo credito</Link>
      </header>

      <div className="flex gap-2 mb-6">
        {(['', 'em_elaboracao', 'aprovado', 'aplicado', 'cancelado'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFiltro(s)} className={clsx('text-xs px-3 py-1.5 rounded-md border transition', statusFiltro === s ? 'bg-carvao-900 text-white border-carvao-900' : 'bg-white text-carvao-700 border-carvao-200')}>
            {s || 'Todos'}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr><th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Tipo</th><th className="text-left px-4 py-3 font-semibold">Origem</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-left px-4 py-3 font-semibold">Data</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {creditos.length === 0 && <tr><td colSpan={7} className="text-center text-carvao-500 py-12">Nenhum credito encontrado.</td></tr>}
            {creditos.map((c) => (
              <tr key={c.id} className="hover:bg-areia-50">
                <td className="px-4 py-3 font-mono text-xs text-carvao-900">{c.numero}</td>
                <td className="px-4 py-3 capitalize text-carvao-700">{c.tipo}</td>
                <td className="px-4 py-3 text-xs text-carvao-600">{c.origem.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-right tabular font-medium">{formatBRL(c.valor)}</td>
                <td className="px-4 py-3 tabular text-carvao-700">{formatData(c.dataDecreto)}</td>
                <td className="px-4 py-3"><span className={clsx('badge font-mono text-[10px]', STATUS_STYLE[c.status])}>{c.status}</span></td>
                <td className="px-4 py-3 text-right"><Link href={`/tenant/orcamento/creditos/${c.id}`} className="text-xs text-verde-700 hover:underline">detalhes →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
