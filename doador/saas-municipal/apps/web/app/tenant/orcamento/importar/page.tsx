'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface Lei { id: string; numero: string; descricao: string; anoInicio: number; tipo: string; ppaVigenteId: string | null }
interface Exercicio { id: string; ano: number; status: string }
interface PreviewResult { resolvidas: Array<{ linha: number; classificacaoCompleta: string; valorInicial: string; programaResolvido: string; acaoResolvida: string }>; comErro: Array<{ linha: number; codigo: string; motivo: string }> }
interface CommitResult { criadas: number; ignoradasPorErro: number; erros: Array<{ linha: number; motivo: string }> }

export default function ImportarPage() {
  const [leis, setLeis] = useState<Lei[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [leiId, setLeiId] = useState('')
  const [exercicioId, setExercicioId] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Lei[]>('/tenant/orcamento/leis?tipo=loa').then(setLeis).catch(() => {})
    api<Exercicio[]>('/tenant/fiscal/exercicios').then((list) => {
      setExercicios(list)
      const aberto = list.find((e) => e.status === 'aberto')
      if (aberto) setExercicioId(aberto.id)
    }).catch(() => {})
  }, [])

  async function doPreview() {
    setLoading(true); setError(null); setPreview(null); setCommitResult(null)
    try {
      const dotacoes = JSON.parse(jsonText) as unknown[]
      const body = { leiOrcamentariaId: leiId, exercicioId, dotacoes }
      const r = await api<PreviewResult>('/tenant/orcamento/importar/preview', { method: 'POST', body: JSON.stringify(body) })
      setPreview(r)
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  async function doCommit() {
    setLoading(true); setError(null)
    try {
      const dotacoes = JSON.parse(jsonText) as unknown[]
      const body = { leiOrcamentariaId: leiId, exercicioId, dotacoes }
      const r = await api<CommitResult>('/tenant/orcamento/importar/commit', { method: 'POST', body: JSON.stringify(body) })
      setCommitResult(r); setPreview(null)
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <Link href="/tenant/orcamento" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Orcamento</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Importar dotacoes</h1>
      <p className="text-sm text-carvao-600 mb-8">Cole um array JSON de dotacoes. Programas, acoes, modalidades e fontes serao resolvidos por codigo.</p>

      <div className="card p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">LOA</label>
            <select value={leiId} onChange={(e) => setLeiId(e.target.value)} required className="input">
              <option value="">-- escolha --</option>
              {leis.filter((l) => l.ppaVigenteId).map((l) => <option key={l.id} value={l.id}>{l.numero} ({l.anoInicio})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Exercicio</label>
            <select value={exercicioId} onChange={(e) => setExercicioId(e.target.value)} required className="input">
              {exercicios.map((e) => <option key={e.id} value={e.id}>{e.ano} ({e.status})</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">JSON das dotacoes</label>
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={12}
            className="input font-mono text-xs" placeholder={'[\n  { "entidadeId": "...", "orgaoCodigo": "03", ... }\n]'} />
          <div className="text-xs text-carvao-500 mt-1">Formato: array de objetos com campos da dotacao (sem IDs resolvidos, apenas codigos).</div>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

        <div className="flex gap-3">
          <button onClick={doPreview} disabled={loading || !leiId || !exercicioId || !jsonText.trim()} className="btn-secondary">
            {loading && !preview ? 'Validando...' : 'Validar (preview)'}
          </button>
          {preview && preview.resolvidas.length > 0 && (
            <button onClick={doCommit} disabled={loading} className="btn-primary">
              {loading ? 'Importando...' : `Importar ${preview.resolvidas.length} dotacoes`}
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="mt-8 space-y-6">
          {preview.comErro.length > 0 && (
            <div className="card p-6 border-2 border-red-200">
              <div className="text-[10px] uppercase tracking-wider text-red-700 font-semibold mb-3">Erros ({preview.comErro.length})</div>
              <div className="space-y-1 max-h-60 overflow-auto">
                {preview.comErro.map((e) => (
                  <div key={e.linha} className="text-xs text-red-800 font-mono">Linha {e.linha}: {e.codigo} -- {e.motivo}</div>
                ))}
              </div>
            </div>
          )}
          {preview.resolvidas.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-carvao-100 text-[10px] uppercase tracking-wider text-verde-700 font-semibold">Resolvidas ({preview.resolvidas.length})</div>
              <table className="w-full text-sm">
                <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                  <tr><th className="text-left px-4 py-2.5 font-semibold">#</th><th className="text-left px-4 py-2.5 font-semibold">Classificacao</th><th className="text-left px-4 py-2.5 font-semibold">Programa</th><th className="text-right px-4 py-2.5 font-semibold">Valor</th></tr>
                </thead>
                <tbody className="divide-y divide-carvao-100">
                  {preview.resolvidas.slice(0, 50).map((r) => (
                    <tr key={r.linha} className="hover:bg-areia-50">
                      <td className="px-4 py-2.5 text-carvao-500 text-xs">{r.linha}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.classificacaoCompleta}</td>
                      <td className="px-4 py-2.5 text-xs text-carvao-700">{r.programaResolvido}</td>
                      <td className="px-4 py-2.5 text-right tabular">{formatBRL(r.valorInicial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.resolvidas.length > 50 && <div className="px-6 py-3 text-xs text-carvao-500">...e mais {preview.resolvidas.length - 50} dotacoes</div>}
            </div>
          )}
        </div>
      )}

      {commitResult && (
        <div className="mt-8 card p-6 border-2 border-verde-300">
          <div className="font-display text-xl text-verde-800 mb-3">Importacao concluida</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="label">Criadas</div><div className="font-display text-2xl text-verde-800">{commitResult.criadas}</div></div>
            <div><div className="label">Ignoradas por erro</div><div className="font-display text-2xl text-areia-800">{commitResult.ignoradasPorErro}</div></div>
            <div><div className="label">Total processado</div><div className="font-display text-2xl">{commitResult.criadas + commitResult.ignoradasPorErro}</div></div>
          </div>
          {commitResult.erros.length > 0 && (
            <div className="mt-4 text-xs text-red-800 space-y-1 max-h-40 overflow-auto">
              {commitResult.erros.map((e) => <div key={e.linha} className="font-mono">Linha {e.linha}: {e.motivo}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
