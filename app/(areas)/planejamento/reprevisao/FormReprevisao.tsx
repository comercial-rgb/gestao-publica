"use client";

import { useActionState, useRef } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { reprevisarAction, type EstadoReprevisao } from "./actions";

/**
 * FORM de REPREVISÃO — ilha client, Server Action autenticada. O ajuste tem SINAL (+ aumenta, −
 * reduz). Sucesso → limpa e a lista (Server Component) revalida.
 */
export function FormReprevisao({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoReprevisao, FormData>(reprevisarAction, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso === true) ref.current?.reset();

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Registrar reprevisão</h2>
      <input type="hidden" name="exercicio" value={exercicio} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Natureza (8 díg.)</span>
          <input name="natureza" required pattern="\d{8}" placeholder="11121101" className={CAMPO} /></label>
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Fonte (3 díg.)</span>
          <input name="fonte" required pattern="\d{3}" placeholder="500" className={CAMPO} /></label>
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Tipo</span>
          <select name="tipo" className={CAMPO} defaultValue="ORCAMENTARIA">
            <option value="ORCAMENTARIA">Orçamentária</option>
            <option value="INTRA_ORCAMENTARIA">Intra-orçamentária</option>
            <option value="DEDUCAO">Dedução</option>
          </select></label>
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Ajuste (+/−, R$)</span>
          {/*
            ⚠️ O ÚNICO VALOR ASSINADO DO SISTEMA — é ele que obriga o `CampoValor` a ter os dois
            rostos. Digita-se "-5.000,00" (com o menos, porque parêntese não é tecla); ao sair do
            campo lê-se "(5.000,00)", a convenção contábil do resto da tela. Submete "-5000.00".
          */}
          <CampoValor name="ajuste" required placeholder="20.000,00 ou -5.000,00" className={CAMPO} /></label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-2"><span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={5} placeholder="reestimativa de arrecadação" className={CAMPO} /></label>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso === true ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">Reprevisão registrada.</p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar"}
      </button>
    </form>
  );
}
