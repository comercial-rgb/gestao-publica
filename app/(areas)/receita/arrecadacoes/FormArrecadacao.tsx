"use client";

import { useActionState, useRef } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { arrecadarAction, type EstadoArrecadacao } from "./actions";

/** Uma natureza prevista na LOA — o vocabulário do form. */
export interface NaturezaParaGuia {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
}

/**
 * FORM DE ARRECADAÇÃO — ilha client, Server Action autenticada.
 *
 * ⚠️ NATUREZA E FONTE SÃO CAMPOS DE TEXTO, não selects fechados. O rol da LOA aparece
 * como `datalist` (sugestão), e não como `<select>` (restrição), porque **receita não
 * prevista existe**: o domínio aceita arrecadar numa natureza que a LOA não previu — é
 * assim que o Anexo 1 do RREO mostra "arrecadado além do previsto". Um select fechado
 * ensinaria que só se arrecada o que foi previsto, o que é falso.
 *
 * A LOA orienta; o domínio valida a FORMA (8 dígitos, 3 dígitos) e a existência.
 *
 * ⚠️ SEM UNIDADE GESTORA: a receita é do ENTE (CF art. 167, IV).
 */
export function FormArrecadacao({
  exercicio,
  naturezas,
}: {
  readonly exercicio: number;
  readonly naturezas: readonly NaturezaParaGuia[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoArrecadacao, FormData>(
    arrecadarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form
      ref={ref}
      action={action}
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar guia de arrecadação
      </h2>
      <input type="hidden" name="exercicio" value={exercicio} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Natureza da receita (8 dígitos)</span>
          <input
            name="natureza"
            required
            pattern="\d{8}"
            list="naturezas-loa"
            placeholder="11121101"
            className={CAMPO}
          />
          {/* SUGESTÃO, não restrição — ver o cabeçalho: receita não prevista existe. */}
          <datalist id="naturezas-loa">
            {naturezas.map((n) => (
              <option key={`${n.naturezaCodigo}-${n.fonteCodigo}`} value={n.naturezaCodigo}>
                {n.naturezaDescricao} · fonte {n.fonteCodigo}
              </option>
            ))}
          </datalist>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fonte (3 dígitos)</span>
          <input name="fonte" required pattern="\d{3}" placeholder="500" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CO (4 dígitos, opcional)</span>
          <input name="co" pattern="\d{4}" placeholder="0001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Exercício da fonte</span>
          <select name="exercicioFonte" defaultValue="1" className={CAMPO}>
            <option value="1">1 — atual</option>
            <option value="2">2 — anterior</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="1.500,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data de arrecadação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da guia</span>
          <input
            name="numeroReceita"
            required
            placeholder="2026RC000001"
            className={CAMPO}
          />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? "Registrando…" : "Registrar guia"}
      </button>
    </form>
  );
}
