"use client";

import { useActionState, useId, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_ROTULO,
} from "../../components/ui/Formulario";
import { entrarAction, type EstadoLogin } from "./actions";

/**
 * FORM de LOGIN — ilha client. Chama a Server Action `entrarAction`; a recusa de CREDENCIAL é
 * ÚNICA (o domínio já é de timing uniforme — a UI não diferencia "usuário não existe" de
 * "senha errada"). Campo vazio é erro DO CAMPO, junto do controle (V6 P0.2).
 *
 * ⚠️ MOSTRAR/OCULTAR SENHA é um botão com `aria-pressed` e `aria-controls` — quem usa leitor de
 * tela sabe o que ele faz e o que ele afeta. O placeholder é neutro: o identificador aceito é
 * o do cadastro do usuário, não um domínio de e-mail fixo.
 */
export function FormLogin({ retorno }: { readonly retorno: string }): React.ReactElement {
  const [estado, formAction, pendente] = useActionState<EstadoLogin, FormData>(entrarAction, {});
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const idIdent = useId();
  const idSenha = useId();
  const idErroIdent = useId();
  const idErroSenha = useId();
  const idErroGeral = useId();
  const erroIdent = estado.erros?.identificador;
  const erroSenha = estado.erros?.senha;

  return (
    <form action={formAction} className="space-y-4" noValidate aria-describedby={estado.erro !== undefined ? idErroGeral : undefined}>
      <input type="hidden" name="retorno" value={retorno} />
      <div>
        <label htmlFor={idIdent} className={CLASSE_ROTULO}>Usuário</label>
        <input
          id={idIdent}
          name="identificador"
          type="text"
          autoComplete="username"
          required
          defaultValue={estado.identificador ?? ""}
          aria-invalid={erroIdent !== undefined ? true : undefined}
          aria-describedby={erroIdent !== undefined ? idErroIdent : undefined}
          className={CLASSE_CAMPO}
          placeholder="Seu usuário de acesso"
        />
        {erroIdent !== undefined ? (
          <p id={idErroIdent} className="mt-1 text-xs text-[color:var(--color-status-erro-fg)]">{erroIdent}</p>
        ) : null}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={idSenha} className={CLASSE_ROTULO}>Senha</label>
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-pressed={mostrarSenha}
            aria-controls={idSenha}
            className="mb-1.5 text-xs text-[color:var(--color-primary)] hover:underline"
          >
            {mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
          </button>
        </div>
        <input
          id={idSenha}
          name="senha"
          type={mostrarSenha ? "text" : "password"}
          autoComplete="current-password"
          required
          aria-invalid={erroSenha !== undefined ? true : undefined}
          aria-describedby={erroSenha !== undefined ? idErroSenha : undefined}
          className={CLASSE_CAMPO}
        />
        {erroSenha !== undefined ? (
          <p id={idErroSenha} className="mt-1 text-xs text-[color:var(--color-status-erro-fg)]">{erroSenha}</p>
        ) : null}
      </div>

      {estado.erro !== undefined ? (
        <p id={idErroGeral} role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        aria-busy={pendente}
        className={`w-full ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
