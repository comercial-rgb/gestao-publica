/**
 * FORMULÁRIOS — anatomia visual única.
 *
 * Somente apresentação: nomes, valores, validação e Server Actions continuam pertencendo
 * a cada formulário. Estes estilos garantem altura, rótulo e ação primária consistentes.
 *
 * O desenho é o do manual da marca Engine: campo com raio de 10px (o foco com borda laranja e anel
 * mora em `app/globals.css`, para valer também nos campos escritos à mão); botão de ação em pílula,
 * fundo no laranja oficial, texto grafite na fonte de títulos.
 */
export const CLASSE_CAMPO =
  "h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-ink-3)] hover:border-[color:var(--color-ink-3)] focus-visible:outline-2";

export const CLASSE_AREA_TEXTO =
  "min-h-24 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-3 text-sm leading-relaxed text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-ink-3)] hover:border-[color:var(--color-ink-3)] focus-visible:outline-2";

export const CLASSE_ROTULO =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]";

export const CLASSE_BOTAO_PRIMARIO =
  "h-11 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-5 font-titulo text-sm font-semibold text-[color:var(--color-acao-tinta)] transition-[background-color,box-shadow] hover:bg-[color:var(--color-acao-hover)] hover:shadow-[var(--shadow-destaque)] disabled:hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60";

export const CLASSE_PAINEL_FORMULARIO =
  "rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)]";
