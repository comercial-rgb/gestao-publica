'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import clsx from 'clsx'

interface NaturezaNode {
  id: string
  codigoCompleto: string
  descricao: string
  nivel: number
  analitica: boolean
  identificadorMsc: string | null
  ativo: boolean
  children: NaturezaNode[]
}

export default function NaturezasPage() {
  const [tree, setTree] = useState<NaturezaNode[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      const r = await api<NaturezaNode[]>('/tenant/receitas/naturezas/tree')
      setTree(r)
      setExpanded(new Set(r.map((n) => n.id)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => { load() }, [])

  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpanded(next)
  }

  function expandAll() {
    const all = new Set<string>()
    const collect = (n: NaturezaNode) => { all.add(n.id); n.children.forEach(collect) }
    tree.forEach(collect)
    setExpanded(all)
  }

  function hasMatch(n: NaturezaNode): boolean {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    if (n.descricao.toLowerCase().includes(s) || n.codigoCompleto.includes(s)) return true
    return n.children.some(hasMatch)
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <header className="flex items-end justify-between border-b border-carvao-200 pb-6 mb-8">
        <div>
          <Link href="/tenant/receitas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Receitas</Link>
          <h1 className="font-display text-4xl tracking-tight mt-3">Naturezas de Receita</h1>
          <p className="text-sm text-carvao-600 mt-2">Plano de Contas — PCASP</p>
        </div>
      </header>

      <div className="flex items-center gap-3 mb-6">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código ou descrição…" className="input max-w-md" />
        <div className="ml-auto flex gap-2 text-xs">
          <button onClick={expandAll} className="text-carvao-600 hover:text-verde-700 underline">expandir tudo</button>
          <button onClick={() => setExpanded(new Set())} className="text-carvao-600 hover:text-verde-700 underline">recolher</button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="card overflow-hidden divide-y divide-carvao-50">
        {tree.filter(hasMatch).map((n) => (
          <TreeNode key={n.id} node={n} depth={0} expanded={expanded} onToggle={toggle} search={search} />
        ))}
        {tree.length === 0 && (
          <div className="px-6 py-12 text-center text-carvao-500">Nenhuma natureza. Rode <code className="font-mono text-xs">pnpm db:seed:pcasp-pr</code></div>
        )}
      </div>
    </div>
  )
}

function TreeNode({ node, depth, expanded, onToggle, search }: {
  node: NaturezaNode; depth: number; expanded: Set<string>; onToggle: (id: string) => void; search: string
}) {
  const isOpen = expanded.has(node.id)
  const hasChildren = node.children.length > 0

  return (
    <>
      <div className={clsx('flex items-center gap-3 px-4 py-2.5 hover:bg-areia-50', !node.ativo && 'opacity-40')}
        style={{ paddingLeft: `${16 + depth * 24}px` }}>
        <button onClick={() => hasChildren && onToggle(node.id)}
          className={clsx('w-5 h-5 flex items-center justify-center text-xs font-mono rounded', hasChildren ? 'text-carvao-700 hover:bg-carvao-100' : 'text-carvao-300')}
          disabled={!hasChildren}>
          {hasChildren ? (isOpen ? '−' : '+') : '·'}
        </button>
        <span className="font-mono text-xs text-carvao-500 tabular w-32 shrink-0">{node.codigoCompleto}</span>
        <span className={clsx('text-sm flex-1', node.analitica ? 'text-carvao-900' : 'text-carvao-700 font-medium')}>{node.descricao}</span>
        {node.analitica && <span className="badge bg-verde-100 text-verde-800 font-mono text-[10px]">analítica</span>}
        {node.identificadorMsc && <span className="badge bg-areia-100 text-areia-800 font-mono text-[10px]">{node.identificadorMsc}</span>}
      </div>
      {isOpen && hasChildren && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} search={search} />
      ))}
    </>
  )
}
