'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface OPMin { id: string; numero: string; status: string; valor: string; empenhoNumero: string; empenhoObjeto: string; fornecedorNome: string; dotacaoClassificacao: string }

export default function AprovarOPPage() {
  const params = useParams<{ id: string }>(); const router = useRouter()
  const [op, setOp] = useState<OPMin | null>(null); const [acao, setAcao] = useState<'aprovar' | 'rejeitar'>('aprovar')
  const [dataAprovacao, setDataAprovacao] = useState(new Date().toISOString().slice(0, 10)); const [motivoRejeicao, setMotivoRejeicao] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<OPMin>(`/tenant/despesas/ordens-pagamento/${params.id}`).then(setOp).catch((err) => setError(err.message)) }, [params.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      if (acao === 'aprovar') await api(`/tenant/despesas/ordens-pagamento/${params.id}/aprovar`, { method: 'POST', body: JSON.stringify({ dataAprovacao }) })
      else await api(`/tenant/despesas/ordens-pagamento/${params.id}/rejeitar`, { method: 'POST', body: JSON.stringify({ motivo: motivoRejeicao }) })
      router.push(`/tenant/despesas/ordens-pagamento/${params.id}`)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  if (!op) return <div className="p-10 text-carvao-500">Carregando...</div>
  if (op.status !== 'aguardando_aprovacao') return (<div className="p-10 max-w-2xl mx-auto"><div className="card p-6"><div className="font-display text-xl mb-2">OP nao aguarda aprovacao</div><p className="text-sm text-carvao-700">Status: <strong>{op.status.replace(/_/g, ' ')}</strong></p><Link href={`/tenant/despesas/ordens-pagamento/${params.id}`} className="btn-primary mt-4 inline-flex">Voltar</Link></div></div>)

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href={`/tenant/despesas/ordens-pagamento/${params.id}`} className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← OP {op.numero}</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Decisao sobre OP</h1>
      <div className="card p-5 mb-6 bg-areia-50/30"><div className="font-mono text-xs text-carvao-500 mb-1">{op.numero}</div><div className="text-2xl font-display tabular mb-2">{formatBRL(op.valor)}</div><div className="text-xs text-carvao-700"><div>Empenho <span className="font-mono">{op.empenhoNumero}</span></div><div className="mt-1 line-clamp-2">{op.empenhoObjeto}</div><div className="mt-2">{op.fornecedorNome}</div></div></div>
      <form onSubmit={submit} className="card p-6 space-y-5">
        <div><label className="label">Decisao</label><div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setAcao('aprovar')} className={`card p-4 cursor-pointer text-left border-2 ${acao === 'aprovar' ? 'border-verde-500 bg-verde-50/30' : 'border-carvao-100'}`}><div className="font-display text-lg text-verde-800">Aprovar</div><div className="text-xs text-carvao-600 mt-1">Autorizar pagamento</div></button>
          <button type="button" onClick={() => setAcao('rejeitar')} className={`card p-4 cursor-pointer text-left border-2 ${acao === 'rejeitar' ? 'border-red-500 bg-red-50/30' : 'border-carvao-100'}`}><div className="font-display text-lg text-red-800">Rejeitar</div><div className="text-xs text-carvao-600 mt-1">Bloquear pagamento</div></button>
        </div></div>
        {acao === 'aprovar' ? (<div><label className="label">Data da aprovacao <span className="text-red-600">*</span></label><input type="date" required value={dataAprovacao} onChange={(e) => setDataAprovacao(e.target.value)} className="input" /></div>
        ) : (<div><label className="label">Motivo da rejeicao <span className="text-red-600">*</span></label><textarea required value={motivoRejeicao} onChange={(e) => setMotivoRejeicao(e.target.value)} rows={3} minLength={20} maxLength={2000} className="input" /><div className="mt-1 text-[10px] text-carvao-500">{motivoRejeicao.length}/20 min</div></div>)}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3"><Link href={`/tenant/despesas/ordens-pagamento/${params.id}`} className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || (acao === 'rejeitar' && motivoRejeicao.length < 20)} className={acao === 'aprovar' ? 'btn-primary' : 'btn-primary bg-red-700 hover:bg-red-800'}>{loading ? 'Processando...' : acao === 'aprovar' ? 'Aprovar' : 'Rejeitar'}</button></div>
      </form>
    </div>
  )
}
