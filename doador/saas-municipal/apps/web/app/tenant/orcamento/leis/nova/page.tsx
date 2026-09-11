'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'

export default function NovaLeiPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [tipo, setTipo] = useState<'ppa' | 'loa'>((params.get('tipo') as 'ppa' | 'loa') || 'loa')
  const [numero, setNumero] = useState('')
  const [descricao, setDescricao] = useState('')
  const [anoInicio, setAnoInicio] = useState(new Date().getFullYear())
  const [anoFim, setAnoFim] = useState(new Date().getFullYear())
  const [valorTotal, setValorTotal] = useState('')
  const [dataSancao, setDataSancao] = useState('')
  const [ppaVigenteId, setPpaVigenteId] = useState('')
  const [ppas, setPpas] = useState<Array<{ id: string; numero: string; anoInicio: number; anoFim: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tipo === 'ppa') setAnoFim(anoInicio + 3)
    else { setAnoFim(anoInicio); api<typeof ppas>('/tenant/orcamento/leis?tipo=ppa').then(setPpas).catch(() => {}) }
  }, [tipo, anoInicio])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const body: Record<string, unknown> = { tipo, numero, descricao, anoInicio, anoFim }
      if (valorTotal) body.valorTotal = Number(valorTotal.replace(',', '.'))
      if (dataSancao) body.dataSancao = dataSancao
      if (tipo === 'loa' && ppaVigenteId) body.ppaVigenteId = ppaVigenteId
      const r = await api<{ id: string }>('/tenant/orcamento/leis', { method: 'POST', body: JSON.stringify(body) })
      router.push(`/tenant/orcamento/leis/${r.id}` as Route)
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/orcamento/leis" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Leis</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Nova lei orcamentaria</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-3">
            {(['ppa', 'loa'] as const).map((t) => (
              <label key={t} className={`card p-4 cursor-pointer border-2 ${tipo === t ? 'border-verde-500 bg-verde-50/30' : 'border-carvao-100'}`}>
                <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                <div className="font-display text-lg">{t === 'ppa' ? 'PPA' : 'LOA'}</div>
                <div className="text-xs text-carvao-600 mt-1">{t === 'ppa' ? '4 anos. Programas e diretrizes.' : '1 ano. Dotacoes executaveis.'}</div>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Numero da lei</label><input type="text" required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: Lei 1950/2025" className="input" maxLength={50} /></div>
          <div><label className="label">Data sancao</label><input type="date" value={dataSancao} onChange={(e) => setDataSancao(e.target.value)} className="input" /></div>
        </div>
        <div><label className="label">Descricao</label><input type="text" required value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input" maxLength={300} /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Ano inicio</label><input type="number" required value={anoInicio} onChange={(e) => setAnoInicio(Number(e.target.value))} min={2000} max={2100} className="input tabular" /></div>
          <div><label className="label">Ano fim</label><input type="number" value={anoFim} disabled className="input tabular bg-carvao-50" /></div>
          <div><label className="label">Valor total (R$)</label><input type="text" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0,00" className="input tabular" /></div>
        </div>
        {tipo === 'loa' && ppas.length > 0 && (
          <div><label className="label">PPA vigente</label>
            <select value={ppaVigenteId} onChange={(e) => setPpaVigenteId(e.target.value)} className="input">
              <option value="">-- sem vinculo --</option>
              {ppas.map((p) => <option key={p.id} value={p.id}>{p.numero} ({p.anoInicio}-{p.anoFim})</option>)}
            </select></div>
        )}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/tenant/orcamento/leis" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || !numero || !descricao} className="btn-primary">{loading ? 'Criando...' : 'Criar lei'}</button>
        </div>
      </form>
    </div>
  )
}
