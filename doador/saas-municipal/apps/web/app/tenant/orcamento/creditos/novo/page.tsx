'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function NovoCreditoPage() {
  const router = useRouter()
  const [loas, setLoas] = useState<Array<{ id: string; numero: string; anoInicio: number }>>([])
  const [exercicios, setExercicios] = useState<Array<{ id: string; ano: number; status: string }>>([])
  const [leiId, setLeiId] = useState(''); const [exercicioId, setExercicioId] = useState('')
  const [numero, setNumero] = useState(''); const [tipo, setTipo] = useState('suplementar')
  const [origem, setOrigem] = useState('anulacao_dotacao'); const [valor, setValor] = useState('')
  const [dataDecreto, setDataDecreto] = useState(new Date().toISOString().slice(0, 10))
  const [dataPublicacao, setDataPublicacao] = useState(''); const [justificativa, setJustificativa] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api<typeof loas>('/tenant/orcamento/leis?tipo=loa'), api<typeof exercicios>('/tenant/fiscal/exercicios')])
      .then(([l, e]) => { setLoas(l); setExercicios(e); const a = e.find((x) => x.status === 'aberto'); if (a) setExercicioId(a.id) }).catch((err) => setError(err.message))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const r = await api<{ id: string }>('/tenant/orcamento/creditos', { method: 'POST', body: JSON.stringify({
        leiOrcamentariaId: leiId, exercicioId, numero, tipo, origem, valor: Number(valor.replace(',', '.')), dataDecreto, dataPublicacao: dataPublicacao || undefined, justificativa,
      }) })
      router.push(`/tenant/orcamento/creditos/${r.id}`)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/tenant/orcamento/creditos" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">← Creditos</Link>
      <h1 className="font-display text-4xl tracking-tight mt-3 mb-8">Novo credito orcamentario</h1>
      <form onSubmit={submit} className="card p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">LOA *</label><select value={leiId} onChange={(e) => setLeiId(e.target.value)} required className="input"><option value="">--</option>{loas.map((l) => <option key={l.id} value={l.id}>{l.anoInicio} - {l.numero}</option>)}</select></div>
          <div><label className="label">Exercicio *</label><select value={exercicioId} onChange={(e) => setExercicioId(e.target.value)} required className="input"><option value="">--</option>{exercicios.map((e) => <option key={e.id} value={e.id} disabled={e.status === 'encerrado'}>{e.ano}</option>)}</select></div>
        </div>
        <div><label className="label">Numero do decreto *</label><input type="text" required value={numero} onChange={(e) => setNumero(e.target.value)} className="input" placeholder="Ex: Decreto 1234/2026" maxLength={50} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Tipo *</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input"><option value="suplementar">Suplementar</option><option value="especial">Especial</option><option value="extraordinario">Extraordinario</option></select></div>
          <div><label className="label">Origem *</label><select value={origem} onChange={(e) => setOrigem(e.target.value)} className="input"><option value="anulacao_dotacao">Anulacao de dotacoes</option><option value="superavit_financeiro">Superavit financeiro</option><option value="excesso_arrecadacao">Excesso de arrecadacao</option><option value="operacao_credito">Operacao de credito</option><option value="reserva_contingencia">Reserva de contingencia</option></select></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2"><label className="label">Valor (R$) *</label><input type="text" required value={valor} onChange={(e) => setValor(e.target.value)} className="input tabular" placeholder="0,00" /></div>
          <div><label className="label">Data decreto *</label><input type="date" required value={dataDecreto} onChange={(e) => setDataDecreto(e.target.value)} className="input" /></div>
        </div>
        <div><label className="label">Data publicacao</label><input type="date" value={dataPublicacao} onChange={(e) => setDataPublicacao(e.target.value)} className="input" /></div>
        <div><label className="label">Justificativa *</label><textarea required value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={5} className="input" minLength={30} maxLength={5000} placeholder="Minimo 30 caracteres" /><div className="mt-1 text-xs text-carvao-500">{justificativa.length}/30 minimo</div></div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/tenant/orcamento/creditos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading || justificativa.length < 30} className="btn-primary">{loading ? 'Criando...' : 'Criar credito'}</button>
        </div>
      </form>
    </div>
  )
}
