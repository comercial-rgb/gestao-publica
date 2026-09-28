"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { declararDadosDaUnidadeAction, type EstadoDaDeclaracao } from "./actions";
import { ATOS, NATUREZAS } from "./rotulos";

/**
 * DECLARAR os dados de uma unidade para a prestação de contas.
 *
 * ⚠️ O FORMULÁRIO FICA MONTADO depois do sucesso, com a confirmação dentro dele — ele não depende de a
 * unidade estar "sem dados" para existir, então não some com o próprio sucesso.
 *
 * ⚠️ DECLARAR DE NOVO NÃO APAGA: cria uma declaração nova com a data desde quando vale. É assim que se
 * registra a troca de secretário, e é assim que se corrige um erro de digitação.
 */
export function FormDeclaracao({
  unidades,
}: {
  readonly unidades: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDeclaracao, FormData>(declararDadosDaUnidadeAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="declarar-dados-da-unidade" aria-label="Declarar os dados da unidade">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Declarar os dados de uma unidade</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Unidade orçamentária</span>
          <select name="unidadeOrcId" defaultValue="" required className={CAMPO}>
            <option value="" disabled>Escolha a unidade…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Natureza jurídica</span>
          <select name="naturezaJuridica" defaultValue="" required className={CAMPO}>
            <option value="" disabled>Escolha…</option>
            {NATUREZAS.map((n) => (
              <option key={n.valor} value={n.valor}>{n.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vale desde (data da posse)</span>
          <input name="vigenteDesde" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nome do secretário responsável (até 60 caracteres)</span>
          <input name="nomeSecretario" required maxLength={60} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CPF do secretário</span>
          <input name="cpfSecretario" required inputMode="numeric" placeholder="000.000.000-00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ato que o nomeou</span>
          <select name="atoDeNomeacao" defaultValue="" required className={CAMPO}>
            <option value="" disabled>Escolha…</option>
            {ATOS.map((a) => (
              <option key={a.valor} value={a.valor}>{a.rotulo}</option>
            ))}
          </select>
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="declarar-dados-da-unidade" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="declarar-dados-da-unidade" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente || unidades.length === 0} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Declarando…" : "Declarar"}
      </button>
    </form>
  );
}
