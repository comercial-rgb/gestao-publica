'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual, formatDataHora } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'

interface Saldo { valorInicial: string; valorAtualizado: string; valorReservado: string; valorEmpenhado: string; valorLiquidado: string; valorPago: string; saldoDisponivel: string; saldoAEmpenhar: string; percentualEmpenhado: number; percentualLiquidado: number; percentualPago: number }
interface HistoricoItem { id: string; creditoId: string | null; creditoNumero: string | null; valorAnterior: string; valorNovo: string; delta: string; motivo: string; registradoEm: string }

export default function DotacaoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [saldo, setSaldo] = useState<Saldo | null>(null)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api<Saldo>(`/tenant/orcamento/dotacoes/${params.id}/saldo`),
      api<HistoricoItem[]>(`/tenant/orcamento/dotacoes/${params.id}/historico`),
    ]).then(([s, h]) => { setSaldo(s); setHistorico(h) }).catch((err) => setError((err as Error).message))
  }, [params.id])

  if (!saldo) return <div className="p-10 text-carvao-500">Carregando...</div>

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/orcamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Orcamento</Link>
      <h1 className="font-display text-3xl tracking-tight mt-3 mb-8">Saldo da dotacao</h1>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Valor inicial" value={formatBRL(saldo.valorInicial)} />
        <MetricCard label="Atualizado" value={formatBRL(saldo.valorAtualizado)} tone="positive" />
        <MetricCard label="Disponivel" value={formatBRL(saldo.saldoDisponivel)} tone={Number(saldo.saldoDisponivel) > 0 ? 'positive' : 'warning'} />
        <MetricCard label="Execucao" value={formatPercentual(saldo.percentualEmpenhado)} hint={`Liq: ${saldo.percentualLiquidado.toFixed(1)}% - Pago: ${saldo.percentualPago.toFixed(1)}%`} />
      </div>

      <div className="card p-6 mb-10">
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-3">Composicao</div>
        <div className="space-y-2 text-sm">
          {[
            { label: 'Reservado', valor: saldo.valorReservado, cor: 'bg-areia-400' },
            { label: 'Empenhado', valor: saldo.valorEmpenhado, cor: 'bg-verde-500' },
            { label: 'Liquidado', valor: saldo.valorLiquidado, cor: 'bg-verde-700' },
            { label: 'Pago', valor: saldo.valorPago, cor: 'bg-verde-900' },
          ].map((row) => {
            const pct = Number(saldo.valorAtualizado) > 0 ? (Number(row.valor) / Number(saldo.valorAtualizado)) * 100 : 0
            return (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-carvao-700 mb-1"><span>{row.label}</span><span className="tabular">{formatBRL(row.valor)} - {pct.toFixed(1)}%</span></div>
                <div className="h-2 bg-carvao-100 rounded"><div className={`h-2 rounded ${row.cor}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-3">Historico</div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr><th className="text-left px-4 py-2.5 font-semibold">Data</th><th className="text-left px-4 py-2.5 font-semibold">Origem</th><th className="text-right px-4 py-2.5 font-semibold">De</th><th className="text-right px-4 py-2.5 font-semibold">Para</th><th className="text-right px-4 py-2.5 font-semibold">Delta</th><th className="text-left px-4 py-2.5 font-semibold">Motivo</th></tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {historico.length === 0 && <tr><td colSpan={6} className="text-center text-carvao-500 py-8">Nenhuma alteracao.</td></tr>}
            {historico.map((h) => {
              const d = Number(h.delta)
              return (
                <tr key={h.id} className="hover:bg-areia-50">
                  <td className="px-4 py-2.5 tabular text-carvao-700">{formatDataHora(h.registradoEm)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{h.creditoNumero || 'manual'}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatBRL(h.valorAnterior)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatBRL(h.valorNovo)}</td>
                  <td className={`px-4 py-2.5 text-right tabular font-medium ${d >= 0 ? 'text-verde-700' : 'text-red-700'}`}>{d >= 0 ? '+' : ''}{formatBRL(h.delta)}</td>
                  <td className="px-4 py-2.5 text-carvao-600 text-xs">{h.motivo}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
