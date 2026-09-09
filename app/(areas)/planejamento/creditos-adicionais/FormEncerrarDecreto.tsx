"use client";

import { useActionState, useState } from "react";
import { CLASSE_CAMPO as CAMPO } from "../../../../components/ui/Formulario";
import { encerrarDecretoAction, type EstadoEncerrar } from "./actions";

/**
 * ENCERRAR DECRETO — ilha client, Server Action autenticada. Confirmação em dois passos (abre o
 * campo de motivo) para não encerrar por engano (4.29). O erro do domínio (encerrar duas vezes) sobe.
 */
export function FormEncerrarDecreto({ decretoId }: { readonly decretoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoEncerrar, FormData>(encerrarDecretoAction, {});
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        data-chrome
        className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
      >
        Encerrar
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="decretoId" value={decretoId} />
      <input name="motivo" required minLength={3} placeholder="motivo do encerramento" className={`${CAMPO} h-8 w-56`} />
      <button type="submit" disabled={pendente} className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[color:var(--color-danger,#c0392b)] px-3 text-xs font-semibold text-white disabled:opacity-60">
        {pendente ? "Encerrando…" : "Confirmar"}
      </button>
      <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">Cancelar</button>
      {estado.erro !== undefined ? <span role="alert" className="text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</span> : null}
    </form>
  );
}
