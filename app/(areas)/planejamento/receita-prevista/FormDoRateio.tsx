"use client";

import { useActionState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { preverPorRateioAction, type EstadoDoAto } from "./actions";

/** A natureza que rateia, como ESTE form a consome (ilha client não importa de `lib/portas`). */
export interface NaturezaQueRateia {
  readonly codigo: string;
  readonly descricao: string;
  readonly fontes: string;
}

/**
 * V36 — a previsão de uma natureza por um valor só, repartido pelas fontes cadastradas na natureza. A lista traz só as
 * naturezas com fontes que somam 100%.
 */
export function FormDoRateio({ exercicio, naturezas }: { readonly exercicio: number; readonly naturezas: readonly NaturezaQueRateia[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(preverPorRateioAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Prever a receita por rateio entre as fontes" data-acao="prever-por-rateio">
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <h2 className="mb-1 text-sm font-semibold">Prever a receita de uma natureza por rateio</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Informe o valor total da natureza: o sistema grava uma previsão por fonte, nos percentuais cadastrados em Fontes por natureza da receita. Se alguma das fontes já tiver previsão da natureza no exercício, nada é gravado.
      </p>
      {naturezas.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma natureza tem fontes que somam 100%. Cadastre as fontes da natureza antes.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Natureza</span>
            <select name="natureza" required defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Escolha a natureza
              </option>
              {naturezas.map((n) => (
                <option key={n.codigo} value={n.codigo}>
                  {n.codigo} — {n.descricao} — {n.fontes}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Valor total previsto (R$)</span>
            <CampoValor name="valor" required placeholder="100.000,00" className={CAMPO} />
          </label>
        </div>
      )}
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]" data-resultado-da-acao="prever-por-rateio">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]" data-resultado-da-acao="prever-por-rateio">{estado.sucesso}</p>
      ) : null}
      {naturezas.length > 0 ? (
        <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
          {pendente ? "Gravando..." : "Gravar a previsão rateada"}
        </button>
      ) : null}
    </form>
  );
}
