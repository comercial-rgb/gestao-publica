"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { apurarResultadoAction, encerrarExercicioAction, type EstadoDoEncerramento } from "./actions";

/**
 * ENCERRAR O EXERCÍCIO E INSCREVER OS RESTOS A PAGAR.
 *
 * ⚠️ É O ATO MENOS REVERSÍVEL DO SISTEMA, e o formulário é desenhado para isso: fechado por
 * padrão, com a consequência escrita antes do campo, e a confirmação é DIGITAR O ANO. Um botão
 * simples aqui seria um clique acidental que trava a competência inteira — depois do
 * encerramento, empenho, liquidação e pagamento com data naquele exercício passam a ser recusados.
 *
 * ⚠️ E A CONFIRMAÇÃO É CONFERIDA NO SERVIDOR, não só aqui: campo de formulário não confere nada.
 */
export function FormEncerramentoDoExercicio({
  exercicio,
}: {
  readonly exercicio: number;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoEncerramento, FormData>(
    encerrarExercicioAction,
    {}
  );

  return (
    <details className={CLASSE_PAINEL_FORMULARIO} data-encerramento={String(exercicio)}>
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Encerrar o exercício {exercicio} e inscrever os restos a pagar
      </summary>
      <form action={action} className="mt-3 space-y-3" data-acao="encerrar-exercicio">
        <ChaveDeComando />
        <input name="ano" type="hidden" value={exercicio} />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          <strong className="text-[color:var(--color-ink)]">
            Atenção: esta operação não pode ser desfeita pela tela.
          </strong>{" "}
          Inscreve como restos a pagar, em todas as unidades, as despesas{" "}
          <strong>liquidadas e não pagas</strong> (processados) e as{" "}
          <strong>empenhadas e não liquidadas</strong> (não processados), e registra o encerramento
          do exercício. A dotação não é alterada.{" "}
          <strong>
            Após o encerramento, não será possível registrar movimentos com data em {exercicio}.
          </strong>
        </div>
        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Para confirmar, digite o ano do exercício</span>
          <input
            className={`${CAMPO} w-32`}
            inputMode="numeric"
            name="confirmacao"
            placeholder={String(exercicio)}
            required
          />
        </label>

        {estado.erro !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
            data-resultado-da-acao="encerrar-exercicio"
            role="alert"
          >
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
            data-resultado-da-acao="encerrar-exercicio"
          >
            {estado.sucesso}
          </p>
        ) : null}

        <button
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] px-4 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Encerrando…" : `Encerrar ${exercicio} e inscrever os restos`}
        </button>
      </form>
    </details>
  );
}

/**
 * APURAR O RESULTADO DO EXERCÍCIO — o segundo ato da virada.
 *
 * ⚠️ ELE VEM DEPOIS DO ENCERRAMENTO, e o domínio impõe isso: apurar um ano que ainda recebe fato
 * daria um resultado que muda depois de publicado. A tela não esconde a ordem — ela a diz.
 */
export function FormApuracaoDoResultado({
  exercicio,
}: {
  readonly exercicio: number;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoEncerramento, FormData>(
    apurarResultadoAction,
    {}
  );

  return (
    <details className={CLASSE_PAINEL_FORMULARIO} data-apuracao={String(exercicio)}>
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Apurar o resultado do exercício {exercicio}
      </summary>
      <form action={action} className="mt-3 space-y-3" data-acao="apurar-resultado">
        <ChaveDeComando />
        <input name="ano" type="hidden" value={exercicio} />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          Encerra as contas de <strong>variação patrimonial</strong> do exercício e transfere o saldo
          para a conta de resultados acumulados do <strong>patrimônio líquido</strong>, parametrizada
          pelo ente. O resultado pode ser superávit ou déficit.{" "}
          <strong>A apuração só pode ser feita após o encerramento do exercício.</strong>
        </div>
        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Para confirmar, digite o ano do exercício</span>
          <input
            className={`${CAMPO} w-32`}
            inputMode="numeric"
            name="confirmacao"
            placeholder={String(exercicio)}
            required
          />
        </label>

        {estado.erro !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
            data-resultado-da-acao="apurar-resultado"
            role="alert"
          >
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
            data-resultado-da-acao="apurar-resultado"
          >
            {estado.sucesso}
          </p>
        ) : null}

        <button
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-4 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Apurando…" : `Apurar o resultado de ${exercicio}`}
        </button>
      </form>
    </details>
  );
}
