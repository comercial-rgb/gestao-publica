'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'
import clsx from 'clsx'

interface EmpItem { id: string; numero: string; tipo: string; status: string; dataEmpenho: string; valor: string; valorLiquidado: string; valorPago: string; valorAnulado: string; saldoAPagar: string; objeto: string; fornecedorNome: string; dotacaoClassificacao: string; agrupadorDescricao: string | null }

export default function EmpenhosListPage() {
  const [items, setItems] = useState<EmpItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(''); const [statusF, setStatusF] = useState(''); const [tipoF, setTipoF] = useState('')

  const load = useCallback(async (cursor?: string) => {
    try { setLoading(true); setError(null); const qs = new URLSearchParams(); qs.set('limit', '25')
      if (cursor) qs.set('cursor', cursor); if (search) qs.set('search', search); if (statusF) qs.set('status', statusF); if (tipoF) qs.set('tipo', tipoF)
      const r = await api<{ items: EmpItem[]; pagination: { nextCursor: string | null } }>(`/tenant/despesas/empenhos?${qs}`)
      if (cursor) setItems((p) => [...p, ...r.items]); else setItems(r.items); setNextCursor(r.pagination.nextCursor)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }, [search, statusF, tipoF])
  useEffect(() => { load() }, [load])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/despesas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Despesas</Link>
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8 mt-3">
        <h1 className="font-display text-4xl tracking-tight">Empenhos</h1>
      </header>
      <div className="flex gap-2 mb-6 flex-wrap items-end">
        <div className="flex-1 min-w-[240px]"><label className="label">Buscar</label><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input" placeholder="numero, objeto, fornecedor" /></div>
        <div className="w-48"><label className="label">Status</label><select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="input"><option value="">todos</option><option value="vigente">vigente</option><option value="pago_total">pago total</option><option value="cancelado">cancelado</option></select></div>
        <div className="w-40"><label className="label">Tipo</label><select value={tipoF} onChange={(e) => setTipoF(e.target.value)} className="input"><option value="">todos</option><option value="ordinario">ordinario</option><option value="global">global</option><option value="estimativo">estimativo</option></select></div>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr>
          <th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Data</th><th className="text-left px-4 py-3 font-semibold">Dotacao / Fornecedor</th><th className="text-left px-4 py-3 font-semibold">Objeto</th>
          <th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-right px-4 py-3 font-semibold">Saldo</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr></thead>
          <tbody className="divide-y divide-carvao-100">
            {items.length === 0 && !loading && <tr><td colSpan={8} className="text-center text-carvao-500 py-12">Nenhum empenho.</td></tr>}
            {items.map((e) => (
              <tr key={e.id} className="hover:bg-areia-50">
                <td className="px-4 py-3 font-mono text-xs">{e.numero}{e.tipo !== 'ordinario' && <div className="text-[9px] text-carvao-500 mt-0.5">{e.tipo}</div>}</td>
                <td className="px-4 py-3 tabular text-carvao-700">{e.dataEmpenho}</td>
                <td className="px-4 py-3"><div className="font-mono text-[10px] text-carvao-500">{e.dotacaoClassificacao}</div><div className="text-xs text-carvao-800">{e.fornecedorNome}</div></td>
                <td className="px-4 py-3 text-xs text-carvao-700 max-w-sm"><div className="line-clamp-2">{e.objeto}</div></td>
                <td className="px-4 py-3 text-right tabular font-medium">{formatBRL(e.valor)}</td>
                <td className={clsx('px-4 py-3 text-right tabular', Number(e.saldoAPagar) > 0 ? 'text-areia-700 font-medium' : 'text-carvao-400')}>{formatBRL(e.saldoAPagar)}</td>
                <td className="px-4 py-3"><DespesaStatusBadge tipo="empenho" status={e.status} /></td>
                <td className="px-4 py-3 text-right"><Link href={`/tenant/despesas/empenhos/${e.id}` as Route} className="text-xs text-verde-700 hover:underline">abrir →</Link></td>
              </tr>))}
          </tbody></table>
        {nextCursor && <div className="border-t border-carvao-100 p-4 text-center"><button onClick={() => load(nextCursor)} disabled={loading} className="btn-secondary">{loading ? 'Carregando...' : 'Carregar mais 25'}</button></div>}
      </div>
    </div>
  )
}
