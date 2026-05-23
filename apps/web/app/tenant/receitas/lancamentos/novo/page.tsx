'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

interface Exercicio { id: string; ano: number; status: string }
interface TipoReceita { id: string; naturezaCodigo: string; naturezaDescricao: string; entidadeNome: string }

export default function NovoLancamentoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preTipoId = searchParams.get('tipoId')

  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [tipos, setTipos] = useState<TipoReceita[]>([])
  const [exercicioId, setExercicioId] = useState('')
  const [tipoReceitaId, setTipoReceitaId] = useState(preTipoId || '')
  const [valor, setValor] = useState('')
  const [memoriaCalculo, setMemoriaCalculo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Exercicio[]>('/tenant/fiscal/exercicios').then((list) => {
      setExercicios(list)
      const aberto = list.find((e) => e.status === 'aberto')
      if (aberto) setExercicioId(aberto.id)
    }).catch(() => {})
    api<TipoReceita[]>('/tenant/receitas/tipos?ativo=true').then(setTipos).catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await api('/tenant/receitas/lancamentos', {
        method: 'POST',
        body: JSON.stringify({
          exercicioId,
          tipoReceitaId,
          valorPrevistoInicial: Number(valor.replace(',', '.')),
          memoriaCalculo: memoriaCalculo || undefined,
        }),
      })
      router.push('/tenant/receitas/lancamentos')
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/receitas/lancamentos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Lançamentos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Novo lançamento de receita</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div>
          <label className="label">Exercício</label>
          <select value={exercicioId} onChange={(e) => setExercicioId(e.target.value)} required className="input">
            <option value="">— escolha —</option>
            {exercicios.filter((e) => e.status !== 'encerrado').map((e) => <option key={e.id} value={e.id}>{e.ano} ({e.status})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tipo de receita</label>
          <select value={tipoReceitaId} onChange={(e) => setTipoReceitaId(e.target.value)} required className="input">
            <option value="">— escolha —</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.naturezaCodigo} — {t.naturezaDescricao} ({t.entidadeNome})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Valor previsto (R$)</label>
          <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} required className="input font-mono tabular" placeholder="0,00" />
        </div>
        <div>
          <label className="label">Memória de cálculo</label>
          <textarea value={memoriaCalculo} onChange={(e) => setMemoriaCalculo(e.target.value)} className="input min-h-[80px]" maxLength={2000}
            placeholder="Base: arrecadação do exercício anterior + índice de correção…" />
        </div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/tenant/receitas/lancamentos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || !exercicioId || !tipoReceitaId || !valor} className="btn-primary">{loading ? 'Salvando…' : 'Criar lançamento'}</button>
        </div>
      </form>
    </div>
  )
}
