/**
 * SIAFIC — TOKENS DE DESIGN, tipados.
 *
 * ⚠️ A FONTE DA VERDADE das cores é o `@theme` do `app/globals.css` (CSS variables). Este
 * arquivo é o ESPELHO TIPADO delas para o TypeScript: quem precisa referenciar um token no TS
 * (não numa classe Tailwind) usa `token("primary")` e recebe `var(--color-primary)` — nunca um
 * hex solto. Se um token nascer no CSS, acrescente-o aqui; o compilador cobra o resto.
 *
 * Não há hex neste arquivo — só os NOMES das variáveis. O valor mora no CSS, num lugar só.
 */

export const CORES = {
  canvas: "var(--color-canvas)",
  surface: "var(--color-surface)",
  surface2: "var(--color-surface-2)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  ink: "var(--color-ink)",
  ink2: "var(--color-ink-2)",
  ink3: "var(--color-ink-3)",
  primary: "var(--color-primary)",
  primaryHover: "var(--color-primary-hover)",
  primaryFg: "var(--color-primary-fg)",
  primarySoft: "var(--color-primary-soft)",
  /** ⚠️ SÓ para sinal contábil (valor positivo/negativo). Nunca decoração. */
  positivo: "var(--color-positivo)",
  negativo: "var(--color-negativo)",
} as const;

export type TokenDeCor = keyof typeof CORES;

/** `token("primary")` → `"var(--color-primary)"`. Uso em `style={{}}` quando a classe não serve. */
export function token(nome: TokenDeCor): string {
  return CORES[nome];
}

/** Escala de espaçamento (rem) — a densidade alta do sistema contábil. */
export const ESPACO = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.25rem",
  xl: "1.5rem",
  "2xl": "2rem",
} as const;

/** Tipografia — tamanhos em rem, com o 14px de base do corpo. */
export const TIPOGRAFIA = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  md: "1.25rem",
  lg: "1.5rem",
  xl: "1.875rem",
} as const;
