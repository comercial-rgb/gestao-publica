/**
 * FORMULÁRIOS — anatomia visual única.
 *
 * Somente apresentação: nomes, valores, validação e Server Actions continuam pertencendo
 * a cada formulário. Estes estilos garantem altura, rótulo e ação primária consistentes.
 */
export const CLASSE_CAMPO =
  "h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-ink-3)] hover:border-[color:var(--color-ink-3)] focus-visible:outline-2";

export const CLASSE_AREA_TEXTO =
  "min-h-24 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-3 text-sm leading-relaxed text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-ink-3)] hover:border-[color:var(--color-ink-3)] focus-visible:outline-2";

export const CLASSE_ROTULO =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]";

export const CLASSE_BOTAO_PRIMARIO =
  "h-11 rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-5 text-sm font-semibold text-[color:var(--color-primary-fg)] transition-colors hover:bg-[color:var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";

export const CLASSE_PAINEL_FORMULARIO =
  "rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)]";
