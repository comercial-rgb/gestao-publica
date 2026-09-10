"use client";

import { useActionState } from "react";
import { CampoSelect, CampoTexto, CampoTextarea } from "../../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO } from "../../../../../components/ui/Formulario";
import {
  apensarAction,
  arquivarAction,
  atenderReadequacaoAction,
  complementarAction,
  desapensarAction,
  encerrarAction,
  reabrirAction,
  receberAction,
  responderParecerAction,
  salvarCamposAction,
  solicitarParecerAction,
  solicitarReadequacaoAction,
  tornarSemEfeitoAction,
  tramitarAction,
  type EstadoDoProcesso,
} from "../actions";
import { Resultado } from "../FormProcesso";

/**
 * OS MOVIMENTOS DO PROCESSO, na própria tela de visualização (5.42.52).
 *
 * ⚠️ CADA AÇÃO É UM `<form>` PRÓPRIO, com o seu estado. Um formulário único com um
 * seletor de "o que fazer" pareceria mais enxuto e teria um defeito concreto: o erro de
 * uma ação apareceria embaixo do campo de outra, e o usuário leria "o texto é
 * obrigatório" sem saber de qual texto se fala.
 *
 * ⚠️ E NENHUM BOTÃO É DESABILITADO POR REGRA DE NEGÓCIO. Os botões que a situação não
 * permite simplesmente não são renderizados — mas o servidor recusa igual se alguém
 * postar por fora. A tela não é a fechadura.
 */

export interface OpcaoDeSetor {
  readonly id: string;
  readonly rotulo: string;
}

export interface PendenciaDoProcesso {
  readonly id: string;
  readonly rotulo: string;
  readonly texto: string;
}

export interface MovimentoAnulavel {
  readonly id: string;
  readonly rotulo: string;
}

export interface ProcessoRelacionado {
  readonly id: string;
  readonly rotulo: string;
}

export interface CampoDoProcesso {
  readonly codigo: string;
  readonly rotulo: string;
  readonly tipo: string;
  readonly obrigatorio: boolean;
  readonly valor: string;
  readonly ativo: boolean;
  readonly opcoes: readonly string[];
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

export function FormReceber({ processoId }: { readonly processoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    receberAction,
    {}
  );
  return (
    <Painel
      titulo="Receber"
      descricao="O prazo da etapa começa no RECEBIMENTO, não no trâmite: um processo enviado na sexta e recebido na segunda não consumiu o fim de semana de quem o recebeu."
    >
      <form action={action} data-acao="receber">
        <input type="hidden" name="processoId" value={processoId} />
        <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
          {pendente ? "Recebendo…" : "Receber processo"}
        </button>
        <Resultado estado={estado} />
      </form>
    </Painel>
  );
}

export function FormTramitar({
  processoId,
  setores,
}: {
  readonly processoId: string;
  readonly setores: readonly OpcaoDeSetor[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    tramitarAction,
    {}
  );
  return (
    <Painel titulo="Tramitar" descricao="Os apensos vigentes vão junto, na mesma transação.">
      <form data-acao="tramitar" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        <CampoSelect
          name="setorDestinoId"
          rotulo="Setor de destino"
          required
          largura={2}
          vazio="Escolha o setor"
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
        />
        <CampoTexto
          name="usuarioDestino"
          rotulo="Aos cuidados de (opcional)"
          largura={2}
          placeholder="identificador do servidor"
          ajuda="Notifica a pessoa em vez do setor inteiro."
        />
        <CampoTextarea
          name="texto"
          rotulo="Despacho"
          required
          largura={4}
          linhas={3}
        />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Tramitando…" : "Tramitar"}
          </button>
          <Resultado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

export function FormComplementar({
  processoId,
}: {
  readonly processoId: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    complementarAction,
    {}
  );
  return (
    <Painel titulo="Complementar" descricao="Acrescenta texto sem mudar de setor.">
      <form data-acao="complementar" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        <CampoTextarea name="texto" rotulo="Complemento" required largura={4} linhas={3} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Registrando…" : "Complementar"}
          </button>
          <Resultado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

export function FormParecer({
  processoId,
  setores,
  pendencias,
}: {
  readonly processoId: string;
  readonly setores: readonly OpcaoDeSetor[];
  readonly pendencias: readonly PendenciaDoProcesso[];
}): React.ReactElement {
  const [pedir, acaoPedir, pendentePedir] = useActionState<EstadoDoProcesso, FormData>(
    solicitarParecerAction,
    {}
  );
  const [responder, acaoResponder, pendenteResponder] = useActionState<
    EstadoDoProcesso,
    FormData
  >(responderParecerAction, {});

  return (
    <Painel
      titulo="Parecer"
      descricao="Pedir parecer NÃO move o processo de setor. E a resposta aponta para o pedido: dois pedidos e uma resposta não fecham os dois."
    >
      <form data-acao="solicitar-parecer" action={acaoPedir} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        <CampoSelect
          name="setorDestinoId"
          rotulo="Pedir parecer a"
          required
          largura={2}
          vazio="Escolha o setor"
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
        />
        <CampoTextarea name="texto" rotulo="O que se pergunta" required largura={4} linhas={3} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendentePedir}>
            {pendentePedir ? "Solicitando…" : "Solicitar parecer"}
          </button>
          <Resultado estado={pedir} />
        </div>
      </form>

      {pendencias.length > 0 ? (
        <form
          data-acao="responder-parecer"
          action={acaoResponder}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
        >
          <input type="hidden" name="processoId" value={processoId} />
          <CampoSelect
            name="solicitacaoId"
            rotulo="Responder ao pedido"
            required
            largura={4}
            opcoes={pendencias.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
          />
          <CampoTextarea name="texto" rotulo="Parecer" required largura={4} linhas={3} />
          <div className="md:col-span-4">
            <button
              type="submit"
              className={CLASSE_BOTAO_PRIMARIO}
              disabled={pendenteResponder}
            >
              {pendenteResponder ? "Respondendo…" : "Responder parecer"}
            </button>
            <Resultado estado={responder} />
          </div>
        </form>
      ) : null}
    </Painel>
  );
}

export function FormReadequacao({
  processoId,
  pendencias,
}: {
  readonly processoId: string;
  readonly pendencias: readonly PendenciaDoProcesso[];
}): React.ReactElement {
  const [pedir, acaoPedir, pendentePedir] = useActionState<EstadoDoProcesso, FormData>(
    solicitarReadequacaoAction,
    {}
  );
  const [atender, acaoAtender, pendenteAtender] = useActionState<EstadoDoProcesso, FormData>(
    atenderReadequacaoAction,
    {}
  );

  return (
    <Painel
      titulo="Readequação do requerente"
      descricao="É o único movimento que o REQUERENTE produz. Ele também pode atendê-lo por fora, pela consulta pública, com o código verificador."
    >
      <form data-acao="solicitar-readequacao" action={acaoPedir} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        <CampoTextarea
          name="texto"
          rotulo="O que falta"
          required
          largura={4}
          linhas={3}
          placeholder="Descreva o que o requerente precisa complementar."
        />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendentePedir}>
            {pendentePedir ? "Solicitando…" : "Solicitar readequação"}
          </button>
          <Resultado estado={pedir} />
        </div>
      </form>

      {pendencias.length > 0 ? (
        <form
          data-acao="atender-readequacao"
          action={acaoAtender}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
        >
          <input type="hidden" name="processoId" value={processoId} />
          <CampoSelect
            name="solicitacaoId"
            rotulo="Atender ao pedido"
            required
            largura={4}
            opcoes={pendencias.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
          />
          <CampoTextarea name="texto" rotulo="Resposta do requerente" required largura={4} linhas={3} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteAtender}>
              {pendenteAtender ? "Registrando…" : "Registrar atendimento"}
            </button>
            <Resultado estado={atender} />
          </div>
        </form>
      ) : null}
    </Painel>
  );
}

export function FormDesfecho({
  processoId,
  situacao,
}: {
  readonly processoId: string;
  readonly situacao: string;
}): React.ReactElement {
  const [encerrar, acaoEncerrar, pendenteEncerrar] = useActionState<EstadoDoProcesso, FormData>(
    encerrarAction,
    {}
  );
  const [arquivar, acaoArquivar, pendenteArquivar] = useActionState<EstadoDoProcesso, FormData>(
    arquivarAction,
    {}
  );
  const [reabrir, acaoReabrir, pendenteReabrir] = useActionState<EstadoDoProcesso, FormData>(
    reabrirAction,
    {}
  );

  const fechado = ["ENCERRADO", "ARQUIVADO", "CANCELADO"].includes(situacao);

  return (
    <Painel
      titulo="Desfecho"
      descricao="Encerrar decide o MÉRITO (está resolvido). Arquivar decide a GUARDA (sai da mesa). São dois atos porque a data em que o pedido do cidadão foi respondido é o número que a ouvidoria mede."
    >
      {!fechado ? (
        <form data-acao="encerrar" action={acaoEncerrar} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input type="hidden" name="processoId" value={processoId} />
          <CampoTextarea name="texto" rotulo="Parecer de encerramento" required largura={4} linhas={3} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteEncerrar}>
              {pendenteEncerrar ? "Encerrando…" : "Encerrar"}
            </button>
            <Resultado estado={encerrar} />
          </div>
        </form>
      ) : null}

      {situacao === "ENCERRADO" ? (
        <form
          data-acao="arquivar"
          action={acaoArquivar}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
        >
          <input type="hidden" name="processoId" value={processoId} />
          <CampoTextarea name="texto" rotulo="Despacho de arquivamento" required largura={4} linhas={2} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteArquivar}>
              {pendenteArquivar ? "Arquivando…" : "Arquivar"}
            </button>
            <Resultado estado={arquivar} />
          </div>
        </form>
      ) : null}

      {fechado ? (
        <form
          data-acao="reabrir"
          action={acaoReabrir}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
        >
          <input type="hidden" name="processoId" value={processoId} />
          <CampoTextarea name="texto" rotulo="Motivo da reabertura" required largura={4} linhas={2} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteReabrir}>
              {pendenteReabrir ? "Reabrindo…" : "Reabrir"}
            </button>
            <Resultado estado={reabrir} />
          </div>
        </form>
      ) : null}
    </Painel>
  );
}

export function FormApensamento({
  processoId,
  candidatos,
  apensos,
}: {
  readonly processoId: string;
  readonly candidatos: readonly ProcessoRelacionado[];
  readonly apensos: readonly ProcessoRelacionado[];
}): React.ReactElement {
  const [apensar, acaoApensar, pendenteApensar] = useActionState<EstadoDoProcesso, FormData>(
    apensarAction,
    {}
  );
  const [desapensar, acaoDesapensar, pendenteDesapensar] = useActionState<
    EstadoDoProcesso,
    FormData
  >(desapensarAction, {});

  return (
    <Painel
      titulo="Apensamento"
      descricao="Enquanto apensado, o processo ACOMPANHA a movimentação do principal — de verdade, na mesma transação. Não é um rótulo na tela."
    >
      {candidatos.length > 0 ? (
        <form data-acao="apensar" action={acaoApensar} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input type="hidden" name="processoId" value={processoId} />
          <CampoSelect
            name="processoApensoId"
            rotulo="Apensar a este processo"
            required
            largura={2}
            vazio="Escolha o processo"
            opcoes={candidatos.map((c) => ({ valor: c.id, rotulo: c.rotulo }))}
          />
          <CampoTextarea name="motivo" rotulo="Motivo" required largura={4} linhas={2} />
          <div className="md:col-span-4">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteApensar}>
              {pendenteApensar ? "Apensando…" : "Apensar"}
            </button>
            <Resultado estado={apensar} />
          </div>
        </form>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Nenhum outro processo aberto no seu alcance para apensar.
        </p>
      )}

      {apensos.length > 0 ? (
        <form
          data-acao="desapensar"
          action={acaoDesapensar}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-4"
        >
          <input type="hidden" name="processoId" value={processoId} />
          <CampoSelect
            name="processoApensoId"
            rotulo="Desapensar"
            required
            largura={2}
            opcoes={apensos.map((a) => ({ valor: a.id, rotulo: a.rotulo }))}
          />
          <CampoTextarea name="motivo" rotulo="Motivo" required largura={4} linhas={2} />
          <div className="md:col-span-4">
            <button
              type="submit"
              className={CLASSE_BOTAO_PRIMARIO}
              disabled={pendenteDesapensar}
            >
              {pendenteDesapensar ? "Desapensando…" : "Desapensar"}
            </button>
            <Resultado estado={desapensar} />
          </div>
        </form>
      ) : null}
    </Painel>
  );
}

export function FormTornarSemEfeito({
  processoId,
  anulavel,
}: {
  readonly processoId: string;
  readonly anulavel: MovimentoAnulavel | null;
}): React.ReactElement | null {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    tornarSemEfeitoAction,
    {}
  );
  if (anulavel === null) return null;

  return (
    <Painel
      titulo="Tornar sem efeito"
      descricao="Isto NÃO apaga. O movimento continua no histórico, marcado, com quem o desfez e por quê — e deixa de contar para a situação e para o prazo. Só o último trâmite ou complemento."
    >
      <form data-acao="tornar-sem-efeito" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        <input type="hidden" name="movimentoId" value={anulavel.id} />
        <p className="text-xs text-[color:var(--color-ink-2)] md:col-span-4">
          Último movimento: <strong>{anulavel.rotulo}</strong>
        </p>
        <CampoTextarea name="motivo" rotulo="Motivo" required largura={4} linhas={2} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Registrando…" : "Tornar sem efeito"}
          </button>
          <Resultado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

/**
 * OS CAMPOS ADICIONAIS definidos pela entidade (5.29.7).
 *
 * ⚠️ CADA TIPO RENDERIZA O SEU CONTROLE. Um `<input type="text">` para tudo devolveria
 * ao servidor a string que ele teria de adivinhar — e a validação por tipo, que é o que
 * distingue isto de um campo de observação, aconteceria tarde demais para ajudar quem
 * digitou.
 */
export function FormCamposAdicionais({
  processoId,
  campos,
}: {
  readonly processoId: string;
  readonly campos: readonly CampoDoProcesso[];
}): React.ReactElement | null {
  const [estado, action, pendente] = useActionState<EstadoDoProcesso, FormData>(
    salvarCamposAction,
    {}
  );
  if (campos.length === 0) return null;

  const editaveis = campos.filter((c) => c.ativo);

  return (
    <Painel
      titulo="Campos adicionais"
      descricao="Definidos pela entidade, por cadastro e por unidade gestora. Cada alteração é uma versão — o valor anterior fica no histórico."
    >
      <form data-acao="campos-adicionais" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="processoId" value={processoId} />
        {editaveis.map((c) => {
          const nome = `campo:${c.codigo}`;
          if (c.tipo === "LISTA" || c.tipo === "LISTA_DINAMICA") {
            return (
              <CampoSelect
                key={c.codigo}
                name={nome}
                rotulo={c.rotulo}
                largura={2}
                vazio="(não informado)"
                defaultValue={c.valor}
                required={c.obrigatorio}
                opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: o }))}
              />
            );
          }
          if (c.tipo === "BOOLEANO") {
            return (
              <CampoSelect
                key={c.codigo}
                name={nome}
                rotulo={c.rotulo}
                largura={2}
                vazio="(não informado)"
                defaultValue={c.valor === "Sim" ? "sim" : c.valor === "Não" ? "nao" : ""}
                required={c.obrigatorio}
                opcoes={[
                  { valor: "sim", rotulo: "Sim" },
                  { valor: "nao", rotulo: "Não" },
                ]}
              />
            );
          }
          return (
            <CampoTexto
              key={c.codigo}
              name={nome}
              rotulo={c.rotulo}
              largura={2}
              defaultValue={c.valor}
              required={c.obrigatorio}
              placeholder={
                c.tipo === "DATA"
                  ? "dd/mm/aaaa"
                  : c.tipo === "HORA"
                    ? "HH:MM"
                    : c.tipo === "VALOR"
                      ? "1.234,56"
                      : undefined
              }
              ajuda={c.obrigatorio ? "Obrigatório." : undefined}
            />
          );
        })}

        {campos.some((c) => !c.ativo) ? (
          <div className="md:col-span-4">
            <p className="text-xs text-[color:var(--color-ink-2)]">
              Campos que a entidade parou de usar, e que este processo respondeu:
            </p>
            <ul className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              {campos
                .filter((c) => !c.ativo)
                .map((c) => (
                  <li key={c.codigo}>
                    <strong>{c.rotulo}:</strong> {c.valor}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar campos"}
          </button>
          <Resultado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}
