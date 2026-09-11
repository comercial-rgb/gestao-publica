'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface Emp { numero: string; valor: string; valorLiquidado: string; valorAnulado: string; saldoALiquidar: string; objeto: string }

export default function AnularEmpenhoPage() {
  const params = useParams<{ id: string }>(); const router = useRouter()
  const [emp, setEmp] = useState<Emp | null>(null); const [valor, setValor] = useState(''); const [dataAnulacao, setDataAnulacao] = useState(new Date().toISOString().slice(0, 10))
  const [motivo, setMotivo] = useState(''); const [documentoAutorizacao, setDocumentoAutorizacao] = useState(''); const [confirmNumero, setConfirmNumero] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<Emp>(`/tenant/despesas/empenhos/${params.id}`).then(setEmp).catch((err) => setError(err.message)) }, [params.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try { await api(`/tenant/despesas/empenhos/${params.id}/anular`, { method: 'POST', body: JSON.stringify({ valor: Number(valor.replace(',', '.')), dataAnulacao, motivo, documentoAutorizacao: documentoAutorizacao || undefined, confirmNumero }) }); router.push(`/tenant/despesas/empenhos/${params.id}`) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  if (!emp) return <div className="p-10 text-carvao-500">Carregando...</div>
  const saldoNaoLiq = Number(emp.saldoALiquidar); const valorNum = valor ? Number(valor.replace(',', '.')) : 0; const ultrapassa = valorNum > saldoNaoLiq; const isTotal = valorNum >= saldoNaoLiq && !ultrapassa

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href={`/tenant/despesas/empenhos/${params.id}`} className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Empenho {emp.numero}</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Anular empenho</h1>
      <p className="text-sm text-carvao-600 mb-6">Operacao <strong>irreversivel</strong>. Valor devolvido a dotacao.</p>
      <div className="card p-5 mb-6 bg-areia-50/30"><div className="font-mono text-xs text-carvao-500 mb-1">{emp.numero}</div><div className="text-sm text-carvao-800 mb-2 line-clamp-2">{emp.objeto}</div>
        <div className="grid grid-cols-4 gap-3 text-xs text-carvao-700"><div><div className="text-[10px] uppercase text-carvao-500">Valor</div><div className="tabular">{formatBRL(emp.valor)}</div></div><div><div className="text-[10px] uppercase text-carvao-500">Liquidado</div><div className="tabular">{formatBRL(emp.valorLiquidado)}</div></div><div><div className="text-[10px] uppercase text-carvao-500">Anulado</div><div className="tabular">{formatBRL(emp.valorAnulado)}</div></div><div><div className="text-[10px] uppercase text-carvao-500 font-bold">Saldo p/ anular</div><div className="tabular font-bold text-areia-800">{formatBRL(emp.saldoALiquidar)}</div></div></div></div>
      <form onSubmit={submit} className="card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Valor (R$) <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular text-lg" placeholder="0,00" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo</div>}{isTotal && <div className="mt-1 text-xs text-areia-700">Anulacao total -- empenho sera cancelado</div>}</div>
          <div><label className="label">Data <span className="text-red-600">*</span></label><input type="date" required value={dataAnulacao} onChange={(e) => setDataAnulacao(e.target.value)} className="input" /></div></div>
        <div><label className="label">Documento de autorizacao</label><input value={documentoAutorizacao} onChange={(e) => setDocumentoAutorizacao(e.target.value)} className="input" maxLength={100} /></div>
        <div><label className="label">Motivo <span className="text-red-600">*</span></label><textarea required value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} minLength={20} maxLength={2000} className="input" /><div className="mt-1 text-[10px] text-carvao-500">{motivo.length}/20 min</div></div>
        <div className="border-t border-carvao-100 pt-5"><label className="label">Confirme o numero: <span className="font-mono text-carvao-900">{emp.numero}</span></label><input value={confirmNumero} onChange={(e) => setConfirmNumero(e.target.value)} className="input font-mono" placeholder={emp.numero} /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3"><Link href={`/tenant/despesas/empenhos/${params.id}`} className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !valor || motivo.length < 20 || confirmNumero !== emp.numero || ultrapassa} className="btn-primary bg-red-700 hover:bg-red-800">{loading ? 'Anulando...' : isTotal ? 'Cancelar empenho' : 'Anular parcialmente'}</button></div>
      </form>
    </div>
  )
}
