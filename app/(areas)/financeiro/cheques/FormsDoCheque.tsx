"use client";

import { useActionState, useRef } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { cancelarChequeAvulsoAction, registrarChequeAvulsoAction, type EstadoDoCheque } from "./actions";

/** A conta como ESTE form a consome (declarada aqui: ilha client não importa de `lib/portas`). */
export interface ContaParaCheque {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}

function Retorno({ estado }: { readonly estado: EstadoDoCheque }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/** V36 — o cheque avulso: o que sai da conta por cheque sem ser pagamento de despesa. */
export function FormChequeAvulso({ contas, hoje }: { readonly contas: readonly ContaParaCheque[]; readonly hoje: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoCheque, FormData>(registrarChequeAvulsoAction, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Registrar cheque avulso" data-form-cheque-avulso>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold">Registrar cheque avulso</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Cheque que não é de pagamento de despesa, como devolução ou suprimento. O dinheiro que ele movimenta é registrado na movimentação bancária; aqui fica o documento.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária</span>
          <select name="conta" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha a conta
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.descricao}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do cheque</span>
          <input name="numero" required maxLength={15} placeholder="000123" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data</span>
          <input name="dia" type="date" required max={hoje} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="1.000,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Favorecido</span>
          <input name="favorecido" required minLength={3} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Finalidade</span>
          <input name="finalidade" required minLength={5} placeholder="devolução de caução" className={CAMPO} />
        </label>
      </div>
      <Retorno estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando..." : "Registrar cheque"}
      </button>
    </form>
  );
}

/** V36 — o cancelamento do cheque avulso, na linha da lista. */
export function FormCancelarCheque({ chequeId, numero, hoje }: { readonly chequeId: string; readonly numero: string; readonly hoje: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoCheque, FormData>(cancelarChequeAvulsoAction, {});
  return (
    <details className="text-xs" data-cancelar-cheque={numero}>
      <summary className="cursor-pointer text-[color:var(--color-primary)] underline">Cancelar</summary>
      <form action={action} className="mt-2 space-y-2" aria-label={`Cancelar o cheque ${numero}`}>
        <ChaveDeComando />
        <input type="hidden" name="chequeId" value={chequeId} />
        <label className="block">
          <span className={ROTULO}>Data do cancelamento</span>
          <input name="dia" type="date" required max={hoje} defaultValue={hoje} className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={5} className={CAMPO} />
        </label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Cancelando..." : "Confirmar cancelamento"}
        </button>
        <Retorno estado={estado} />
      </form>
    </details>
  );
}
