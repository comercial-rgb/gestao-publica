'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'

interface Pag { id: string; numero: string; status: string; dataPagamento: string; valor: string; meio: string; numeroDocumento: string | null; opNumero: string; empenhoNumero: string; fornecedorNome: string }

export default function PagamentosListPage() {
  const params = useSearchParams()
  const [items, setItems] = useState<Pag[]>([]); const [error, setError] = useState<string | null>(null)
  const opId = params.get('opId') || ''
  async function load() { try { setError(null); const qs = new URLSearchParams(); qs.set('limit', '50'); if (opId) qs.set('opId', opId); setItems(await api<Pag[]>(`/tenant/despesas/pagamentos?${qs}`)) } catch (err) { setError((err as Error).message) } }
  useEffect(() => { load() }, [opId])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/despesas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Despesas</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3"><h1 className="font-display text-4xl tracking-tight">Pagamentos</h1></header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>}
      <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr>
        <th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Data</th><th className="text-left px-4 py-3 font-semibold">OP / Empenho</th><th className="text-left px-4 py-3 font-semibold">Fornecedor</th><th className="text-left px-4 py-3 font-semibold">Meio</th><th className="text-left px-4 py-3 font-semibold">Doc.</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-left px-4 py-3 font-semibold">Status</th></tr></thead>
        <tbody className="divide-y divide-carvao-100">
          {items.length === 0 && <tr><td colSpan={8} className="text-center text-carvao-500 py-12">Nenhum pagamento.</td></tr>}
          {items.map((p) => (<tr key={p.id} className="hover:bg-areia-50">
            <td className="px-4 py-3 font-mono text-xs">{p.numero}</td><td className="px-4 py-3 tabular text-carvao-700">{p.dataPagamento}</td>
            <td className="px-4 py-3 font-mono text-[10px]"><div>{p.opNumero}</div><div className="text-carvao-500">{p.empenhoNumero}</div></td>
            <td className="px-4 py-3 text-carvao-900 text-xs">{p.fornecedorNome}</td><td className="px-4 py-3 text-xs capitalize text-carvao-700">{p.meio.replace('_', ' ')}</td>
            <td className="px-4 py-3 text-xs text-carvao-600 font-mono">{p.numeroDocumento ?? '--'}</td>
            <td className="px-4 py-3 text-right tabular font-medium">{formatBRL(p.valor)}</td>
            <td className="px-4 py-3"><DespesaStatusBadge tipo="pagamento" status={p.status} /></td>
          </tr>))}
        </tbody></table></div>
    </div>
  )
}
