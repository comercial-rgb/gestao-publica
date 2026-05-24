'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface PagMin { id: string; numero: string; valor: string; meio: string; dataPagamento: string; opNumero: string; empenhoNumero: string; fornecedorNome: string }

export default function EstornarPagamentoPage() {
  const params = useParams<{ id: string }>(); const router = useRouter()
  const [pag, setPag] = useState<PagMin | null>(null); const [dataEstorno, setDataEstorno] = useState(new Date().toISOString().slice(0, 10))
  const [motivo, setMotivo] = useState(''); const [documentoBancario, setDocumentoBancario] = useState(''); const [confirmNumero, setConfirmNumero] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<PagMin[]>('/tenant/despesas/pagamentos?limit=200').then((items) => { const f = items.find((p) => p.id === params.id); if (f) setPag(f); else setError('Pagamento nao encontrado') }).catch((err) => setError(err.message)) }, [params.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try { await api(`/tenant/despesas/pagamentos/${params.id}/estornar`, { method: 'POST', body: JSON.stringify({ dataEstorno, motivo, documentoBancario: documentoBancario || undefined, confirmNumero }) }); router.push('/tenant/despesas/pagamentos') } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  if (!pag) return <div className="p-10 text-carvao-500">{error || 'Carregando...'}</div>

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/despesas/pagamentos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Pagamentos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Estornar pagamento</h1>
      <p className="text-sm text-carvao-600 mb-6">Operacao <strong>irreversivel</strong>. Reverte cascata completa (OP, liquidacao, empenho, dotacao).</p>
      <div className="card p-5 mb-6 bg-areia-50/30"><div className="font-mono text-xs text-carvao-500 mb-1">{pag.numero}</div><div className="text-2xl font-display tabular mb-2">{formatBRL(pag.valor)}</div><div className="text-xs text-carvao-700"><div>OP {pag.opNumero} - Empenho {pag.empenhoNumero}</div><div className="mt-1">{pag.fornecedorNome} - {pag.meio.replace('_', ' ')} em {pag.dataPagamento}</div></div></div>
      <form onSubmit={submit} className="card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Data estorno <span className="text-red-600">*</span></label><input type="date" required value={dataEstorno} onChange={(e) => setDataEstorno(e.target.value)} className="input" /></div>
          <div><label className="label">Documento bancario</label><input value={documentoBancario} onChange={(e) => setDocumentoBancario(e.target.value)} className="input" maxLength={100} /></div></div>
        <div><label className="label">Motivo <span className="text-red-600">*</span></label><textarea required value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} minLength={20} maxLength={2000} className="input" /><div className="mt-1 text-[10px] text-carvao-500">{motivo.length}/20 min</div></div>
        <div className="border-t border-carvao-100 pt-5"><label className="label">Confirme o numero: <span className="font-mono text-carvao-900">{pag.numero}</span></label><input value={confirmNumero} onChange={(e) => setConfirmNumero(e.target.value)} className="input font-mono" placeholder={pag.numero} /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3"><Link href="/tenant/despesas/pagamentos" className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || motivo.length < 20 || confirmNumero !== pag.numero} className="btn-primary bg-red-700 hover:bg-red-800">{loading ? 'Estornando...' : 'Estornar'}</button></div>
      </form>
    </div>
  )
}
