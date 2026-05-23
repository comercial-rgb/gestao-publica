'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { api } from '@/lib/api'
import { formatBRL, formatData, formatDataHora } from '@/lib/formato'
import { MetricCard } from '@/components/MetricCard'
import clsx from 'clsx'

interface CreditoLinha { id: string; dotacaoId: string; classificacaoCompleta: string; programaNome: string; sinal: number; valor: string; valorAtualizadoAtual: string; valorAtualizadoSimulado: string; saldoSimuladoNegativo: boolean }
interface CreditoDetalhe { id: string; numero: string; tipo: string; origem: string; valor: string; dataDecreto: string; dataPublicacao: string | null; justificativa: string; status: string; aplicadoEm: string | null; leiOrcamentariaId: string; leiNumero: string; exercicioId: string; exercicioAno: number; linhas: CreditoLinha[]; totais: { somaReforcos: string; somaAnulacoes: string; saldoLiquido: string; linhasComProblema: number } }

const ST: Record<string, string> = { em_elaboracao: 'bg-carvao-100 text-carvao-700', aprovado: 'bg-areia-200 text-areia-800', aplicado: 'bg-verde-100 text-verde-800', cancelado: 'bg-red-100 text-red-800' }

export default function CreditoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [credito, setCredito] = useState<CreditoDetalhe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showAplicar, setShowAplicar] = useState(false)

  async function load() { try { setError(null); setCredito(await api(`/tenant/orcamento/creditos/${params.id}`)) } catch (err) { setError((err as Error).message) } }
  useEffect(() => { load() }, [params.id])

  async function changeStatus(status: string) {
    if (!confirm(`${status === 'aprovado' ? 'Aprovar' : 'Cancelar'} este credito?`)) return
    setActionLoading(true)
    try { await api(`/tenant/orcamento/creditos/${params.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load() }
    catch (err) { setError((err as Error).message) } finally { setActionLoading(false) }
  }

  async function removerLinha(linhaId: string) {
    if (!confirm('Remover esta linha?')) return
    try { await api(`/tenant/orcamento/creditos/${params.id}/dotacoes/${linhaId}`, { method: 'DELETE' }); await load() }
    catch (err) { setError((err as Error).message) }
  }

  if (!credito) return <div className="p-10 text-carvao-500">Carregando...</div>
  const podeEditar = credito.status === 'em_elaboracao'
  const podeAprovar = podeEditar && credito.linhas.length > 0 && credito.totais.linhasComProblema === 0
  const podeAplicar = credito.status === 'aprovado' && credito.totais.linhasComProblema === 0

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <Link href="/tenant/orcamento/creditos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Creditos</Link>
      <header className="border-b border-carvao-200 pb-6 mb-8 mt-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={clsx('badge font-mono text-[10px]', ST[credito.status])}>{credito.status.replace('_', ' ')}</span>
              <span className="font-mono text-xs text-carvao-500">{credito.numero}</span>
            </div>
            <h1 className="font-display text-3xl tracking-tight">Credito {credito.tipo}</h1>
            <p className="text-sm text-carvao-600 mt-2">LOA {credito.leiNumero} - Exercicio {credito.exercicioAno} - {credito.origem.replace(/_/g, ' ')} - Decreto {formatData(credito.dataDecreto)}</p>
            {credito.aplicadoEm && <p className="text-xs text-verde-700 mt-1">Aplicado em {formatDataHora(credito.aplicadoEm)}</p>}
          </div>
          <div className="flex gap-2">
            {podeEditar && <button onClick={() => setShowAdd(true)} className="btn-secondary">+ Linha</button>}
            {podeAprovar && <button onClick={() => changeStatus('aprovado')} disabled={actionLoading} className="btn-secondary">Aprovar</button>}
            {podeAplicar && <button onClick={() => setShowAplicar(true)} className="btn-primary">Aplicar credito</button>}
            {podeEditar && <button onClick={() => changeStatus('cancelado')} disabled={actionLoading} className="text-xs text-red-600 hover:underline px-3">cancelar</button>}
          </div>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Valor declarado" value={formatBRL(credito.valor)} />
        <MetricCard label="Reforcos" value={formatBRL(credito.totais.somaReforcos)} tone="positive" hint={`${credito.linhas.filter((l) => l.sinal === 1).length} dotacao(oes)`} />
        <MetricCard label="Anulacoes" value={formatBRL(credito.totais.somaAnulacoes)} tone="warning" hint={`${credito.linhas.filter((l) => l.sinal === -1).length} dotacao(oes)`} />
        <MetricCard label="Saldo liquido" value={formatBRL(credito.totais.saldoLiquido)} tone={credito.totais.linhasComProblema > 0 ? 'danger' : 'neutral'} />
      </div>

      <div className="card p-5 mb-8"><div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-2">Justificativa</div><p className="text-sm text-carvao-800 whitespace-pre-wrap">{credito.justificativa}</p></div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-2xl">Dotacoes afetadas</div>
          {credito.totais.linhasComProblema > 0 && <span className="badge bg-red-100 text-red-800 text-xs">{credito.totais.linhasComProblema} com problema</span>}
        </div>
        {credito.linhas.length === 0 ? (
          <div className="card p-12 text-center text-carvao-500">Nenhuma dotacao adicionada.{podeEditar && ' Use "+ Linha".'}</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-areia-100 text-carvao-600 text-[11px] uppercase tracking-wider">
                <tr><th className="text-left px-4 py-3 font-semibold">Tipo</th><th className="text-left px-4 py-3 font-semibold">Classificacao</th><th className="text-right px-4 py-3 font-semibold">Valor</th><th className="text-right px-4 py-3 font-semibold">Atual / Simulado</th>{podeEditar && <th></th>}</tr>
              </thead>
              <tbody className="divide-y divide-carvao-100">
                {credito.linhas.map((l) => (
                  <tr key={l.id} className={clsx(l.saldoSimuladoNegativo && 'bg-red-50/40')}>
                    <td className="px-4 py-3">{l.sinal === 1 ? <span className="badge bg-verde-100 text-verde-800 text-[10px]">+ reforco</span> : <span className="badge bg-red-100 text-red-800 text-[10px]">- anulacao</span>}</td>
                    <td className="px-4 py-3"><div className="font-mono text-xs text-carvao-700">{l.classificacaoCompleta}</div><div className="text-[11px] text-carvao-500 mt-0.5">{l.programaNome}</div></td>
                    <td className="px-4 py-3 text-right tabular font-medium">{l.sinal === 1 ? '+' : '-'}{formatBRL(l.valor)}</td>
                    <td className="px-4 py-3 text-right tabular text-xs"><div className="text-carvao-500">{formatBRL(l.valorAtualizadoAtual)}</div><div className={clsx('font-medium', l.saldoSimuladoNegativo ? 'text-red-700' : 'text-carvao-900')}>→ {formatBRL(l.valorAtualizadoSimulado)}</div></td>
                    {podeEditar && <td className="px-4 py-3 text-right"><button onClick={() => removerLinha(l.id)} className="text-xs text-red-600 hover:underline">remover</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && <AddLinhaModal creditoId={params.id} leiId={credito.leiOrcamentariaId} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
      {showAplicar && <AplicarModal credito={credito} onClose={() => setShowAplicar(false)} onApplied={() => { setShowAplicar(false); load() }} />}
    </div>
  )
}

function AddLinhaModal({ creditoId, leiId, onClose, onAdded }: { creditoId: string; leiId: string; onClose: () => void; onAdded: () => void }) {
  const [search, setSearch] = useState(''); const [dotacoes, setDotacoes] = useState<Array<Record<string, unknown>>>([])
  const [dotacaoId, setDotacaoId] = useState(''); const [sinal, setSinal] = useState<1 | -1>(1)
  const [valor, setValor] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  async function buscar() { try { const r = await api<{ items: Array<Record<string, unknown>> }>(`/tenant/orcamento/dotacoes?leiOrcamentariaId=${leiId}&limit=20${search ? `&search=${search}` : ''}`); setDotacoes(r.items) } catch (err) { setError((err as Error).message) } }
  async function submit() { setLoading(true); setError(null); try { await api(`/tenant/orcamento/creditos/${creditoId}/dotacoes`, { method: 'POST', body: JSON.stringify({ dotacaoId, sinal, valor: Number(valor.replace(',', '.')) }) }); onAdded() } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }

  return (
    <div className="fixed inset-0 bg-carvao-900/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card max-w-2xl w-full p-6 m-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl">Adicionar linha</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSinal(1)} className={clsx('card p-3 text-left border-2', sinal === 1 ? 'border-verde-500 bg-verde-50/30' : 'border-carvao-100')}><div className="font-medium text-verde-800">+ Reforco</div></button>
          <button onClick={() => setSinal(-1)} className={clsx('card p-3 text-left border-2', sinal === -1 ? 'border-red-500 bg-red-50/30' : 'border-carvao-100')}><div className="font-medium text-red-800">- Anulacao</div></button>
        </div>
        <div>
          <label className="label">Buscar dotacao</label>
          <div className="flex gap-2"><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input flex-1 font-mono" placeholder="Classificacao..." onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscar())} /><button onClick={buscar} className="btn-secondary">Buscar</button></div>
          {dotacoes.length > 0 && <div className="mt-2 border border-carvao-200 rounded-md max-h-60 overflow-auto">{dotacoes.map((d) => (
            <button key={String(d.id)} onClick={() => { setDotacaoId(String(d.id)); setDotacoes([]) }} className="w-full text-left px-3 py-2 hover:bg-areia-50 text-xs border-b border-carvao-50 last:border-0">
              <div className="font-mono text-carvao-800">{String(d.classificacaoCompleta)}</div><div className="text-[10px] text-carvao-500 mt-0.5">Atualizado: {formatBRL(String(d.valorAtualizado))}</div>
            </button>
          ))}</div>}
          {dotacaoId && <div className="mt-1 text-xs text-verde-700 font-mono">selecionada</div>}
        </div>
        <div><label className="label">Valor (R$)</label><input type="text" value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular" placeholder="0,00" /></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3"><button onClick={onClose} className="btn-secondary">Cancelar</button><button onClick={submit} disabled={loading || !dotacaoId || !valor} className="btn-primary">{loading ? 'Adicionando...' : 'Adicionar'}</button></div>
      </div>
    </div>
  )
}

function AplicarModal({ credito, onClose, onApplied }: { credito: CreditoDetalhe; onClose: () => void; onApplied: () => void }) {
  const [confirmacao, setConfirmacao] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  async function aplicar() {
    setLoading(true); setError(null)
    try { await api(`/tenant/orcamento/creditos/${credito.id}/aplicar`, { method: 'POST', body: JSON.stringify({ confirmNumero: confirmacao }) }); onApplied() }
    catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-carvao-900/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card max-w-2xl w-full p-6 m-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl mb-2">Aplicar credito</h2>
        <p className="text-sm text-carvao-600 mb-4">Operacao <strong>irreversivel</strong>. Dotacoes terao valor_atualizado alterado.</p>
        <div className="rounded-md border border-areia-300 bg-areia-50 p-4 mb-4 text-sm">
          <div className="flex justify-between mb-1"><span>Reforcos:</span><span className="tabular font-medium text-verde-800">+{formatBRL(credito.totais.somaReforcos)}</span></div>
          <div className="flex justify-between mb-1"><span>Anulacoes:</span><span className="tabular font-medium text-red-800">-{formatBRL(credito.totais.somaAnulacoes)}</span></div>
          <div className="flex justify-between pt-2 border-t border-areia-300 mt-2"><span className="font-semibold">Saldo liquido:</span><span className="tabular font-semibold">{formatBRL(credito.totais.saldoLiquido)}</span></div>
          <div className="text-xs text-carvao-600 mt-2">{credito.linhas.length} dotacao(oes)</div>
        </div>
        <div><label className="label">Digite o numero para confirmar: <span className="font-mono text-carvao-900">{credito.numero}</span></label>
          <input type="text" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className="input font-mono" placeholder={credito.numero} /></div>
        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="btn-secondary">Cancelar</button><button onClick={aplicar} disabled={loading || confirmacao !== credito.numero} className="btn-primary">{loading ? 'Aplicando...' : 'Aplicar agora'}</button></div>
      </div>
    </div>
  )
}
