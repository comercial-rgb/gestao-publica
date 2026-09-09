"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUiContext } from "../../../../../lib/ui-context";

/**
 * SELETOR de EXERCÍCIO × BIMESTRE do RREO — ilha client.
 *
 * ⚠️ O DADO MORA NA URL, não no estado local. A página é um Server Component: ela lê
 * `?exercicio=&bimestre=` e re-consulta a porta a cada mudança. Por isso o seletor NÃO guarda
 * estado próprio de bimestre — ele empurra para a URL (`router.push`), e o servidor renderiza de
 * novo. O exercício vem do `UiContext` (o mesmo do cabeçalho), reusado aqui: mudar o exercício
 * global muda o relatório, como manda a fatia.
 */

const BIMESTRES = [1, 2, 3, 4, 5, 6] as const;
const CLASSE_SELECT =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorBimestreRreo({
  bimestre,
  exercicio,
}: {
  readonly bimestre: number;
  readonly exercicio: number;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exerciciosDisponiveis, setExercicio } = useUiContext();

  const navegar = (proxExercicio: number, proxBimestre: number): void => {
    const q = new URLSearchParams(params.toString());
    q.set("exercicio", String(proxExercicio));
    q.set("bimestre", String(proxBimestre));
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-chrome>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <select
          aria-label="Exercício do relatório"
          className={CLASSE_SELECT}
          value={exercicio}
          onChange={(e) => {
            const ano = Number(e.target.value);
            setExercicio(ano); // mantém o contexto global em sincronia
            navegar(ano, bimestre);
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

      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Bimestre</span>
        <select
          aria-label="Bimestre de referência"
          className={CLASSE_SELECT}
          value={bimestre}
          onChange={(e) => navegar(exercicio, Number(e.target.value))}
        >
          {BIMESTRES.map((b) => (
            <option key={b} value={b}>
              {b}º bimestre
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
