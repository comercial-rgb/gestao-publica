"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

/** SELETOR de DATA DE CORTE — ilha client. O balanço patrimonial é um retrato numa data. */
export function SeletorCorte({ corte }: { readonly corte: string }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [c, setC] = useState(corte);

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    p.set("corte", c);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-chrome>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Posição em</span>
        <input type="date" aria-label="Data de corte" className={CLASSE} value={c} onChange={(e) => setC(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={aplicar}
        className="h-8 rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 text-sm font-medium text-[color:var(--color-primary-fg)] hover:opacity-90"
      >
        Aplicar
      </button>
    </div>
  );
}
