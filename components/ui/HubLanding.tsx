import { Card, CardNavegacao } from "./Card";
import { PageHeader } from "./PageHeader";

/**
 * LANDING DE ÁREA (hub) — o índice de uma área funcional em linguagem de produto.
 *
 * Cada card ou LEVA a uma tela que existe (`href`), ou DESCREVE onde o dado da área aparece. Nunca
 * anuncia "em construção" nem promete entrega: o que não tem tela própria diz, com honestidade, em
 * que tela o número já pode ser lido. É o mesmo padrão visual das landings de Receita/Despesa.
 *
 * ⚠️ Imports RELATIVOS na UI (o alias @/ conflita com o webpack do Next neste setup).
 */

export interface ItemHub {
  readonly titulo: string;
  readonly descricao: string;
  /** A tela que existe para este item. Ausente = card informativo (o dado aparece na descrição). */
  readonly href?: string;
  /** Etiqueta curta à direita do título (ex.: "Relatórios", "Integrações") — de onde vem o dado. */
  readonly onde?: string;
}

function Conteudo(item: ItemHub): React.ReactElement {
  if (item.href !== undefined) {
    return (
      <CardNavegacao
        href={item.href}
        titulo={item.titulo}
        descricao={item.descricao}
        badge={item.onde !== undefined ? <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-ink-3)]">{item.onde}</span> : undefined}
      />
    );
  }

  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold text-[color:var(--color-ink)]">{item.titulo}</h3>
        {item.onde !== undefined ? (
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-[color:var(--color-ink-3)]">
            {item.onde}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{item.descricao}</p>
    </Card>
  );
}

export function HubLanding({
  titulo,
  subtitulo,
  itens,
  rodape,
}: {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly itens: readonly ItemHub[];
  readonly rodape?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader titulo={titulo} subtitulo={subtitulo} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item) =>
          item.href !== undefined ? (
            <div key={item.titulo}>{Conteudo(item)}</div>
          ) : (
            <div key={item.titulo}>{Conteudo(item)}</div>
          )
        )}
      </div>
      {rodape !== undefined ? <div className="text-sm leading-relaxed text-[color:var(--color-ink-2)]">{rodape}</div> : null}
    </div>
  );
}
