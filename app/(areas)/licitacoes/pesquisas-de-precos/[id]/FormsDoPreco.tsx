"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { fixarPrecoAction, type EstadoDoPreco } from "./actions-preco";

/** V39-R3 (R3-020) — fixar o preço estimado de um item: método, descartes com motivo e, abaixo do mínimo, a justificativa. */

type Preco = { readonly id: string; readonly fornecedor: string; readonly valor: string; readonly parametro: string | null; readonly dataDoPreco: string | null; readonly documento: string | null };

export function FormFixarPreco({ itemId, precos, rotulos, minimo }: { readonly itemId: string; readonly precos: readonly Preco[]; readonly rotulos: Readonly<Record<string, string>>; readonly minimo: number | null }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDoPreco, FormData>(fixarPrecoAction, {});
  return (
    <form action={action} data-acao="fixar-preco-estimado" data-item={itemId} className="mt-2 grid gap-2 text-xs">
      <ChaveDeComando />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-m`}>Método</label>
          <select id={`${uid}-m`} name="metodo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="MEDIA">Média</option>
            <option value="MEDIANA">Mediana</option>
            <option value="MENOR">Menor dos valores</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${uid}-j`}>Justificativa do gestor, se ficarem menos de {minimo ?? "?"} preços (ao menos 20 caracteres)</label>
          <input id={`${uid}-j`} name="justificativaMenosPrecos" className={CAMPO} />
        </div>
      </div>
      <fieldset className="grid gap-1">
        <legend className={ROTULO}>Descartar um preço (inexequível, inconsistente ou excessivamente elevado), com o motivo</legend>
        {precos.map((p) => (
          <div key={p.id} className="grid items-center gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2" htmlFor={`${uid}-d-${p.id}`}>
              <input id={`${uid}-d-${p.id}`} type="checkbox" name="descartar" value={p.id} />
              <span>{p.fornecedor}: R$ {p.valor} ({p.parametro === null ? "sem origem" : rotulos[p.parametro] ?? p.parametro})</span>
            </label>
            <div className="sm:col-span-2">
              <label className="sr-only" htmlFor={`${uid}-mo-${p.id}`}>Motivo do descarte do preço de {p.fornecedor}</label>
              <input id={`${uid}-mo-${p.id}`} name={`motivo.${p.id}`} placeholder="motivo do descarte" className={CAMPO} />
            </div>
          </div>
        ))}
      </fieldset>
      <div>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Fixar o preço estimado"}</button>
        {estado.erro !== undefined || estado.sucesso !== undefined ? (
          <p className={estado.erro !== undefined ? "mt-1 text-[color:var(--color-status-erro-fg)]" : "mt-1 text-[color:var(--color-status-ok-fg)]"} role={estado.erro !== undefined ? "alert" : "status"} data-resultado-da-acao={`fixar-preco-${itemId}`}>
            {estado.erro ?? estado.sucesso}
          </p>
        ) : null}
      </div>
    </form>
  );
}
