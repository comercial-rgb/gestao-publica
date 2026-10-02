"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { declararAcaoAction, declararProgramaAction, type EstadoDoAto } from "./actions";

/**
 * V26 — os formulários da declaração de um programa e de uma ação. Cada linha da lista tem o seu, recolhido; os
 * campos vêm pré-preenchidos com o que está vigente (declarar de novo cria uma versão, não apaga a anterior).
 */

function Resultado({ estado, acao }: { readonly estado: EstadoDoAto; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  }
  if (estado.sucesso !== undefined) {
    return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  }
  return null;
}

export function FormDoPrograma({
  programaId,
  codigo,
  atual,
  objetivos,
}: {
  readonly programaId: string;
  readonly codigo: string;
  readonly atual: { readonly descricao: string; readonly objetivo: string; readonly ods: string };
  readonly objetivos: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(declararProgramaAction, {});
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Declarar dados do programa {codigo}</summary>
      <form action={action} data-acao="declarar-programa" className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={`Declarar os dados do programa ${codigo}`}>
        <ChaveDeComando />
        <input type="hidden" name="programaId" value={programaId} />
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Denominação (até 70 caracteres)</span>
          <input name="descricao" required maxLength={70} defaultValue={atual.descricao} className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Objetivo do programa (até 150 caracteres)</span>
          <input name="objetivo" required maxLength={150} defaultValue={atual.objetivo} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Objetivo da Agenda 2030</span>
          <select name="tipoObjetivoMilenio" required defaultValue={atual.ods} className={CAMPO}>
            <option value="">Escolha…</option>
            {objetivos.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Vale desde</span>
          <input name="vigenteDesde" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>De onde vem (PPA, LOA, lei de alteração)</span>
          <input name="fundamento" required minLength={10} maxLength={300} className={CAMPO} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Declarar"}</button>
          <Resultado estado={estado} acao="declarar-programa" />
        </div>
      </form>
    </details>
  );
}

export function FormDaAcao({
  acaoId,
  codigo,
  atual,
}: {
  readonly acaoId: string;
  readonly codigo: string;
  readonly atual: { readonly descricao: string; readonly meta: string; readonly unidade: string };
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(declararAcaoAction, {});
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Declarar dados da ação {codigo}</summary>
      <form action={action} data-acao="declarar-acao" className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={`Declarar os dados da ação ${codigo}`}>
        <ChaveDeComando />
        <input type="hidden" name="acaoId" value={acaoId} />
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Denominação (até 70 caracteres)</span>
          <input name="descricao" required maxLength={70} defaultValue={atual.descricao} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Meta (opcional, até 150)</span>
          <input name="descMeta" maxLength={150} defaultValue={atual.meta} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Unidade de medida da meta</span>
          <input name="unidadeMedida" maxLength={50} defaultValue={atual.unidade} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Vale desde</span>
          <input name="vigenteDesde" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>De onde vem (PPA, LOA, lei de alteração)</span>
          <input name="fundamento" required minLength={10} maxLength={300} className={CAMPO} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Declarar"}</button>
          <Resultado estado={estado} acao="declarar-acao" />
        </div>
      </form>
    </details>
  );
}
