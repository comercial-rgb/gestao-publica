'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface Dotacao { id: string; classificacaoCompleta: string; programaNome: string; valorAtualizado: string; valorEmpenhado: string; valorReservado: string }
interface Pessoa { id: string; nome: string; documento: string | null }
interface Agrupador { id: string; descricao: string; numeroExterno: string | null }

export default function NovoEmpenhoPage() {
  const router = useRouter()
  const [dotacaoId, setDotacaoId] = useState(''); const [fornecedorPessoaId, setFornecedorPessoaId] = useState(''); const [agrupadorId, setAgrupadorId] = useState('')
  const [dataEmpenho, setDataEmpenho] = useState(new Date().toISOString().slice(0, 10)); const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<'ordinario' | 'global' | 'estimativo'>('ordinario'); const [objeto, setObjeto] = useState(''); const [observacoes, setObservacoes] = useState('')
  const [contratoNumero, setContratoNumero] = useState(''); const [contratoModalidade, setContratoModalidade] = useState(''); const [contratoProcesso, setContratoProcesso] = useState('')
  const [searchDot, setSearchDot] = useState(''); const [dotacoes, setDotacoes] = useState<Dotacao[]>([]); const [dotSel, setDotSel] = useState<Dotacao | null>(null)
  const [searchForn, setSearchForn] = useState(''); const [fornecedores, setFornecedores] = useState<Pessoa[]>([]); const [fornSel, setFornSel] = useState<Pessoa | null>(null)
  const [agrupadores, setAgrupadores] = useState<Agrupador[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { api<Agrupador[]>('/tenant/despesas/agrupadores?ativo=true').then(setAgrupadores).catch(() => {}) }, [])

  async function buscarDot() { try { const r = await api<{ items: Dotacao[] }>(`/tenant/orcamento/dotacoes?limit=20${searchDot ? `&search=${searchDot}` : ''}`); setDotacoes(r.items) } catch (err) { setError((err as Error).message) } }
  async function buscarForn() { try { const r = await api<{ items: Pessoa[] }>(`/tenant/pessoas?limit=20${searchForn ? `&search=${searchForn}` : ''}`); setFornecedores(r.items) } catch (err) { setError((err as Error).message) } }

  const saldo = dotSel ? Number(dotSel.valorAtualizado) - Number(dotSel.valorEmpenhado) - Number(dotSel.valorReservado) : 0
  const valorNum = valor ? Number(valor.replace(',', '.')) : 0
  const ultrapassa = dotSel && valorNum > saldo

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const body: Record<string, unknown> = { dotacaoId, fornecedorPessoaId, dataEmpenho, valor: valorNum, tipo, objeto }
      if (agrupadorId) body.agrupadorId = agrupadorId; if (observacoes) body.observacoes = observacoes
      if (contratoNumero || contratoModalidade || contratoProcesso) body.contratoReferencia = { numero: contratoNumero || undefined, modalidade: contratoModalidade || undefined, processoLicitatorio: contratoProcesso || undefined }
      const r = await api<{ id: string }>('/tenant/despesas/empenhos', { method: 'POST', body: JSON.stringify(body) })
      router.push(`/tenant/despesas/empenhos/${r.id}`)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <Link href="/tenant/despesas/empenhos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Empenhos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Novo empenho</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div>
          <label className="label">Dotacao <span className="text-red-600">*</span></label>
          {dotSel ? (
            <div className="card p-4 border-verde-300 bg-verde-50/30"><div className="flex items-start justify-between"><div><div className="font-mono text-xs text-carvao-800">{dotSel.classificacaoCompleta}</div><div className="text-xs text-carvao-600 mt-1">{dotSel.programaNome}</div><div className="text-xs text-verde-700 mt-1 font-medium">Saldo: {formatBRL(saldo.toFixed(2))}</div></div>
              <button type="button" onClick={() => { setDotSel(null); setDotacaoId('') }} className="text-xs text-red-600 hover:underline">trocar</button></div></div>
          ) : (<div><div className="flex gap-2"><input value={searchDot} onChange={(e) => setSearchDot(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarDot())} placeholder="Classificacao..." className="input flex-1 font-mono" /><button type="button" onClick={buscarDot} className="btn-secondary">Buscar</button></div>
            {dotacoes.length > 0 && <div className="mt-2 border border-carvao-200 rounded-md max-h-72 overflow-auto">{dotacoes.map((d) => { const s = Number(d.valorAtualizado) - Number(d.valorEmpenhado) - Number(d.valorReservado); return (<button key={d.id} type="button" onClick={() => { setDotacaoId(d.id); setDotSel(d); setDotacoes([]) }} className="w-full text-left px-3 py-2 hover:bg-areia-50 border-b border-carvao-50 last:border-0"><div className="font-mono text-[11px] text-carvao-800">{d.classificacaoCompleta}</div><div className="text-[10px] text-carvao-500 mt-0.5">{d.programaNome} - saldo: {formatBRL(s.toFixed(2))}</div></button>) })}</div>}</div>)}
        </div>
        <div>
          <label className="label">Fornecedor <span className="text-red-600">*</span></label>
          {fornSel ? (
            <div className="card p-4 border-verde-300 bg-verde-50/30"><div className="flex items-start justify-between"><div><div className="text-sm text-carvao-900">{fornSel.nome}</div>{fornSel.documento && <div className="font-mono text-[10px] text-carvao-500 mt-0.5">{fornSel.documento}</div>}</div>
              <button type="button" onClick={() => { setFornSel(null); setFornecedorPessoaId('') }} className="text-xs text-red-600 hover:underline">trocar</button></div></div>
          ) : (<div><div className="flex gap-2"><input value={searchForn} onChange={(e) => setSearchForn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarForn())} placeholder="Nome ou CNPJ..." className="input flex-1" /><button type="button" onClick={buscarForn} className="btn-secondary">Buscar</button></div>
            {fornecedores.length > 0 && <div className="mt-2 border border-carvao-200 rounded-md max-h-60 overflow-auto">{fornecedores.map((p) => (<button key={p.id} type="button" onClick={() => { setFornecedorPessoaId(p.id); setFornSel(p); setFornecedores([]) }} className="w-full text-left px-3 py-2 hover:bg-areia-50 border-b border-carvao-50 last:border-0"><div className="text-sm text-carvao-800">{p.nome}</div>{p.documento && <div className="font-mono text-[10px] text-carvao-500">{p.documento}</div>}</button>))}</div>}</div>)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Valor (R$) <span className="text-red-600">*</span></label><input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="input tabular text-lg" />{ultrapassa && <div className="mt-1 text-xs text-red-700">Excede saldo</div>}</div>
          <div><label className="label">Data <span className="text-red-600">*</span></label><input type="date" required value={dataEmpenho} onChange={(e) => setDataEmpenho(e.target.value)} className="input" /></div>
          <div><label className="label">Tipo</label><select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="input"><option value="ordinario">Ordinario</option><option value="global">Global</option><option value="estimativo">Estimativo</option></select></div>
        </div>
        <div><label className="label">Objeto <span className="text-red-600">*</span></label><textarea required value={objeto} onChange={(e) => setObjeto(e.target.value)} rows={3} minLength={10} maxLength={2000} className="input" placeholder="Min 10 caracteres" /><div className="mt-1 text-[10px] text-carvao-500">{objeto.length}/10 min</div></div>
        {agrupadores.length > 0 && <div><label className="label">Agrupador</label><select value={agrupadorId} onChange={(e) => setAgrupadorId(e.target.value)} className="input"><option value="">-- sem --</option>{agrupadores.map((a) => <option key={a.id} value={a.id}>{a.descricao}</option>)}</select></div>}
        <details className="card p-4 bg-areia-50/30"><summary className="cursor-pointer text-xs uppercase tracking-wider text-carvao-600 font-semibold">Contrato (opcional)</summary>
          <div className="grid grid-cols-3 gap-3 mt-3"><div><label className="label">Numero</label><input value={contratoNumero} onChange={(e) => setContratoNumero(e.target.value)} className="input" /></div><div><label className="label">Modalidade</label><input value={contratoModalidade} onChange={(e) => setContratoModalidade(e.target.value)} className="input" /></div><div><label className="label">Processo</label><input value={contratoProcesso} onChange={(e) => setContratoProcesso(e.target.value)} className="input" /></div></div></details>
        <div><label className="label">Observacoes</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={2000} className="input" /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100"><Link href="/tenant/despesas/empenhos" className="btn-secondary">Cancelar</Link><button type="submit" disabled={loading || !dotacaoId || !fornecedorPessoaId || !valor || objeto.length < 10 || !!ultrapassa} className="btn-primary">{loading ? 'Empenhando...' : 'Empenhar'}</button></div>
      </form>
    </div>
  )
}
