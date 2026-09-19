"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { configuracaoDoAcessoAction, type EstadoDaConfiguracao } from "./actions";

/**
 * O FORMULÁRIO DA CONFIGURAÇÃO DO ACESSO À INFORMAÇÃO (V11 V5.1).
 *
 * ⚠️ NENHUM CAMPO VEM PREENCHIDO COM UM NÚMERO "USUAL". Um formulário que já trouxesse o prazo
 * mais citado economizaria dois cliques e faria o ente publicar, com a sua assinatura, um número
 * que ele não conferiu contra a própria norma. Os campos nascem vazios de propósito.
 *
 * ⚠️ RÓTULO EM TODO CAMPO — campo sem rótulo é caixa muda para leitor de tela.
 */
export function FormConfiguracao(): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaConfiguracao, FormData>(configuracaoDoAcessoAction, {});
  // ⚠️ O ID VEM DO `useId`, NÃO DE UM LITERAL (corrigido em V11 V5.3). Dois formulários na
  // mesma página com `id={`${uid}-vigenciaInicio`}` fazem o rótulo de um apontar para o campo do outro:
  // quem usa leitor de tela é levado ao campo errado, e o clique no rótulo foca o errado.

  return (
    <section data-papel="form-configuracao-do-acesso" className="space-y-4">
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">O que esta publicação decide</h2>
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Publicar cria uma <strong>versão nova</strong>; nenhuma reescreve a anterior. Os pedidos
          já protocolados continuam com o prazo que valia no dia em que entraram — é essa a
          pergunta que o controle interno faz depois, e ela só tem resposta se o histórico ficar.
          Enquanto não houver versão vigente, o pedido do cidadão continua sendo recebido e
          instruído; o que fica impedido é prometer data e prorrogar.
        </p>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}

      <form action={action} className="space-y-4" data-acao="publicar">
        <ChaveDeComando />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ROTULO} htmlFor={`${uid}-vigenciaInicio`}>
            Esta configuração passa a valer em
            <input id={`${uid}-vigenciaInicio`} name="vigenciaInicio" type="date" required className={CAMPO} />
          </label>
        </div>

        <fieldset className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Prazos, em dias corridos</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={ROTULO} htmlFor={`${uid}-prazoDeRespostaEmDias`}>
              Prazo para responder, contado do protocolo
              <input id={`${uid}-prazoDeRespostaEmDias`} name="prazoDeRespostaEmDias" type="number" min={1} max={3650} required className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-prazoDeProrrogacaoEmDias`}>
              Dias que cada prorrogação acrescenta
              <input id={`${uid}-prazoDeProrrogacaoEmDias`} name="prazoDeProrrogacaoEmDias" type="number" min={1} max={3650} required className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-prorrogacoesPermitidas`}>
              Quantas prorrogações a norma admite
              <input id={`${uid}-prorrogacoesPermitidas`} name="prorrogacoesPermitidas" type="number" min={0} max={10} required className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-instanciasDeRecurso`}>
              Instâncias de recurso previstas
              <input id={`${uid}-instanciasDeRecurso`} name="instanciasDeRecurso" type="number" min={0} max={10} required className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-prazoDeRecursoEmDias`}>
              Prazo para recorrer, contado da resposta
              <input id={`${uid}-prazoDeRecursoEmDias`} name="prazoDeRecursoEmDias" type="number" min={1} max={3650} required className={CAMPO} />
            </label>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
            Zero prorrogação e zero instância de recurso são respostas válidas, e ficam registradas
            como decisão declarada — não como configuração pela metade.
          </p>
        </fieldset>

        <fieldset className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">As normas</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={ROTULO} htmlFor={`${uid}-normaFederal`}>
              Norma federal que fixa o prazo, com o artigo
              <input id={`${uid}-normaFederal`} name="normaFederal" type="text" required minLength={5} maxLength={400} className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-normaFederalPublicadaEm`}>
              Data de publicação da norma federal
              <input id={`${uid}-normaFederalPublicadaEm`} name="normaFederalPublicadaEm" type="date" required className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-regulamentacaoLocal`}>
              Regulamentação local, com o artigo (deixe vazio se ainda não houver)
              <input id={`${uid}-regulamentacaoLocal`} name="regulamentacaoLocal" type="text" maxLength={400} className={CAMPO} />
            </label>
            <label className={ROTULO} htmlFor={`${uid}-regulamentacaoLocalPublicadaEm`}>
              Data de publicação da regulamentação local
              <input id={`${uid}-regulamentacaoLocalPublicadaEm`} name="regulamentacaoLocalPublicadaEm" type="date" className={CAMPO} />
            </label>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
            A regulamentação local vem com a data de publicação, ou não vem: uma norma citada sem
            data não é conferível por quem for auditar. Deixá-la vazia é estado legítimo — aparece
            como pendência a resolver, e não impede o pedido de correr pelo prazo federal.
          </p>
        </fieldset>

        <label className={ROTULO} htmlFor={`${uid}-observacao`}>
          Observação (opcional)
          <textarea id={`${uid}-observacao`} name="observacao" rows={3} maxLength={2000} className={CAMPO} />
        </label>

        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Publicando…" : "Publicar esta versão"}
        </button>
      </form>
    </section>
  );
}
