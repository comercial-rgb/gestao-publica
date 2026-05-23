'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

interface Natureza { id: string; codigoCompleto: string; descricao: string }
interface Entidade { id: string; nome: string; tipo: string }

export default function NovoTipoPage() {
  const router = useRouter()
  const [naturezaSearch, setNaturezaSearch] = useState('')
  const [naturezas, setNaturezas] = useState<Natureza[]>([])
  const [entidades, setEntidades] = useState<Entidade[]>([])
  const [naturezaId, setNaturezaId] = useState('')
  const [entidadeId, setEntidadeId] = useState('')
  const [fonteRecurso, setFonteRecurso] = useState('0.1.00')
  const [descricaoLocal, setDescricaoLocal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buscarNaturezas() {
    try {
      const r = await api<{ items: Natureza[] }>(`/tenant/receitas/naturezas?analitica=true&search=${encodeURIComponent(naturezaSearch)}&limit=20`)
      setNaturezas(r.items)
    } catch (err) { setError((err as Error).message) }
  }

  useEffect(() => {
    api<Entidade[]>('/tenant/entidades').then(setEntidades).catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await api('/tenant/receitas/tipos', {
        method: 'POST',
        body: JSON.stringify({ naturezaId, entidadeId, fonteRecurso: fonteRecurso || undefined, descricaoLocal: descricaoLocal || undefined }),
      })
      router.push('/tenant/receitas/tipos')
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/receitas/tipos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Tipos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Novo tipo de receita</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div>
          <label className="label">Natureza (PCASP)</label>
          <div className="flex gap-2">
            <input type="text" value={naturezaSearch} onChange={(e) => setNaturezaSearch(e.target.value)}
              placeholder="Ex: IPTU, ISS, 1.1.1.8" className="input flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarNaturezas() } }} />
            <button type="button" onClick={buscarNaturezas} className="btn-secondary">Buscar</button>
          </div>
          {naturezas.length > 0 && (
            <div className="mt-2 border border-carvao-200 rounded-md max-h-60 overflow-auto">
              {naturezas.map((n) => (
                <button key={n.id} type="button"
                  onClick={() => { setNaturezaId(n.id); setNaturezaSearch(`${n.codigoCompleto} — ${n.descricao}`); setNaturezas([]) }}
                  className="w-full text-left px-3 py-2 hover:bg-areia-50 text-sm border-b border-carvao-50 last:border-0">
                  <div className="font-mono text-xs text-carvao-500">{n.codigoCompleto}</div>
                  <div className="text-carvao-900">{n.descricao}</div>
                </button>
              ))}
            </div>
          )}
          {naturezaId && <div className="mt-1 text-xs text-verde-700 font-mono">selecionado</div>}
        </div>
        <div>
          <label className="label">Entidade gestora</label>
          <select value={entidadeId} onChange={(e) => setEntidadeId(e.target.value)} required className="input">
            <option value="">— escolha —</option>
            {entidades.map((e) => <option key={e.id} value={e.id}>{e.nome} ({e.tipo})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Fonte de recurso</label><input type="text" value={fonteRecurso} onChange={(e) => setFonteRecurso(e.target.value)} className="input font-mono" maxLength={10} /></div>
          <div><label className="label">Descrição local</label><input type="text" value={descricaoLocal} onChange={(e) => setDescricaoLocal(e.target.value)} className="input" maxLength={200} /></div>
        </div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/tenant/receitas/tipos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || !naturezaId || !entidadeId} className="btn-primary">{loading ? 'Salvando…' : 'Criar tipo'}</button>
        </div>
      </form>
    </div>
  )
}
