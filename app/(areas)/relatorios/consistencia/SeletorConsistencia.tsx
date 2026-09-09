"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** SELETOR de exercício × escopo do Relatório de Consistência — ilha client, o dado mora na URL. */
const CLASSE = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

const ESCOPOS: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "PRE_ENVIO", rotulo: "Pré-envio (7.27)" },
  { valor: "MENSAL", rotulo: "Mensal (5.128)" },
  { valor: "PLANEJAMENTO", rotulo: "Planejamento (5.129)" },
  { valor: "ANUAL", rotulo: "Anual (5.130)" },
];

export function SeletorConsistencia({ exercicio, escopo }: { readonly exercicio: number; readonly escopo: string }): React.ReactElement {
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
        <input type="number" defaultValue={exercicio} className={`${CLASSE} w-24`} onBlur={(e) => navegar("exercicio", e.target.value)} aria-label="Exercício" />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Escopo</span>
        <select aria-label="Escopo" className={CLASSE} value={escopo} onChange={(e) => navegar("escopo", e.target.value)}>
          {ESCOPOS.map((s) => (
            <option key={s.valor} value={s.valor}>{s.rotulo}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
