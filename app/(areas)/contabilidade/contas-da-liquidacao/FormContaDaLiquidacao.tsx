"use client";

import { useActionState, useState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { declararContaDaLiquidacaoAction, type EstadoDaContaDaLiquidacao } from "./actions";

/**
 * O FORMULÁRIO DA CONTA DA LIQUIDAÇÃO POR ELEMENTO (V28).
 *
 * ⚠️ SEM DEFAULT NO EFEITO. Escolher "despesa do período" por padrão faria o equipamento virar
 * despesa — exatamente o erro que a recusa da liquidação existia para impedir.
 *
 * ⚠️ O FORMULÁRIO FICA NA TELA DEPOIS DO SUCESSO, e a confirmação também: declarar o 52 não
 * esconde o lugar de declarar o 51.
 */

export interface EfeitoNaTela {
  readonly valor: string;
  readonly rotulo: string;
}

export function FormContaDaLiquidacao({
  efeitos,
  elementoInicial,
}: {
  readonly efeitos: readonly EfeitoNaTela[];
  readonly elementoInicial?: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaContaDaLiquidacao, FormData>(declararContaDaLiquidacaoAction, {});
  const [efeito, setEfeito] = useState("");

  return (
    <form action={action} data-painel="declarar-conta-da-liquidacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Declarar a conta da liquidação de um elemento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Elemento de despesa (2 dígitos)</span>
          <input name="elemento" required pattern="\d{2}" placeholder="52" defaultValue={elementoInicial ?? ""} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-3">
          <span className={ROTULO}>Em que a despesa se transforma</span>
          <select name="efeito" required value={efeito} onChange={(e) => setEfeito(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            {efeitos.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
        <CampoReferenciado
          name="contaCodigo"
          rotulo="Conta do plano debitada na liquidação"
          catalogo="contas-analiticas"
          contexto={["efeito"]}
          placeholder="Digite o início do código ou parte do nome"
          ajuda="Só contas analíticas da classe do efeito escolhido."
          largura={4}
        />
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Fundamento</span>
          <input
            name="fundamento"
            required
            minLength={20}
            maxLength={500}
            placeholder="Norma, ato do ente ou orientação do tribunal que sustenta a conta escolhida"
            className={CAMPO}
          />
        </label>
      </div>
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="declarar-conta-da-liquidacao" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="declarar-conta-da-liquidacao" className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Declarando…" : "Declarar conta"}
      </button>
    </form>
  );
}
