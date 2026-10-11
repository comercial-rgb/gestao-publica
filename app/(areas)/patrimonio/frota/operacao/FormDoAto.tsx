"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { operacaoDaFrotaAction, type EstadoDaOperacaoDaFrota } from "./actions";

/**
 * V39-R2 — um formulário de ato da operação da frota, montado pela lista de campos (cada campo com rótulo). A resposta
 * do servidor (sucesso ou recusa com o motivo) aparece logo abaixo.
 */
export interface CampoDoAto {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo?: "texto" | "data" | "selecao" | "marcar" | "oculto";
  readonly opcoes?: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly obrigatorio?: boolean;
  readonly valor?: string;
  readonly decimal?: boolean;
}

export function FormDoAto({ ato, titulo, campos, botao }: { readonly ato: string; readonly titulo: string; readonly campos: readonly CampoDoAto[]; readonly botao: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacaoDaFrota, FormData>(operacaoDaFrotaAction, {});
  const texto = estado.erro ?? estado.sucesso;
  return (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">{titulo}</summary>
      <form action={action} aria-label={titulo} className="mt-2 grid gap-2 sm:grid-cols-2" data-acao={ato}>
        <ChaveDeComando />
        <input name="__ato" type="hidden" value={ato} />
        {campos.map((c) => {
          const id = `${uid}-${c.nome}`;
          if (c.tipo === "oculto") return <input key={c.nome} name={c.nome} type="hidden" value={c.valor ?? ""} />;
          if (c.tipo === "marcar") {
            return (
              <fieldset className="text-xs sm:col-span-2" key={c.nome}>
                <legend className={ROTULO}>{c.rotulo}</legend>
                <div className="flex flex-wrap gap-3">
                  {(c.opcoes ?? []).map((o) => <label className="flex items-center gap-1" key={o.valor}><input name={c.nome} type="checkbox" value={o.valor} /> {o.rotulo}</label>)}
                </div>
              </fieldset>
            );
          }
          return (
            <div key={c.nome}>
              <label className={ROTULO} htmlFor={id}>{c.rotulo}</label>
              {c.tipo === "selecao" ? (
                <select className={CAMPO} defaultValue={c.valor ?? ""} id={id} name={c.nome} required={c.obrigatorio === true}>
                  <option value="">{c.obrigatorio === true ? "Escolha" : "Nenhum"}</option>
                  {(c.opcoes ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              ) : (
                <input className={CAMPO} defaultValue={c.valor} id={id} inputMode={c.decimal === true ? "decimal" : undefined} name={c.nome} required={c.obrigatorio === true} type={c.tipo === "data" ? "date" : "text"} />
              )}
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando..." : botao}</button>
          {texto !== undefined ? (
            <p
              className={
                estado.erro !== undefined
                  ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
                  : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
              }
              data-resultado-da-acao={ato}
              role={estado.erro !== undefined ? "alert" : "status"}
            >
              {texto}
            </p>
          ) : null}
        </div>
      </form>
    </details>
  );
}
