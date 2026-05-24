'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'
import clsx from 'clsx'

interface OP { id: string; numero: string; status: string; dataEmissao: string; dataAprovacao: string | null; valor: string; valorPago: string; saldoPagar: string; liquidacaoNumero: string; empenhoNumero: string; fornecedorNome: string }

export default function OPsListPage() {
  const params = useSearchParams()
  const [items, setItems] = useState<OP[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState(params.get('status') || '')

  async function load(cursor?: string) {
    try { setLoading(true); const qs = new URLSearchParams(); qs.set('limit', '25'); if (cursor) qs.set('cursor', cursor); if (statusF) qs.set('status', statusF)
      const r = await api<{ items: OP[]; pagination: { nextCursor: string | null } }>(`/tenant/despesas/ordens-pagamento?${qs}`)
      if (cursor) setItems((p) => [...p, ...r.items]); else setItems(r.items); setNextCursor(r.pagination.nextCursor)
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [statusF])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/despesas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Despesas</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3"><h1 className="font-display text-4xl tracking-tight">Ordens de pagamento</h1></header>
      <div className="flex gap-2 mb-6">
        {[{ v: '', l: 'todas' }, { v: 'aguardando_aprovacao', l: 'aguardando' }, { v: 'aprovada', l: 'aprovada' }, { v: 'paga_parcial', l: 'parcial' }, { v: 'paga_total', l: 'paga' }, { v: 'rejeitada', l: 'rejeitada' }, { v: 'cancelada', l: 'cancelada' }].map((o) => (
          <button key={o.v} onClick={() => setStatusF(o.v)} className={clsx('text-xs px-3 py-1.5 rounded-md border transition', statusF === o.v ? 'bg-carvao-900 text-white border-carvao-900' : 'bg-white text-carvao-700 border-carvao-200')}>{o.l}</button>
        ))}
      </div>
      <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr>
        <th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Emissao</th><th className="text-left px-4 py-3 font-semibold">Vinculos</th><th className="text-left px-4 py-3 font-semibold">Fornecedor</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-right px-4 py-3 font-semibold">Pago</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr></thead>
        <tbody className="divide-y divide-carvao-100">
          {items.length === 0 && !loading && <tr><td colSpan={8} className="text-center text-carvao-500 py-12">Nenhuma OP.</td></tr>}
          {items.map((op) => (<tr key={op.id} className="hover:bg-areia-50">
            <td className="px-4 py-3 font-mono text-xs">{op.numero}</td><td className="px-4 py-3 tabular text-carvao-700"><div className="text-xs">{op.dataEmissao}</div>{op.dataAprovacao && <div className="text-[10px] text-verde-700">aprov: {op.dataAprovacao}</div>}</td>
            <td className="px-4 py-3 font-mono text-[10px]"><div>L: {op.liquidacaoNumero}</div><div className="text-carvao-500">E: {op.empenhoNumero}</div></td>
            <td className="px-4 py-3 text-carvao-900 text-xs">{op.fornecedorNome}</td><td className="px-4 py-3 text-right tabular font-medium">{formatBRL(op.valor)}</td>
            <td className="px-4 py-3 text-right tabular text-xs"><div className="text-carvao-700">{formatBRL(op.valorPago)}</div>{Number(op.saldoPagar) > 0 && <div className="text-[10px] text-areia-700">saldo: {formatBRL(op.saldoPagar)}</div>}</td>
            <td className="px-4 py-3"><DespesaStatusBadge tipo="op" status={op.status} /></td>
            <td className="px-4 py-3 text-right"><Link href={`/tenant/despesas/ordens-pagamento/${op.id}` as Route} className="text-xs text-verde-700 hover:underline">abrir →</Link></td>
          </tr>))}
        </tbody></table>
        {nextCursor && <div className="border-t border-carvao-100 p-4 text-center"><button onClick={() => load(nextCursor)} disabled={loading} className="btn-secondary">{loading ? 'Carregando...' : 'Carregar mais'}</button></div>}
      </div>
    </div>
  )
}
