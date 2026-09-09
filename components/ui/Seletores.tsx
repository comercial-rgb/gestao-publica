"use client";

import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";

/**
 * SELETORES de EXERCÍCIO e UG — ilhas client no cabeçalho. Escrevem no `UiContext`.
 *
 * ⚠️ Eles são parâmetro de quase toda porta do domínio. Hoje mudam só o contexto (mock); quando
 * as páginas de relatório lerem o contexto, mudar aqui vai re-consultar as portas reais.
 */

const CLASSE_SELECT =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorExercicio(): React.ReactElement {
  const { exercicio, setExercicio, exerciciosDisponiveis } = useUiContext();
  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
      <span className="uppercase tracking-wide">Exercício</span>
      <select
        aria-label="Exercício ativo"
        className={CLASSE_SELECT}
        value={exercicio}
        onChange={(e) => setExercicio(Number(e.target.value))}
      >
        {exerciciosDisponiveis.map((ex) => (
          <option key={ex.ano} value={ex.ano}>
            {ex.ano}
            {ex.encerrado ? " (encerrado)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SeletorUg(): React.ReactElement {
  const { ug, setUg, ugsDisponiveis } = useUiContext();
  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
      <span className="uppercase tracking-wide">Unidade</span>
      <select
        aria-label="Unidade gestora"
        className={CLASSE_SELECT}
        value={ug}
        onChange={(e) => setUg(e.target.value)}
      >
        <option value={UG_CONSOLIDADO}>Consolidado (ente)</option>
        {ugsDisponiveis.map((u) => (
          <option key={u.id} value={u.id}>
            {u.codigo} — {u.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
