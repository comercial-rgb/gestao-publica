"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { declararLimiteAction, type EstadoDoLimite } from "./actions";

export function FormLimite({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoLimite, FormData>(declararLimiteAction, {});
  return (
    <form action={action} data-acao="declarar-limite-do-legislativo" className="grid gap-3 text-xs sm:grid-cols-2" aria-label="Declarar a população e a base do limite do Legislativo">
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <label>
        <span className={ROTULO}>População (habitantes)</span>
        <input name="populacao" required inputMode="numeric" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Fonte da população</span>
        <input name="fontePopulacao" required minLength={10} placeholder="IBGE, estimativa do ano anterior" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Base realizada no exercício anterior (só se ele não foi escriturado aqui)</span>
        <input name="baseDeclarada" inputMode="decimal" placeholder="0,00" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Documento da base</span>
        <input name="documentoDaBase" placeholder="Balanço do exercício anterior, ou dados do Tribunal" className={CAMPO} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Declarando…" : "Declarar"}</button>
        {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="declarar-limite" className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
        {estado.erro !== undefined ? <p role="alert" data-resultado-da-acao="declarar-limite" className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      </div>
    </form>
  );
}
