import { Card } from "./Card";
import { CLASSE_BOTAO_PRIMARIO } from "./Formulario";

/**
 * BARRA DE FILTROS — composição sobre `Card`, não um container novo.
 *
 * ⚠️ ELA NÃO REDESENHA A MOLDURA. `Card` já é o painel padrão do sistema (borda, superfície,
 * padding, sombra). Reimplementar isso aqui criaria dois painéis que hoje são idênticos e
 * divergiriam no dia em que o raio ou a sombra mudassem — e ninguém acharia a segunda cópia.
 * O que este componente acrescenta é a ANATOMIA: o grid dos campos e o par limpar/aplicar.
 *
 * ⚠️ É UM `<form method="get">`, e isso é o desenho todo. Os filtros viram query string por
 * submissão nativa — a lista fica linkável, sobrevive ao refresh e funciona sem JS. Um
 * `onSubmit` com `router.push` faria o mesmo, pior: exigiria `"use client"` e perderia o
 * "abrir em nova aba".
 *
 * ⚠️ POR ISSO TAMBÉM NÃO HÁ BOTÃO "APLICAR" COM `onClick`: quem aplica é o submit do form, e
 * `Enter` dentro de qualquer campo já funciona — que é como quem digita o dia inteiro espera.
 */

export interface BarraFiltrosProps {
  /** Os campos, tipicamente `CampoTexto`/`CampoSelect` com o seu `largura`. */
  readonly children: React.ReactNode;
  /** O href que zera os filtros — normalmente a própria rota, sem query. */
  readonly hrefLimpar: string;
  /** `action` do form. Ausente = a própria rota. */
  readonly action?: string | undefined;
  readonly rotuloAplicar?: string;
}

export function BarraFiltros({
  children,
  hrefLimpar,
  action,
  rotuloAplicar = "Aplicar filtros",
}: BarraFiltrosProps): React.ReactElement {
  return (
    <Card>
      <form
        method="get"
        {...(action !== undefined ? { action } : {})}
        aria-label="Filtros da lista"
      >
        {/* O mesmo grid de 4 colunas dos formulários: o `largura` de cada campo controla o span,
            e abaixo de 768px tudo colapsa para UMA coluna. ⚠️ É `md:` (768px) e não `sm:` (640px)
            — com `sm:` o grid ficaria em 4 colunas espremidas justamente em 768. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">{children}</div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-[color:var(--color-border)] pt-4">
          {/* ⚠️ LIMPAR É LINK, não botão de reset. `type="reset"` devolveria os campos aos valores
              INICIAIS do HTML — que, numa lista já filtrada, são os filtros vigentes. O usuário
              clicaria em "limpar" e nada mudaria. O link vai para a rota sem query. */}
          <a
            href={hrefLimpar}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] px-4 text-sm font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
          >
            Limpar
          </a>
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>
            {rotuloAplicar}
          </button>
        </div>
      </form>
    </Card>
  );
}
