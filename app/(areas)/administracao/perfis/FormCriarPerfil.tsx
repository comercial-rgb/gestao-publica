"use client";

import { useActionState, useRef } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarPerfilAction, type EstadoPerfil } from "./actions";

/**
 * CRIAR PERFIL (TR 4.56) — ilha client, ação autorizada (CRIAR_PERFIL).
 *
 * ⚠️ NÃO HÁ "COPIAR DE OUTRO PERFIL", e a ausência é a decisão. Copiar pouparia cliques e
 * entregaria, num passo, todo o poder de um perfil existente a um nome que ainda não
 * significa nada para ninguém. O perfil nasce vazio e recebe cada ação por concessão
 * explícita — é o que a tela abaixo faz, uma a uma.
 */
export function FormCriarPerfil(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPerfil, FormData>(criarPerfilAction, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="criar-perfil">
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Criar perfil</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs">
          <span className={ROTULO}>Nome do perfil</span>
          <input name="nome" required maxLength={60} placeholder="TESOURARIA" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Descrição — o que este perfil faz</span>
          <input
            name="descricao"
            required
            placeholder="Quem opera a conciliação e os pagamentos"
            className={CAMPO}
          />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Criando…" : "Criar perfil"}
      </button>
    </form>
  );
}
