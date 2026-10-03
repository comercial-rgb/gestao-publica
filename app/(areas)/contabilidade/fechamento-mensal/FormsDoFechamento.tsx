"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { fecharMesAction, reabrirMesAction, type EstadoDoFechamento } from "./actions";

/**
 * Fechar e reabrir um mês (V32). Um formulário por mês: o resultado aparece na linha do mês que o
 * operador acionou, e não num aviso solto no topo da página.
 */

function Resultado({ estado, acao }: { readonly estado: EstadoDoFechamento; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="mt-2 whitespace-pre-line text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  return null;
}

export function FormFecharMes({ competencia, rotulo }: { readonly competencia: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoFechamento, FormData>(fecharMesAction, {});
  return (
    <form action={action} data-acao="fechar-mes" data-competencia={competencia}>
      <ChaveDeComando />
      <input type="hidden" name="competencia" value={competencia} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO} aria-label={`Conferir e fechar ${rotulo}`}>
        {pendente ? "Conferindo…" : "Conferir e fechar"}
      </button>
      <Resultado estado={estado} acao="fechar-mes" />
    </form>
  );
}

export function FormReabrirMes({ competencia, rotulo }: { readonly competencia: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoFechamento, FormData>(reabrirMesAction, {});
  return (
    <form action={action} data-acao="reabrir-mes" data-competencia={competencia} className="flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="competencia" value={competencia} />
      <label className="min-w-[16rem] flex-1 text-xs text-[color:var(--color-ink-2)]">
        <span className={ROTULO}>Motivo da reabertura de {rotulo}</span>
        <input name="motivo" required minLength={10} maxLength={500} placeholder="Por que o mês precisa ser reaberto" className={CAMPO} />
      </label>
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Reabrindo…" : "Reabrir"}
      </button>
      <div className="basis-full">
        <Resultado estado={estado} acao="reabrir-mes" />
      </div>
    </form>
  );
}
