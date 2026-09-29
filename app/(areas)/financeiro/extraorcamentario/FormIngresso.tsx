"use client";

import { useActionState, useId } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { registrarIngressoAction, type EstadoDoEstornoExtra } from "./actions";

/** REGISTRAR UM INGRESSO AVULSO — o dinheiro de terceiro entra no caixa e nasce a obrigação de repassá-lo. */
export function FormIngresso({
  tipos,
  contas,
}: {
  readonly tipos: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contas: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoEstornoExtra, FormData>(registrarIngressoAction, {});
  const id = useId();
  return (
    <form action={action} data-acao="registrar-ingresso-extra" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar ingresso (caução, depósito, consignação)</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O valor é de terceiro: não é receita orçamentária. A retenção feita no pagamento não se registra aqui, porque ela nasce do próprio pagamento.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-tipo`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select id={`${id}-tipo`} name="tipoConsignacao" required className={CAMPO} defaultValue="">
            <option value="">Escolha…</option>
            {tipos.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} — {t.descricao}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-credor`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>De quem é o valor</span>
          <input id={`${id}-credor`} name="credorConsignatario" required className={CAMPO} />
        </label>
        <label htmlFor={`${id}-conta`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta que recebeu</span>
          <select id={`${id}-conta`} name="contaBancaria" required className={CAMPO} defaultValue="">
            <option value="">Escolha…</option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} — {c.descricao}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-valor`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor id={`${id}-valor`} name="valor" required placeholder="0,00" className={CAMPO} />
        </label>
        <label htmlFor={`${id}-data`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data</span>
          <input id={`${id}-data`} name="data" type="date" required className={CAMPO} />
        </label>
        <label htmlFor={`${id}-historico`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Histórico</span>
          <input id={`${id}-historico`} name="historico" required className={CAMPO} />
        </label>
      </div>
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar ingresso"}
        </button>
      </div>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
    </form>
  );
}
