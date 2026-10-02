"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { detalharAction, type EstadoDoAto } from "./actions";

/** V26 — o detalhe de uma linha da previsão: o subtipo da dedução (quando é dedução) e a origem no documento. */
export function FormDoDetalhe({ id, deducao, deducoes }: { readonly id: string; readonly deducao: boolean; readonly deducoes: readonly (readonly [string, string])[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(detalharAction, {});
  if (estado.sucesso !== undefined) {
    return <p role="status" data-resultado-da-acao="detalhar-receita-prevista" className="text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  }
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Registrar o detalhe</summary>
      <form action={action} data-acao="detalhar-receita-prevista" className="mt-2 grid gap-2" aria-label="Registrar o detalhe da linha">
        <ChaveDeComando />
        <input type="hidden" name="receitaPrevistaId" value={id} />
        {deducao ? (
          <label className="text-xs">
            <span className={ROTULO}>Tipo da dedução</span>
            <select name="tipoDeducaoSagres" required defaultValue="" className={CAMPO}>
              <option value="">Escolha…</option>
              {deducoes.map(([c, d]) => (
                <option key={c} value={c}>{d}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs">
          <span className={ROTULO}>Código como está no documento (opcional)</span>
          <input name="codigoNoDocumento" maxLength={40} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Documento de origem</span>
          <input name="documento" required minLength={5} placeholder="Lei 613/2025, Anexo II" className={CAMPO} />
        </label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Registrar"}</button>
        {estado.erro !== undefined ? <span role="alert" className="text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</span> : null}
      </form>
    </details>
  );
}
