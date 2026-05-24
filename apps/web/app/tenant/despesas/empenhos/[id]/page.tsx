'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL, formatDataHora } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'

interface EmpenhoDetalhe { id: string; numero: string; tipo: string; status: string; exercicioAno: number; dataEmpenho: string; valor: string; valorLiquidado: string; valorPago: string; valorAnulado: string; saldoAPagar: string; saldoALiquidar: string; objeto: string; observacoes: string | null; contratoReferencia: Record<string, unknown> | null; dotacaoId: string; dotacaoClassificacao: string; dotacaoSaldoDisponivel: string; fornecedorId: string; fornecedorNome: string; fornecedorDocumento: string | null; agrupadorId: string | null; agrupadorDescricao: string | null; liquidacoesQtd: number; anulacoesQtd: number; criadoEm: string; criadoPor: string | null }
interface Evento { id: string; statusAnterior: string | null; statusNovo: string; motivo: string; registradoEm: string; userNome: string | null }

export default function EmpenhoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [emp, setEmp] = useState<EmpenhoDetalhe | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api<EmpenhoDetalhe>(`/tenant/despesas/empenhos/${params.id}`), api<Evento[]>(`/tenant/despesas/empenhos/${params.id}/eventos`)])
      .then(([e, ev]) => { setEmp(e); setEventos(ev) }).catch((err) => setError((err as Error).message))
  }, [params.id])

  if (!emp) return <div className="p-10 text-carvao-500">Carregando...</div>
  const vLiq = Number(emp.valor) - Number(emp.valorAnulado)
  const pLiq = vLiq > 0 ? (Number(emp.valorLiquidado) / vLiq) * 100 : 0
  const pPago = vLiq > 0 ? (Number(emp.valorPago) / vLiq) * 100 : 0

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/despesas/empenhos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Empenhos</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3">
        <div className="flex items-center gap-2 mb-2"><DespesaStatusBadge tipo="empenho" status={emp.status} /><span className="font-mono text-xs text-carvao-500">{emp.numero}</span></div>
        <h1 className="font-display text-3xl tracking-tight">Empenho {emp.numero}</h1>
        <p className="text-sm text-carvao-600 mt-2">Emitido em {emp.dataEmpenho} - Exercicio {emp.exercicioAno}</p>
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Valor" value={formatBRL(emp.valor)} />
        <MetricCard label="Anulado" value={formatBRL(emp.valorAnulado)} tone={Number(emp.valorAnulado) > 0 ? 'warning' : 'neutral'} hint={`${emp.anulacoesQtd} anulacao(oes)`} />
        <MetricCard label="Liquidado" value={formatBRL(emp.valorLiquidado)} tone="positive" hint={`${emp.liquidacoesQtd} liq. - ${pLiq.toFixed(0)}%`} />
        <MetricCard label="Pago" value={formatBRL(emp.valorPago)} hint={`${pPago.toFixed(0)}%`} tone={pPago === 100 ? 'positive' : 'neutral'} />
      </div>

      <div className="card p-6 mb-8">
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-3">Execucao</div>
        {[{ label: 'Liquidado', valor: emp.valorLiquidado, cor: 'bg-verde-500' }, { label: 'Pago', valor: emp.valorPago, cor: 'bg-verde-800' }].map((row) => {
          const pct = vLiq > 0 ? (Number(row.valor) / vLiq) * 100 : 0
          return (<div key={row.label} className="mb-2"><div className="flex justify-between text-xs text-carvao-700 mb-1"><span>{row.label}</span><span className="tabular">{formatBRL(row.valor)} - {pct.toFixed(1)}%</span></div><div className="h-2 bg-carvao-100 rounded"><div className={`h-2 rounded ${row.cor}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div></div>)
        })}
        <div className="pt-2 mt-2 border-t border-carvao-100 flex justify-between text-xs text-carvao-700"><span>Saldo a liquidar</span><span className="tabular">{formatBRL(emp.saldoALiquidar)}</span></div>
        <div className="flex justify-between text-xs text-carvao-700"><span>Saldo a pagar</span><span className="tabular">{formatBRL(emp.saldoAPagar)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Objeto</div>
          <p className="text-sm text-carvao-800 whitespace-pre-wrap">{emp.objeto}</p>
        </div>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Dotacao</div>
          <div className="font-mono text-xs text-carvao-800">{emp.dotacaoClassificacao}</div>
          <Link href={`/tenant/orcamento/dotacoes/${emp.dotacaoId}` as Route} className="text-xs text-verde-700 hover:underline mt-2 inline-block">saldo: {formatBRL(emp.dotacaoSaldoDisponivel)} →</Link>
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mt-4 mb-2">Fornecedor</div>
          <div className="text-sm text-carvao-900">{emp.fornecedorNome}</div>
          {emp.fornecedorDocumento && <div className="font-mono text-[10px] text-carvao-500 mt-0.5">{emp.fornecedorDocumento}</div>}
        </div>
      </div>

      <section>
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-3">Timeline</div>
        {eventos.length === 0 ? <div className="card p-6 text-center text-carvao-500 text-sm">Nenhum evento.</div> : (
          <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider"><tr><th className="text-left px-4 py-2.5 font-semibold">Quando</th><th className="text-left px-4 py-2.5 font-semibold">Transicao</th><th className="text-left px-4 py-2.5 font-semibold">Quem</th><th className="text-left px-4 py-2.5 font-semibold">Motivo</th></tr></thead>
            <tbody className="divide-y divide-carvao-100">{eventos.map((ev) => (
              <tr key={ev.id}><td className="px-4 py-2.5 tabular text-carvao-700 text-xs">{formatDataHora(ev.registradoEm)}</td>
                <td className="px-4 py-2.5">{ev.statusAnterior ? <div className="flex items-center gap-1.5 text-xs"><DespesaStatusBadge tipo="empenho" status={ev.statusAnterior} /><span className="text-carvao-400">→</span><DespesaStatusBadge tipo="empenho" status={ev.statusNovo} /></div> : <DespesaStatusBadge tipo="empenho" status={ev.statusNovo} />}</td>
                <td className="px-4 py-2.5 text-xs text-carvao-700">{ev.userNome ?? 'sistema'}</td><td className="px-4 py-2.5 text-xs text-carvao-600">{ev.motivo}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
    </div>
  )
}
