"use client";

import { useActionState, useId } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  assinarAction,
  enviarParaAssinaturaAction,
  type EstadoAssinatura,
} from "./actions";

function Mensagens({ estado }: { readonly estado: EstadoAssinatura }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
    </>
  );
}

/**
 * ENVIAR PARA ASSINATURA — uma ilha por documento.
 *
 * ⚠️ MULTI-SELEÇÃO ORDENADA. A fila do M22 é ORDENADA: o primeiro assina primeiro, e o
 * segundo não pode furar. O `<select multiple>` preserva a ordem do DOM, e é essa a ordem
 * que vira a posição na fila — por isso o rótulo diz isso ao operador, em vez de deixá-lo
 * descobrir quando o segundo signatário for recusado.
 */
export function FormEnviarAssinatura({
  tipo,
  registroId,
  numero,
  signatarios,
}: {
  readonly tipo: "EMPENHO" | "LIQUIDACAO" | "ORDEM";
  readonly registroId: string;
  readonly numero: string;
  readonly signatarios: readonly string[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAssinatura, FormData>(
    enviarParaAssinaturaAction,
    {}
  );
  const idSel = `signatarios-${useId()}`;

  return (
    <form action={action} data-acao="enviar-para-assinatura" className="mt-2">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="registroId" value={registroId} />
      <label htmlFor={idSel} className={ROTULO}>
        Signatários de {numero}, na ordem em que assinam
      </label>
      <select
        id={idSel}
        name="signatarios"
        multiple
        required
        size={Math.min(4, Math.max(2, signatarios.length))}
        className={CAMPO}
      >
        {signatarios.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gerando…" : "Gerar documento e enviar"}
      </button>
    </form>
  );
}

/**
 * ⚠️ ASSINAR É `POST`, NUNCA LINK. `GET` não produz transição de estado — assinar por
 * link deixaria o pré-carregador do navegador assinar documento por alguém.
 */
export function FormAssinar({ filaId }: { readonly filaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAssinatura, FormData>(
    assinarAction,
    {}
  );
  return (
    <form action={action} data-acao="assinar-na-fila" className="mt-2">
      <input type="hidden" name="filaId" value={filaId} />
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Assinando…" : "Assinar"}
      </button>
    </form>
  );
}
