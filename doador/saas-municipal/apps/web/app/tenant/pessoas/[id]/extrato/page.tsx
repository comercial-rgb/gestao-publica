'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL, formatCpfCnpj, formatData } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import { SituacaoFiscalBadge } from '@/components/SituacaoFiscalBadge'

interface ExtratoFiscal {
  pessoa: { id: string; nome: string; documento: string; tipo: string }
  exercicio: number
  resumo: {
    totalArrecadado: string; totalAnulado: string; totalLiquido: string
    qtdArrecadacoes: number; qtdAnulacoes: number
    primeiroPagamento: string | null; ultimoPagamento: string | null
  }
  statusFiscal: {
    situacao: 'em_dia' | 'parcialmente_em_dia' | 'inadimplente' | 'sem_movimento'
    descricao: string; percentualPago: number
  }
  porNatureza: Array<{
    naturezaCodigo: string; naturezaDescricao: string
    valorArrecadado: string; valorAnulado: string; valorLiquido: string
    qtdArrecadacoes: number; ultimaArrecadacao: string | null
  }>
  arrecadacoes: Array<{
    id: string; dataArrecadacao: string; valor: string; formaPagamento: string
    numeroDocumento: string | null; referencia: string | null
    naturezaCodigo: string; naturezaDescricao: string
    anuladoEm: string | null; valorAnulacoes: string
  }>
}

export default function ExtratoPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const exercicio = Number(searchParams.get('exercicio')) || new Date().getFullYear()

  const [data, setData] = useState<ExtratoFiscal | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    api<ExtratoFiscal>(`/tenant/pessoas/${params.id}/extrato-fiscal?exercicio=${exercicio}`)
      .then(setData).catch((err) => setError((err as Error).message))
  }, [params.id, exercicio])

  function exportCsv() {
    if (!data) return
    const rows = [
      ['Data', 'Natureza', 'Forma', 'Documento', 'Referência', 'Valor', 'Anulado', 'Status'],
      ...data.arrecadacoes.map((a) => [
        formatData(a.dataArrecadacao), `${a.naturezaCodigo} — ${a.naturezaDescricao}`,
        a.formaPagamento, a.numeroDocumento ?? '', a.referencia ?? '',
        a.valor, a.valorAnulacoes, a.anuladoEm ? 'Anulada' : 'Ativa',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `extrato-${data.pessoa.documento}-${exercicio}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="p-10 max-w-5xl mx-auto"><div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div></div>
  if (!data) return <div className="p-10 text-carvao-500">Carregando…</div>

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-carvao-500 uppercase tracking-wider mb-2">
        <Link href="/tenant/contribuintes" className="hover:text-verde-700">Contribuintes</Link>
        <span>/</span>
        <span className="text-carvao-700">Extrato</span>
      </div>

      {/* Header */}
      <div className="border-b border-carvao-200 pb-6 mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl text-carvao-900 tracking-tight">{data.pessoa.nome}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="font-mono text-sm text-carvao-700">{formatCpfCnpj(data.pessoa.documento)}</span>
              <span className="badge bg-carvao-100 text-carvao-700 text-[10px]">{data.pessoa.tipo}</span>
              <SituacaoFiscalBadge situacao={data.statusFiscal.situacao} />
            </div>
            <p className="text-sm text-carvao-600 mt-3 italic">{data.statusFiscal.descricao}</p>
          </div>
          <button onClick={exportCsv} className="btn-secondary text-sm" disabled={data.arrecadacoes.length === 0}>Exportar CSV</button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <MetricCard label="Arrecadado bruto" value={formatBRL(data.resumo.totalArrecadado)} hint={`${data.resumo.qtdArrecadacoes} arrecadação(ões)`} />
        <MetricCard label="Anulado" value={formatBRL(data.resumo.totalAnulado)} hint={`${data.resumo.qtdAnulacoes} anulação(ões)`}
          tone={Number(data.resumo.totalAnulado) > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="Líquido" value={formatBRL(data.resumo.totalLiquido)} tone="positive"
          hint={`${data.statusFiscal.percentualPago.toFixed(1)}% do bruto`} />
        <MetricCard label="Período" value={
          data.resumo.primeiroPagamento && data.resumo.ultimoPagamento
            ? `${formatData(data.resumo.primeiroPagamento)} → ${formatData(data.resumo.ultimoPagamento)}` : '—'
        } hint={`Exercício ${data.exercicio}`} />
      </div>

      {/* Por natureza */}
      {data.porNatureza.length > 0 && (
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-1">Composição</div>
          <div className="font-display text-xl mb-4">Por natureza de receita</div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Natureza</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Arrecadado</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Anulado</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Líquido</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Qtd</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Última</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carvao-100">
                {data.porNatureza.map((n, i) => (
                  <tr key={i} className="hover:bg-areia-50">
                    <td className="px-4 py-2.5"><div className="font-mono text-xs text-carvao-500">{n.naturezaCodigo}</div><div className="text-carvao-900">{n.naturezaDescricao}</div></td>
                    <td className="px-4 py-2.5 text-right tabular">{formatBRL(n.valorArrecadado)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-areia-800">{Number(n.valorAnulado) > 0 ? formatBRL(n.valorAnulado) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular font-medium">{formatBRL(n.valorLiquido)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-carvao-700">{n.qtdArrecadacoes}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{n.ultimaArrecadacao ? formatData(n.ultimaArrecadacao) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Movimentações */}
      <section>
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-1">Detalhamento</div>
        <div className="font-display text-xl mb-4">Movimentações do exercício</div>

        {data.arrecadacoes.length === 0 ? (
          <div className="card p-12 text-center text-carvao-500">
            Nenhuma arrecadação registrada em {data.exercicio} para esta pessoa.
            <div className="mt-3">
              <Link href={`/tenant/receitas/arrecadar?contribuinteDocumento=${data.pessoa.documento}`} className="btn-primary inline-flex">+ Registrar arrecadação</Link>
            </div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Data</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Natureza</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Forma</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Documento</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Valor</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carvao-100">
                {data.arrecadacoes.map((a) => {
                  const valAnul = Number(a.valorAnulacoes)
                  const totalAnulada = !!a.anuladoEm
                  const parcialAnulada = valAnul > 0 && !totalAnulada
                  return (
                    <tr key={a.id} className={totalAnulada ? 'opacity-50' : 'hover:bg-areia-50'}>
                      <td className="px-4 py-2.5 tabular text-carvao-700">{formatData(a.dataArrecadacao)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-[10px] text-carvao-500">{a.naturezaCodigo}</div>
                        <div className="text-carvao-900 text-xs">{a.naturezaDescricao}</div>
                      </td>
                      <td className="px-4 py-2.5 text-carvao-700 capitalize">{a.formaPagamento.replace('_', ' ')}</td>
                      <td className="px-4 py-2.5">
                        {a.numeroDocumento && <div className="font-mono text-xs text-carvao-700">{a.numeroDocumento}</div>}
                        {a.referencia && <div className="text-[10px] text-carvao-500">{a.referencia}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="tabular font-medium">{formatBRL(a.valor)}</div>
                        {valAnul > 0 && <div className="tabular text-[10px] text-red-700">-{formatBRL(valAnul)}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {totalAnulada && <span className="badge bg-red-100 text-red-800 text-[10px]">anulada</span>}
                        {parcialAnulada && <span className="badge bg-areia-100 text-areia-800 text-[10px]">parcial</span>}
                        {!totalAnulada && !parcialAnulada && <span className="badge bg-verde-100 text-verde-800 text-[10px]">ativa</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
