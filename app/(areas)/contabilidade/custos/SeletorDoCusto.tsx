"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SELETOR do exercício × centro — ilha client, o recorte mora na URL.
 *
 * ⚠️ O CENTRO ESCOLHIDO ABRE A COMPOSIÇÃO. Sem ele, a tela mostra o acumulado; com ele, cada parte
 * com a liquidação de onde veio. É esse o caminho que responde "de onde veio este número?" — e é
 * por isso que ele está na URL, e não num estado que se perde ao recarregar ou ao compartilhar o
 * endereço com quem perguntou.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export interface OpcaoDoCusto {
  readonly valor: string;
  readonly rotulo: string;
}

export function SeletorDoCusto({
  exercicios,
  exercicio,
  centros,
  centro,
}: {
  readonly exercicios: readonly number[];
  readonly exercicio: number;
  readonly centros: readonly OpcaoDoCusto[];
  readonly centro: string;
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
        <span className="uppercase tracking-wide">Exercício</span>
        <select
          aria-label="Exercício"
          className={CLASSE}
          data-seletor="exercicio"
          onChange={(e) => navegar("exercicio", e.target.value)}
          value={String(exercicio)}
        >
          {exercicios.map((a) => (
            <option key={a} value={String(a)}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Composição do centro</span>
        <select
          aria-label="Centro de custo cuja composição será detalhada"
          className={`${CLASSE} max-w-72`}
          data-seletor="centro"
          onChange={(e) => navegar("centro", e.target.value)}
          value={centro}
        >
          <option value="">Nenhum — mostrar só o acumulado</option>
          {centros.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
