"use client";

import { formatarMoeda } from "../../../../../packages/contracts/moeda";
import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { liberarReservaAction, reservarAction, type EstadoDaDotacao } from "./actions";

/**
 * RESERVAR E LIBERAR NA FICHA (V31). Os formulários ficam montados depois do sucesso: a confirmação
 * aparece no lugar, e a página recarrega com o saldo novo (o percurso da V29 mediu "silêncio" quando o
 * formulário sumia com o próprio sucesso).
 */

function Resultado({ estado, acao }: { readonly estado: EstadoDaDotacao; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export function FormReservar({ fichaId, disponivel }: { readonly fichaId: string; readonly disponivel: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDotacao, FormData>(reservarAction, {});
  return (
    <form action={action} className={`${PAINEL} space-y-3`} data-acao="reservar-dotacao" aria-label="Reservar dotação desta ficha">
      <ChaveDeComando />
      <input type="hidden" name="fichaId" value={fichaId} />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className={ROTULO}>Valor a reservar (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required aria-describedby={`disp-${fichaId}`} />
          <span id={`disp-${fichaId}`} className="mt-1 block text-xs text-[color:var(--color-ink-3)]">
            Disponível agora: R$ {formatarMoeda(String(disponivel)).texto}. O saldo é conferido de novo ao gravar.
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className={ROTULO}>Finalidade da reserva</span>
          <input className={CAMPO} name="historico" required minLength={5} placeholder="Ex.: contratação de manutenção da frota — processo em instrução" />
        </label>
      </div>
      <Resultado estado={estado} acao="reservar-dotacao" />
      <button className={BOTAO} disabled={pendente} type="submit">
        {pendente ? "Reservando…" : "Reservar"}
      </button>
    </form>
  );
}

/**
 * ⚠️ FICA MONTADO DEPOIS DA LIBERAÇÃO (`liberada`): a linha passa a dizer "Liberada" e deixaria de
 * oferecer o formulário — e a confirmação sumiria junto. O percurso da V31 mediu esse silêncio (D.3).
 * Liberada e sem resposta a mostrar, não desenha nada.
 */
export function FormLiberarReserva({
  fichaId,
  reservaId,
  rotulo,
  liberada,
}: {
  readonly fichaId: string;
  readonly reservaId: string;
  readonly rotulo: string;
  readonly liberada: boolean;
}): React.ReactElement | null {
  const [estado, action, pendente] = useActionState<EstadoDaDotacao, FormData>(liberarReservaAction, {});
  if (liberada) return <Resultado estado={estado} acao="liberar-reserva" />;
  return (
    <details data-forma="liberar-reserva">
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">Liberar</summary>
      <form action={action} className="mt-2 space-y-2" data-acao="liberar-reserva" aria-label={`Liberar ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="fichaId" value={fichaId} />
        <input type="hidden" name="reservaId" value={reservaId} />
        <label className="block text-xs">
          <span className={ROTULO}>Motivo da liberação</span>
          <input className={CAMPO} name="historico" required minLength={5} />
        </label>
        <Resultado estado={estado} acao="liberar-reserva" />
        <button className={BOTAO} disabled={pendente} type="submit">
          {pendente ? "Liberando…" : "Liberar o saldo"}
        </button>
      </form>
    </details>
  );
}
