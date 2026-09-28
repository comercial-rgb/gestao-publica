"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";

interface Estado {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A VERSÃO DO PARÂMETRO — ilha client (limite 2 do molde: a base é uma LISTA de rubricas).
 *
 * ⚠️ O PERCENTUAL SE DIGITA COMO NO ATO ("20" ou "20,5"), sem valor sugerido. Não há "padrão nacional"
 * pré-preenchido: RGPS, RPPS e FGTS têm fundamentos e bases diferentes.
 * ⚠️ "SINTÉTICA" é perfil de teste — a apuração e o documento dizem isso em cada linha.
 */
export function FormVersaoDoEncargo({ componenteId, rubricas, action }: {
  readonly componenteId: string;
  readonly rubricas: readonly { readonly id: string; readonly rotulo: string }[];
  readonly action: (e: Estado, f: FormData) => Promise<Estado>;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<Estado, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={disparar} data-acao="nova-versao-do-encargo" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={componenteId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova versão do parâmetro</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A versão vale a partir da competência de início e só é considerada na apuração após aprovação por outro usuário.
        Para corrigir, cadastre nova versão com início posterior; a anterior permanece no histórico.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Competência de início (AAAA-MM)</span>
          <input name="competenciaInicio" required pattern="\d{4}-(0[1-9]|1[0-2])" placeholder="2026-01" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Competência final (opcional)</span>
          <input name="competenciaFim" pattern="\d{4}-(0[1-9]|1[0-2])" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Percentual do ato (ex.: 20 ou 20,5)</span>
          <input name="percentual" required inputMode="decimal" pattern="\d{1,3}([,.]\d{1,4})?" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Teto da base (opcional)</span>
          <input name="teto" inputMode="decimal" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Fundamentação (lei, portaria, decreto e artigo)</span>
          <input name="fundamentacaoLegal" required minLength={5} className={CAMPO} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
          <input type="checkbox" name="sintetica" value="sim" className="h-4 w-4" />
          <span>Versão sintética para teste (sem validade normativa)</span>
        </label>
      </div>
      <fieldset data-secao="base" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Rubricas de provento que compõem a base</legend>
        {rubricas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Não há rubrica de provento cadastrada.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rubricas.map((r, i) => (
              <label key={r.id} className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
                <input type="checkbox" name={`rubricas.${i}.id`} value={r.id} className="h-4 w-4" />
                <span>{r.rotulo}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {estado.erro !== undefined ? <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Cadastrar versão"}</button>
    </form>
  );
}
