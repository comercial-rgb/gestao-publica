"use client";

import { useActionState, useId, useState } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { desfazerVinculoAction, vincularAction, type EstadoDoVinculo } from "./actions";

/** Uma pendência oferecida para vínculo: o valor é o residual SEM sinal (o que ainda cabe conciliar). */
export interface OpcaoDePendencia {
  readonly valor: string;
  readonly rotulo: string;
  readonly residual: string;
}

function Mensagens({ estado }: { readonly estado: EstadoDoVinculo }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
    </>
  );
}

/**
 * VINCULAR uma linha do extrato a um registro do sistema. O valor vem preenchido com o menor dos dois
 * residuais — parcial é legítimo, e o domínio recusa o que passar do que cabe.
 */
export function FormVincular({
  linhas,
  registros,
}: {
  readonly linhas: readonly OpcaoDePendencia[];
  readonly registros: readonly OpcaoDePendencia[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoVinculo, FormData>(vincularAction, {});
  const id = useId();
  const [linha, setLinha] = useState("");
  const [registro, setRegistro] = useState("");
  const [valor, setValor] = useState("");
  const sugerir = (l: string, r: string): void => {
    const a = linhas.find((x) => x.valor === l)?.residual;
    const b = registros.find((x) => x.valor === r)?.residual;
    if (a !== undefined && b !== undefined) setValor(Number(a) <= Number(b) ? a : b);
    else setValor(a ?? b ?? "");
  };

  return (
    <form action={action} data-acao="vincular-conciliacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Vincular uma linha do extrato a um registro do sistema</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Entrada do banco só se vincula a entrada no sistema, e saída a saída. O vínculo pode ser parcial dos dois lados.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-linha`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Linha do extrato</span>
          <select id={`${id}-linha`} name="linhaDoExtrato" required className={CAMPO} value={linha} onChange={(e) => { setLinha(e.target.value); sugerir(e.target.value, registro); }}>
            <option value="">Escolha…</option>
            {linhas.map((l) => (
              <option key={l.valor} value={l.valor}>{l.rotulo}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-registro`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Registro do sistema</span>
          <select id={`${id}-registro`} name="registroDoSistema" required className={CAMPO} value={registro} onChange={(e) => { setRegistro(e.target.value); sugerir(linha, e.target.value); }}>
            <option value="">Escolha…</option>
            {registros.map((r) => (
              <option key={r.valor} value={r.valor}>{r.rotulo}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-valor`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor a conciliar (R$)</span>
          <input id={`${id}-valor`} name="valor" required inputMode="decimal" placeholder="0.00" className={CAMPO} value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Vinculando…" : "Vincular"}</button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}

/** DESFAZER um vínculo: um registro novo que o anula, com motivo — o original continua no histórico. */
export function FormDesfazerVinculo({ vinculoId, rotulo }: { readonly vinculoId: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoVinculo, FormData>(desfazerVinculoAction, {});
  const id = useId();
  return (
    <form action={action} data-acao="desfazer-vinculo" className="mt-1 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="vinculoId" value={vinculoId} />
      <label htmlFor={`${id}-motivo`} className="text-xs text-[color:var(--color-ink-2)]">
        <span className="sr-only">Motivo para desfazer o vínculo de {rotulo}</span>
        <input id={`${id}-motivo`} name="motivo" required minLength={10} placeholder="Motivo (mín. 10 caracteres)" className={`${CAMPO} w-56`} />
      </label>
      <button type="submit" disabled={pendente} className="text-xs font-semibold text-[color:var(--color-primary)] underline">
        {pendente ? "Desfazendo…" : "Desfazer"}
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}
