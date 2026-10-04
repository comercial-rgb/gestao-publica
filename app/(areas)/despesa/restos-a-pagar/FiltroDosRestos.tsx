"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

/** FILTRO dos restos a pagar — ilha client. O recorte mora na URL. */
export function FiltroDosRestos({
  exercicio,
  tipo,
}: {
  readonly exercicio: string;
  readonly tipo: string;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [e, setE] = useState(exercicio);
  const [t, setT] = useState(tipo);

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    if (e.trim() !== "") p.set("exercicio", e.trim());
    else p.delete("exercicio");
    if (t !== "") p.set("tipo", t);
    else p.delete("tipo");
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-chrome>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício de origem</span>
        <input
          type="number"
          aria-label="Exercício de origem"
          min={2000}
          max={2100}
          placeholder="todos"
          className={`${CLASSE} w-28`}
          value={e}
          onChange={(ev) => setE(ev.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Tipo</span>
        <select aria-label="Tipo de resto a pagar" className={`${CLASSE} w-48`} value={t} onChange={(ev) => setT(ev.target.value)}>
          <option value="">Todos</option>
          <option value="PROCESSADO">Processados</option>
          <option value="NAO_PROCESSADO">Não processados</option>
        </select>
      </label>
      <button
        type="button"
        onClick={aplicar}
        className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 text-sm font-medium text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]"
      >
        Aplicar
      </button>
    </div>
  );
}
