'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL, formatPercentual } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'

interface Lei { id: string; tipo: 'ppa' | 'loa'; numero: string; descricao: string; anoInicio: number; anoFim: number; valorTotal: string | null; status: string }
interface LeiDetalhe extends Lei { estatisticas: { qtdProgramas: number; qtdAcoes: number; qtdDotacoes: number; valorDotacoesAtualizado: string } }

export default function OrcamentoDashboard() {
  const [leis, setLeis] = useState<Lei[]>([])
  const [loaAtual, setLoaAtual] = useState<LeiDetalhe | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      const list = await api<Lei[]>('/tenant/orcamento/leis')
      setLeis(list)
      const anoAtual = new Date().getFullYear()
      const loaCorrente = list.find((l) => l.tipo === 'loa' && l.anoInicio === anoAtual)
      if (loaCorrente) setLoaAtual(await api<LeiDetalhe>(`/tenant/orcamento/leis/${loaCorrente.id}`))
    } catch (err) { setError((err as Error).message) }
  }

  useEffect(() => { load() }, [])

  const ppas = leis.filter((l) => l.tipo === 'ppa')
  const loas = leis.filter((l) => l.tipo === 'loa').sort((a, b) => b.anoInicio - a.anoInicio)

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-carvao-500 font-semibold">Camada 2 · Registro</div>
          <h1 className="font-display text-4xl tracking-tight mt-1">Orcamento</h1>
          <p className="text-sm text-carvao-600 mt-2">PPA, LOA, dotacoes e creditos do municipio.</p>
        </div>
        <div className="flex gap-2">
          <Link href={'/tenant/orcamento/importar' as unknown as Route} className="btn-secondary">Importar JSON</Link>
          <Link href="/tenant/orcamento/leis/nova" className="btn-primary">+ Nova lei</Link>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      {loaAtual && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-3">LOA {loaAtual.anoInicio} — {loaAtual.numero}</div>
          <div className="grid grid-cols-4 gap-4 mb-10">
            <MetricCard label="Valor total LOA" value={formatBRL(loaAtual.valorTotal ?? '0')} hint={`Status: ${loaAtual.status}`} />
            <MetricCard label="Dotacoes atualizadas" value={formatBRL(loaAtual.estatisticas.valorDotacoesAtualizado)} hint={`${loaAtual.estatisticas.qtdDotacoes} dotacoes`} tone="positive" />
            <MetricCard label="Programas" value={loaAtual.estatisticas.qtdProgramas.toLocaleString('pt-BR')} hint={`${loaAtual.estatisticas.qtdAcoes} acoes`} />
            <MetricCard label="Cobertura" value={loaAtual.valorTotal ? formatPercentual((Number(loaAtual.estatisticas.valorDotacoesAtualizado) / Number(loaAtual.valorTotal)) * 100) : '--'} tone={loaAtual.valorTotal && Number(loaAtual.estatisticas.valorDotacoesAtualizado) / Number(loaAtual.valorTotal) >= 0.95 ? 'positive' : 'warning'} />
          </div>
        </>
      )}

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-2xl">PPAs</div>
          <Link href={'/tenant/orcamento/leis?tipo=ppa' as Route} className="text-xs text-verde-700 hover:underline">ver todos →</Link>
        </div>
        {ppas.length === 0 ? (
          <div className="card p-8 text-center text-carvao-500">Nenhum PPA cadastrado. <Link href={'/tenant/orcamento/leis/nova?tipo=ppa' as Route} className="btn-primary inline-flex ml-3">+ Criar PPA</Link></div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {ppas.map((p) => (
              <Link key={p.id} href={`/tenant/orcamento/leis/${p.id}` as Route} className="card p-4 border border-carvao-100 hover:border-verde-400 transition">
                <div className="font-mono text-xs text-carvao-500">{p.numero}</div>
                <div className="font-display text-lg mt-1">PPA {p.anoInicio}-{p.anoFim}</div>
                <div className="text-sm text-carvao-600 mt-1 line-clamp-2">{p.descricao}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-2xl">LOAs</div>
        </div>
        {loas.length === 0 ? (
          <div className="card p-8 text-center text-carvao-500">Nenhuma LOA cadastrada.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                <tr><th className="text-left px-4 py-3 font-semibold">Exercicio</th><th className="text-left px-4 py-3 font-semibold">Lei</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-left px-4 py-3 font-semibold">Status</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-carvao-100">
                {loas.slice(0, 5).map((l) => (
                  <tr key={l.id} className="hover:bg-areia-50">
                    <td className="px-4 py-3 font-display text-lg">{l.anoInicio}</td>
                    <td className="px-4 py-3"><div className="font-mono text-xs text-carvao-500">{l.numero}</div><div className="text-carvao-900">{l.descricao}</div></td>
                    <td className="px-4 py-3 text-right tabular">{formatBRL(l.valorTotal ?? '0')}</td>
                    <td className="px-4 py-3"><span className="badge bg-carvao-100 text-carvao-700 text-[10px]">{l.status}</span></td>
                    <td className="px-4 py-3 text-right"><Link href={`/tenant/orcamento/leis/${l.id}` as Route} className="text-xs text-verde-700 hover:underline">dotações →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
