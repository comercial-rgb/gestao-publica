"use client";

import { useActionState, useRef } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarUsuarioAction, type EstadoUsuario } from "./actions";

/** Uma opção de perfil — declarada aqui (o grep trivalente barra import de lib/portas na ilha client). */
export interface PerfilOpcaoUI {
  readonly id: string;
  readonly nome: string;
}

/**
 * CRIAR USUÁRIO (TR 4.55) — ilha client, ação autorizada (CRIAR_USUARIO).
 *
 * ⚠️ A SENHA INICIAL aparece UMA vez, no resultado, para o admin entregar ao servidor — e some no
 * reset do form. Ela NUNCA é logada (o audit registra a ação, não a senha).
 */
export function FormCriarUsuario({ perfis }: { readonly perfis: readonly PerfilOpcaoUI[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoUsuario, FormData>(criarUsuarioAction, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Criar usuário</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className={ROTULO}>Nome</span>
          <input name="nome" required placeholder="Maria da Silva" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Email (identificador)</span>
          <input name="email" type="email" required placeholder="maria@cg.pb.gov.br" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Senha inicial (mín. 12)</span>
          <input name="senhaInicial" required minLength={12} placeholder="frase longa e única" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Perfil inicial (opcional)</span>
          <select name="perfilId" defaultValue="" className={CAMPO}>
            <option value="">— sem perfil —</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <div className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          <p>{estado.sucesso}</p>
          {estado.senhaParaEntregar !== undefined ? (
            <p className="mt-1">
              ⚠️ Entregue esta senha ao servidor AGORA — ela não será mostrada de novo:{" "}
              <strong className="tabular select-all">{estado.senhaParaEntregar}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}
