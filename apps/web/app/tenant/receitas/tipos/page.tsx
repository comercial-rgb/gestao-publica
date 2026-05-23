'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import clsx from 'clsx'

interface TipoReceita {
  id: string; naturezaCodigo: string; naturezaDescricao: string
  entidadeNome: string; codigoInterno: string | null
  descricaoLocal: string | null; fonteRecurso: string | null; ativo: boolean
}

export default function TiposPage() {
  const [tipos, setTipos] = useState<TipoReceita[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setError(null); setTipos(await api<TipoReceita[]>('/tenant/receitas/tipos')) }
    catch (err) { setError((err as Error).message) }
  }

  useEffect(() => { load() }, [])

  async function toggleAtivo(t: TipoReceita) {
    try { await api(`/tenant/receitas/tipos/${t.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !t.ativo }) }); load() }
    catch (err) { setError((err as Error).message) }
  }

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <Link href="/tenant/receitas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Receitas</Link>
          <h1 className="font-display text-4xl tracking-tight mt-3">Tipos de Receita</h1>
          <p className="text-sm text-carvao-600 mt-2">Vincula natureza analítica PCASP a entidade gestora.</p>
        </div>
        <Link href="/tenant/receitas/tipos/novo" className="btn-primary">+ Novo tipo</Link>
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Natureza</th>
              <th className="text-left px-4 py-3 font-semibold">Entidade</th>
              <th className="text-left px-4 py-3 font-semibold">Fonte</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carvao-100">
            {tipos.length === 0 && <tr><td colSpan={5} className="text-center text-carvao-500 py-12">Nenhum tipo cadastrado.</td></tr>}
            {tipos.map((t) => (
              <tr key={t.id} className="hover:bg-areia-50">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-carvao-500">{t.naturezaCodigo}</div>
                  <div className="text-carvao-900">{t.descricaoLocal || t.naturezaDescricao}</div>
                </td>
                <td className="px-4 py-3 text-carvao-700">{t.entidadeNome}</td>
                <td className="px-4 py-3 font-mono text-xs text-carvao-700">{t.fonteRecurso || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleAtivo(t)} className={clsx('badge font-mono cursor-pointer', t.ativo ? 'bg-verde-700 text-white' : 'bg-carvao-200 text-carvao-700')}>
                    {t.ativo ? 'ativo' : 'inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/tenant/receitas/lancamentos/novo?tipoId=${t.id}`} className="text-xs text-verde-700 hover:underline">lançar →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
