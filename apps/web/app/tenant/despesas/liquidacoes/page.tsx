'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'

interface Liq { id: string; numero: string; status: string; empenhoId: string; empenhoNumero: string; dataLiquidacao: string; valor: string; valorPago: string; documentoComprovante: string | null; fornecedorNome: string }

export default function LiquidacoesListPage() {
  const params = useSearchParams(); const empenhoId = params.get('empenhoId') || ''
  const [items, setItems] = useState<Liq[]>([]); const [error, setError] = useState<string | null>(null)
  async function load() { try { setError(null); const qs = new URLSearchParams(); qs.set('limit', '50'); if (empenhoId) qs.set('empenhoId', empenhoId); setItems(await api<Liq[]>(`/tenant/despesas/liquidacoes?${qs}`)) } catch (err) { setError((err as Error).message) } }
  useEffect(() => { load() }, [empenhoId])

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/despesas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Despesas</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3"><h1 className="font-display text-4xl tracking-tight">Liquidacoes</h1></header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>}
      <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr>
        <th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Data</th><th className="text-left px-4 py-3 font-semibold">Empenho</th><th className="text-left px-4 py-3 font-semibold">Fornecedor</th><th className="text-left px-4 py-3 font-semibold">Doc.</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-right px-4 py-3 font-semibold">Pago</th><th className="text-left px-4 py-3 font-semibold">Status</th></tr></thead>
        <tbody className="divide-y divide-carvao-100">
          {items.length === 0 && <tr><td colSpan={8} className="text-center text-carvao-500 py-12">Nenhuma liquidacao.</td></tr>}
          {items.map((l) => (<tr key={l.id} className="hover:bg-areia-50"><td className="px-4 py-3 font-mono text-xs">{l.numero}</td><td className="px-4 py-3 tabular text-carvao-700">{l.dataLiquidacao}</td>
            <td className="px-4 py-3 font-mono text-xs"><Link href={`/tenant/despesas/empenhos/${l.empenhoId}` as Route} className="text-verde-700 hover:underline">{l.empenhoNumero}</Link></td>
            <td className="px-4 py-3 text-carvao-900 text-xs">{l.fornecedorNome}</td><td className="px-4 py-3 text-xs text-carvao-600">{l.documentoComprovante ?? '--'}</td>
            <td className="px-4 py-3 text-right tabular">{formatBRL(l.valor)}</td><td className="px-4 py-3 text-right tabular text-carvao-700">{formatBRL(l.valorPago)}</td>
            <td className="px-4 py-3"><DespesaStatusBadge tipo="liquidacao" status={l.status} /></td></tr>))}
        </tbody></table></div>
    </div>
  )
}
