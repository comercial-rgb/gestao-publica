import clsx from 'clsx'

export function MetricCard({
  label, value, hint, tone = 'neutral', icon,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'positive' | 'warning' | 'danger'
  icon?: string
}) {
  const tones = {
    neutral:  'border-carvao-200',
    positive: 'border-verde-300 bg-verde-50/30',
    warning:  'border-areia-300 bg-areia-50',
    danger:   'border-red-300 bg-red-50/30',
  }
  return (
    <div className={clsx('card p-5 border', tones[tone])}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold">{label}</div>
        {icon && <span className="font-mono text-areia-500">{icon}</span>}
      </div>
      <div className="font-display text-3xl text-carvao-900 tabular">{value}</div>
      {hint && <div className="text-xs text-carvao-600 mt-1">{hint}</div>}
    </div>
  )
}
