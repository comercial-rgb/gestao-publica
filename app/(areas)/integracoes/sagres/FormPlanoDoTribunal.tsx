"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { importarPlanoAction, type EstadoDoPlano } from "./actions";

/** IMPORTAR O PLANO DE CONTAS DO TRIBUNAL — a planilha publicada, o ano que vale e o porquê. */
export function FormPlanoDoTribunal({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoPlano, FormData>(importarPlanoAction, {});
  const id = useId();
  return (
    <form action={action} data-acao="importar-plano-do-tribunal" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h3 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Importar a planilha do Tribunal</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        A planilha publicada pelo Tribunal diz, conta a conta, quando a receita extra precisa apontar a retenção e quando o
        recolhimento precisa apontar a receita extra. Escolha qual ano da tabela vale para o exercício e diga por quê.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-arquivo`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-3">
          <span className={ROTULO}>Planilha (.xlsx)</span>
          <input id={`${id}-arquivo`} type="file" name="arquivo" accept=".xlsx" required className={CAMPO} />
        </label>
        <label htmlFor={`${id}-exercicio`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Exercício da remessa</span>
          <input id={`${id}-exercicio`} name="exercicio" type="number" required defaultValue={exercicio} className={CAMPO} />
        </label>
        <label htmlFor={`${id}-ano`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ano da tabela a usar</span>
          <input id={`${id}-ano`} name="anoDaTabela" type="number" required defaultValue={exercicio} className={CAMPO} />
        </label>
        <label htmlFor={`${id}-fundamento`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-3">
          <span className={ROTULO}>Por que esta tabela vale para o exercício</span>
          <textarea id={`${id}-fundamento`} name="fundamento" required minLength={20} rows={2} className={CAMPO} />
        </label>
      </div>
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Importando…" : "Importar"}
      </button>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
    </form>
  );
}
