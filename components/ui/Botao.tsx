"use client";

import { CLASSE_BOTAO_PRIMARIO } from "./Formulario";

/**
 * BOTÃO — as quatro variantes que o scaffold usa.
 *
 * ⚠️ O PRIMÁRIO REUSA `CLASSE_BOTAO_PRIMARIO` (Formulario.tsx), que já é o botão de submissão de
 * todos os formulários existentes. Redefinir o estilo aqui faria o botão do scaffold divergir do
 * botão das telas escritas à mão no dia em que o azul mudasse — e ninguém acharia as duas cópias.
 */

export type VarianteBotao = "primario" | "secundario" | "perigo" | "texto";

const CLASSE_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const CLASSES: Record<VarianteBotao, string> = {
  // ⚠️ O `inline-flex … gap-2` É ACRESCENTADO, não substituído. `CLASSE_BOTAO_PRIMARIO` é a mesma
  // classe dos formulários escritos à mão, e trocá-la aqui faria o botão do scaffold divergir do
  // deles. Mas ela não tem layout de flex — e sem isso o spinner do `carregando` encosta no texto
  // ("⟳Processando"). Foi a página de fumaça que mostrou; teste de comportamento não vê colisão.
  primario: `${CLASSE_BOTAO_PRIMARIO} inline-flex items-center justify-center gap-2`,
  secundario: `${CLASSE_BASE} border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:border-[color:var(--color-ink-3)]`,
  // ⚠️ O PERIGO É CONTORNADO, NÃO PREENCHIDO. Um botão vermelho sólido ao lado de um azul sólido
  // compete pela atenção e vira o alvo do clique apressado — e a ação destrutiva é justamente a
  // que não pode ser clicada por reflexo.
  perigo: `${CLASSE_BASE} border border-[color:var(--color-negativo)] bg-[color:var(--color-surface)] text-[color:var(--color-negativo)] hover:bg-[color:var(--color-status-erro-bg)]`,
  texto: `${CLASSE_BASE} px-2 text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-soft)]`,
};

export interface BotaoProps {
  readonly children: React.ReactNode;
  readonly variante?: VarianteBotao;
  readonly type?: "button" | "submit";
  /**
   * ⚠️ ELE DESABILITA, E É ISSO QUE IMPEDE O DUPLO SUBMIT. Num sistema em que o clique vira
   * empenho, um duplo clique numa rede lenta é um empenho duplicado — e o segundo tem número
   * próprio, entra no razão e precisa ser ANULADO (não apagado). Prevenir é mais barato.
   */
  readonly carregando?: boolean;
  readonly desabilitado?: boolean;
  readonly onClick?: (() => void) | undefined;
  readonly className?: string | undefined;
}

export function Botao({
  children,
  variante = "primario",
  type = "button",
  carregando = false,
  desabilitado = false,
  onClick,
  className = "",
}: BotaoProps): React.ReactElement {
  const travado = carregando || desabilitado;

  return (
    <button
      type={type}
      className={`${CLASSES[variante]} ${className}`}
      disabled={travado}
      // ⚠️ O `disabled` já barra o clique no browser, mas o guard aqui é a segunda linha: um
      // `onClick` disparado por teclado ou por teste programático não passa pelo botão.
      onClick={travado ? undefined : onClick}
      {...(carregando ? { "aria-busy": true } : {})}
    >
      {carregando ? (
        <>
          {/* `aria-hidden` no spinner e o texto no `sr-only`: o leitor anuncia o ESTADO, não o
              desenho. Sem isso, quem usa leitor ouviria o rótulo antigo e acharia que nada mudou. */}
          <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="sr-only">Processando…</span>
        </>
      ) : null}
      {children}
    </button>
  );
}
