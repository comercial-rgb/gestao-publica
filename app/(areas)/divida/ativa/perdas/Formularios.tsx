"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { apurarAction, declararPercentualAction, type EstadoDoAjuste } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDoAjuste; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  if (estado.erro !== undefined) return <p role="alert" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  return null;
}

function CampoOrigem(): React.ReactElement {
  return (
    <label>
      <span className={ROTULO}>Origem da dívida ativa</span>
      <select name="origem" required className={CAMPO}>
        <option value="TRIBUTARIA">Tributária</option>
        <option value="NAO_TRIBUTARIA">Não tributária</option>
      </select>
    </label>
  );
}

export function FormPercentual({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAjuste, FormData>(declararPercentualAction, {});
  return (
    <form action={action} data-acao="declarar-percentual-de-perda" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Declarar o percentual de perda esperada da dívida ativa">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Exercício</span>
        <input name="exercicio" required inputMode="numeric" defaultValue={exercicio} className={CAMPO} />
      </label>
      <CampoOrigem />
      <label>
        <span className={ROTULO}>Perda esperada (% do saldo)</span>
        <input name="percentual" required inputMode="decimal" placeholder="0,00" className={CAMPO} />
      </label>
      <label className="sm:col-span-3">
        <span className={ROTULO}>Metodologia e premissas (vão às notas explicativas)</span>
        <textarea name="metodologia" required minLength={40} rows={3} className={CAMPO} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Declarando…" : "Declarar percentual"}</button>
        <Resultado estado={estado} acao="declarar-percentual-de-perda" />
      </div>
    </form>
  );
}

export function FormApuracao({ corte }: { readonly corte: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAjuste, FormData>(apurarAction, {});
  return (
    <form action={action} data-acao="apurar-ajuste-de-perdas" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Apurar o ajuste para perdas da dívida ativa">
      <ChaveDeComando />
      <CampoOrigem />
      <label>
        <span className={ROTULO}>Data de corte</span>
        <input name="corte" type="date" required defaultValue={corte} className={CAMPO} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Apurando…" : "Apurar e lançar a diferença"}</button>
      </div>
      <div className="sm:col-span-3">
        <Resultado estado={estado} acao="apurar-ajuste-de-perdas" />
      </div>
    </form>
  );
}
