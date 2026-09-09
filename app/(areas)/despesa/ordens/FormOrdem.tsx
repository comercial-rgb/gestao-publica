"use client";

import { useActionState, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  autorizarOrdemAction,
  cancelarOrdemAction,
  prepararOrdemAction,
  type EstadoDaOrdem,
} from "./actions";

/**
 * ⚠️ TIPOS DECLARADOS AQUI, não importados de `lib/portas`. O grep trivalente da
 * fronteira é TEXTUAL e barra qualquer `from ".../lib/portas/"` numa ilha client — e está
 * certo em ser cego. Mesmo padrão do `FichaParaEmpenho` e do `TipoAnulavel`.
 */
export interface LiquidacaoParaOrdem {
  readonly id: string;
  readonly numero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly disponivelParaOrdem: string;
}

export interface ContaParaOrdem {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

/**
 * ETAPA 1a — PREPARAR A ORDEM.
 *
 * ⚠️ PREPARAR NÃO AUTORIZA, e a tela diz isso em vez de deixar subentendido. Quem
 * preenche este formulário está pedindo o pagamento; quem consente é outra pessoa, no
 * botão "Autorizar" da lista — e o domínio recusa se for a mesma.
 */
export function FormOrdem({
  liquidacoes,
  contas,
}: {
  readonly liquidacoes: readonly LiquidacaoParaOrdem[];
  readonly contas: readonly ContaParaOrdem[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(
    prepararOrdemAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [conta, setConta] = useState<string>("");
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (liquidacoes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhuma liquidação comporta ordem nova
        </strong>{" "}
        — ou não há despesa liquidada em aberto, ou o que havia já está inteiramente
        comprometido em ordens vivas.
      </div>
    );
  }

  const selecionada = contas.find((c) => c.codigo === conta);

  return (
    <form ref={ref} action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Preparar ordem de pagamento
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Preparar <strong>não autoriza</strong>: a ordem nasce aguardando o consentimento de
        outra pessoa. Nada é lançado no razão nesta etapa — quem lança é o pagamento.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Liquidação</span>
          <select name="liquidacaoId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha a liquidação…
            </option>
            {liquidacoes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.numero} — empenho {l.empenhoNumero} · {l.credorCpfCnpj} · cabe{" "}
                {l.disponivelParaOrdem} · fonte {l.fonteCodigo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da ordem</span>
          <input name="numero" required placeholder="2026OP000001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="1.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data prevista</span>
          <input name="dataPrevista" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária (traz a fonte)</span>
          <select
            name="contaBancaria"
            required
            defaultValue=""
            className={CAMPO}
            onChange={(e) => setConta(e.target.value)}
          >
            <option value="" disabled>
              Escolha a conta…
            </option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} — {c.descricao} · fonte {c.fonteCodigo}
              </option>
            ))}
          </select>
        </label>
        {/* A fonte acompanha a conta: o usuário não a digita (TR 5.23). */}
        <input type="hidden" name="fonteId" value={selecionada?.fonteId ?? ""} />

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="pagamento conforme liquidação"
            className={CAMPO}
          />
        </label>
      </div>

      <Mensagem estado={estado} />

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Preparando…" : "Preparar ordem"}
      </button>
    </form>
  );
}

/** ETAPA 1b — AUTORIZAR. Uma ilha por linha, dentro de um `<details>` compacto. */
export function FormAutorizar({ ordemId }: { readonly ordemId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(
    autorizarOrdemAction,
    {}
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Autorizar
      </summary>
      <form
        action={action}
        className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3"
      >
        <input type="hidden" name="ordemId" value={ordemId} />
        <p className="text-[color:var(--color-ink-2)]">
          Autorizar é <strong>consentir com o pagamento</strong>. Quem preparou a ordem não
          pode autorizá-la — o sistema recusa.
        </p>
        <label className="block">
          <span className={ROTULO}>Observação (opcional)</span>
          <input name="motivo" placeholder="conferido processo 123/2026" className={CAMPO} />
        </label>
        <Mensagem estado={estado} />
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Autorizando…" : "Confirmar autorização"}
        </button>
      </form>
    </details>
  );
}

/** ETAPA 1c — CANCELAR. Motivo obrigatório: o domínio cobra 10 caracteres. */
export function FormCancelar({ ordemId }: { readonly ordemId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(
    cancelarOrdemAction,
    {}
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-ink-2)] hover:underline">
        Cancelar
      </summary>
      <form
        action={action}
        className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3"
      >
        <input type="hidden" name="ordemId" value={ordemId} />
        <label className="block">
          <span className={ROTULO}>Motivo (mín. 10 caracteres)</span>
          <input
            name="motivo"
            required
            minLength={10}
            placeholder="certidão do credor vencida"
            className={CAMPO}
          />
        </label>
        <Mensagem estado={estado} />
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
      </form>
    </details>
  );
}

function Mensagem({ estado }: { readonly estado: EstadoDaOrdem }): React.ReactElement | null {
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
      <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}
