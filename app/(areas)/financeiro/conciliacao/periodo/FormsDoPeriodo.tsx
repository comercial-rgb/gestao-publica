"use client";

import { useActionState, useId, useRef } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import {
  abrirPeriodoAction,
  atribuirContaAction,
  encerrarPeriodoAction,
  justificarAction,
  pendenciaManualAction,
  type EstadoConciliacao,
} from "./actions";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";

export interface ContaParaPeriodo {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}

/**
 * OS FORMULÁRIOS DA CONCILIAÇÃO POR PERÍODO — ilhas client, Server Actions autenticadas.
 *
 * ⚠️ SÃO QUATRO NA MESMA PÁGINA, e cada um tem `data-acao` próprio e ids únicos por
 * `useId()`. Id repetido quebra o `label for` e o leitor de tela, e faz o usuário por
 * teclado cair no formulário errado — é o que `test/ui/formularios-na-mesma-pagina.test.tsx`
 * prende desde o ENT02.
 */

function Mensagens({ estado }: { readonly estado: EstadoConciliacao }): React.ReactElement {
  return (
    <>
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
    </>
  );
}

export function FormAbrirPeriodo({
  contas,
}: {
  readonly contas: readonly ContaParaPeriodo[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoConciliacao, FormData>(
    abrirPeriodoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form
      ref={ref}
      action={action}
      data-acao="abrir-conciliacao"
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Abrir período de conciliação
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária</span>
          <select name="conta" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.descricao}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Início</span>
          <input name="inicio" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fim</span>
          <input name="fim" type="date" required className={CAMPO} />
        </label>
      </div>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Abrindo…" : "Abrir período"}
      </button>
    </form>
  );
}

/**
 * ⚠️ O ENCERRAMENTO É UM BOTÃO COM HANDLER DE VERDADE, e não um link.
 *
 * `GET` não produz transição de estado — encerrar por link deixaria o pré-carregador do
 * navegador fechar o mês de alguém. É `POST` por Server Action, e a recusa do domínio
 * (amarração que não fecha, período já encerrado) volta na tela como veio.
 */
export function FormEncerrar({
  conciliacaoId,
  rotulo,
}: {
  readonly conciliacaoId: string;
  readonly rotulo: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoConciliacao, FormData>(
    encerrarPeriodoAction,
    {}
  );
  return (
    <form action={action} data-acao="encerrar-conciliacao" className="mt-4">
      <ChaveDeComando />
      <input type="hidden" name="conciliacaoId" value={conciliacaoId} />
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Encerrando…" : `Encerrar a conciliação de ${rotulo}`}
      </button>
      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        Após o encerramento, a conciliação não pode ser reaberta. Correções posteriores são
        tratadas no período seguinte, com referência a este.
      </p>
    </form>
  );
}

export function FormPendenciaManual({
  conciliacaoId,
}: {
  readonly conciliacaoId: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoConciliacao, FormData>(
    pendenciaManualAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const idAviso = `pendencia-manual-${useId()}`;
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form
      ref={ref}
      action={action}
      data-acao="registrar-pendencia-manual"
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <ChaveDeComando />
      <input type="hidden" name="conciliacaoId" value={conciliacaoId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Incluir pendência
      </h2>
      <p id={idAviso} className="mb-3 text-[11px] text-[color:var(--color-ink-2)]">
        A pendência registra o motivo da diferença e{" "}
        <strong>não gera lançamento contábil</strong>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Descrição</span>
          <input
            name="descricao"
            required
            placeholder="cheque 4412 não compensado"
            aria-describedby={idAviso}
            className={CAMPO}
          />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="1.200,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Natureza</span>
          <select name="natureza" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="CREDITO">Crédito (entrou no banco)</option>
            <option value="DEBITO">Débito (saiu do banco)</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Motivo</span>
          <input
            name="motivo"
            required
            minLength={10}
            placeholder="emitido em 28/06; o banco só compensa em julho"
            className={CAMPO}
          />
        </label>
      </div>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Incluir pendência"}
      </button>
    </form>
  );
}

export function FormJustificar({
  conciliacaoId,
  lado,
  referencia,
  descricao,
  motivoAtual,
}: {
  readonly conciliacaoId: string;
  readonly lado: string;
  readonly referencia: string;
  readonly descricao: string;
  readonly motivoAtual: string | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoConciliacao, FormData>(
    justificarAction,
    {}
  );
  const idCampo = `justificativa-${useId()}`;

  return (
    <form action={action} data-acao="justificar-pendencia" className="mt-2">
      <ChaveDeComando />
      <input type="hidden" name="conciliacaoId" value={conciliacaoId} />
      <input type="hidden" name="lado" value={lado} />
      <input type="hidden" name="referencia" value={referencia} />
      <label htmlFor={idCampo} className="sr-only">
        Motivo da pendência {descricao}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={idCampo}
          name="motivo"
          required
          minLength={10}
          defaultValue={motivoAtual ?? ""}
          placeholder="motivo para manter a pendência no encerramento"
          className={`${CAMPO} max-w-md`}
        />
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Salvando…" : "Justificar"}
        </button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}

/**
 * V6 P1.2 — ATRIBUIR A CONTA a uma guia do legado (sem conta bancária). Um formulário por guia; a
 * conta vem pré-selecionada com a conta da conciliação aberta, e o motivo é obrigatório. O servidor
 * recusa quando o razão da guia não debitou a conta contábil da conta escolhida.
 */
export function FormAtribuirConta({
  receitaArrecadadaId,
  contaPadraoId,
  contas,
}: {
  readonly receitaArrecadadaId: string;
  readonly contaPadraoId: string;
  readonly contas: readonly ContaParaPeriodo[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoConciliacao, FormData>(atribuirContaAction, {});
  return (
    <form action={action} data-acao="atribuir-conta" data-guia={receitaArrecadadaId} className="mt-1 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="receitaArrecadadaId" value={receitaArrecadadaId} />
      <label className="text-xs text-[color:var(--color-ink-2)]">
        <span className="mb-0.5 block">Conta que recebeu</span>
        <select name="contaBancariaId" defaultValue={contaPadraoId} className={`${CAMPO} h-8`}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-[color:var(--color-ink-2)]">
        <span className="mb-0.5 block">Motivo</span>
        <input name="motivo" required minLength={5} placeholder="guia importada antes da conta obrigatória" className={`${CAMPO} h-8 w-72`} />
      </label>
      <button type="submit" disabled={pendente} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-60">
        {pendente ? "Atribuindo…" : "Atribuir conta"}
      </button>
      <div className="basis-full"><Mensagens estado={estado} /></div>
    </form>
  );
}
