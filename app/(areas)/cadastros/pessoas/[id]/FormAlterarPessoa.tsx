"use client";

import { useActionState } from "react";
import { CampoCep, CampoTelefone } from "../../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { alterarPessoaAction, type EstadoPessoa } from "../actions";

/**
 * ALTERAR — que aqui significa ACRESCENTAR UMA VERSÃO.
 *
 * ⚠️ O MOTIVO É OBRIGATÓRIO, e a regra é do domínio (`zAlterarPessoa`), não deste
 * formulário. Uma versão sem motivo é um carimbo: a linha do tempo vira uma lista de
 * instantes que não explica nada. O `required` aqui repete a regra na tela; não a
 * substitui.
 *
 * ⚠️ O DOCUMENTO NÃO É EDITÁVEL, e não é esquecimento. Corrigir um CPF não é atualizar a
 * pessoa: é dizer que aquela pessoa era outra — e os empenhos já emitidos continuariam
 * apontando para o documento antigo. O caminho certo é desativar este cadastro e criar o
 * correto; o histórico mostra os dois, que é o que aconteceu.
 */
export function FormAlterarPessoa({
  pessoaId,
  ativa,
  nome,
}: {
  readonly pessoaId: string;
  readonly ativa: boolean;
  readonly nome: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPessoa, FormData>(
    alterarPessoaAction,
    {}
  );

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Alterar cadastro
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A versão atual não é reescrita — esta alteração cria uma nova, e a anterior
        permanece no histórico.
      </p>

      <input type="hidden" name="pessoaId" value={pessoaId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Nome ou razão social</span>
          <input name="nome" required defaultValue={nome} className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nome fantasia</span>
          <input name="nomeFantasia" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>E-mail</span>
          <input name="email" type="email" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Telefone</span>
          <CampoTelefone name="telefone" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Logradouro</span>
          <input name="logradouro" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número</span>
          <input name="numero" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Bairro</span>
          <input name="bairro" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Município</span>
          <input name="municipio" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>UF</span>
          <input name="uf" maxLength={2} className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CEP</span>
          <CampoCep name="cep" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Motivo da alteração</span>
          <input
            name="motivo"
            required
            placeholder="correção de endereço · mudança de razão social"
            className={CAMPO}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="ativa" defaultChecked={ativa} />
          <span>Cadastro ativo</span>
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

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar alteração"}
      </button>
    </form>
  );
}
