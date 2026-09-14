"use client";

import { useActionState, useId, useRef } from "react";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";

/**
 * O DOCUMENTO DE RESPOSTA — ilha (arquivo não cabe no molde). O que for liberado aqui O REQUERENTE VÊ E
 * BAIXA; anexo interno do processo continua pelo processo digital, e não chega a ele.
 */
export function FormRespostaDaMesa({ solicitacaoId, accept, action }: {
  readonly solicitacaoId: string;
  readonly accept: string;
  readonly action: (e: EstadoDoMolde, f: FormData) => Promise<EstadoDoMolde>;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const id = useId();
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={disparar} data-acao="liberar-resposta" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={solicitacaoId} />
      <label htmlFor={id} className={CLASSE_ROTULO}>Liberar documento de resposta ao requerente</label>
      <input id={id} aria-describedby={`${id}-ajuda`} type="file" name="arquivo" accept={accept} required className={CLASSE_CAMPO} />
      <p id={`${id}-ajuda`} className="mt-1 text-xs text-[color:var(--color-ink-2)]">O requerente é avisado e baixa este arquivo pelo acompanhamento. Documento interno (parecer, despacho) não se libera aqui.</p>
      {estado.erro !== undefined ? <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Enviando…" : "Liberar documento"}</button>
    </form>
  );
}
