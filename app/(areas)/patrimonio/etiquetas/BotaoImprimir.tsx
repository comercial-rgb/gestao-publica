"use client";

import { CLASSE_BOTAO_PRIMARIO } from "../../../../components/ui/Formulario";

/** Abre o diálogo de impressão do navegador — a folha de etiquetas já está na tela. */
export function BotaoImprimir(): React.ReactElement {
  return (
    <button type="button" className={CLASSE_BOTAO_PRIMARIO} data-acao="imprimir-etiquetas" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
