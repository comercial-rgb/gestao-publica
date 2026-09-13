"use client";

import { createContext, useContext, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * O SHELL RESPONSIVO (V6 P0.2/P0.3) — a única coisa que este contexto guarda é se o MENU
 * está aberto na largura estreita (< 768 px). Em telas largas a sidebar é fixa e o estado é
 * irrelevante. O menu fecha sozinho quando a rota muda (o usuário escolheu um destino).
 *
 * ⚠️ Nada de dado aqui: permissões, áreas visíveis e identidade continuam chegando por
 * props do layout (servidor). Este provider não sabe quem está logado.
 */
interface ShellValor {
  readonly menuAberto: boolean;
  readonly setMenuAberto: (aberto: boolean) => void;
  /** O id do painel do menu (de `useId`, nunca literal) — liga `aria-controls` ao `<aside>`. */
  readonly idDoMenu: string;
}

const ShellContext = createContext<ShellValor | null>(null);

export function ShellProvider({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const [menuAberto, setMenuAberto] = useState(false);
  const idDoMenu = useId();
  const pathname = usePathname();
  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);
  return <ShellContext.Provider value={{ menuAberto, setMenuAberto, idDoMenu }}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValor {
  const v = useContext(ShellContext);
  if (v === null) return { menuAberto: false, setMenuAberto: () => undefined, idDoMenu: "menu-principal" };
  return v;
}

/** O botão do menu — só aparece na largura estreita (`md:hidden`). */
export function BotaoMenu(): React.ReactElement {
  const { menuAberto, setMenuAberto, idDoMenu } = useShell();
  return (
    <button
      type="button"
      onClick={() => setMenuAberto(!menuAberto)}
      aria-expanded={menuAberto}
      aria-controls={idDoMenu}
      aria-label={menuAberto ? "Fechar o menu" : "Abrir o menu"}
      data-botao-menu
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] md:hidden"
    >
      <span aria-hidden className="flex flex-col gap-[3px]">
        <span className="block h-0.5 w-4 bg-current" />
        <span className="block h-0.5 w-4 bg-current" />
        <span className="block h-0.5 w-4 bg-current" />
      </span>
    </button>
  );
}

/** O pano atrás do menu aberto na largura estreita — clicar fecha. */
export function PanoDoMenu(): React.ReactElement | null {
  const { menuAberto, setMenuAberto } = useShell();
  if (!menuAberto) return null;
  return (
    <button
      type="button"
      aria-label="Fechar o menu"
      onClick={() => setMenuAberto(false)}
      className="fixed inset-0 z-30 bg-[color:var(--color-ink)]/40 md:hidden"
    />
  );
}
