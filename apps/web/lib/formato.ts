export function formatBRL(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export function formatPercentual(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}%`
}

export function formatData(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('pt-BR')
}

export function formatCpfCnpj(doc: string | null): string {
  if (!doc) return '—'
  const clean = doc.replace(/\D/g, '')
  if (clean.length === 11) return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (clean.length === 14) return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  return doc
}
