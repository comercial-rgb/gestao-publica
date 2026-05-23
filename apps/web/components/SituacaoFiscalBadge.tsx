import clsx from 'clsx'

const CONFIG = {
  em_dia: { label: 'Em dia', className: 'bg-verde-100 text-verde-800 border-verde-300', dot: 'bg-verde-600' },
  parcialmente_em_dia: { label: 'Parcial', className: 'bg-areia-100 text-areia-800 border-areia-400', dot: 'bg-areia-600' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-100 text-red-800 border-red-300', dot: 'bg-red-600' },
  sem_movimento: { label: 'Sem movimento', className: 'bg-carvao-100 text-carvao-600 border-carvao-200', dot: 'bg-carvao-400' },
} as const

export function SituacaoFiscalBadge({ situacao, size = 'md' }: {
  situacao: keyof typeof CONFIG
  size?: 'sm' | 'md'
}) {
  const cfg = CONFIG[situacao] ?? CONFIG.sem_movimento
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      cfg.className,
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
