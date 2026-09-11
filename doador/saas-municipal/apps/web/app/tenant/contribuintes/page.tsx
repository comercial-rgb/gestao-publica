'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatBRL, formatCpfCnpj, formatData } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import { SituacaoFiscalBadge } from '@/components/SituacaoFiscalBadge'
import clsx from 'clsx'

interface RankingItem {
  pessoaId: string; nome: string; documento: string; tipo: string
  totalArrecadado: string; totalAnulado: string; totalLiquido: string
  qtdArrecadacoes: number
  situacao: 'em_dia' | 'parcialmente_em_dia' | 'inadimplente' | 'sem_movimento'
  percentualPago: number; ultimaArrecadacao: string | null
}

interface RankingResponse {
  exercicio: number
  items: RankingItem[]
  pagination: { nextCursor: string | null; limit: number }
  totais: { contribuintesNoRanking: number; totalArrecadadoTodos: string; totalLiquidoTodos: string }
}

interface PessoaSearch { id: string; nome: string; documento: string; tipo: string }
type SituacaoFiltro = '' | 'em_dia' | 'parcialmente_em_dia' | 'inadimplente'

export default function ContribuintesPage() {
  const router = useRouter()
  const [exercicio, setExercicio] = useState(new Date().getFullYear())

  // Busca
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<PessoaSearch[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ranking
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [totais, setTotais] = useState<RankingResponse['totais'] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingRanking, setLoadingRanking] = useState(true)
  const [situacaoFiltro, setSituacaoFiltro] = useState<SituacaoFiltro>('')
  const [error, setError] = useState<string | null>(null)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const term = searchTerm.trim()
    if (term.length < 3) { setSearchResults([]); setSearchOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api<{ items: PessoaSearch[] }>(`/tenant/pessoas?search=${encodeURIComponent(term)}&limit=8`)
        setSearchResults(r.items); setSearchOpen(true)
      } catch { setSearchResults([]) }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchTerm])

  // Ranking loader
  const loadRanking = useCallback(async (cursor?: string) => {
    try {
      setLoadingRanking(true); setError(null)
      const qs = new URLSearchParams()
      qs.set('exercicio', String(exercicio)); qs.set('limit', '25')
      if (cursor) qs.set('cursor', cursor)
      if (situacaoFiltro) qs.set('situacao', situacaoFiltro)
      const r = await api<RankingResponse>(`/tenant/contribuintes?${qs}`)
      if (cursor) { setRanking((prev) => [...prev, ...r.items]) }
      else { setRanking(r.items); setTotais(r.totais) }
      setNextCursor(r.pagination.nextCursor)
    } catch (err) { setError((err as Error).message) }
    finally { setLoadingRanking(false) }
  }, [exercicio, situacaoFiltro])

  useEffect(() => { loadRanking() }, [loadRanking])

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="border-b border-carvao-200 pb-6 mb-8">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">Receitas · Contribuintes</div>
            <h1 className="font-display text-4xl tracking-tight mt-1">Contribuintes</h1>
            <p className="text-sm text-carvao-600 mt-2">Busca operacional + ranking do exercício {exercicio}.</p>
          </div>
          <select value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} className="input w-32">
            {[exercicio - 1, exercicio, exercicio + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      {/* Busca */}
      <div className="mb-10">
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Buscar contribuinte</div>
        <div className="relative">
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Digite nome, CPF ou CNPJ (mín. 3 caracteres)…"
            className="input text-lg py-3 pl-12" />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-carvao-400 font-mono text-lg">Q</div>
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 card overflow-hidden max-h-96 overflow-y-auto">
              {searchResults.map((p) => (
                <button key={p.id} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => router.push(`/tenant/pessoas/${p.id}/extrato?exercicio=${exercicio}`)}
                  className="w-full text-left px-4 py-3 hover:bg-areia-50 border-b border-carvao-50 last:border-0 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-carvao-900">{p.nome}</div>
                    <div className="text-xs font-mono text-carvao-500 mt-0.5">{formatCpfCnpj(p.documento)} · {p.tipo}</div>
                  </div>
                  <span className="text-xs text-verde-700">ver extrato →</span>
                </button>
              ))}
            </div>
          )}
          {searchOpen && searchTerm.length >= 3 && searchResults.length === 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 card px-4 py-6 text-center text-sm text-carvao-500">
              Nenhuma pessoa encontrada para &ldquo;{searchTerm}&rdquo;.
              <div className="mt-2"><Link href={'/tenant/pessoas' as Route} className="text-verde-700 underline text-xs">ir para Pessoas →</Link></div>
            </div>
          )}
        </div>
      </div>

      {/* Métricas */}
      {totais && (
        <div className="grid grid-cols-3 gap-4 mb-10">
          <MetricCard label="Contribuintes ativos" value={totais.contribuintesNoRanking.toLocaleString('pt-BR')} hint={`Que arrecadaram em ${exercicio}`} />
          <MetricCard label="Total arrecadado bruto" value={formatBRL(totais.totalArrecadadoTodos)} />
          <MetricCard label="Total líquido" value={formatBRL(totais.totalLiquidoTodos)} tone="positive" hint="Após anulações" />
        </div>
      )}

      {/* Ranking */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold">Ranking</div>
            <div className="font-display text-2xl mt-0.5">Top contribuintes do exercício</div>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-carvao-500">Filtrar:</span>
            {([['', 'Todos'], ['em_dia', 'Em dia'], ['parcialmente_em_dia', 'Parcial'], ['inadimplente', 'Inadimplente']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setSituacaoFiltro(val)}
                className={clsx('text-xs px-3 py-1 rounded-md border transition',
                  situacaoFiltro === val ? 'bg-carvao-900 text-white border-carvao-900' : 'bg-white text-carvao-700 border-carvao-200 hover:border-carvao-400')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold">Contribuinte</th>
                <th className="text-left px-4 py-3 font-semibold">Situação</th>
                <th className="text-right px-4 py-3 font-semibold">Arrecadado</th>
                <th className="text-right px-4 py-3 font-semibold">Líquido</th>
                <th className="text-right px-4 py-3 font-semibold">Qtd</th>
                <th className="text-right px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carvao-100">
              {loadingRanking && ranking.length === 0 && <tr><td colSpan={7} className="text-center text-carvao-400 py-12">Carregando…</td></tr>}
              {!loadingRanking && ranking.length === 0 && (
                <tr><td colSpan={7} className="text-center text-carvao-500 py-12">
                  Nenhum contribuinte no exercício {exercicio}{situacaoFiltro && ` com situação "${situacaoFiltro}"`}.
                </td></tr>
              )}
              {ranking.map((c, i) => (
                <tr key={c.pessoaId} className="hover:bg-areia-50">
                  <td className="px-4 py-3 text-carvao-500 tabular text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-carvao-900">{c.nome}</div>
                    <div className="text-xs font-mono text-carvao-500 mt-0.5">
                      {formatCpfCnpj(c.documento)} · {c.tipo}
                      {c.ultimaArrecadacao && <> · última: {formatData(c.ultimaArrecadacao)}</>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SituacaoFiscalBadge situacao={c.situacao} size="sm" />
                    <div className="text-[10px] text-carvao-500 tabular mt-1">{c.percentualPago.toFixed(1)}%</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular text-carvao-700">{formatBRL(c.totalArrecadado)}</td>
                  <td className="px-4 py-3 text-right tabular font-medium text-carvao-900">{formatBRL(c.totalLiquido)}</td>
                  <td className="px-4 py-3 text-right tabular text-carvao-700">{c.qtdArrecadacoes}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tenant/pessoas/${c.pessoaId}/extrato?exercicio=${exercicio}`} className="text-xs text-verde-700 hover:underline">extrato →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor && (
            <div className="border-t border-carvao-100 p-4 text-center">
              <button onClick={() => loadRanking(nextCursor)} disabled={loadingRanking} className="btn-secondary">
                {loadingRanking ? 'Carregando…' : 'Carregar mais 25'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
