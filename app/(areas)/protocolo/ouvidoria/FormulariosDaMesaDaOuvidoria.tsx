"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { responderAction, triarAction, type EstadoDaOuvidoria } from "./actions";

/** As ilhas da mesa da ouvidoria: triagem (tipo confirmado + anotação interna) e resposta ao manifestante. */

function Mensagens({ estado, acao }: { readonly estado: EstadoDaOuvidoria; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} data-resultado-seq="1" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

export function FormTriagem({ manifestacaoId, tipos, tipoInformado, motivo }: {
  readonly manifestacaoId: string;
  readonly tipos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly tipoInformado: string;
  readonly motivo: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(triarAction, {});
  const id = useId();
  if (motivo !== null) return estado.sucesso !== undefined ? <Mensagens estado={estado} acao="triar-manifestacao" /> : <p className="text-xs text-[color:var(--color-ink-2)]" data-motivo-da-triagem>Triagem: {motivo}</p>;
  return (
    <form action={disparar} data-acao="triar-manifestacao" className="mt-3 grid gap-3 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={manifestacaoId} />
      <label htmlFor={`${id}-tipo`} className="text-xs">
        <span className={CLASSE_ROTULO}>Tipo confirmado</span>
        <select id={`${id}-tipo`} name="tipoConfirmado" defaultValue={tipoInformado} className={CLASSE_CAMPO}>
          {tipos.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-anotacao`} className="text-xs">
        <span className={CLASSE_ROTULO}>Anotação interna da triagem</span>
        <textarea id={`${id}-anotacao`} name="anotacaoInterna" required minLength={5} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={estado} acao="triar-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar triagem"}</button>
    </form>
  );
}

export function FormRespostaDaOuvidoria({ manifestacaoId, motivo }: { readonly manifestacaoId: string; readonly motivo: string | null }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(responderAction, {});
  const id = useId();
  if (motivo !== null) return estado.sucesso !== undefined ? <Mensagens estado={estado} acao="responder-manifestacao" /> : <p className="text-xs text-[color:var(--color-ink-2)]" data-motivo-da-resposta>Resposta: {motivo}</p>;
  return (
    <form action={disparar} data-acao="responder-manifestacao" className="mt-3 grid gap-3 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={manifestacaoId} />
      <label htmlFor={`${id}-texto`} className="text-xs">
        <span className={CLASSE_ROTULO}>Resposta ao manifestante</span>
        <textarea id={`${id}-texto`} name="texto" required minLength={10} aria-describedby={`${id}-ajuda`} className={CLASSE_AREA_TEXTO} />
        <span id={`${id}-ajuda`} className="mt-1 block text-[color:var(--color-ink-2)]">Este texto é o que o manifestante lê com o código. Não coloque dado interno ou de terceiros.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="conclusiva" value="sim" className="h-4 w-4" />
        <span>Resposta conclusiva (encerra o processo)</span>
      </label>
      <Mensagens estado={estado} acao="responder-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar resposta"}</button>
    </form>
  );
}
