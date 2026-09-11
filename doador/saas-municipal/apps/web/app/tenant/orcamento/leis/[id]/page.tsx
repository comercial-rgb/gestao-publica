'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'

interface LeiDetalhe { id: string; tipo: string; numero: string; descricao: string; anoInicio: number; anoFim: number; status: string; valorTotal: string | null; estatisticas: { qtdProgramas: number; qtdAcoes: number; qtdDotacoes: number; valorDotacoesAtualizado: string } }
interface Dotacao { id: string; classificacaoCompleta: string; entidadeNome: string; programaCodigo: string; programaNome: string; acaoCodigo: string; fonteCodigo: string; valorAtualizado: string; valorEmpenhado: string }

export default function LeiDetalhePage() {
  const params = useParams<{ id: string }>()
  const [lei, setLei] = useState<LeiDetalhe | null>(null)
  const [dotacoes, setDotacoes] = useState<Dotacao[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadLei() { try { setError(null); setLei(await api(`/tenant/orcamento/leis/${params.id}`)) } catch (err) { setError((err as Error).message) } }
  const loadDotacoes = useCallback(async (cursor?: string) => {
    try { setLoading(true)
      const qs = new URLSearchParams(); qs.set('leiOrcamentariaId', params.id); qs.set('limit', '25')
      if (cursor) qs.set('cursor', cursor); if (search) qs.set('search', search)
      const r = await api<{ items: Dotacao[]; pagination: { nextCursor: string | null } }>(`/tenant/orcamento/dotacoes?${qs}`)
      if (cursor) setDotacoes((prev) => [...prev, ...r.items]); else setDotacoes(r.items)
      setNextCursor(r.pagination.nextCursor)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }, [params.id, search])

  useEffect(() => { loadLei() }, [params.id])
  useEffect(() => { loadDotacoes() }, [loadDotacoes])

  if (!lei) return <div className="p-10 text-carvao-500">Carregando...</div>

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/orcamento/leis" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Leis</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={`badge font-mono text-[10px] ${lei.tipo === 'ppa' ? 'bg-verde-100 text-verde-800' : 'bg-areia-200 text-areia-800'}`}>{lei.tipo.toUpperCase()}</span>
          <span className="font-mono text-xs text-carvao-500">{lei.numero}</span>
        </div>
        <h1 className="font-display text-3xl tracking-tight">{lei.descricao}</h1>
        <p className="text-sm text-carvao-600 mt-2">Vigencia {lei.anoInicio === lei.anoFim ? lei.anoInicio : `${lei.anoInicio}-${lei.anoFim}`} - {lei.status}</p>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <MetricCard label="Valor declarado" value={formatBRL(lei.valorTotal ?? '0')} />
        <MetricCard label="Dotacoes" value={lei.estatisticas.qtdDotacoes.toLocaleString('pt-BR')} hint={`${lei.estatisticas.qtdProgramas} programas`} />
        <MetricCard label="Total dotacoes" value={formatBRL(lei.estatisticas.valorDotacoesAtualizado)} tone="positive" />
        <MetricCard label="Cobertura" value={lei.valorTotal ? formatPercentual((Number(lei.estatisticas.valorDotacoesAtualizado) / Number(lei.valorTotal)) * 100) : '--'} />
      </div>

      {lei.tipo === 'loa' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar classificacao..." className="input flex-1 max-w-md font-mono" />
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                <tr><th className="text-left px-4 py-3 font-semibold">Classificacao</th><th className="text-left px-4 py-3 font-semibold">Programa / Acao</th><th className="text-right px-4 py-3 font-semibold">Atualizado</th><th className="text-right px-4 py-3 font-semibold">Empenhado</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-carvao-100">
                {dotacoes.length === 0 && !loading && <tr><td colSpan={5} className="text-center text-carvao-500 py-12">Nenhuma dotacao.</td></tr>}
                {dotacoes.map((d) => (
                  <tr key={d.id} className="hover:bg-areia-50">
                    <td className="px-4 py-3"><div className="font-mono text-xs text-carvao-700">{d.classificacaoCompleta}</div><div className="text-[10px] text-carvao-500 mt-0.5">{d.entidadeNome} - Fonte {d.fonteCodigo}</div></td>
                    <td className="px-4 py-3"><div className="font-mono text-[10px] text-carvao-500">{d.programaCodigo}.{d.acaoCodigo}</div><div className="text-xs text-carvao-900">{d.programaNome}</div></td>
                    <td className="px-4 py-3 text-right tabular font-medium">{formatBRL(d.valorAtualizado)}</td>
                    <td className="px-4 py-3 text-right tabular text-carvao-700">{formatBRL(d.valorEmpenhado)}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/tenant/orcamento/dotacoes/${d.id}` as Route} className="text-xs text-verde-700 hover:underline">saldo →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nextCursor && <div className="border-t border-carvao-100 p-4 text-center"><button onClick={() => loadDotacoes(nextCursor)} disabled={loading} className="btn-secondary">{loading ? 'Carregando...' : 'Carregar mais 25'}</button></div>}
          </div>
        </>
      )}
    </div>
  )
}
