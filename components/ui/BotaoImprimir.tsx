"use client";

import { useEffect } from "react";

/**
 * IMPRIMIR A TELA (V22) — chama a impressão do navegador. O layout de papel é o do `@media print`
 * de `app/globals.css`: some o que é `data-chrome` (menu, cabeçalho, rodapé, botões), fica o
 * documento. Com `aoAbrir`, imprime assim que a página monta — é o que o "Imprimir" do modal usa
 * ao abrir o documento numa aba nova.
 */
export function BotaoImprimir({ rotulo = "Imprimir", aoAbrir = false }: { readonly rotulo?: string; readonly aoAbrir?: boolean }): React.ReactElement {
  useEffect(() => {
    if (!aoAbrir) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [aoAbrir]);
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-chrome
      className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
    >
      {rotulo}
    </button>
  );
}
