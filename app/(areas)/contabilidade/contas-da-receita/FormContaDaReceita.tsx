"use client";

import { useActionState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { declararContaDaReceitaAction, type EstadoDaContaDaReceita } from "./actions";

/**
 * O FORMULÁRIO DA VPA POR NATUREZA DE RECEITA (V28). O formulário fica na tela depois do sucesso: declarar
 * o IPTU não esconde o lugar de declarar o ITBI.
 */
export function FormContaDaReceita({ prefixoInicial }: { readonly prefixoInicial?: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaContaDaReceita, FormData>(declararContaDaReceitaAction, {});
  return (
    <form action={action} data-acao="declarar-conta-da-receita" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      {/* O recorte da busca de contas: só variação patrimonial aumentativa (classe 4). */}
      <input type="hidden" name="efeito" value="VPA" />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Declarar a conta de uma natureza de receita</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Natureza de receita (início, 2 a 8 dígitos)</span>
          <input name="naturezaPrefixo" required pattern="\d{2,8}" placeholder="11180111" defaultValue={prefixoInicial ?? ""} className={CAMPO} />
        </label>
        <CampoReferenciado
          name="contaVpaCodigo"
          rotulo="Conta de variação patrimonial aumentativa"
          catalogo="contas-analiticas"
          contexto={["efeito"]}
          placeholder="Digite o início do código ou parte do nome"
          ajuda="Só contas analíticas da classe 4."
          largura={3}
        />
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Fundamento</span>
          <input name="fundamento" required minLength={20} maxLength={500} placeholder="Plano de contas, norma ou orientação do tribunal que sustenta a conta" className={CAMPO} />
        </label>
      </div>
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="declarar-conta-da-receita" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="declarar-conta-da-receita" className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Declarando…" : "Declarar conta"}
      </button>
    </form>
  );
}
