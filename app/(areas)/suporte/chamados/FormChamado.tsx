"use client";

import { useActionState, useRef } from "react";
import { CampoSelect, CampoTexto, CampoTextarea } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_PAINEL_FORMULARIO,
} from "../../../../components/ui/Formulario";
import {
  abrirChamadoAction,
  avaliarChamadoAction,
  encerrarChamadoAction,
  reabrirChamadoAction,
  responderChamadoAction,
  type EstadoDoChamado,
} from "./actions";

export interface OpcaoDoChamado {
  readonly id: string;
  readonly rotulo: string;
}

export function ResultadoChamado({
  estado,
}: {
  readonly estado: EstadoDoChamado;
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

export function FormAbrirChamado({
  unidades,
  severidades,
}: {
  readonly unidades: readonly OpcaoDoChamado[];
  readonly severidades: readonly OpcaoDoChamado[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoChamado, FormData>(
    abrirChamadoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (severidades.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhum nível de severidade cadastrado
        </strong>{" "}
        — a escala é <em>dado de configuração</em>, não texto fixo no código: é o que cada
        contratante negocia no contrato de suporte. Cadastre a escala antes de abrir
        chamado.
      </div>
    );
  }

  return (
    <form ref={ref} data-acao="abrir-chamado" action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <CampoSelect
          name="unidadeOrcId"
          rotulo="Unidade gestora"
          required
          largura={2}
          opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.rotulo }))}
        />
        <CampoSelect
          name="severidadeId"
          rotulo="Severidade"
          required
          largura={2}
          vazio="Escolha"
          opcoes={severidades.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
        />
        <CampoTexto name="titulo" rotulo="Título" required largura={4} />
        <CampoTextarea
          name="descricao"
          rotulo="Descrição"
          required
          largura={4}
          linhas={5}
          placeholder="O que você tentou fazer, o que aconteceu, e o que esperava que acontecesse."
          ajuda="Mínimo de 20 caracteres — é o que alguém precisa para conseguir ajudar."
        />
        <CampoTexto
          name="rota"
          rotulo="Tela em que ocorreu (opcional)"
          largura={2}
          placeholder="/protocolo/processos"
          ajuda="Liga o chamado à ajuda daquela tela."
        />
      </div>
      <ResultadoChamado estado={estado} />
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Abrindo…" : "Abrir chamado"}
      </button>
    </form>
  );
}

function Painel({
  titulo,
  descricao,
  children,
}: {
  readonly titulo: string;
  readonly descricao?: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <h3 className="text-sm font-medium text-[color:var(--color-ink)]">{titulo}</h3>
      {descricao !== undefined ? (
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{descricao}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FormAtendimento({
  chamadoId,
  encerrado,
}: {
  readonly chamadoId: string;
  readonly encerrado: boolean;
}): React.ReactElement {
  const [responder, acaoResponder, pendenteResponder] = useActionState<EstadoDoChamado, FormData>(
    responderChamadoAction,
    {}
  );
  const [encerrar, acaoEncerrar, pendenteEncerrar] = useActionState<EstadoDoChamado, FormData>(
    encerrarChamadoAction,
    {}
  );
  const [reabrir, acaoReabrir, pendenteReabrir] = useActionState<EstadoDoChamado, FormData>(
    reabrirChamadoAction,
    {}
  );

  return (
    <Painel
      titulo="Atendimento"
      descricao="Responder e encerrar são atos separados: quem abriu é quem sabe se o problema acabou. Encerrar junto com a resposta faria a métrica de resolução medir a velocidade de digitar."
    >
      {!encerrado ? (
        <>
          <form action={acaoResponder} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input type="hidden" name="chamadoId" value={chamadoId} />
            <CampoTextarea name="texto" rotulo="Resposta" required largura={4} linhas={3} />
            <div className="md:col-span-4">
              <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteResponder}>
                {pendenteResponder ? "Respondendo…" : "Responder"}
              </button>
              <ResultadoChamado estado={responder} />
            </div>
          </form>

          <form
            action={acaoEncerrar}
            className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
          >
            <input type="hidden" name="chamadoId" value={chamadoId} />
            <CampoTextarea name="texto" rotulo="Encerramento" required largura={4} linhas={2} />
            <div className="md:col-span-4">
              <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteEncerrar}>
                {pendenteEncerrar ? "Encerrando…" : "Encerrar"}
              </button>
              <ResultadoChamado estado={encerrar} />
            </div>
          </form>
        </>
      ) : (
        <form action={acaoReabrir} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input type="hidden" name="chamadoId" value={chamadoId} />
          <CampoTextarea name="texto" rotulo="Motivo da reabertura" required largura={4} linhas={2} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteReabrir}>
              {pendenteReabrir ? "Reabrindo…" : "Reabrir"}
            </button>
            <ResultadoChamado estado={reabrir} />
          </div>
        </form>
      )}
    </Painel>
  );
}

export function FormAvaliar({ chamadoId }: { readonly chamadoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoChamado, FormData>(
    avaliarChamadoAction,
    {}
  );
  return (
    <Painel
      titulo="Avaliar o atendimento"
      descricao="A avaliação é de quem abriu o chamado, depois do encerramento, e não se altera."
    >
      <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="chamadoId" value={chamadoId} />
        <CampoSelect
          name="nota"
          rotulo="Nota"
          required
          largura={1}
          vazio="Escolha"
          opcoes={[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), rotulo: String(n) }))}
        />
        <CampoTextarea name="comentario" rotulo="Comentário (opcional)" largura={4} linhas={2} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Enviando…" : "Enviar avaliação"}
          </button>
          <ResultadoChamado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}
