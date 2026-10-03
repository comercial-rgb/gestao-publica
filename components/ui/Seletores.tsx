"use client";

import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";
import { periodoDoExercicio, type SituacaoDoExercicio } from "../../lib/situacao-do-exercicio";
import { confirmarDescarte } from "./VigiaDeEdicao";

/**
 * SELETORES de EXERCÍCIO e UG — ilhas client no cabeçalho. Escrevem no `UiContext`.
 *
 * ⚠️ V31 — O CONTEXTO É VISÍVEL INTEIRO: exercício, a FASE dele (proposta em elaboração, orçamento
 * aprovado, em execução, encerrado), o período e a unidade. A fase vem do servidor, derivada de fatos
 * (`lib/situacao-do-exercicio.ts`) — o selo nunca é decidido aqui.
 * ⚠️ E TROCAR PERGUNTA ANTES, se há dado digitado e não salvo na tela (`VigiaDeEdicao`).
 */

const CLASSE_SELECT =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

const TOM: Record<SituacaoDoExercicio["tom"], string> = {
  vigente: "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]",
  andamento: "bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]",
  encerrado: "bg-[color:var(--color-status-neutro-bg)] text-[color:var(--color-status-neutro-fg)]",
  neutro: "bg-[color:var(--color-status-neutro-bg)] text-[color:var(--color-status-neutro-fg)]",
};

export function SeletorExercicio(): React.ReactElement {
  const { exercicio, setExercicio, exerciciosDisponiveis, anoCivil, mesCivil } = useUiContext();
  const situacao = exerciciosDisponiveis.find((e) => e.ano === exercicio)?.situacao;
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Exercício</span>
        <select
          aria-label="Exercício ativo"
          className={CLASSE_SELECT}
          value={exercicio}
          onChange={(e) => {
            if (confirmarDescarte()) setExercicio(Number(e.target.value));
          }}
        >
          {exerciciosDisponiveis.map((ex) => (
            <option key={ex.ano} value={ex.ano}>
              {ex.ano}
              {ex.situacao !== undefined ? ` — ${ex.situacao.rotulo.toLowerCase()}` : ex.encerrado ? " (encerrado)" : ""}
            </option>
          ))}
        </select>
      </label>
      {situacao !== undefined ? (
        <span
          data-situacao-do-exercicio={situacao.fase}
          className={`rounded-[var(--radius-md)] px-2 py-0.5 text-xs font-medium ${TOM[situacao.tom]}`}
          title={`Período: ${periodoDoExercicio(exercicio, anoCivil, mesCivil)}`}
        >
          {situacao.rotulo}
        </span>
      ) : null}
      <span data-periodo className="hidden text-xs text-[color:var(--color-ink-3)] lg:inline">
        {periodoDoExercicio(exercicio, anoCivil, mesCivil)}
      </span>
    </div>
  );
}

export function SeletorUg(): React.ReactElement {
  const { ug, setUg, ugsDisponiveis, podeConsolidado } = useUiContext();
  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)]">
      <span className="uppercase tracking-wide">Unidade</span>
      <select
        aria-label="Unidade gestora"
        className={CLASSE_SELECT}
        value={ug}
        onChange={(e) => {
          if (confirmarDescarte()) setUg(e.target.value);
        }}
      >
        {/* O consolidado só é oferecido a quem pode lê-lo — para os demais ele conteria unidades alheias. */}
        {podeConsolidado ? <option value={UG_CONSOLIDADO}>Consolidado (ente)</option> : null}
        {ugsDisponiveis.map((u) => (
          <option key={u.id} value={u.id}>
            {u.codigo} — {u.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
