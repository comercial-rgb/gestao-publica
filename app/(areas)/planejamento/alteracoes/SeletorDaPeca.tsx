"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SELETOR da peça × corte — ilha client, o dado mora na URL.
 *
 * ⚠️ O CORTE É UMA DATA, e é ele que responde "como a peça estava em tal dia". A versão da peça
 * não é um rótulo guardado: é o estado dela até um ato. Em branco, mostra o vigente.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export interface OpcaoDePeca {
  readonly valor: string;
  readonly rotulo: string;
}

export function SeletorDaPeca({
  pecas,
  selecionada,
  ate,
}: {
  readonly pecas: readonly OpcaoDePeca[];
  readonly selecionada: string;
  readonly ate: string;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navegar = (chave: string, valor: string): void => {
    const p = new URLSearchParams(params.toString());
    if (valor === "") p.delete(chave);
    else p.set(chave, valor);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-chrome>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Peça</span>
        <select
          aria-label="Peça de planejamento"
          className={CLASSE}
          data-seletor="peca"
          onChange={(e) => navegar("peca", e.target.value)}
          value={selecionada}
        >
          {pecas.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Situação até</span>
        <input
          aria-label="Situação até a data"
          className={`${CLASSE} w-40`}
          data-seletor="ate"
          defaultValue={ate}
          onBlur={(e) => navegar("ate", e.target.value)}
          type="date"
        />
      </label>
    </div>
  );
}
