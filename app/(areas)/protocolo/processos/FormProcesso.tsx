"use client";

import { useActionState, useRef, useState } from "react";
import {
  CampoSelect,
  CampoTexto,
  CampoTextarea,
} from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_PAINEL_FORMULARIO,
} from "../../../../components/ui/Formulario";
import { abrirProcessoAction, type EstadoDoProcesso } from "./actions";

/**
 * ⚠️ TIPOS DECLARADOS AQUI, não importados de `lib/portas`. O grep trivalente da
 * fronteira é TEXTUAL e barra qualquer import de porta numa ilha client — e está certo
 * em ser cego: a porta puxa o Prisma, que não bundla para o browser.
 */
export interface AssuntoDoForm {
  readonly id: string;
  readonly rotulo: string;
  readonly permiteAnonimo: boolean;
  readonly sigiloPadrao: boolean;
  readonly exigeTermo: boolean;
  readonly termo: string | null;
  readonly orientacao: string | null;
  readonly subassuntos: readonly { readonly id: string; readonly rotulo: string }[];
}

export interface OpcaoDoForm {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * ABERTURA DE PROCESSO.
 *
 * ═══ ⚠️ A TELA ACOMPANHA O ASSUNTO, E NÃO INVENTA REGRA ═══
 * Escolher o assunto muda o que o formulário mostra: o termo de aceite aparece quando o
 * assunto o exige, o requerente anônimo só é oferecido quando ele permite, e o aviso de
 * sigilo aparece quando o assunto o impõe.
 *
 * Nada disso é a regra: a regra está no caso de uso, que recusa igual se a requisição
 * vier por fora. Isto aqui é para o servidor não precisar recusar — e é a diferença
 * entre um formulário gentil e um formulário que mente.
 */
export function FormAbrirProcesso({
  assuntos,
  setores,
  pessoas,
  exercicios,
}: {
  readonly assuntos: readonly AssuntoDoForm[];
  readonly setores: readonly OpcaoDoForm[];
  readonly pessoas: readonly OpcaoDoForm[];
  readonly exercicios: readonly number[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    abrirProcessoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [assuntoId, setAssuntoId] = useState<string>("");
  const [anonimo, setAnonimo] = useState(false);

  const assunto = assuntos.find((a) => a.id === assuntoId);

  if (setores.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Você não está lotado em nenhum setor
        </strong>{" "}
        — e é do setor que um processo nasce. Peça a lotação a quem administra os
        cadastros; sem ela o servidor recusaria a abertura de qualquer forma.
      </div>
    );
  }

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <CampoSelect
          name="exercicio"
          rotulo="Exercício"
          required
          largura={1}
          opcoes={exercicios.map((a) => ({ valor: String(a), rotulo: String(a) }))}
          ajuda="A numeração do protocolo reinicia a cada exercício."
        />
        <CampoSelect
          name="setorAberturaId"
          rotulo="Setor de abertura"
          required
          largura={1}
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
          ajuda="Só os setores em que você está lotado."
        />
        <CampoSelect
          name="assuntoId"
          rotulo="Assunto"
          required
          largura={2}
          vazio="Escolha o assunto"
          opcoes={assuntos.map((a) => ({ valor: a.id, rotulo: a.rotulo }))}
          aoMudar={(v) => {
            setAssuntoId(v);
            setAnonimo(false);
          }}
        />

        {assunto !== undefined && assunto.subassuntos.length > 0 ? (
          <CampoSelect
            name="subassuntoId"
            rotulo="Subassunto"
            largura={2}
            vazio="Sem subassunto"
            opcoes={assunto.subassuntos.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
          />
        ) : null}

        <CampoSelect
          name="finalidade"
          rotulo="Finalidade"
          required
          largura={1}
          opcoes={[
            { valor: "ATENDIMENTO_AO_PUBLICO", rotulo: "Atendimento ao público" },
            { valor: "INTERNO", rotulo: "Interno da entidade" },
          ]}
        />
        <CampoSelect
          name="prioridade"
          rotulo="Prioridade"
          required
          largura={1}
          opcoes={[
            { valor: "NORMAL", rotulo: "Normal" },
            { valor: "ALTA", rotulo: "Alta" },
            { valor: "URGENTE", rotulo: "Urgente" },
          ]}
        />

        {assunto?.permiteAnonimo === true ? (
          <label className="flex items-center gap-2 self-end pb-2 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
            <input
              type="checkbox"
              checked={anonimo}
              onChange={(e) => setAnonimo(e.target.checked)}
            />
            Requerente anônimo (este assunto permite)
          </label>
        ) : null}

        {anonimo ? (
          <CampoTexto
            name="contatoAnonimo"
            rotulo="Contato do requerente anônimo"
            required
            largura={2}
            placeholder="(83) 99999-0000 ou e-mail"
            ajuda="É o único canal para responder — sem ele, o pedido não tem a quem voltar."
          />
        ) : (
          <CampoSelect
            name="requerenteId"
            rotulo="Requerente"
            required
            largura={2}
            vazio="Escolha no cadastro único"
            opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
            ajuda="Do cadastro compartilhado — o mesmo que a despesa e as consignações usam."
          />
        )}

        <CampoTextarea
          name="textoAbertura"
          rotulo="Texto da abertura"
          required
          largura={4}
          linhas={4}
          placeholder="Descreva o que está sendo requerido."
          ajuda="Sem limite de caracteres."
        />

        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
          <input type="checkbox" name="documentacaoFisica" />
          Há documentação física além da digital
        </label>

        {assunto?.sigiloPadrao === true ? (
          <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
            <strong className="text-[color:var(--color-ink)]">
              Este assunto é sigiloso por definição da entidade.
            </strong>{" "}
            O processo nascerá sigiloso — visível apenas a quem estiver envolvido nele.
            Não há como abrir sem sigilo por aqui.
          </p>
        ) : (
          <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
            <input type="checkbox" name="sigiloso" />
            Processo sigiloso (visível apenas aos envolvidos)
          </label>
        )}

        {assunto?.orientacao != null ? (
          <p className="text-xs text-[color:var(--color-ink-2)] md:col-span-4">
            {assunto.orientacao}
          </p>
        ) : null}

        {assunto?.exigeTermo === true ? (
          <label className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)] md:col-span-4">
            <span className="font-medium text-[color:var(--color-ink)]">
              Termo de aceite
            </span>
            <span>{assunto.termo}</span>
            <span className="flex items-center gap-2">
              <input type="checkbox" name="aceitouTermo" />
              Li e concordo com o termo acima
            </span>
          </label>
        ) : null}
      </div>

      <Resultado estado={estado} aoLimpar={() => ref.current?.reset()} />

      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Abrindo…" : "Abrir processo"}
      </button>
    </form>
  );
}

/**
 * O RESULTADO DA AÇÃO — erro ou sucesso, sempre com a mensagem do domínio inteira.
 *
 * ⚠️ A MENSAGEM NÃO É RESUMIDA. Ela foi escrita para quem lê: diz o que aconteceu, por
 * que, e o que fazer. Encurtá-la aqui devolveria o "operação inválida" que este
 * repositório passou o ENT01 inteiro tirando das telas.
 */
export function Resultado({
  estado,
  aoLimpar,
}: {
  readonly estado: EstadoDoProcesso;
  readonly aoLimpar?: (() => void) | undefined;
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
    if (aoLimpar !== undefined) aoLimpar();
    return (
      <p className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}
