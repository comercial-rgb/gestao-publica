"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_ROTULO,
} from "../../components/ui/Formulario";
import { entrarAction, type EstadoLogin } from "./actions";

/**
 * FORM de LOGIN — ilha client. Chama a Server Action `entrarAction`; a mensagem de erro é ÚNICA
 * (o domínio já é de timing uniforme — a UI não diferencia "usuário não existe" de "senha errada").
 */
export function FormLogin({ retorno }: { readonly retorno: string }): React.ReactElement {
  const [estado, formAction, pendente] = useActionState<EstadoLogin, FormData>(entrarAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="retorno" value={retorno} />
      <label className="block">
        <span className={CLASSE_ROTULO}>Usuário</span>
        <input
          name="identificador"
          type="text"
          autoComplete="username"
          required
          className={CLASSE_CAMPO}
          placeholder="usuario@cg.pb.gov.br"
        />
      </label>
      <label className="block">
        <span className={CLASSE_ROTULO}>Senha</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className={CLASSE_CAMPO}
        />
      </label>

      {estado.erro !== undefined ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        className={`w-full ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
