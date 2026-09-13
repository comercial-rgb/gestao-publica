import { Breadcrumb } from "./Breadcrumb";
import { BuscaGlobal } from "./BuscaGlobal";
import { SeletorExercicio, SeletorUg } from "./Seletores";
import { BotaoMenu } from "./Shell";
import type { DestinoDaBusca } from "../../lib/busca-global";
import type { IdentidadeDaTela } from "../../lib/identidade/produto";

/**
 * CABEÇALHO — o botão do menu (só na largura estreita), o breadcrumb, a busca e os seletores de
 * exercício e unidade. O CONTEXTO fica visível: ente e ambiente no cabeçalho (V6 P0.2), e o
 * exercício/unidade nos seletores — o operador sabe onde está sem abrir nada.
 *
 * É Server Component; as partes interativas são ilhas client importadas.
 *
 * ⚠️ A BUSCA RECEBE O ÍNDICE JÁ RECORTADO PELA PERMISSÃO — quem calcula é o layout, no
 * servidor, com as mesmas tabelas de `autorizar`. Deixar o recorte para o cliente mandaria
 * a lista inteira de telas no HTML, e esconder na tela não é deixar de enviar.
 */
export function Header({
  destinosDaBusca = [],
  identidade,
}: {
  readonly destinosDaBusca?: readonly DestinoDaBusca[];
  readonly identidade?: IdentidadeDaTela;
}): React.ReactElement {
  return (
    <header
      data-chrome
      className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-2 md:px-8 md:py-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <BotaoMenu />
        <Breadcrumb />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {identidade !== undefined && identidade.rotuloDoAmbiente !== null ? (
          <span
            data-ambiente
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-status-alerta-fg)]"
          >
            {identidade.rotuloDoAmbiente}
          </span>
        ) : null}
        <BuscaGlobal destinos={destinosDaBusca} />
        <SeletorExercicio />
        <SeletorUg />
      </div>
    </header>
  );
}
