"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUiContext } from "../../../../../lib/ui-context";

/** SELETOR de EXERCÍCIO × QUADRIMESTRE do RGF — ilha client; o dado mora na URL. */
const CLASSE = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorQuadrimestre({ quadrimestre, exercicio }: { readonly quadrimestre: number; readonly exercicio: number }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exerciciosDisponiveis, setExercicio } = useUiContext();

  const navegar = (ex: number, q: number): void => {
    const p = new URLSearchParams(params.toString());
    p.set("exercicio", String(ex));
    p.set("quadrimestre", String(q));
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-chrome>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <select aria-label="Exercício" className={CLASSE} value={exercicio} onChange={(e) => { setExercicio(Number(e.target.value)); navegar(Number(e.target.value), quadrimestre); }}>
          {exerciciosDisponiveis.map((ex) => <option key={ex.ano} value={ex.ano}>{ex.ano}{ex.encerrado ? " (encerrado)" : ""}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Quadrimestre</span>
        <select aria-label="Quadrimestre" className={CLASSE} value={quadrimestre} onChange={(e) => navegar(exercicio, Number(e.target.value))}>
          {[1, 2, 3].map((q) => <option key={q} value={q}>{q}º quadrimestre</option>)}
        </select>
      </label>
    </div>
  );
}
