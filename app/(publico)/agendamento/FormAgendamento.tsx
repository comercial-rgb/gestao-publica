"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../components/ui/Formulario";
import { agendarAction, type EstadoDoAgendamento } from "./actions";

/**
 * O FORMULÁRIO DO CIDADÃO (V11 V8.1).
 *
 * ═══ ⚠️ O SEGREDO APARECE UMA VEZ, E A TELA DIZ ISSO ═══
 * Ele é a única credencial de quem marcou sem conta: é com ele que a pessoa consulta e cancela.
 * Não é relido de lugar nenhum — o banco guarda só o hash. Uma tela que o mostrasse de passagem,
 * no meio de um "pronto!", condenaria quem fechou a aba a aparecer no guichê sem poder cancelar
 * se precisasse.
 *
 * ⚠️ O PAINEL **NÃO** FECHA NO SUCESSO, ao contrário de todos os formulários internos. Ali o que
 * importa é que o ato aconteceu; aqui há algo a COPIAR, e fechar levaria embora o que a pessoa
 * ainda não anotou.
 *
 * ⚠️ ILHA CLIENT NÃO IMPORTA PORTA: guichê, serviço e horários chegam como props.
 */

export function FormAgendamento({
  guicheId,
  servicoId,
  servicoTitulo,
  unidade,
  endereco,
  dia,
  horarios,
}: {
  readonly guicheId: string;
  readonly servicoId: string;
  readonly servicoTitulo: string;
  readonly unidade: string;
  readonly endereco: string;
  readonly dia: string;
  readonly horarios: readonly { readonly hora: string; readonly livres: number }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAgendamento, FormData>(agendarAction, {});
  const [anotou, setAnotou] = useState(false);

  if (estado.segredo !== undefined && estado.codigo !== undefined) {
    return (
      <div
        role="status"
        data-resultado-da-acao="agendar-atendimento"
        data-resultado-seq="1"
        className={`${CLASSE_PAINEL_FORMULARIO} border-[color:var(--color-status-ok-fg)]`}
      >
        <h2 className="text-base font-semibold text-[color:var(--color-status-ok-fg)]">
          Atendimento marcado
        </h2>
        <p className="mt-2 text-sm">
          <strong>{servicoTitulo}</strong> em {unidade} — {endereco}.<br />
          Dia <strong>{dia.split("-").reverse().join("/")}</strong>.
        </p>
        <p className="mt-3 text-sm">
          Leve um documento de identificação. O seu número de atendimento é{" "}
          <strong className="font-mono" data-teste="codigo-do-atendimento">{estado.codigo}</strong>.
        </p>

        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3">
          <p className="text-sm font-semibold">Guarde este código de acompanhamento</p>
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
            O código é exibido <strong>uma única vez</strong> e não pode ser recuperado. Ele é
            necessário para consultar, remarcar ou cancelar a marcação.
          </p>
          <p className="mt-2 font-mono text-lg tracking-wide" data-teste="segredo-do-cidadao">
            {estado.segredo}
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={anotou} onChange={(e) => setAnotou(e.target.checked)} />
            <span>Já anotei o código</span>
          </label>
          {anotou ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
              Para consultar ou cancelar depois, use <strong>Acompanhar minha marcação</strong>.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (horarios.length === 0) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-sm text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">Nenhum horário livre neste dia.</strong>{" "}
        Escolha outra data acima.
      </div>
    );
  }

  return (
    <form action={action} data-acao="agendar-atendimento" className={CLASSE_PAINEL_FORMULARIO} aria-label="Marcar atendimento presencial">
      <input type="hidden" name="guicheId" value={guicheId} />
      <input type="hidden" name="servicoId" value={servicoId} />
      <input type="hidden" name="dia" value={dia} />

      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Os seus dados</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Os dados informados serão usados para a chamada no atendimento. No dia, leve um documento
        de identificação.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Nome completo</span>
          <input name="nome" required minLength={5} maxLength={120} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>CPF ou CNPJ</span>
          <input name="documento" required maxLength={20} placeholder="000.000.000-00" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Horário</span>
          <select name="horaInicio" required defaultValue="" className={CAMPO}>
            <option value="">Escolha o horário…</option>
            {horarios.map((h) => (
              <option key={h.hora} value={h.hora}>{h.hora}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Marcando…" : "Marcar atendimento"}
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
        ) : null}
      </div>
    </form>
  );
}
