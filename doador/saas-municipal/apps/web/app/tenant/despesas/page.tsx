'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'

interface EmpItem { id: string; numero: string; status: string; valor: string; valorLiquidado: string; valorPago: string; valorAnulado: string; objeto: string; fornecedorNome: string }
interface OPItem { id: string; numero: string; status: string; valor: string; valorPago: string; fornecedorNome: string }

export default function DespesasDashboard() {
  const [empenhos, setEmpenhos] = useState<EmpItem[]>([])
  const [opsAguardando, setOpsAguardando] = useState<OPItem[]>([])
  const [opsAprovadas, setOpsAprovadas] = useState<OPItem[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null)
      const [e, oa, oap] = await Promise.all([
        api<{ items: EmpItem[] }>('/tenant/despesas/empenhos?limit=10'),
        api<{ items: OPItem[] }>('/tenant/despesas/ordens-pagamento?status=aguardando_aprovacao&limit=10'),
        api<{ items: OPItem[] }>('/tenant/despesas/ordens-pagamento?status=aprovada&limit=10'),
      ])
      setEmpenhos(e.items); setOpsAguardando(oa.items); setOpsAprovadas(oap.items)
    } catch (err) { setError((err as Error).message) }
  }
  useEffect(() => { load() }, [])

  const totalEmp = empenhos.reduce((a, e) => a + Number(e.valor), 0)
  const totalPago = empenhos.reduce((a, e) => a + Number(e.valorPago), 0)

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">Camada 2 - Registro</div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Despesas</h1>
          <p className="text-sm text-carvao-600 mt-2">Empenho → Liquidacao → Ordem de pagamento → Pagamento</p>
        </div>
        <Link href="/tenant/despesas/empenhos" className="btn-primary">Empenhos</Link>
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-3 gap-4 mb-10">
        <MetricCard label="Empenhado (top 10)" value={formatBRL(totalEmp.toFixed(2))} hint={`${empenhos.length} empenhos`} />
        <MetricCard label="Pago" value={formatBRL(totalPago.toFixed(2))} tone="positive" />
        <MetricCard label="OPs aguardando" value={String(opsAguardando.length)} hint="Pendentes de aprovacao" tone={opsAguardando.length > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="grid grid-cols-4 gap-3 mb-10">
        {[{ href: '/tenant/despesas/empenhos', label: 'Empenhos' }, { href: '/tenant/despesas/liquidacoes', label: 'Liquidacoes' }, { href: '/tenant/despesas/ordens-pagamento', label: 'Ordens de pagamento' }, { href: '/tenant/despesas/pagamentos', label: 'Pagamentos' }].map((s) => (
          <Link key={s.href} href={s.href as Route} className="card p-4 hover:border-verde-400 border border-carvao-100 transition">
            <div className="font-display text-lg">{s.label} →</div>
          </Link>
        ))}
      </div>

      {opsAguardando.length > 0 && (
        <section className="mb-10">
          <div className="font-display text-2xl mb-4">{opsAguardando.length} OPs aguardando aprovacao</div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr><th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Fornecedor</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th></th></tr></thead>
              <tbody className="divide-y divide-carvao-100">{opsAguardando.map((op) => (
                <tr key={op.id} className="hover:bg-areia-50"><td className="px-4 py-3 font-mono text-xs">{op.numero}</td><td className="px-4 py-3 text-carvao-900">{op.fornecedorNome}</td><td className="px-4 py-3 text-right tabular font-medium">{formatBRL(op.valor)}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/tenant/despesas/ordens-pagamento/${op.id}` as Route} className="text-xs text-verde-700 hover:underline">analisar →</Link></td></tr>
              ))}</tbody></table>
          </div>
        </section>
      )}

      {empenhos.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4"><div className="font-display text-2xl">Ultimos empenhos</div>
            <Link href={'/tenant/despesas/empenhos' as Route} className="text-xs text-verde-700 hover:underline">ver todos →</Link></div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr><th className="text-left px-4 py-3 font-semibold">Numero</th><th className="text-left px-4 py-3 font-semibold">Fornecedor</th><th className="text-left px-4 py-3 font-semibold">Objeto</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-carvao-100">{empenhos.map((e) => (
                <tr key={e.id} className="hover:bg-areia-50"><td className="px-4 py-3 font-mono text-xs">{e.numero}</td><td className="px-4 py-3 text-carvao-900">{e.fornecedorNome}</td><td className="px-4 py-3 text-xs text-carvao-700 max-w-xs truncate">{e.objeto}</td><td className="px-4 py-3 text-right tabular">{formatBRL(e.valor)}</td>
                  <td className="px-4 py-3"><DespesaStatusBadge tipo="empenho" status={e.status} /></td><td className="px-4 py-3 text-right"><Link href={`/tenant/despesas/empenhos/${e.id}` as Route} className="text-xs text-verde-700 hover:underline">abrir →</Link></td></tr>
              ))}</tbody></table>
          </div>
        </section>
      )}
    </div>
  )
}
