import { Breadcrumb } from "./Breadcrumb";
import { SeletorExercicio, SeletorUg } from "./Seletores";

/**
 * CABEÇALHO — breadcrumb à esquerda, seletores de exercício/UG à direita.
 *
 * É Server Component; as partes interativas (breadcrumb usa a rota, seletores usam o contexto)
 * são ilhas client importadas. O cabeçalho em si não tem estado.
 */
export function Header(): React.ReactElement {
  return (
    <header
      data-chrome
      className="flex h-14 shrink-0 items-center justify-between gap-5 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-8"
    >
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <SeletorExercicio />
        <SeletorUg />
      </div>
    </header>
  );
}
