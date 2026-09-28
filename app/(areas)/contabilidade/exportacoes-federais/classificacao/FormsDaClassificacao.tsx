"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO } from "../../../../../components/ui/Formulario";
import { classificarAction, declararCentralizacaoAction, type EstadoDaClassificacao } from "./actions";

/**
 * OS FORMULÁRIOS DA CLASSIFICAÇÃO PARA O ARQUIVO DA RECEITA — um por linha da tabela, porque cada
 * linha é uma decisão sobre um cadastro. Rótulo em todo campo (visualmente oculto, com o código do
 * item: "Tipo da unidade 01001"), id do `useId`. A tela sugere; o servidor confere o rol.
 */

function Resultado({ estado }: { readonly estado: EstadoDaClassificacao }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao="classificar" className="mt-1 text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao="classificar" className="mt-1 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export function FormClassificacao({
  grupo,
  id,
  codigo,
  rotuloDoItem,
  opcoes,
  tipoAtual,
  comNivel,
  nivelAtual,
}: {
  readonly grupo: "unidade" | "acao" | "natureza-despesa" | "natureza-receita";
  readonly id: string;
  readonly codigo: string;
  /** "da unidade", "da ação", "da natureza" — compõe o rótulo acessível. */
  readonly rotuloDoItem: string;
  readonly opcoes: readonly (readonly [string, string])[];
  readonly tipoAtual: string | null;
  readonly comNivel: boolean;
  readonly nivelAtual: number | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaClassificacao, FormData>(classificarAction, {});
  const idTipo = useId();
  const idNivel = useId();
  return (
    <form action={disparar} data-acao={`classificar-${grupo}`} data-codigo={codigo}>
      <ChaveDeComando />
      <input type="hidden" name="grupo" value={grupo} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idTipo} className="sr-only">
          {comNivel ? "Tipo de conta" : "Tipo"} {rotuloDoItem} {codigo}
        </label>
        <select id={idTipo} name="tipo" required defaultValue={tipoAtual ?? ""} className={`${CLASSE_CAMPO} w-auto min-w-40`}>
          <option value="" disabled>
            Escolha
          </option>
          {opcoes.map(([c, r]) => (
            <option key={c} value={c}>
              {c} - {r}
            </option>
          ))}
        </select>
        {comNivel ? (
          <>
            <label htmlFor={idNivel} className="sr-only">
              Nível da conta {rotuloDoItem} {codigo}
            </label>
            <input
              id={idNivel}
              name="nivel"
              type="number"
              min={1}
              max={99}
              step={1}
              required
              defaultValue={nivelAtual ?? ""}
              placeholder="Nível"
              className={`${CLASSE_CAMPO} w-24`}
            />
          </>
        ) : null}
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando..." : "Gravar"}
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormCentralizacao({
  opcoes,
  atual,
}: {
  readonly opcoes: readonly (readonly [string, string])[];
  readonly atual: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaClassificacao, FormData>(declararCentralizacaoAction, {});
  const idCampo = useId();
  return (
    <form action={disparar} data-acao="declarar-centralizacao" className="flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <div>
        <label htmlFor={idCampo} className="block text-sm font-medium text-[color:var(--color-ink)]">
          Forma de escrituração
        </label>
        <select id={idCampo} name="indicador" required defaultValue={atual ?? ""} className={`${CLASSE_CAMPO} w-auto min-w-72`}>
          <option value="" disabled>
            Escolha
          </option>
          {opcoes.map(([c, r]) => (
            <option key={c} value={c}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Gravando..." : "Gravar"}
      </button>
      <div className="basis-full">
        <Resultado estado={estado} />
      </div>
    </form>
  );
}
