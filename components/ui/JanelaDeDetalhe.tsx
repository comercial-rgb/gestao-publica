"use client";

import { useId, useRef } from "react";

/**
 * A JANELA DE DETALHE (V22) — o modal da lista: clicar no número abre o documento por cima da
 * tabela, sem perder a posição na lista.
 *
 * ⚠️ É O `<dialog>` NATIVO, com `showModal()`: o navegador dá o foco preso dentro da janela, o
 * Esc que fecha, o fundo inerte para leitor de tela e o `::backdrop`. Reescrever isso à mão é
 * reescrever acessibilidade que já vem pronta — e errar em algum dos quatro.
 *
 * O conteúdo chega PRONTO do servidor (`children`): a janela não busca nada, não decide nada e
 * não mostra nada que a página já não pudesse mostrar.
 */
export function JanelaDeDetalhe({
  gatilho,
  rotuloDoGatilho,
  titulo,
  subtitulo,
  children,
}: {
  /** O que aparece na célula (o número do documento). */
  readonly gatilho: React.ReactNode;
  /** O nome acessível do botão ("Abrir o empenho 2026NE000001"). */
  readonly rotuloDoGatilho: string;
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={rotuloDoGatilho}
        aria-haspopup="dialog"
        className="font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
      >
        {gatilho}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${id}-titulo`}
        onClick={(e) => {
          // clique no fundo (fora da caixa) fecha; clique dentro não
          if (e.target === ref.current) ref.current.close();
        }}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-0 text-left text-[color:var(--color-ink)] shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-4 border-b-4 border-[color:var(--color-engine)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-titulo`} className="text-lg font-bold text-[color:var(--color-ink)]">
              {titulo}
            </h2>
            {subtitulo !== undefined ? <p className="text-xs text-[color:var(--color-ink-3)]">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-[var(--radius-md)] px-2 py-1 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
          >
            Fechar
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </dialog>
    </>
  );
}
