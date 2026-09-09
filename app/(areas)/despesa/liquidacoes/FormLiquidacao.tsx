"use client";

import { useActionState, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { liquidarAction, type EstadoLiquidacao } from "./actions";

/** O empenho liquidável, já filtrado pelo Server Component (saldo a liquidar > 0). */
export interface EmpenhoLiquidavel {
  readonly id: string;
  readonly numero: string;
  readonly credorCpfCnpj: string;
  readonly saldoALiquidar: string;
}

/**
 * FORM DE LIQUIDAÇÃO — ilha client, Server Action autenticada.
 *
 * ⚠️ O TETO DO VALOR É SUGESTÃO, NÃO GUARD. O `max` do input ajuda quem digita, mas
 * quem RECUSA liquidar acima do empenhado é o domínio, lendo o SUM real dentro da
 * transação. Confiar no `max` seria confiar num número que o navegador pode ignorar e
 * que já está velho quando o form é enviado — duas requisições concorrentes liquidariam
 * o mesmo saldo.
 */
export function FormLiquidacao({
  empenhos,
}: {
  readonly empenhos: readonly EmpenhoLiquidavel[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLiquidacao, FormData>(
    liquidarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (empenhos.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhum empenho com saldo a liquidar
        </strong>{" "}
        — ou não há empenho neste recorte, ou todos já foram liquidados por inteiro. A
        liquidação sempre parte de um empenho: é ele que reservou a dotação.
      </div>
    );
  }

  const alvo = empenhos.find((e) => e.id === escolhido);

  return (
    <form
      ref={ref}
      action={action}
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar liquidação
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Empenho (com saldo a liquidar)</span>
          <select
            name="empenhoId"
            required
            defaultValue=""
            className={CAMPO}
            onChange={(e) => setEscolhido(e.target.value)}
          >
            <option value="" disabled>
              Escolha o empenho…
            </option>
            {empenhos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numero} — credor {e.credorCpfCnpj} · a liquidar {e.saldoALiquidar}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da liquidação</span>
          <input name="numero" required placeholder="2026NL000001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>
            Valor (R$){alvo !== undefined ? ` — até ${alvo.saldoALiquidar}` : ""}
          </span>
          <CampoValor name="valor" required placeholder="6.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data da liquidação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Responsável pelo atesto</span>
          <input
            name="atesto"
            required
            placeholder="quem atestou o recebimento"
            className={CAMPO}
          />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="recebimento conforme nota fiscal 1234"
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
        {pendente ? "Liquidando…" : "Liquidar"}
      </button>
    </form>
  );
}
