'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import clsx from 'clsx'

interface Lei { id: string; tipo: 'ppa' | 'loa'; numero: string; descricao: string; anoInicio: number; anoFim: number; valorTotal: string | null; status: string }

export default function LeisPage() {
  const params = useSearchParams()
  const [leis, setLeis] = useState<Lei[]>([])
  const [tipo, setTipo] = useState<'todas' | 'ppa' | 'loa'>((params.get('tipo') as 'ppa' | 'loa') || 'todas')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null); setLeis(await api<Lei[]>(`/tenant/orcamento/leis${tipo === 'todas' ? '' : `?tipo=${tipo}`}`)) }
    catch (err) { setError((err as Error).message) }
  }
  useEffect(() => { load() }, [tipo])

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/orcamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Orcamento</Link>
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8 mt-3">
        <h1 className="font-display text-4xl tracking-tight">Leis Orcamentarias</h1>
        <Link href="/tenant/orcamento/leis/nova" className="btn-primary">+ Nova lei</Link>
      </header>
      <div className="flex gap-2 mb-6">
        {(['todas', 'ppa', 'loa'] as const).map((t) => (
          <button key={t} onClick={() => setTipo(t)} className={clsx('text-xs px-3 py-1.5 rounded-md border transition', tipo === t ? 'bg-carvao-900 text-white border-carvao-900' : 'bg-white text-carvao-700 border-carvao-200')}>{t.toUpperCase()}</button>
        ))}
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr><th className="text-left px-4 py-3 font-semibold">Tipo</th><th className="text-left px-4 py-3 font-semibold">Vigencia</th><th className="text-left px-4 py-3 font-semibold">Lei</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {leis.length === 0 && <tr><td colSpan={6} className="text-center text-carvao-500 py-12">Nenhuma lei cadastrada.</td></tr>}
            {leis.map((l) => (
              <tr key={l.id} className="hover:bg-areia-50">
                <td className="px-4 py-3"><span className={clsx('badge font-mono text-[10px]', l.tipo === 'ppa' ? 'bg-verde-100 text-verde-800' : 'bg-areia-200 text-areia-800')}>{l.tipo.toUpperCase()}</span></td>
                <td className="px-4 py-3 tabular">{l.anoInicio === l.anoFim ? l.anoInicio : `${l.anoInicio}-${l.anoFim}`}</td>
                <td className="px-4 py-3"><div className="font-mono text-xs text-carvao-500">{l.numero}</div><div className="text-carvao-900">{l.descricao}</div></td>
                <td className="px-4 py-3 text-right tabular">{formatBRL(l.valorTotal ?? '0')}</td>
                <td className="px-4 py-3"><span className="badge bg-carvao-100 text-carvao-700 text-[10px]">{l.status}</span></td>
                <td className="px-4 py-3 text-right"><Link href={`/tenant/orcamento/leis/${l.id}` as Route} className="text-xs text-verde-700 hover:underline">abrir →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
