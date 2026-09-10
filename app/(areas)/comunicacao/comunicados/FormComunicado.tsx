"use client";

import { useActionState, useRef } from "react";
import { CampoSelect, CampoTexto, CampoTextarea } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_PAINEL_FORMULARIO,
} from "../../../../components/ui/Formulario";
import { rascunharAction, type EstadoDoComunicado } from "./actions";

export interface TipoDoForm {
  readonly id: string;
  readonly rotulo: string;
  readonly aceitaResposta: boolean;
  readonly assinaturaExigida: string | null;
}

export interface SetorDoForm {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * ⚠️ O RESULTADO REPETE A MENSAGEM DO DOMÍNIO INTEIRA. Ela foi escrita para quem lê:
 * diz o que aconteceu, por que, e o que fazer.
 */
export function ResultadoComunicado({
  estado,
}: {
  readonly estado: EstadoDoComunicado;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        role="alert"
        className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/**
 * NOVO COMUNICADO — nasce RASCUNHO.
 *
 * ⚠️ RASCUNHO NÃO É "SALVO PELA METADE": é um comunicado que existe, já numerado, e que
 * ainda não foi enviado a ninguém. Numerar só no envio faria o número mudar de lugar na
 * fila conforme a ordem em que as pessoas terminassem de escrever — e um memorando já
 * impresso para assinatura mudaria de número antes de sair.
 */
export function FormNovoComunicado({
  tipos,
  setores,
  exercicios,
}: {
  readonly tipos: readonly TipoDoForm[];
  readonly setores: readonly SetorDoForm[];
  readonly exercicios: readonly number[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoComunicado, FormData>(
    rascunharAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (setores.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Você não está lotado em nenhum setor
        </strong>{" "}
        — e um comunicado sai de um setor, não de uma pessoa.
      </div>
    );
  }
  if (tipos.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhum tipo de comunicado cadastrado
        </strong>{" "}
        — memorando, ofício e circular são <em>dados</em>, não valores fixos no código:
        cada entidade cria os seus. Cadastre ao menos um.
      </div>
    );
  }

  return (
    <form ref={ref} data-acao="novo-comunicado" action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <CampoSelect
          name="exercicio"
          rotulo="Exercício"
          required
          largura={1}
          opcoes={exercicios.map((a) => ({ valor: String(a), rotulo: String(a) }))}
          ajuda="A numeração é por ano, tipo e setor."
        />
        <CampoSelect
          name="tipoId"
          rotulo="Tipo"
          required
          largura={1}
          vazio="Escolha"
          opcoes={tipos.map((t) => ({ valor: t.id, rotulo: t.rotulo }))}
        />
        <CampoSelect
          name="setorRemetenteId"
          rotulo="Setor remetente"
          required
          largura={2}
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
          ajuda="Só os setores em que você está lotado."
        />
        <CampoTexto name="assunto" rotulo="Assunto" required largura={4} />
        <CampoTextarea name="corpo" rotulo="Corpo" required largura={4} linhas={6} />
      </div>
      <ResultadoComunicado estado={estado} />
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Criando…" : "Criar rascunho"}
      </button>
    </form>
  );
}
