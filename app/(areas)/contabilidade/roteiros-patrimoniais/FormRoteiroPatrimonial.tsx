"use client";

import { useActionState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { declararRoteiroPatrimonialAction, type EstadoDoRoteiroPatrimonial } from "./actions";

/**
 * O FORMULÁRIO DO ROTEIRO DE PRECATÓRIOS E CONVÊNIOS (V32). Sem conta sugerida: a escolha é do contador,
 * e o serviço recusa conta de subsistema diferente do movimento.
 */

export function FormRoteiroPatrimonial({
  movimentos,
  movimentoInicial,
}: {
  readonly movimentos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly movimentoInicial?: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoRoteiroPatrimonial, FormData>(declararRoteiroPatrimonialAction, {});
  return (
    <form action={action} data-painel="declarar-roteiro-patrimonial" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Declarar o roteiro de um movimento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Movimento</span>
          <select name="movimento" required defaultValue={movimentoInicial ?? ""} className={CAMPO}>
            <option value="">Escolha…</option>
            {movimentos.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
        <CampoReferenciado
          name="contaDebitoCodigo"
          rotulo="Conta debitada"
          catalogo="contas-analiticas"
          placeholder="Digite o início do código ou parte do nome"
          ajuda="Precatórios lançam nas classes 1 a 4; convênios, nas classes 7 e 8."
          largura={2}
        />
        <CampoReferenciado
          name="contaCreditoCodigo"
          rotulo="Conta creditada"
          catalogo="contas-analiticas"
          placeholder="Digite o início do código ou parte do nome"
          largura={2}
        />
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Histórico do lançamento</span>
          <input name="historicoPadrao" required minLength={5} maxLength={200} placeholder="Inscrição de precatório" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Fundamento</span>
          <input
            name="fundamento"
            required
            minLength={20}
            maxLength={500}
            placeholder="Norma, ato do ente ou orientação do tribunal que sustenta as contas"
            className={CAMPO}
          />
        </label>
      </div>
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="declarar-roteiro-patrimonial" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="declarar-roteiro-patrimonial" className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Declarando…" : "Declarar roteiro"}
      </button>
    </form>
  );
}
