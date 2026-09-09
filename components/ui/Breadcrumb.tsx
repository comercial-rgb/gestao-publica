"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaDaRota, rotuloDaRota } from "../../lib/navegacao";

/**
 * BREADCRUMB — derivado da rota (client: `usePathname`). Início › Área › (sub).
 *
 * Simples de propósito: dois níveis bastam à profundidade deste app. O rótulo da área vem do
 * mapa de navegação (a linguagem do usuário); os segmentos além dela aparecem crus até ganharem
 * páginas próprias.
 */
export function Breadcrumb(): React.ReactElement {
  const pathname = usePathname();
  const area = areaDaRota(pathname);
  const segmentos = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Trilha de navegação" className="flex items-center gap-1.5 text-sm">
      <Link href="/" className="text-[color:var(--color-ink-2)] hover:text-[color:var(--color-primary)]">
        Início
      </Link>
      {area !== null ? (
        <>
          <span aria-hidden className="text-[color:var(--color-ink-3)]">
            ›
          </span>
          <Link
            href={`/${area.slug}`}
            className="font-medium text-[color:var(--color-ink)] hover:text-[color:var(--color-primary)]"
          >
            {area.rotulo}
          </Link>
          {segmentos.slice(1).map((seg, i) => {
            // Rótulo acentuado da rota cumulativa (`/receita/arrecadacoes` → "Arrecadação"); se não
            // houver mapa, capitaliza o segmento cru como antes.
            const rotaAteAqui = `/${segmentos.slice(0, i + 2).join("/")}`;
            const rotulo = rotuloDaRota(rotaAteAqui);
            return (
              <span key={`${seg}-${i}`} className="flex items-center gap-1.5">
                <span aria-hidden className="text-[color:var(--color-ink-3)]">
                  ›
                </span>
                <span className={`text-[color:var(--color-ink-2)]${rotulo === null ? " capitalize" : ""}`}>{rotulo ?? seg}</span>
              </span>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}
