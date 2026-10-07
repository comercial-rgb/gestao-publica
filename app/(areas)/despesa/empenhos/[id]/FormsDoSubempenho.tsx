"use client";

import { useActionState } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { anularSubempenhoAction, emitirSubempenhoAction, type EstadoDoSubempenho } from "./actions-subempenho";

function Resultado({ estado, acao }: { readonly estado: EstadoDoSubempenho; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-[color:var(--color-status-erro-fg)] sm:col-span-2">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-[color:var(--color-status-ok-fg)] sm:col-span-2">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/** V36 — emitir subempenho: o valor sai do saldo livre do empenho (não da ficha) e não lança no razão. */
export function FormEmitirSubempenho({ empenhoId, livre }: { readonly empenhoId: string; readonly livre: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoSubempenho, FormData>(emitirSubempenhoAction, {});
  return (
    <form action={action} data-acao="emitir-subempenho" aria-label="Emitir subempenho" className="grid gap-2 text-xs sm:grid-cols-2">
      <ChaveDeComando />
      <input type="hidden" name="empenhoId" value={empenhoId} />
      <h3 className="text-sm font-semibold sm:col-span-2">Emitir subempenho</h3>
      <p className="text-[color:var(--color-ink-3)] sm:col-span-2">
        O subempenho reserva parte do saldo livre do empenho (R$ {formatarMoeda(livre).texto}) para uma parcela. A liquidação da parcela informa o subempenho.
      </p>
      <label className="block">
        <span className={ROTULO}>Valor (R$)</span>
        <CampoValor name="valor" required className={CAMPO} />
      </label>
      <label className="block">
        <span className={ROTULO}>Data</span>
        <input name="data" type="date" required className={CAMPO} />
      </label>
      <label className="block sm:col-span-2">
        <span className={ROTULO}>Histórico da parcela</span>
        <input name="historico" required minLength={5} placeholder="Fatura de março" className={CAMPO} />
      </label>
      <Resultado estado={estado} acao="emitir-subempenho" />
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} sm:col-span-2 sm:justify-self-start`}>
        {pendente ? "Emitindo..." : "Emitir subempenho"}
      </button>
    </form>
  );
}

/** V36 — anular o saldo não liquidado de um subempenho: o valor volta ao saldo livre do empenho. */
export function FormAnularSubempenho({
  empenhoId,
  subempenhos,
}: {
  readonly empenhoId: string;
  readonly subempenhos: readonly { readonly id: string; readonly rotulo: string; readonly saldo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoSubempenho, FormData>(anularSubempenhoAction, {});
  return (
    <form action={action} data-acao="anular-subempenho" aria-label="Anular saldo de subempenho" className="grid gap-2 text-xs sm:grid-cols-2">
      <ChaveDeComando />
      <input type="hidden" name="empenhoId" value={empenhoId} />
      <h3 className="text-sm font-semibold sm:col-span-2">Anular saldo de subempenho</h3>
      <label className="block sm:col-span-2">
        <span className={ROTULO}>Subempenho</span>
        <select name="subempenhoId" required defaultValue="" className={CAMPO}>
          <option value="" disabled>Escolha o subempenho</option>
          {subempenhos.map((s) => (
            <option key={s.id} value={s.id}>{s.rotulo} · saldo R$ {formatarMoeda(s.saldo).texto}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={ROTULO}>Valor a anular (R$)</span>
        <CampoValor name="valor" required className={CAMPO} />
      </label>
      <label className="block">
        <span className={ROTULO}>Data</span>
        <input name="data" type="date" required className={CAMPO} />
      </label>
      <label className="block sm:col-span-2">
        <span className={ROTULO}>Motivo</span>
        <input name="motivo" required minLength={5} className={CAMPO} />
      </label>
      <Resultado estado={estado} acao="anular-subempenho" />
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} sm:col-span-2 sm:justify-self-start`}>
        {pendente ? "Anulando..." : "Anular o saldo"}
      </button>
    </form>
  );
}
