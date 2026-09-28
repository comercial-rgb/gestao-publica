"use client";

import { useActionState, useId, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { administracaoDaFiscalizacaoAction, type EstadoDaAdministracao } from "./actions";

type Opcao = { readonly valor: string; readonly rotulo: string };

function Mensagens({ estado, acao }: { readonly estado: EstadoDaAdministracao; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

export function FormDefinirAdministrador({ usuarios }: { readonly usuarios: readonly Opcao[] }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaAdministracao, FormData>(administracaoDaFiscalizacaoAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const id = useId();
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={disparar} data-acao="definir-administrador-da-fiscalizacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="definir" />
      <h3 className="mb-1 text-sm font-semibold">Definir administrador da fiscalização</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Durante a vigência, o administrador tem acesso à fiscalização de todos os contratos. A definição não concede esse acesso a quem a registra.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-usuario`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={CLASSE_ROTULO}>Usuário (com pessoa vinculada)</span>
          <select id={`${id}-usuario`} name="usuario" required defaultValue="" className={CLASSE_CAMPO}>
            <option value="" disabled>Escolha…</option>
            {usuarios.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-ato`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Ato de definição</span><input id={`${id}-ato`} name="ato" required minLength={3} placeholder="Portaria 12/2026" className={CLASSE_CAMPO} /></label>
        <label htmlFor={`${id}-inicio`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Início</span><input id={`${id}-inicio`} name="inicio" type="date" required className={CLASSE_CAMPO} /></label>
        <label htmlFor={`${id}-fim`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Fim (opcional)</span><input id={`${id}-fim`} name="fim" type="date" className={CLASSE_CAMPO} /></label>
      </div>
      <Mensagens estado={estado} acao="definir-administrador-da-fiscalizacao" />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Definir"}</button>
    </form>
  );
}

export function FormRevogarAdministrador({ administradorId, nome }: { readonly administradorId: string; readonly nome: string }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaAdministracao, FormData>(administracaoDaFiscalizacaoAction, {});
  const id = useId();
  return (
    <form action={disparar} data-acao="revogar-administrador-da-fiscalizacao" className="mt-2 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="revogar" />
      <input type="hidden" name="administradorId" value={administradorId} />
      <label htmlFor={`${id}-efeito`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Efeito da revogação</span><input id={`${id}-efeito`} name="dataEfeito" type="date" required className={CLASSE_CAMPO} /></label>
      <label htmlFor={`${id}-motivo`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo</span><input id={`${id}-motivo`} name="motivo" required minLength={5} className={CLASSE_CAMPO} /></label>
      <button type="submit" disabled={pendente} className="min-h-9 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-xs font-semibold" aria-label={`Revogar a definição de ${nome}`}>{pendente ? "Gravando…" : "Revogar"}</button>
      <Mensagens estado={estado} acao="revogar-administrador-da-fiscalizacao" />
    </form>
  );
}
