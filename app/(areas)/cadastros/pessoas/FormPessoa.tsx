"use client";

import { useActionState, useRef } from "react";
import { CampoCep, CampoCpfCnpj, CampoTelefone } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { cadastrarPessoaAction, type EstadoPessoa } from "./actions";

/**
 * FORM DE CADASTRO — ilha client, Server Action autenticada.
 *
 * ⚠️ NÃO HÁ SELETOR DE "TIPO" (física/jurídica). O tipo SAI DO DOCUMENTO: 11 dígitos é
 * CPF, 14 é CNPJ. Um select ao lado seria uma segunda declaração da mesma coisa, e o dia
 * em que as duas divergissem o cadastro teria uma PJ com CPF — sem erro nenhum, porque as
 * duas entradas eram "válidas" separadamente.
 *
 * ⚠️ NENHUM CAMPO ESCONDIDO CARREGA AUTORIZAÇÃO. Não há `criadoPor` no formulário: ele
 * vem da sessão, no servidor.
 */
export function FormPessoa(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPessoa, FormData>(
    cadastrarPessoaAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Cadastrar pessoa
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CPF ou CNPJ</span>
          <CampoCpfCnpj
            name="documento"
            required
            placeholder="12.345.678/0001-99"
            className={CAMPO}
          />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
            O tipo — física ou jurídica — vem do documento.
          </span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Nome ou razão social</span>
          <input name="nome" required placeholder="Fornecedor Alfa Ltda" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nome fantasia</span>
          <input name="nomeFantasia" placeholder="somente para PJ" className={CAMPO} />
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
          <span className={ROTULO}>Complemento</span>
          <input name="complemento" className={CAMPO} />
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
          <input name="uf" maxLength={2} placeholder="PB" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CEP</span>
          <CampoCep name="cep" className={CAMPO} />
        </label>
      </div>

      {/*
        ⚠️ OS DADOS BANCÁRIOS NÃO ESTÃO AQUI, e é decisão. A especificação do lote pede que
        eles fiquem "no domínio de credor/conta com permissões próprias, não no perfil
        público" — quem pode corrigir um endereço não deveria poder trocar a conta que
        recebe o pagamento. O domínio da conta do credor ainda não existe; enquanto não
        existir, ele fica declarado como pendência em vez de nascer no lugar errado.
      */}

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
        {pendente ? "Cadastrando…" : "Cadastrar pessoa"}
      </button>
    </form>
  );
}
