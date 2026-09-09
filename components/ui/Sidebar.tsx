"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMINISTRACAO, AREAS, CONTABILIDADE, EXECUCAO_DESPESA, EXECUCAO_RECEITA, PLANEJAMENTO, RELATORIOS_GERENCIAIS, RELATORIOS_LIVROS, RELATORIOS_RGF, RELATORIOS_RREO, type RelatorioNav } from "../../lib/navegacao";

/** Os submenus por área (grupo → itens). Só aparecem na área ativa e expandida. */
const SUBMENUS: Record<string, readonly (readonly [string, readonly RelatorioNav[]])[]> = {
  relatorios: [["RREO", RELATORIOS_RREO], ["RGF", RELATORIOS_RGF], ["Livros", RELATORIOS_LIVROS], ["Gerenciais", RELATORIOS_GERENCIAIS]],
  administracao: [["Administração", ADMINISTRACAO]],
  despesa: [["Execução", EXECUCAO_DESPESA]],
  receita: [["Execução", EXECUCAO_RECEITA]],
  planejamento: [["Planejamento", PLANEJAMENTO]],
  contabilidade: [["Contabilidade", CONTABILIDADE]],
};

/**
 * SIDEBAR — ilha client, e por dois motivos: o item ATIVO vem de `usePathname`, e o COLAPSO é
 * interação. O estado colapsado é lido de um COOKIE no servidor (o layout) e passado como
 * `colapsadaInicial` — assim o SSR já renderiza no estado certo e NÃO há flash de expandir/
 * colapsar no primeiro paint (a razão de ser cookie, não localStorage).
 *
 * ⚠️ ACESSIBILIDADE: `<nav aria-label>`, `aria-current="page"` no item ativo, e o toggle tem
 * `aria-expanded`. A navegação inteira funciona por teclado (foco visível vem do `:focus-visible`
 * global).
 */

const COOKIE_COLAPSADA = "sidebar_colapsada";

export function Sidebar({
  colapsadaInicial,
  usuario,
  sairAction,
}: {
  readonly colapsadaInicial: boolean;
  /** O identificador do usuário logado (real, da sessão). */
  readonly usuario?: string;
  /** Server Action de logout (form action). */
  readonly sairAction?: () => Promise<void>;
}): React.ReactElement {
  const pathname = usePathname();
  // O estado vive no cookie; o toggle o reescreve e força um re-render por reload leve do estado.
  // Sem useState de "aberto/fechado" no cliente além do necessário: o cookie É a verdade.
  const colapsada = colapsadaInicial;

  const alternar = (): void => {
    const nova = !colapsada;
    // 1 ano; SameSite=Lax para o SSR ler no próximo request.
    document.cookie = `${COOKIE_COLAPSADA}=${nova ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    // re-render do servidor para o layout reler o cookie (a sidebar é SSR-first).
    window.location.reload();
  };

  return (
    <aside
      data-chrome
      className={`flex shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] transition-[width] ${
        colapsada ? "w-14" : "w-60"
      }`}
    >
      {/* marca */}
      <div className="flex h-14 items-center gap-2 border-b border-[color:var(--color-border)] px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] text-sm font-bold text-[color:var(--color-primary-fg)]">
          SF
        </div>
        {!colapsada ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-[color:var(--color-ink)]">
              SIAFIC
            </div>
            <div className="truncate text-xs leading-tight text-[color:var(--color-ink-3)]">
              Campina Grande
            </div>
          </div>
        ) : null}
      </div>

      {/* navegação */}
      <nav aria-label="Áreas do sistema" className="flex-1 overflow-y-auto py-2">
        <ul className="flex flex-col gap-0.5 px-2">
          {AREAS.map((area) => {
            const href = `/${area.slug}`;
            const ativo = pathname === href || pathname.startsWith(`${href}/`);
            // ⚠️ Algumas áreas ganham SUBMENU (Relatórios, Administração). Só aparece quando a área
            // está ativa e a sidebar expandida — não polui as outras áreas nem o modo colapsado.
            const grupos = SUBMENUS[area.slug];
            const temSubmenu = grupos !== undefined && ativo && !colapsada;
            return (
              <li key={area.slug}>
                <Link
                  href={href}
                  aria-current={ativo && pathname === href ? "page" : undefined}
                  title={colapsada ? area.rotulo : undefined}
                  className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors ${
                    ativo
                      ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)] ring-1 ring-inset ring-[color:var(--color-primary)]/15"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      ativo ? "bg-[color:var(--color-primary)]" : "bg-[color:var(--color-ink-3)]"
                    }`}
                  />
                  {!colapsada ? <span className="truncate">{area.rotulo}</span> : null}
                </Link>
                {temSubmenu && grupos !== undefined ? (
                  <div className="mb-1 ml-4 mt-0.5 border-l border-[color:var(--color-border)] pl-2">
                    {grupos.map(([grupo, itens]) => (
                      <ul key={grupo} className="flex flex-col gap-0.5">
                        <li className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{grupo}</li>
                        {itens.map((rel) => {
                          const subAtivo = pathname === rel.href;
                          return (
                            <li key={rel.href}>
                              <Link
                                href={rel.href}
                                aria-current={subAtivo ? "page" : undefined}
                                className={`block truncate rounded-[var(--radius-md)] px-2 py-1.5 text-xs transition-colors ${
                                  subAtivo ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)]" : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                                }`}
                              >
                                {rel.numero}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* rodapé da sidebar: usuário REAL (da sessão) + sair + toggle */}
      <div className="border-t border-[color:var(--color-border)] p-2">
        {!colapsada && usuario !== undefined ? (
          <div className="mb-2 flex items-center gap-2 px-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-primary-soft)] text-xs font-semibold uppercase text-[color:var(--color-primary)]">
              {usuario.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[color:var(--color-ink)]" title={usuario}>{usuario}</div>
              <div className="truncate text-xs text-[color:var(--color-ink-3)]">Autenticado</div>
            </div>
            {sairAction !== undefined ? (
              <form action={sairAction}>
                <button type="submit" className="rounded-[var(--radius-md)] px-1.5 py-1 text-xs text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]" title="Sair">
                  Sair
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!colapsada}
          aria-label={colapsada ? "Expandir menu" : "Recolher menu"}
          className="flex w-full items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] py-1.5 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
        >
          {colapsada ? "»" : "« Recolher"}
        </button>
      </div>
    </aside>
  );
}
