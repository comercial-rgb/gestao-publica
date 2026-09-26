"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

/** SELETOR de EXERCÍCIO — ilha client. O dado mora na URL; o Server Component re-consulta a porta. */
export function SeletorExercicio({ exercicio }: { readonly exercicio: string }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [e, setE] = useState(exercicio);

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    p.set("exercicio", e);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-chrome>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <input
          type="number"
          aria-label="Exercício"
          min={2000}
          max={2100}
          className={`${CLASSE} w-24`}
          value={e}
          onChange={(ev) => setE(ev.target.value)}
        />
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
