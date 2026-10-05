"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { declararControleDosRestosAction, type EstadoDoRoteiroDeRestos } from "./actions";

export interface PapelDoForm {
  readonly papel: string;
  readonly titulo: string;
  readonly prefixo: string;
  readonly escolhida: string | null;
  readonly opcoes: readonly { readonly codigo: string; readonly nome: string }[];
}

/** V35 A3 — as contas do controle 5.3/6.3 dos restos, todas de uma vez (o controle liga só com todas). */
export function FormControleDosRestos({ papeis }: { readonly papeis: readonly PapelDoForm[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoRoteiroDeRestos, FormData>(declararControleDosRestosAction, {});
  return (
    <form action={action} data-acao="declarar-controle-dos-restos" className="grid gap-3 text-xs sm:grid-cols-2" aria-label="Declarar as contas do controle orçamentário dos restos a pagar">
      <ChaveDeComando />
      {papeis.map((p) => (
        <label key={p.papel}>
          <span className={ROTULO}>
            {p.titulo} ({p.prefixo})
          </span>
          <select name={`papel:${p.papel}`} className={CAMPO} defaultValue={p.escolhida ?? ""} required>
            <option value="">{p.opcoes.length === 0 ? "Nenhuma conta analítica do plano sob este título" : "Escolha a conta"}</option>
            {p.opcoes.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.codigo} — {o.nome}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="sm:col-span-2">
        <span className={ROTULO}>Fundamento</span>
        <input name="fundamento" className={CAMPO} required minLength={10} placeholder="Norma e plano de contas que fundamentam a escolha" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
          Declarar as contas
        </button>
        {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="declarar-controle-dos-restos" className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
        {estado.erro !== undefined ? <p role="alert" data-resultado-da-acao="declarar-controle-dos-restos" className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      </div>
    </form>
  );
}
