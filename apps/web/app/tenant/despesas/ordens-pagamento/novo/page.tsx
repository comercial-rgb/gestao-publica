'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface LiqOp { id: string; numero: string; valor: string; valorPago: string; empenhoNumero: string; fornecedorNome: string }

export default function NovaOPPage() {
  const router = useRouter(); const params = useSearchParams(); const liqIdInicial = params.get('liquidacaoId') || ''
  const [liquidacaoId, setLiquidacaoId] = useState(liqIdInicial); const [liq, setLiq] = useState<LiqOp | null>(null); const [liqList, setLiqList] = useState<LiqOp[]>([])
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10)); const [valor, setValor] = useState(''); const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (liqIdInicial) { api<LiqOp[]>('/tenant/despesas/liquidacoes?limit=200').then((items) => { const f = items.find((l) => l.id === liqIdInicial); if (f) setLiq(f) }).catch(() => {}) } else { api<LiqOp[]>('/tenant/despesas/liquidacoes?status=vigente&limit=50').then((items) => setLiqList(items.filter((l) => Number(l.valor) - Number(l.valorPago) > 0))).catch(() => {}) } }, [liqIdInicial])

  const saldoLiq = liq ? Number(liq.valor) - Number(liq.valorPago) : 0; const valorNum = valor ? Number(valor.replace(',', '.')) : 0; const ultrapassa = liq && valorNum > saldoLiq

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try { const r = await api<{ id: string }>('/tenant/despesas/ordens-pagamento', { method: 'POST', body: JSON.stringify({ liquidacaoId, dataEmissao, valor: valorNum, observacoes: observacoes || undefined }) }); router.push(`/tenant/despesas/ordens-pagamento/${r.id}`) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/despesas/ordens-pagamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← OPs</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Nova ordem de pagamento</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div><label className="label">Liquidacao <span className="text-red-600">*</span></label>
          {liq ? (<div className="card p-4 border-verde-300 bg-verde-50/30"><div className="font-mono text-xs">{liq.numero}</div><div className="text-xs text-carvao-700 mt-1">Emp {liq.empenhoNumero} - {liq.fornecedorNome}</div><div className="text-xs text-verde-700 mt-2">Saldo: {formatBRL(saldoLiq.toFixed(2))}</div><button type="button" onClick={() => { setLiq(null); setLiquidacaoId('') }} className="text-xs text-red-600 hover:underline mt-2">trocar</button></div>
          ) : (<div className="border border-carvao-200 rounded-md max-h-60 overflow-auto">{liqList.length === 0 ? <div className="p-4 text-center text-carvao-500 text-xs">Nenhuma liquidacao disponivel</div> : liqList.map((l) => (<button key={l.id} type="button" onClick={() => { setLiq(l); setLiquidacaoId(l.id) }} className="w-full text-left px-3 py-2 hover:bg-areia-50 border-b border-carvao-50 last:border-0"><div className="font-mono text-xs">{l.numero}</div><div className="text-[10px] text-carvao-500">Emp {l.empenhoNumero} - {l.fornecedorNome} - {formatBRL(l.valor)}</div></button>))}</div>)}</div>
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Valor (R$) <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular text-lg" placeholder="0,00" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo</div>}</div><div><label className="label">Data emissao <span className="text-red-600">*</span></label><input type="date" required value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className="input" /></div></div>
        <div><label className="label">Observacoes</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={2000} className="input" /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100"><Link href="/tenant/despesas/ordens-pagamento" className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !liquidacaoId || !valor || !!ultrapassa} className="btn-primary">{loading ? 'Emitindo...' : 'Emitir OP'}</button></div>
      </form>
    </div>
  )
}
