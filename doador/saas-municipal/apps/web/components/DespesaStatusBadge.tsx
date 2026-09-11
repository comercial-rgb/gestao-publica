import clsx from 'clsx'

const STATUS_EMPENHO: Record<string, { classe: string; label: string }> = {
  vigente: { classe: 'bg-verde-100 text-verde-800', label: 'vigente' },
  restos_processados: { classe: 'bg-areia-200 text-areia-900', label: 'RP processado' },
  restos_nao_processados: { classe: 'bg-areia-300 text-areia-900', label: 'RP nao-processado' },
  cancelado: { classe: 'bg-red-100 text-red-700', label: 'cancelado' },
  cancelado_lrf: { classe: 'bg-red-200 text-red-800', label: 'cancelado (LRF)' },
  pago_total: { classe: 'bg-carvao-100 text-carvao-700', label: 'pago total' },
}
const STATUS_OP: Record<string, { classe: string; label: string }> = {
  aguardando_aprovacao: { classe: 'bg-areia-100 text-areia-800', label: 'aguardando' },
  aprovada: { classe: 'bg-verde-100 text-verde-800', label: 'aprovada' },
  rejeitada: { classe: 'bg-red-100 text-red-700', label: 'rejeitada' },
  paga_parcial: { classe: 'bg-verde-200 text-verde-900', label: 'paga parcial' },
  paga_total: { classe: 'bg-carvao-100 text-carvao-700', label: 'paga total' },
  cancelada: { classe: 'bg-red-100 text-red-700', label: 'cancelada' },
}
const STATUS_PAGAMENTO: Record<string, { classe: string; label: string }> = {
  vigente: { classe: 'bg-verde-100 text-verde-800', label: 'vigente' },
  estornado: { classe: 'bg-red-100 text-red-700', label: 'estornado' },
}
const STATUS_LIQUIDACAO: Record<string, { classe: string; label: string }> = {
  vigente: { classe: 'bg-verde-100 text-verde-800', label: 'vigente' },
  cancelada: { classe: 'bg-red-100 text-red-700', label: 'cancelada' },
}

const MAPS = { empenho: STATUS_EMPENHO, op: STATUS_OP, pagamento: STATUS_PAGAMENTO, liquidacao: STATUS_LIQUIDACAO } as const

export function DespesaStatusBadge({ tipo, status, className }: { tipo: keyof typeof MAPS; status: string; className?: string }) {
  const entry = MAPS[tipo][status] ?? { classe: 'bg-carvao-100 text-carvao-700', label: status }
  return <span className={clsx('badge font-mono text-[10px]', entry.classe, className)}>{entry.label}</span>
}
