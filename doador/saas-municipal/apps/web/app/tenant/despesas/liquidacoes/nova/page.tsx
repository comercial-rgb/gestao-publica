'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface EmpOp { id: string; numero: string; valor: string; valorAnulado: string; valorLiquidado: string; saldoALiquidar: string; objeto: string; fornecedorNome: string }

export default function NovaLiquidacaoPage() {
  const router = useRouter(); const params = useSearchParams(); const empenhoIdInicial = params.get('empenhoId') || ''
  const [empenhoId, setEmpenhoId] = useState(empenhoIdInicial); const [emp, setEmp] = useState<EmpOp | null>(null)
  const [searchEmp, setSearchEmp] = useState(''); const [empList, setEmpList] = useState<Array<Record<string, unknown>>>([])
  const [dataLiquidacao, setDataLiquidacao] = useState(new Date().toISOString().slice(0, 10)); const [valor, setValor] = useState('')
  const [documentoComprovante, setDocumentoComprovante] = useState(''); const [dataDocumento, setDataDocumento] = useState(''); const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (empenhoIdInicial) api<EmpOp>(`/tenant/despesas/empenhos/${empenhoIdInicial}`).then(setEmp).catch(() => {}) }, [empenhoIdInicial])
  async function buscarEmp() { try { const r = await api<{ items: Array<Record<string, unknown>> }>(`/tenant/despesas/empenhos?limit=20&status=vigente${searchEmp ? `&search=${searchEmp}` : ''}`); setEmpList(r.items) } catch (err) { setError((err as Error).message) } }
  async function selEmp(e: Record<string, unknown>) { setEmpenhoId(String(e.id)); setEmpList([]); setEmp(await api<EmpOp>(`/tenant/despesas/empenhos/${e.id}`)) }

  const valorNum = valor ? Number(valor.replace(',', '.')) : 0; const ultrapassa = emp && valorNum > Number(emp.saldoALiquidar)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try { const r = await api<{ id: string }>('/tenant/despesas/liquidacoes', { method: 'POST', body: JSON.stringify({ empenhoId, dataLiquidacao, valor: valorNum, documentoComprovante: documentoComprovante || undefined, dataDocumento: dataDocumento || undefined, observacoes: observacoes || undefined }) }); router.push(`/tenant/despesas/empenhos/${empenhoId}`) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/despesas/liquidacoes" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Liquidacoes</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Nova liquidacao</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div><label className="label">Empenho <span className="text-red-600">*</span></label>
          {emp ? (<div className="card p-4 border-verde-300 bg-verde-50/30"><div className="font-mono text-xs">{emp.numero}</div><div className="text-xs text-carvao-700 mt-1">{emp.objeto}</div><div className="text-xs text-verde-700 mt-2 font-medium">Saldo a liquidar: {formatBRL(emp.saldoALiquidar)}</div><button type="button" onClick={() => { setEmp(null); setEmpenhoId('') }} className="text-xs text-red-600 hover:underline mt-2">trocar</button></div>
          ) : (<div><div className="flex gap-2"><input value={searchEmp} onChange={(e) => setSearchEmp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarEmp())} placeholder="Numero, objeto..." className="input flex-1" /><button type="button" onClick={buscarEmp} className="btn-secondary">Buscar</button></div>
            {empList.length > 0 && <div className="mt-2 border border-carvao-200 rounded-md max-h-60 overflow-auto">{empList.map((e) => (<button key={String(e.id)} type="button" onClick={() => selEmp(e)} className="w-full text-left px-3 py-2 hover:bg-areia-50 border-b border-carvao-50 last:border-0"><div className="font-mono text-xs">{String(e.numero)}</div><div className="text-xs text-carvao-700 line-clamp-1">{String(e.objeto)}</div></button>))}</div>}</div>)}</div>
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Valor (R$) <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular text-lg" placeholder="0,00" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo</div>}</div><div><label className="label">Data <span className="text-red-600">*</span></label><input type="date" required value={dataLiquidacao} onChange={(e) => setDataLiquidacao(e.target.value)} className="input" /></div></div>
        <div className="grid grid-cols-2 gap-4"><div><label className="label">Documento (NF/recibo)</label><input value={documentoComprovante} onChange={(e) => setDocumentoComprovante(e.target.value)} className="input" /></div><div><label className="label">Data doc.</label><input type="date" value={dataDocumento} onChange={(e) => setDataDocumento(e.target.value)} className="input" /></div></div>
        <div><label className="label">Observacoes</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={2000} className="input" /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100"><Link href="/tenant/despesas/liquidacoes" className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !empenhoId || !valor || !!ultrapassa} className="btn-primary">{loading ? 'Liquidando...' : 'Liquidar'}</button></div>
      </form>
    </div>
  )
}
