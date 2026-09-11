import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Header */}
      <header className="relative border-b border-carvao-100 bg-areia-50/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-verde-700 flex items-center justify-center text-white font-display font-bold">
              M
            </div>
            <div>
              <div className="font-display font-semibold tracking-tight text-carvao-900">
                SaaS Municipal
              </div>
              <div className="text-[11px] text-carvao-500 uppercase tracking-wider">
                Gestão Pública Integrada
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-secondary">Login Prefeitura</Link>
            <Link href="/admin/login" className="btn-primary">Área Administrativa</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-verde-700 font-semibold mb-6">
            Conforme Lei 14.133/2021 · Pregão 90023/2026
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[1.02] tracking-tight text-carvao-900 mb-8">
            Operação financeira da prefeitura,
            <span className="italic font-normal text-verde-700"> com clareza</span>.
          </h1>
          <p className="text-lg md:text-xl text-carvao-700 max-w-2xl leading-relaxed">
            Plataforma multi-tenant integrada para Receitas, Despesas, Folha de Pagamento,
            Demonstrativos Fiscais (RREO/RGF) e Audiência Pública. Schema isolado por
            entidade, auditoria completa, conformidade contínua.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-8 max-w-2xl">
            <Stat label="Camadas" value="3" desc="Fundação · Registro · Inteligência" />
            <Stat label="Módulos" value="11" desc="Bronze, Prata e Ouro" />
            <Stat label="Compliance" value="LRF" desc="Lei 14.133 · LC 101/2000" />
          </div>
        </div>
      </section>

      <footer className="border-t border-carvao-100 mt-24">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-carvao-500 flex justify-between">
          <span>© 2026 SaaS Municipal</span>
          <span className="font-mono">v0.1.0</span>
        </div>
      </footer>
    </main>
  )
}

function Stat({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-carvao-500 font-semibold mb-1">
        {label}
      </div>
      <div className="font-display text-4xl text-carvao-900 tabular">{value}</div>
      <div className="text-xs text-carvao-600 mt-1">{desc}</div>
    </div>
  )
}
