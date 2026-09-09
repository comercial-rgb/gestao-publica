"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_ROTULO,
} from "../../../../components/ui/Formulario";
import { trocarSenhaAction, type EstadoSenha } from "./actions";

export function FormSenha(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoSenha, FormData>(trocarSenhaAction, {});
  return (
    <form action={action} className="max-w-sm space-y-4">
      <label className="block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Nova senha</span>
        <input name="nova" type="password" autoComplete="new-password" required className={CLASSE_CAMPO} /></label>
      <label className="block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Confirmar</span>
        <input name="confirmar" type="password" autoComplete="new-password" required className={CLASSE_CAMPO} /></label>
      {estado.erro !== undefined ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`w-full ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Trocando…" : "Trocar senha"}
      </button>
    </form>
  );
}
