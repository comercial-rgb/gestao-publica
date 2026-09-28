"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SELETOR de exercício × bimestre — ilha client, o dado mora na URL.
 *
 * ⚠️ O BIMESTRE, e não um par de datas: o par orçamentário é lido do RREO, que é bimestral. Duas
 * datas livres deixariam o operador comparar receita de um recorte com despesa de outro — e a
 * diferença apareceria como resíduo de consolidação, que é justamente o número que esta tela
 * existe para ser confiável.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

const BIMESTRES: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "1", rotulo: "1º bimestre (jan-fev)" },
  { valor: "2", rotulo: "2º bimestre (mar-abr)" },
  { valor: "3", rotulo: "3º bimestre (mai-jun)" },
  { valor: "4", rotulo: "4º bimestre (jul-ago)" },
  { valor: "5", rotulo: "5º bimestre (set-out)" },
  { valor: "6", rotulo: "6º bimestre (nov-dez)" },
];

export function SeletorDoPeriodo({
  exercicio,
  bimestre,
}: {
  readonly exercicio: number;
  readonly bimestre: number;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navegar = (chave: string, valor: string): void => {
    const p = new URLSearchParams(params.toString());
    p.set(chave, valor);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-chrome>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <input
          aria-label="Exercício"
          className={`${CLASSE} w-24`}
          defaultValue={exercicio}
          onBlur={(e) => navegar("exercicio", e.target.value)}
          type="number"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Período</span>
        <select
          aria-label="Período"
          className={CLASSE}
          onChange={(e) => navegar("bimestre", e.target.value)}
          value={String(bimestre)}
        >
          {BIMESTRES.map((b) => (
            <option key={b.valor} value={b.valor}>
              {b.rotulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
