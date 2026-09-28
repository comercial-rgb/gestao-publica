"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SELETOR do exercício — ilha client, o recorte mora na URL.
 *
 * ⚠️ O EXERCÍCIO NA URL, e não num estado de componente: a virada é um ato que alguém confere duas
 * vezes antes de clicar, e o endereço tem de poder ser recarregado e mandado para outra pessoa sem
 * mudar de ano no caminho.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorDoExercicioDaVirada({
  exercicios,
  exercicio,
}: {
  readonly exercicios: readonly number[];
  readonly exercicio: number;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navegar = (valor: string): void => {
    const p = new URLSearchParams(params.toString());
    if (valor === "") p.delete("exercicio");
    else p.set("exercicio", valor);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-chrome>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <select
          aria-label="Exercício do encerramento"
          className={CLASSE}
          data-seletor="exercicio"
          onChange={(e) => navegar(e.target.value)}
          value={String(exercicio)}
        >
          {exercicios.map((a) => (
            <option key={a} value={String(a)}>
              {a}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
