'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL, formatDataHora } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import { DespesaStatusBadge } from '@/components/DespesaStatusBadge'

interface OPDetalhe { id: string; numero: string; status: string; dataEmissao: string; dataAprovacao: string | null; aprovadaPor: string | null; aprovadaEm: string | null; rejeitadaPor: string | null; rejeitadaEm: string | null; motivoRejeicao: string | null; valor: string; valorPago: string; saldoPagar: string; observacoes: string | null; liquidacaoId: string; liquidacaoNumero: string; empenhoId: string; empenhoNumero: string; empenhoObjeto: string; fornecedorId: string; fornecedorNome: string; fornecedorDocumento: string | null; dotacaoClassificacao: string; pagamentosQtd: number; criadoEm: string; criadoPor: string | null }

export default function OPDetalhePage() {
  const params = useParams<{ id: string }>()
  const [op, setOp] = useState<OPDetalhe | null>(null); const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<OPDetalhe>(`/tenant/despesas/ordens-pagamento/${params.id}`).then(setOp).catch((err) => setError((err as Error).message)) }, [params.id])
  if (!op) return <div className="p-10 text-carvao-500">Carregando...</div>

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/despesas/ordens-pagamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Ordens de pagamento</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3">
        <div className="flex items-center gap-2 mb-2"><DespesaStatusBadge tipo="op" status={op.status} /><span className="font-mono text-xs text-carvao-500">{op.numero}</span></div>
        <h1 className="font-display text-3xl tracking-tight">OP {op.numero}</h1>
        <p className="text-sm text-carvao-600 mt-2">Emitida em {op.dataEmissao}{op.dataAprovacao ? ` - Aprovada em ${op.dataAprovacao}` : ''}</p>
        {op.aprovadaPor && <p className="text-xs text-verde-700 mt-1">Aprovada por {op.aprovadaPor} em {op.aprovadaEm ? formatDataHora(op.aprovadaEm) : '--'}</p>}
        {op.rejeitadaPor && <p className="text-xs text-red-700 mt-1">Rejeitada por {op.rejeitadaPor}: {op.motivoRejeicao}</p>}
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Valor" value={formatBRL(op.valor)} />
        <MetricCard label="Pago" value={formatBRL(op.valorPago)} tone="positive" hint={`${op.pagamentosQtd} pagamento(s)`} />
        <MetricCard label="Saldo a pagar" value={formatBRL(op.saldoPagar)} tone={Number(op.saldoPagar) > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Empenho</div>
          <Link href={`/tenant/despesas/empenhos/${op.empenhoId}` as Route} className="font-mono text-xs text-verde-700 hover:underline">{op.empenhoNumero}</Link>
          <p className="text-sm text-carvao-800 mt-2">{op.empenhoObjeto}</p>
        </div>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Fornecedor</div>
          <div className="text-sm text-carvao-900">{op.fornecedorNome}</div>
          {op.fornecedorDocumento && <div className="font-mono text-[10px] text-carvao-500 mt-0.5">{op.fornecedorDocumento}</div>}
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mt-4 mb-2">Dotacao</div>
          <div className="font-mono text-xs text-carvao-800">{op.dotacaoClassificacao}</div>
        </div>
      </div>

      {op.observacoes && <div className="card p-5 mb-8"><div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Observacoes</div><p className="text-sm text-carvao-800">{op.observacoes}</p></div>}

      <div className="text-xs text-carvao-500 mt-4">Criado em {formatDataHora(op.criadoEm)}{op.criadoPor ? ` por ${op.criadoPor}` : ''}</div>
    </div>
  )
}
