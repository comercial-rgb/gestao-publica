"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { acertarAction, apropriarAction, apropriarEncargosAction, declararFeriasAction, type EstadoDaApropriacao } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDaApropriacao; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  if (estado.erro !== undefined) return <p role="alert" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  return null;
}

export function FormParametroDeFerias({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaApropriacao, FormData>(declararFeriasAction, {});
  return (
    <form action={action} data-acao="declarar-parametro-de-ferias" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Declarar o parâmetro das férias">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Exercício</span>
        <input name="exercicio" required inputMode="numeric" defaultValue={exercicio} className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Meses do período aquisitivo</span>
        <input name="meses" required inputMode="numeric" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Apropria a remuneração do período de férias?</span>
        <select name="incluiRemuneracao" required className={CAMPO}>
          <option value="">Escolha</option>
          <option value="sim">Sim: a remuneração do mês de gozo e o abono</option>
          <option value="nao">Não: só o abono (a remuneração do gozo sai na rubrica ordinária)</option>
        </select>
      </label>
      <label>
        <span className={ROTULO}>Abono constitucional: numerador</span>
        <input name="abonoNumerador" required inputMode="numeric" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Abono constitucional: denominador</span>
        <input name="abonoDenominador" required inputMode="numeric" className={CAMPO} />
      </label>
      <label className="sm:col-span-3">
        <span className={ROTULO}>Fundamento (ato do município e dispositivo)</span>
        <input name="fundamento" required minLength={20} className={CAMPO} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Declarando…" : "Declarar parâmetro"}</button>
        <Resultado estado={estado} acao="declarar-parametro-de-ferias" />
      </div>
    </form>
  );
}

export function FormApropriar({ competencia }: { readonly competencia: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaApropriacao, FormData>(apropriarAction, {});
  return (
    <form action={action} data-acao="apropriar-competencia" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Apropriar o 13º e as férias da competência">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Competência</span>
        <input name="competencia" type="month" required defaultValue={competencia} className={CAMPO} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Apropriando…" : "Apropriar a competência"}</button>
      </div>
      <div className="sm:col-span-3">
        <Resultado estado={estado} acao="apropriar-competencia" />
      </div>
    </form>
  );
}

export function FormEncargos({ competencia }: { readonly competencia: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaApropriacao, FormData>(apropriarEncargosAction, {});
  return (
    <form action={action} data-acao="apropriar-encargos-da-competencia" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Apropriar os encargos patronais sobre o 13º e as férias da competência">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Competência</span>
        <input name="competencia" type="month" required defaultValue={competencia} className={CAMPO} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Apropriando…" : "Apropriar os encargos"}</button>
      </div>
      <div className="sm:col-span-3">
        <Resultado estado={estado} acao="apropriar-encargos-da-competencia" />
      </div>
    </form>
  );
}

export function FormAcerto({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaApropriacao, FormData>(acertarAction, {});
  return (
    <form action={action} data-acao="acertar-decimo-terceiro" className="grid gap-3 text-xs sm:grid-cols-3" aria-label="Acertar o 13º apropriado no fim do exercício">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Exercício</span>
        <input name="exercicio" required inputMode="numeric" defaultValue={exercicio} className={CAMPO} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Acertando…" : "Acertar o 13º do exercício"}</button>
      </div>
      <div className="sm:col-span-3">
        <Resultado estado={estado} acao="acertar-decimo-terceiro" />
      </div>
    </form>
  );
}
