'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual, formatData, formatCpfCnpj } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'

interface Saldo {
  valorPrevistoInicial: string; valorAtualizado: string; valorArrecadado: string
  valorAnulado: string; valorArrecadadoLiquido: string; saldoARealizar: string; percentualExecucao: number
}

interface Arrecadacao {
  id: string; dataArrecadacao: string; valor: string; formaPagamento: string
  contribuinteNome: string | null; contribuinteDocumento: string | null
  numeroDocumento: string | null; anuladoEm: string | null
}

export default function LancamentoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [saldo, setSaldo] = useState<Saldo | null>(null)
  const [arrecadacoes, setArrecadacoes] = useState<Arrecadacao[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      const [s, arr] = await Promise.all([
        api<Saldo>(`/tenant/receitas/lancamentos/${params.id}/saldo`),
        api<Arrecadacao[]>(`/tenant/receitas/arrecadacoes?lancamentoId=${params.id}&limit=50&incluirAnuladas=true`),
      ])
      setSaldo(s)
      setArrecadacoes(arr)
    } catch (err) { setError((err as Error).message) }
  }

  useEffect(() => { load() }, [params.id])

  if (!saldo) return <div className="p-10 text-carvao-500">Carregando…</div>

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/receitas/lancamentos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Lançamentos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Saldo do lançamento</h1>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Previsto atualizado" value={formatBRL(saldo.valorAtualizado)} hint={`Inicial: ${formatBRL(saldo.valorPrevistoInicial)}`} />
        <MetricCard label="Arrecadado líquido" value={formatBRL(saldo.valorArrecadadoLiquido)} tone="positive"
          hint={`Bruto: ${formatBRL(saldo.valorArrecadado)} · Anulado: ${formatBRL(saldo.valorAnulado)}`} />
        <MetricCard label="Saldo a realizar" value={formatBRL(saldo.saldoARealizar)} tone={Number(saldo.saldoARealizar) > 0 ? 'warning' : 'positive'} />
        <MetricCard label="Execução" value={formatPercentual(saldo.percentualExecucao)} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-carvao-100 flex items-center justify-between">
          <div className="font-display text-lg">Arrecadações</div>
          <Link href={`/tenant/receitas/arrecadar?lancamentoId=${params.id}`} className="btn-primary text-sm">+ Nova arrecadação</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Data</th>
              <th className="text-left px-4 py-2.5 font-semibold">Contribuinte</th>
              <th className="text-left px-4 py-2.5 font-semibold">Forma</th>
              <th className="text-right px-4 py-2.5 font-semibold">Valor</th>
              <th className="text-left px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {arrecadacoes.length === 0 && <tr><td colSpan={5} className="text-center text-carvao-500 py-12">Nenhuma arrecadação.</td></tr>}
            {arrecadacoes.map((a) => (
              <tr key={a.id} className={a.anuladoEm ? 'opacity-50' : 'hover:bg-areia-50'}>
                <td className="px-4 py-2.5 tabular text-carvao-700">{formatData(a.dataArrecadacao)}</td>
                <td className="px-4 py-2.5">
                  {a.contribuinteNome ? (
                    <><div className="text-carvao-900">{a.contribuinteNome}</div><div className="font-mono text-xs text-carvao-500">{formatCpfCnpj(a.contribuinteDocumento)}</div></>
                  ) : <span className="text-carvao-400 italic text-xs">avulso</span>}
                </td>
                <td className="px-4 py-2.5 text-carvao-700 capitalize">{a.formaPagamento.replace('_', ' ')}</td>
                <td className="px-4 py-2.5 text-right tabular font-medium">{formatBRL(a.valor)}</td>
                <td className="px-4 py-2.5">
                  {a.anuladoEm ? <span className="badge bg-red-100 text-red-800 text-[10px]">anulada</span>
                    : <span className="badge bg-verde-100 text-verde-800 text-[10px]">ativa</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
