"use client";

import { useActionState, useId, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  registrarMovimentoAction,
  type EstadoMovimento,
} from "./actions";

/**
 * A conta como ESTE form a consome.
 *
 * ⚠️ DECLARADA AQUI, e não importada de `lib/portas/tesouraria`. Seria `import type` —
 * some na compilação —, mas o grep da fronteira UI↔domínio é TEXTUAL e barra qualquer
 * `from ".../lib/portas/"` numa ilha client. Ele está certo em ser cego: a diferença
 * entre `import type` e `import` é uma palavra que alguém apaga sem perceber, e aí o
 * Prisma vai para o browser.
 */
export interface ContaParaMovimento {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly saldo: string;
  readonly fontes: readonly {
    readonly id: string;
    readonly codigo: string;
    readonly descricao: string;
  }[];
}

export interface ContaContabilParaMovimento {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

/**
 * FORM DE MOVIMENTAÇÃO BANCÁRIA (TR 5.62) — ilha client, Server Action autenticada.
 *
 * ⚠️ A FONTE DEPENDE DA CONTA ESCOLHIDA, e é por isso que este form tem estado.
 *
 * Desde o ADR de 2026-09-10 a conta admite VÁRIAS fontes, e cada conta tem o seu rol.
 * Mostrar todas as fontes do ente num select fixo faria o operador escolher uma que a
 * conta não comporta e receber a recusa só depois de enviar — e a recusa correta, vinda
 * do domínio, pareceria um defeito da tela.
 *
 * ⚠️ E O SELECT NÃO É O GUARD. Quem recusa fonte fora do rol é `exigirFonteNoRolDaConta`,
 * dentro da transação. Este filtro é conveniência; conveniência não protege.
 */
export function FormMovimentacao({
  contas,
  contasContabeis,
}: {
  readonly contas: readonly ContaParaMovimento[];
  readonly contasContabeis: readonly ContaContabilParaMovimento[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoMovimento, FormData>(
    registrarMovimentoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [contaId, setContaId] = useState("");
  // ⚠️ `useId` — esta página tem mais de um formulário, e id repetido quebra o
  // `label for` e o leitor de tela. Ver `test/ui/formularios-na-mesma-pagina.test.tsx`.
  const idFontes = `fontes-da-conta-${useId()}`;

  if (estado.sucesso !== undefined) ref.current?.reset();

  if (contas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhuma conta bancária cadastrada
        </strong>{" "}
        — não há onde movimentar. A movimentação sai de uma conta do ente, e ela precisa
        ter conta contábil e rol de fontes parametrizados.
      </div>
    );
  }

  const escolhida = contas.find((c) => c.id === contaId);

  return (
    <form
      ref={ref}
      action={action}
      data-acao="registrar-movimento-bancario"
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar movimentação bancária
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Conta bancária</span>
          <select
            name="conta"
            required
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            aria-describedby={idFontes}
            className={CAMPO}
          >
            <option value="" disabled>
              Escolha a conta…
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.descricao} · saldo {c.saldo}
              </option>
            ))}
          </select>
          <span id={idFontes} className="mt-1 block text-[11px]">
            {escolhida === undefined
              ? "As fontes disponíveis dependem da conta."
              : `Fontes desta conta: ${escolhida.fontes.map((f) => f.codigo).join(", ")}`}
          </span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fonte de recurso</span>
          {/*
            ⚠️ SEM DEFAULT, e por decisão. Conta multifonte não significa movimento sem
            fonte — significa o oposto: a fonte precisa ser DECLARADA, porque não dá mais
            para inferi-la da conta. Um default carimbaria recurso vinculado como livre.
          */}
          <select name="fonte" required defaultValue="" disabled={escolhida === undefined} className={CAMPO}>
            <option value="" disabled>
              {escolhida === undefined ? "Escolha a conta primeiro…" : "Escolha a fonte…"}
            </option>
            {(escolhida?.fontes ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.descricao}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="DEPOSITO">Depósito</option>
            <option value="SAQUE">Saque</option>
            <option value="APLICACAO">Aplicação financeira</option>
            <option value="RESGATE">Resgate de aplicação</option>
            <option value="RENDIMENTO">Rendimento creditado</option>
            <option value="TARIFA">Tarifa bancária</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="1.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do movimento</span>
          <input name="dia" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Contrapartida (conta contábil)</span>
          {/*
            ⚠️ INFORMADA, e não adivinhada. A contrapartida de uma tarifa é despesa
            financeira; a de um rendimento é receita financeira; a de uma aplicação é a
            conta de aplicações. Escolher por conta do operador acertaria às vezes e
            erraria em silêncio no resto — e é o operador que sabe qual conta é qual.
          */}
          <select name="contrapartida" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha a conta de contrapartida…
            </option>
            {contasContabeis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="aplicação em fundo de curto prazo — conta movimento"
            className={CAMPO}
          />
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
        {pendente ? "Registrando…" : "Registrar movimento"}
      </button>
    </form>
  );
}
