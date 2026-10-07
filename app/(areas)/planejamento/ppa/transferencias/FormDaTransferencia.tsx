"use client";

import { useActionState } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { preverTransferenciaAction, type EstadoDaTransferencia } from "./actions";

/** V36 — a previsão da transferência financeira de uma entidade num ano do PPA (a correção pede o motivo). */
export function FormDaTransferencia({
  planoId,
  anos,
  entidades,
}: {
  readonly planoId: string;
  readonly anos: readonly number[];
  readonly entidades: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaTransferencia, FormData>(preverTransferenciaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Prever transferência financeira" data-acao="prever-transferencia">
      <ChaveDeComando />
      <input type="hidden" name="planoId" value={planoId} />
      <h2 className="mb-1 text-sm font-semibold">Prever transferência financeira</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O valor que o ente prevê transferir a cada entidade no ano. Se o ano já tem previsão para a entidade, o novo valor a corrige e o motivo é obrigatório; a anterior fica no histórico.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Entidade de destino</span>
          <select name="entidadeId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>Escolha a entidade</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>{e.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ano</span>
          <select name="ano" required defaultValue={String(anos[0] ?? "")} className={CAMPO}>
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor previsto (R$)</span>
          <CampoValor name="valor" required placeholder="1.000.000,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Finalidade</span>
          <input name="finalidade" required minLength={5} placeholder="Duodécimo do Poder Legislativo" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Motivo (só na correção)</span>
          <input name="motivo" className={CAMPO} />
        </label>
      </div>
      {estado.erro !== undefined ? <p role="alert" data-resultado-da-acao="prever-transferencia" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="prever-transferencia" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando..." : "Gravar a previsão"}</button>
    </form>
  );
}
