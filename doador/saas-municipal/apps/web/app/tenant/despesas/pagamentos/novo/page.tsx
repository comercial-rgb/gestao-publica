'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface OPOpcao { id: string; numero: string; status: string; valor: string; valorPago: string; saldoPagar: string; fornecedorNome: string; empenhoNumero: string }

const MEIOS = [{ v: 'pix', l: 'PIX' }, { v: 'transferencia', l: 'Transferencia' }, { v: 'cheque', l: 'Cheque' }, { v: 'boleto', l: 'Boleto' }, { v: 'debito_automatico', l: 'Debito automatico' }, { v: 'ordem_bancaria', l: 'Ordem bancaria' }, { v: 'compensacao', l: 'Compensacao' }, { v: 'outros', l: 'Outros' }]

export default function NovoPagamentoPage() {
  const router = useRouter(); const params = useSearchParams(); const opIdInicial = params.get('opId') || ''
  const [opId, setOpId] = useState(opIdInicial); const [op, setOp] = useState<OPOpcao | null>(null); const [opList, setOpList] = useState<OPOpcao[]>([])
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10)); const [valor, setValor] = useState(''); const [meio, setMeio] = useState('pix')
  const [numeroDocumento, setNumeroDocumento] = useState(''); const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (opIdInicial) { api<OPOpcao>(`/tenant/despesas/ordens-pagamento/${opIdInicial}`).then(setOp).catch(() => {}) }
    else { api<{ items: OPOpcao[] }>('/tenant/despesas/ordens-pagamento?status=aprovada&limit=50').then((r) => setOpList(r.items.filter((o) => Number(o.saldoPagar) > 0))).catch(() => {}) }
  }, [opIdInicial])

  const saldoOP = op ? Number(op.saldoPagar) : 0; const valorNum = valor ? Number(valor.replace(',', '.')) : 0; const ultrapassa = op && valorNum > saldoOP

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try { const r = await api<{ id: string; numero: string }>('/tenant/despesas/pagamentos', { method: 'POST', body: JSON.stringify({ ordemPagamentoId: opId, dataPagamento, valor: valorNum, meio, numeroDocumento: numeroDocumento || undefined, observacoes: observacoes || undefined }) }); router.push(`/tenant/despesas/ordens-pagamento/${opId}`) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/despesas/pagamentos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Pagamentos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Novo pagamento</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div><label className="label">Ordem de pagamento <span className="text-red-600">*</span></label>
          {op ? (<div className="card p-4 border-verde-300 bg-verde-50/30"><div className="font-mono text-xs">{op.numero}</div><div className="text-xs text-carvao-700 mt-1">Emp {op.empenhoNumero} - {op.fornecedorNome}</div><div className="text-xs text-verde-700 mt-2 font-medium">Saldo: {formatBRL(op.saldoPagar)}</div><button type="button" onClick={() => { setOp(null); setOpId('') }} className="text-xs text-red-600 hover:underline mt-2">trocar</button></div>
          ) : (<div className="border border-carvao-200 rounded-md max-h-60 overflow-auto">{opList.length === 0 ? <div className="p-4 text-center text-carvao-500 text-xs">Nenhuma OP aprovada</div> : opList.map((o) => (<button key={o.id} type="button" onClick={() => { setOp(o); setOpId(o.id) }} className="w-full text-left px-3 py-2 hover:bg-areia-50 border-b border-carvao-50 last:border-0"><div className="font-mono text-xs">{o.numero}</div><div className="text-[10px] text-carvao-500">Emp {o.empenhoNumero} - {o.fornecedorNome} - saldo: {formatBRL(o.saldoPagar)}</div></button>))}</div>)}</div>
        <div className="grid grid-cols-3 gap-4"><div><label className="label">Valor (R$) <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular text-lg" placeholder="0,00" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo da OP</div>}</div>
          <div><label className="label">Data <span className="text-red-600">*</span></label><input type="date" required value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="input" /></div>
          <div><label className="label">Meio <span className="text-red-600">*</span></label><select value={meio} onChange={(e) => setMeio(e.target.value)} className="input">{MEIOS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div></div>
        <div><label className="label">Documento bancario</label><input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} className="input" maxLength={100} placeholder="OB, cheque no, etc" /></div>
        <div><label className="label">Observacoes</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={2000} className="input" /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100"><Link href="/tenant/despesas/pagamentos" className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !opId || !valor || !!ultrapassa} className="btn-primary">{loading ? 'Pagando...' : 'Pagar'}</button></div>
      </form>
    </div>
  )
}
