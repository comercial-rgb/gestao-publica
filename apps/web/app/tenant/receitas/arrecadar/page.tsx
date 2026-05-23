'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/formato'

interface Lancamento { id: string; naturezaCodigo: string; naturezaDescricao: string; entidadeNome: string }

const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'compensacao', label: 'Compensação' },
  { value: 'outros', label: 'Outros' },
]

export default function ArrecadarPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preLancamentoId = searchParams.get('lancamentoId')

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [lancamentoId, setLancamentoId] = useState(preLancamentoId || '')
  const [documento, setDocumento] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('pix')
  const [numeroDoc, setNumeroDoc] = useState('')
  const [referencia, setReferencia] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const ano = new Date().getFullYear()
    api<Lancamento[]>(`/tenant/receitas/lancamentos?exercicioAno=${ano}`)
      .then(setLancamentos).catch((e) => setError(e.message))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null); setSuccess(null)
    try {
      const clean = documento.replace(/\D/g, '')
      const payload: Record<string, unknown> = {
        lancamentoId,
        dataArrecadacao: data,
        valor: Number(valor.replace(',', '.')),
        formaPagamento,
      }
      if (clean.length >= 11) payload.contribuinteDocumento = clean
      if (numeroDoc) payload.numeroDocumento = numeroDoc
      if (referencia) payload.referencia = referencia
      if (observacoes) payload.observacoes = observacoes

      const r = await api<{ id: string }>('/tenant/receitas/arrecadacoes', {
        method: 'POST', body: JSON.stringify(payload),
      })
      setSuccess(r.id)
      setDocumento(''); setValor(''); setNumeroDoc(''); setReferencia(''); setObservacoes('')
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/receitas" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Receitas</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Arrecadação rápida</h1>
      <p className="text-sm text-carvao-600 mb-8">Registre entrada de receita. Período fiscal validado automaticamente.</p>

      {success && (
        <div className="rounded-md border border-verde-200 bg-verde-50 px-4 py-3 text-sm text-verde-800 mb-6 flex items-center justify-between">
          <span>Arrecadação registrada com sucesso.</span>
          <div className="flex gap-3">
            <button onClick={() => setSuccess(null)} className="text-verde-700 underline text-xs">registrar outra</button>
            <Link href={`/tenant/receitas/lancamentos/${lancamentoId}`} className="text-verde-700 underline text-xs">ver lançamento →</Link>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card p-8 space-y-5">
        <div>
          <label className="label">Lançamento (previsão)</label>
          <select value={lancamentoId} onChange={(e) => setLancamentoId(e.target.value)} required className="input">
            <option value="">— escolha o lançamento —</option>
            {lancamentos.map((l) => (
              <option key={l.id} value={l.id}>{l.naturezaCodigo} — {l.naturezaDescricao} ({l.entidadeNome})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">CPF/CNPJ contribuinte</label>
            <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} className="input font-mono" placeholder="opcional" />
          </div>
          <div>
            <label className="label">Data arrecadação</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Valor (R$)</label>
            <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} required className="input font-mono tabular" placeholder="0,00" />
          </div>
          <div>
            <label className="label">Forma de pagamento</label>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="input">
              {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Nº documento</label><input type="text" value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} className="input" maxLength={100} /></div>
          <div><label className="label">Referência</label><input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="input" placeholder="ex: IPTU 03/12" maxLength={100} /></div>
        </div>

        <div>
          <label className="label">Observações</label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="input min-h-[60px]" maxLength={2000} />
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/tenant/receitas" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || !lancamentoId || !valor} className="btn-primary">{loading ? 'Registrando…' : 'Registrar arrecadação'}</button>
        </div>
      </form>
    </div>
  )
}
