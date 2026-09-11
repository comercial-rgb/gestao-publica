'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface LiqMin { id: string; numero: string; valor: string; valorPago: string; empenhoId: string; empenhoNumero: string }

export default function AnularLiquidacaoPage() {
  const params = useParams<{ id: string }>(); const router = useRouter()
  const [liq, setLiq] = useState<LiqMin | null>(null); const [valor, setValor] = useState(''); const [dataAnulacao, setDataAnulacao] = useState(new Date().toISOString().slice(0, 10))
  const [motivo, setMotivo] = useState(''); const [confirmNumero, setConfirmNumero] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<LiqMin[]>('/tenant/despesas/liquidacoes?limit=200').then((items) => { const f = items.find((l) => l.id === params.id); if (f) setLiq(f); else setError('Liquidacao nao encontrada') }).catch((err) => setError(err.message)) }, [params.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!liq) return; setLoading(true); setError(null)
    try { await api(`/tenant/despesas/liquidacoes/${params.id}/anular`, { method: 'POST', body: JSON.stringify({ dataAnulacao, valor: Number(valor.replace(',', '.')), motivo, confirmNumero }) }); router.push(`/tenant/despesas/empenhos/${liq.empenhoId}`) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  if (!liq) return <div className="p-10 text-carvao-500">{error || 'Carregando...'}</div>
  const saldoLivre = Number(liq.valor) - Number(liq.valorPago); const valorNum = valor ? Number(valor.replace(',', '.')) : 0; const ultrapassa = valorNum > saldoLivre

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href={`/tenant/despesas/empenhos/${liq.empenhoId}`} className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Empenho {liq.empenhoNumero}</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Anular liquidacao</h1>
      <p className="text-sm text-carvao-600 mb-6">Pagamentos vinculados precisam ser estornados antes.</p>
      <div className="card p-5 mb-6 bg-areia-50/30"><div className="font-mono text-xs text-carvao-500">{liq.numero}</div>
        <div className="grid grid-cols-3 gap-3 text-xs text-carvao-700 mt-2"><div><div className="text-[10px] uppercase text-carvao-500">Valor</div><div className="tabular">{formatBRL(liq.valor)}</div></div><div><div className="text-[10px] uppercase text-carvao-500">Pago</div><div className="tabular">{formatBRL(liq.valorPago)}</div></div><div><div className="text-[10px] uppercase text-carvao-500 font-bold">Saldo livre</div><div className="tabular font-bold text-areia-800">{formatBRL(saldoLivre.toFixed(2))}</div></div></div></div>
      <form onSubmit={submit} className="card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Valor <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular text-lg" placeholder="0,00" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo livre</div>}</div><div><label className="label">Data <span className="text-red-600">*</span></label><input type="date" required value={dataAnulacao} onChange={(e) => setDataAnulacao(e.target.value)} className="input" /></div></div>
        <div><label className="label">Motivo <span className="text-red-600">*</span></label><textarea required value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} minLength={20} maxLength={2000} className="input" /><div className="mt-1 text-[10px] text-carvao-500">{motivo.length}/20 min</div></div>
        <div className="border-t border-carvao-100 pt-5"><label className="label">Confirme: <span className="font-mono text-carvao-900">{liq.numero}</span></label><input value={confirmNumero} onChange={(e) => setConfirmNumero(e.target.value)} className="input font-mono" placeholder={liq.numero} /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3"><Link href={`/tenant/despesas/empenhos/${liq.empenhoId}`} className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !valor || motivo.length < 20 || confirmNumero !== liq.numero || ultrapassa} className="btn-primary bg-red-700 hover:bg-red-800">{loading ? 'Anulando...' : 'Anular'}</button></div>
      </form>
    </div>
  )
}
