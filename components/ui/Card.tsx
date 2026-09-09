import Link from "next/link";

/** CARD — o painel base. O respiro padrão é parte da anatomia, não responsabilidade da tela. */
export interface CardProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function Card({ children, className = "" }: CardProps): React.ReactElement {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Um KPI de dashboard: rótulo pequeno + valor grande, sempre com algarismos tabulares. */
export interface CardEstatisticaProps {
  readonly rotulo: string;
  readonly children: React.ReactNode;
  readonly nota?: string;
}

export function CardEstatistica({
  rotulo,
  children,
  nota,
}: CardEstatisticaProps): React.ReactElement {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-ink-3)]">
        {rotulo}
      </div>
      <div className="mt-2 text-xl font-semibold tabular text-[color:var(--color-ink)]">{children}</div>
      {nota !== undefined ? (
        <div className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{nota}</div>
      ) : null}
    </Card>
  );
}

/** Card de navegação canônico dos hubs: rótulo, título, descrição e affordance de link. */
export function CardNavegacao({
  href,
  rotulo,
  titulo,
  descricao,
  badge,
}: {
  readonly href: string;
  readonly rotulo?: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly badge?: React.ReactNode;
}): React.ReactElement {
  return (
    <Link href={href} className="group block h-full">
      <Card className="h-full transition-[border-color,transform] group-hover:-translate-y-0.5 group-hover:border-[color:var(--color-primary)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {rotulo !== undefined ? (
              <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
                {rotulo}
              </div>
            ) : null}
            <h3 className={`${rotulo !== undefined ? "mt-2" : ""} text-base font-semibold text-[color:var(--color-ink)]`}>
              {titulo}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {badge}
            <span aria-hidden className="text-lg text-[color:var(--color-ink-3)] transition-transform group-hover:translate-x-1 group-hover:text-[color:var(--color-primary)]">
              →
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{descricao}</p>
      </Card>
    </Link>
  );
}

/** Indicador navegável do painel inicial, com a mesma anatomia e hierarquia dos hubs. */
export function CardIndicador({
  href,
  rotulo,
  valor,
  descricao,
}: {
  readonly href: string;
  readonly rotulo: string;
  readonly valor: React.ReactNode;
  readonly descricao: string;
}): React.ReactElement {
  return (
    <Link href={href} className="group block h-full">
      <Card className="h-full transition-[border-color,transform] group-hover:-translate-y-0.5 group-hover:border-[color:var(--color-primary)]">
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{rotulo}</div>
          <span aria-hidden className="text-lg text-[color:var(--color-ink-3)] transition-transform group-hover:translate-x-1 group-hover:text-[color:var(--color-primary)]">→</span>
        </div>
        <div className="mt-3 text-xl font-semibold tabular text-[color:var(--color-ink)]">{valor}</div>
        <div className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{descricao}</div>
      </Card>
    </Link>
  );
}
