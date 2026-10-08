"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { definirFontesDaNaturezaAction, type EstadoDaComposicao } from "./actions";
import { LINHAS_DA_COMPOSICAO } from "./linhas";

/** O item de lista como ESTE form o consome (declarado aqui: ilha client não importa de `lib/portas`). */
export interface OpcaoDeCodigo {
  readonly codigo: string;
  readonly descricao: string;
}

/**
 * V36 — as fontes de uma natureza da receita, com percentual. A natureza e a fonte são digitadas com sugestão (a lista
 * do ementário e a de fontes são longas demais para um seletor); o domínio confere que existem.
 */
export function FormDaComposicao({ naturezas, fontes }: { readonly naturezas: readonly OpcaoDeCodigo[]; readonly fontes: readonly OpcaoDeCodigo[] }): React.ReactElement {
  const idNaturezas = useId();
  const idFontes = useId();
  const [estado, action, pendente] = useActionState<EstadoDaComposicao, FormData>(definirFontesDaNaturezaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Registrar as fontes da natureza" data-form-composicao>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold">Registrar as fontes de uma natureza</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A soma dos percentuais não pode passar de 100%. Para ratear a previsão da receita, a soma tem de ser exatamente 100%. Uma nova composição substitui a anterior, que continua no histórico.
      </p>
      <datalist id={idNaturezas}>
        {naturezas.map((n) => (
          <option key={n.codigo} value={n.codigo}>{n.descricao}</option>
        ))}
      </datalist>
      <datalist id={idFontes}>
        {fontes.map((f) => (
          <option key={f.codigo} value={f.codigo}>{f.descricao}</option>
        ))}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Natureza da receita (8 dígitos)</span>
          <input name="natureza" required list={idNaturezas} maxLength={20} placeholder="11180111" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fundamento (lei, decreto ou parecer)</span>
          <input name="fundamento" required minLength={5} className={CAMPO} />
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className={ROTULO}>Fontes e percentuais</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: LINHAS_DA_COMPOSICAO }, (_, i) => (
            <div key={i} className="flex gap-2" data-linha-composicao={i}>
              <label className="flex-1 text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Fonte {i + 1}</span>
                <input name={`fonte${String(i)}`} list={idFontes} inputMode="numeric" maxLength={6} placeholder="500" className={CAMPO} />
              </label>
              <label className="w-28 text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Percentual</span>
                <input name={`percentual${String(i)}`} inputMode="decimal" placeholder="25,5" className={CAMPO} />
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block max-w-xs text-xs text-[color:var(--color-ink-2)]">
        <span className={ROTULO}>Fonte que recebe o centavo de sobra do rateio</span>
        <input name="residuo" required list={idFontes} inputMode="numeric" maxLength={6} placeholder="500" className={CAMPO} />
      </label>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]" data-composicao-registrada>{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando..." : "Registrar as fontes"}
      </button>
    </form>
  );
}
