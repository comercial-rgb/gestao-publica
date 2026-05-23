'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function NovaPrefeituraPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    slug: '',
    name: '',
    cnpj: '',
    state: '',
    city: '',
    ibgeCode: '',
    contactEmail: '',
    contactPhone: '',
    planSlug: 'prata',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<any>(null)

  function update(field: keyof typeof form, value: string) {
    setForm({ ...form, [field]: value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        cnpj: form.cnpj.replace(/\D/g, ''),
        ibgeCode: form.ibgeCode.replace(/\D/g, ''),
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
      }
      const result = await api<any>('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSuccess(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-10 max-w-3xl mx-auto">
        <div className="card p-8">
          <div className="text-[10px] uppercase tracking-[0.3em] text-verde-700 font-semibold mb-2">
            Provisioning concluído
          </div>
          <h1 className="font-display text-3xl mb-2">{success.name}</h1>
          <p className="text-sm text-carvao-600 mb-6">
            Schema PostgreSQL <code className="font-mono bg-areia-100 px-1.5 py-0.5 rounded">{success.schemaName}</code>
            {' '}criado com sucesso.
          </p>

          <dl className="grid grid-cols-2 gap-4 text-sm border-t border-carvao-100 pt-6">
            <Item label="Migrations aplicadas" value={success.provisioning?.migrationsApplied ?? '—'} />
            <Item label="Seed baseline" value={success.provisioning?.seedApplied ? 'Sim' : 'Não'} />
            <Item label="Status" value={success.status} />
            <Item label="Slug" value={success.slug} />
          </dl>

          <div className="mt-8 flex gap-3">
            <Link href="/admin/tenants" className="btn-primary">← Voltar à lista</Link>
            <button
              onClick={() => { setSuccess(null); setForm({ ...form, slug: '', name: '', cnpj: '', city: '', ibgeCode: '' }) }}
              className="btn-secondary"
            >
              Cadastrar outra
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <Link href="/admin/tenants" className="text-xs text-carvao-500 hover:text-verde-700 uppercase tracking-wider">
        ← Prefeituras
      </Link>

      <h1 className="font-display text-4xl tracking-tight mt-3 mb-2">Nova Prefeitura</h1>
      <p className="text-sm text-carvao-600 mb-8">
        O sistema criará um schema PostgreSQL isolado e aplicará todas as migrations
        automaticamente. Esse processo leva poucos segundos.
      </p>

      <form onSubmit={handleSubmit} className="card p-8 space-y-6">
        <Section title="Identificação">
          <Field label="Slug (identificador único)" required>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="input font-mono"
              placeholder="santa-izabel-oeste"
              pattern="[a-z0-9-]+"
              minLength={3}
              required
            />
            <p className="mt-1 text-xs text-carvao-500">
              Schema gerado: <code className="font-mono">tenant_{form.slug.replace(/-/g, '_') || '...'}</code>
            </p>
          </Field>

          <Field label="Razão social" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="input"
              placeholder="Município de Santa Izabel do Oeste"
              required
              minLength={3}
            />
          </Field>

          <Field label="CNPJ" required>
            <input
              type="text"
              value={form.cnpj}
              onChange={(e) => update('cnpj', e.target.value)}
              className="input font-mono tabular"
              placeholder="00.000.000/0000-00"
              required
            />
          </Field>
        </Section>

        <Section title="Localização">
          <div className="grid grid-cols-3 gap-4">
            <Field label="UF" required>
              <input
                type="text"
                value={form.state}
                onChange={(e) => update('state', e.target.value.toUpperCase())}
                className="input font-mono"
                placeholder="PR"
                maxLength={2}
                minLength={2}
                required
              />
            </Field>
            <Field label="Cidade" required>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                className="input col-span-2"
                placeholder="Santa Izabel do Oeste"
                required
              />
            </Field>
            <Field label="Código IBGE" required>
              <input
                type="text"
                value={form.ibgeCode}
                onChange={(e) => update('ibgeCode', e.target.value)}
                className="input font-mono tabular"
                placeholder="4124053"
                maxLength={7}
                minLength={7}
                required
              />
            </Field>
          </div>
        </Section>

        <Section title="Contato (opcional)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="E-mail">
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => update('contactEmail', e.target.value)}
                className="input"
                placeholder="[email protected]"
              />
            </Field>
            <Field label="Telefone">
              <input
                type="text"
                value={form.contactPhone}
                onChange={(e) => update('contactPhone', e.target.value)}
                className="input"
                placeholder="(46) 3542-1224"
              />
            </Field>
          </div>
        </Section>

        <Section title="Comercial">
          <Field label="Plano">
            <select
              value={form.planSlug}
              onChange={(e) => update('planSlug', e.target.value)}
              className="input"
            >
              <option value="bronze">Bronze — Cadastros + 1 módulo</option>
              <option value="prata">Prata — Cadastros + 3 módulos</option>
              <option value="ouro">Ouro — Todos os módulos</option>
            </select>
          </Field>
        </Section>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-carvao-100">
          <Link href="/admin/tenants" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Provisionando schema…' : 'Criar e Provisionar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-carvao-500 mb-3 pb-1 border-b border-carvao-100">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  )
}

function Item({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold">{label}</dt>
      <dd className="text-carvao-900 font-medium mt-0.5">{value}</dd>
    </div>
  )
}
