"use client";

import { useActionState, useRef } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { anularReceitaAction, type EstadoAnulacaoReceita } from "./anular-actions";

/**
 * FORM DE ANULAÇÃO DE ARRECADAÇÃO (TR 4.61) — ilha client, uma por linha, em `<details>` compacto.
 *
 * ⚠️ TOTAL apenas (o serviço não tem parcial), então não há campo de valor: a anulação nega a guia
 * inteira. Só o número da guia DE ANULAÇÃO e a data do fato — o resto é do domínio.
 */
export function FormAnularReceita({ receitaId }: { readonly receitaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAnulacaoReceita, FormData>(anularReceitaAction, {});
  const ref = useRef<HTMLDetailsElement>(null);
  if (estado.sucesso !== undefined && ref.current?.open === true) ref.current.open = false;

  return (
    <details ref={ref} className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Anular
      </summary>
      <form action={action} className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <input type="hidden" name="receitaId" value={receitaId} />
        <label className="block">
          <span className={ROTULO}>Nº da guia de anulação</span>
          <input name="numero" required placeholder="2026RA000001" className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Data da anulação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        {estado.erro !== undefined ? (
          <p role="alert" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-[color:var(--color-status-erro-fg)]">
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-[color:var(--color-status-ok-fg)]">
            {estado.sucesso}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pendente}
          className={CLASSE_BOTAO_PRIMARIO}
        >
          {pendente ? "Anulando…" : "Confirmar anulação"}
        </button>
      </form>
    </details>
  );
}
