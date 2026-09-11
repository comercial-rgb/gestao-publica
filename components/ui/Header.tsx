import { Breadcrumb } from "./Breadcrumb";
import { BuscaGlobal } from "./BuscaGlobal";
import { SeletorExercicio, SeletorUg } from "./Seletores";
import type { DestinoDaBusca } from "../../lib/busca-global";

/**
 * CABEÇALHO — breadcrumb à esquerda, seletores de exercício/UG à direita.
 *
 * É Server Component; as partes interativas (breadcrumb usa a rota, seletores usam o contexto)
 * são ilhas client importadas. O cabeçalho em si não tem estado.
 *
 * ⚠️ A BUSCA RECEBE O ÍNDICE JÁ RECORTADO PELA PERMISSÃO — quem calcula é o layout, no
 * servidor, com as mesmas tabelas de `autorizar`. Deixar o recorte para o cliente mandaria
 * a lista inteira de telas no HTML, e esconder na tela não é deixar de enviar.
 */
export function Header({
  destinosDaBusca = [],
}: {
  readonly destinosDaBusca?: readonly DestinoDaBusca[];
}): React.ReactElement {
  return (
    <header
      data-chrome
      className="flex h-14 shrink-0 items-center justify-between gap-5 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-8"
    >
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <BuscaGlobal destinos={destinosDaBusca} />
        <SeletorExercicio />
        <SeletorUg />
      </div>
    </header>
  );
}
