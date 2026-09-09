"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUiContext } from "../../../../../lib/ui-context";

/**
 * SELETOR de EXERCÍCIO DE REFERÊNCIA do Anexo 7 — ilha client.
 *
 * ⚠️ O dado mora na URL (a página é Server Component e re-consulta a porta a cada mudança). O
 * exercício vem do `UiContext` (o mesmo do cabeçalho) — mudar o exercício global muda o ano de
 * referência do demonstrativo.
 */
const CLASSE_SELECT =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorExercicioAnexo7({
  exercicio,
}: {
  readonly exercicio: number;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exerciciosDisponiveis, setExercicio } = useUiContext();

  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]" data-chrome>
      <span className="uppercase tracking-wide">Exercício de referência</span>
      <select
        aria-label="Exercício de referência"
        className={CLASSE_SELECT}
        value={exercicio}
        onChange={(e) => {
          const ano = Number(e.target.value);
          setExercicio(ano);
          const q = new URLSearchParams(params.toString());
          q.set("exercicio", String(ano));
          router.push(`${pathname}?${q.toString()}`);
        }}
      >
        {exerciciosDisponiveis.map((ex) => (
          <option key={ex.ano} value={ex.ano}>
            {ex.ano}
            {ex.encerrado ? " (encerrado)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
