import Link from "next/link";

/**
 * PAGINAÇÃO — "N–M de T", anterior e próxima.
 *
 * ⚠️ SEM ESTADO INTERNO, e por link — o mesmo motivo da ordenação em `TabelaDeDados`: a página
 * vive na URL, para a lista ser LINKÁVEL e sobreviver ao refresh. Um `useState` aqui faria o
 * usuário perder a página ao recarregar, e um link compartilhado abriria sempre na primeira.
 *
 * ⚠️ E ISTO MANTÉM O COMPONENTE SERVER. Um `onClick` obrigaria `"use client"` e levaria a
 * hidratação para toda lista paginada do sistema, em troca de nada que o link não dê.
 */

export interface PaginacaoProps {
  /** 1-indexada — é o que o usuário lê e o que vai na URL. */
  readonly pagina: number;
  readonly tamanhoPagina: number;
  /** O total de registros, não de páginas. */
  readonly total: number;
  /** Recebe a página de destino; devolve o href. */
  readonly hrefDePagina: (pagina: number) => string;
  /** O nome do que se conta, no plural ("contratos", "empenhos"). */
  readonly rotuloItens?: string;
}

const CLASSE_LINK =
  "inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm font-medium text-[color:var(--color-ink)] hover:border-[color:var(--color-ink-3)]";

const CLASSE_DESLIGADO =
  "inline-flex h-9 cursor-not-allowed items-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm font-medium text-[color:var(--color-ink-3)]";

export function Paginacao({
  pagina,
  tamanhoPagina,
  total,
  hrefDePagina,
  rotuloItens = "registros",
}: PaginacaoProps): React.ReactElement {
  const ultimaPagina = total === 0 ? 1 : Math.ceil(total / tamanhoPagina);
  const temAnterior = pagina > 1;
  const temProxima = pagina < ultimaPagina;

  // ⚠️ COM ZERO REGISTROS, "0–0 de 0" — e não "1–0". O primeiro é uma contagem honesta; o segundo
  // é um intervalo impossível que faz o leitor duvidar do resto da tela.
  const primeiro = total === 0 ? 0 : (pagina - 1) * tamanhoPagina + 1;
  const ultimo = Math.min(pagina * tamanhoPagina, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-4 border-t border-[color:var(--color-border)] px-4 py-3"
    >
      {/* `aria-live="polite"`: ao trocar de página o leitor anuncia a nova faixa. Sem isso, quem
          navega por teclado clica em "próxima" e não recebe confirmação de que algo mudou. */}
      <p aria-live="polite" className="text-sm text-[color:var(--color-ink-2)]">
        <span className="tabular">{primeiro}</span>
        {"–"}
        <span className="tabular">{ultimo}</span>
        {" de "}
        <span className="tabular">{total}</span>
        {` ${rotuloItens}`}
      </p>

      <div className="flex items-center gap-2">
        {temAnterior ? (
          <Link href={hrefDePagina(pagina - 1)} rel="prev" className={CLASSE_LINK}>
            Anterior
          </Link>
        ) : (
          // ⚠️ `<span aria-disabled>` e NÃO um `<a>` sem href: um link sem destino continua no
          // fluxo de tabulação e leva o teclado a um beco. O span sai da tabulação sozinho.
          <span aria-disabled className={CLASSE_DESLIGADO}>
            Anterior
          </span>
        )}
        {temProxima ? (
          <Link href={hrefDePagina(pagina + 1)} rel="next" className={CLASSE_LINK}>
            Próxima
          </Link>
        ) : (
          <span aria-disabled className={CLASSE_DESLIGADO}>
            Próxima
          </span>
        )}
      </div>
    </nav>
  );
}
