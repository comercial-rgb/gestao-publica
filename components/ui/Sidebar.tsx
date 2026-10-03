"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { abaDaRota, menuVisivel } from "../../lib/navegacao";
import { identidadeNeutra, type IdentidadeDaTela } from "../../lib/identidade/produto";
import { Marca } from "./Marca";
import { useShell } from "./Shell";
import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";

/** A sigla da aba na barra recolhida ("Orçamento e Despesa" → "OD"). */
function sigla(rotulo: string): string {
  return rotulo
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

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
  areasVisiveis,
  identidade = identidadeNeutra(),
}: {
  readonly colapsadaInicial: boolean;
  /** A identidade da tela (produto + ente + ambiente), lida no servidor pela porta. */
  readonly identidade?: IdentidadeDaTela;
  /** O identificador do usuário logado (real, da sessão). */
  readonly usuario?: string;
  /** Server Action de logout (form action). */
  readonly sairAction?: () => Promise<void>;
  /**
   * OS SLUGS QUE ESTE USUÁRIO PODE VER — calculados NO SERVIDOR, a partir das mesmas
   * permissões que `autorizar` confere.
   *
   * ⚠️ ELES CHEGAM POR PROPS, e não de uma consulta daqui: este componente é client, o
   * Prisma não atravessa a fronteira, e `test/ui/fronteira-ui.test.ts` recusa a tentativa.
   * ⚠️ E A LISTA NÃO TEM PADRÃO "TUDO". Omitir a prop mostra TODAS as áreas, o que só é
   * correto em teste de render isolado; o layout sempre a passa.
   */
  readonly areasVisiveis?: readonly string[];
}): React.ReactElement {
  const pathname = usePathname();
  // O estado vive no cookie; o toggle o reescreve e força um re-render por reload leve do estado.
  // Sem useState de "aberto/fechado" no cliente além do necessário: o cookie É a verdade.
  const colapsada = colapsadaInicial;
  // ⚠️ NA LARGURA ESTREITA (< 768 px) a sidebar vira um painel sobreposto, aberto pelo botão
  // do cabeçalho (`BotaoMenu`) — e nunca colapsada: colapsar só faz sentido com espaço ao lado.
  const { menuAberto, idDoMenu } = useShell();

  // ⚠️ V31 — AS ABAS DO CONTADOR. O recorte usa as áreas que o SERVIDOR liberou (props); aqui só se
  // arruma. A aba da rota atual abre sozinha; as outras abrem e fecham pelo botão, sem navegar.
  const abas = useMemo(() => menuVisivel(areasVisiveis), [areasVisiveis]);
  // ⚠️ O LINK LEVA O CONTEXTO: a tela abre já no exercício e na unidade do cabeçalho, sem uma segunda
  // ida ao servidor para corrigir a URL. O servidor ainda confere o recorte (a URL não amplia acesso).
  const { exercicio, ug, ugsDisponiveis } = useUiContext();
  const codigoUg = ug === UG_CONSOLIDADO ? null : (ugsDisponiveis.find((u) => u.id === ug)?.codigo ?? null);
  const comContexto = (href: string): string =>
    `${href}?exercicio=${String(exercicio)}${codigoUg === null ? "" : `&ug=${encodeURIComponent(codigoUg)}`}`;
  const abaAtual = abaDaRota(pathname, abas);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => new Set(abaAtual === null ? [] : [abaAtual]));
  useEffect(() => {
    if (abaAtual !== null) setAbertas((a) => (a.has(abaAtual) ? a : new Set([...a, abaAtual])));
  }, [abaAtual]);
  const alternarAba = (id: string): void =>
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const alternar = (): void => {
    const nova = !colapsada;
    // 1 ano; SameSite=Lax para o SSR ler no próximo request.
    document.cookie = `${COOKIE_COLAPSADA}=${nova ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    // re-render do servidor para o layout reler o cookie (a sidebar é SSR-first).
    window.location.reload();
  };

  return (
    <aside
      id={idDoMenu}
      data-chrome
      data-superficie="grafite"
      data-menu-aberto={menuAberto ? "sim" : "nao"}
      className={`${menuAberto ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] transition-[width] md:static md:flex ${
        colapsada ? "md:w-14" : "md:w-60"
      }`}
    >
      {/* marca — produto + ente (ou ambiente), da porta de identidade; colapsada, só o símbolo */}
      <div className="flex h-14 items-center border-b border-[color:var(--color-border)] px-3">
        <Marca identidade={identidade} somenteSimbolo={colapsada && !menuAberto} />
      </div>

      {/* navegação — as abas do contador (lib/navegacao.ts, MENU_DO_CONTADOR), recortadas no servidor */}
      <nav aria-label="Áreas do sistema" className="flex-1 overflow-y-auto py-2">
        <ul className="flex flex-col gap-0.5 px-2">
          <li>
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              title={colapsada && !menuAberto ? "Início" : undefined}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
                pathname === "/" ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)]" : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
              }`}
            >
              <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-ink-3)]" />
              {!colapsada || menuAberto ? <span className="truncate">Início</span> : null}
            </Link>
          </li>
          {abas.map((aba) => {
            const ativa = aba.id === abaAtual;
            const expandida = abertas.has(aba.id);
            const idDoPainel = `menu-${aba.id}`;
            const primeiro = aba.grupos[0]?.itens[0]?.href ?? "/";
            if (colapsada && !menuAberto) {
              // Recolhida: a aba vira atalho para a primeira tela dela, com o nome no title.
              return (
                <li key={aba.id}>
                  <Link
                    href={comContexto(primeiro)}
                    title={aba.rotulo}
                    className={`flex justify-center rounded-[var(--radius-md)] py-2 text-xs font-semibold ${
                      ativa ? "bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary)]" : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                    }`}
                  >
                    {sigla(aba.rotulo)}
                  </Link>
                </li>
              );
            }
            return (
              <li key={aba.id} data-aba={aba.id}>
                <button
                  type="button"
                  aria-expanded={expandida}
                  aria-controls={idDoPainel}
                  onClick={() => alternarAba(aba.id)}
                  className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors ${
                    ativa
                      ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)] ring-1 ring-inset ring-[color:var(--color-primary)]/15"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                  }`}
                >
                  <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ativa ? "bg-[color:var(--color-primary)]" : "bg-[color:var(--color-ink-3)]"}`} />
                  <span className="flex-1 truncate">{aba.rotulo}</span>
                  <span aria-hidden className="text-xs text-[color:var(--color-ink-3)]">{expandida ? "−" : "+"}</span>
                </button>
                {expandida ? (
                  <div id={idDoPainel} className="mb-1 ml-4 mt-0.5 border-l border-[color:var(--color-border)] pl-2">
                    {aba.grupos.map((grupo) => (
                      <ul key={grupo.rotulo} className="flex flex-col gap-0.5">
                        <li className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{grupo.rotulo}</li>
                        {grupo.itens.map((item) => {
                          const subAtivo = pathname === item.href;
                          return (
                            <li key={`${grupo.rotulo}-${item.href}`}>
                              <Link
                                href={comContexto(item.href)}
                                aria-current={subAtivo ? "page" : undefined}
                                className={`block rounded-[var(--radius-md)] px-2 py-1.5 text-xs leading-snug transition-colors ${
                                  subAtivo ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)]" : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"
                                }`}
                              >
                                {item.rotulo}
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
        {(!colapsada || menuAberto) && usuario !== undefined ? (
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
          className="hidden w-full items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] py-1.5 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] md:flex"
        >
          {colapsada ? "»" : "« Recolher"}
        </button>
      </div>
    </aside>
  );
}
