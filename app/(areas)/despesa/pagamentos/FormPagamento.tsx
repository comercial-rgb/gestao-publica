"use client";

import { useActionState, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_AREA_TEXTO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { pagarAction, type EstadoPagamento } from "./actions";

/** Uma liquidação pagável, como a página a passa (já com a posição que o M06 deu). */
export interface LiquidacaoPagavel {
  readonly liquidacaoId: string;
  readonly posicao: number;
  readonly numero: string;
  readonly credorCpfCnpj: string;
  readonly saldoAPagar: string;
  readonly fonteCodigo: string;
  readonly categoria: string;
}

export interface ContaParaPagar {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

const ROTULO_HIPOTESE: Record<string, string> = {
  I_EMERGENCIA_CALAMIDADE: "I — emergência ou calamidade pública",
  II_ME_EPP_RISCO: "II — ME/EPP em risco de descontinuidade",
  III_SISTEMAS_ESTRUTURANTES: "III — sistemas estruturantes de TI",
  IV_FALENCIA_RECUPERACAO: "IV — falência ou recuperação judicial",
  V_ATIVIDADE_FINALISTICA: "V — atividade finalística",
};

/**
 * FORM DE PAGAMENTO — ilha client, Server Action autenticada.
 *
 * ═══ ⚠️ A JUSTIFICATIVA APARECE SOZINHA FORA DA POSIÇÃO 1 — E ISSO É UI, NÃO REGRA ═══
 * Escolher uma liquidação que não é a cabeça da fila abre o bloco do §1º. É conveniência:
 * o usuário vê o que vai precisar antes de digitar o resto. **A regra continua sendo do
 * domínio** — entre este render e o submit, outro pagamento pode andar a fila, e a
 * posição que está na tela já não é a de agora. Por isso o bloco é *mostrado* pela
 * posição, mas *nada aqui impede* enviar sem ele: quem recusa é o art. 141 §2º, dentro
 * da transação, contra a fila real.
 *
 * A fonte NÃO é um campo: ela vem da conta bancária escolhida (TR 5.23 — a fonte do
 * pagamento tem de casar com a do banco). Pedir as duas seria oferecer ao usuário a
 * chance de errar num guard que o sistema já sabe responder.
 */
export function FormPagamento({
  liquidacoes,
  contas,
}: {
  readonly liquidacoes: readonly LiquidacaoPagavel[];
  readonly contas: readonly ContaParaPagar[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPagamento, FormData>(
    pagarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [escolhida, setEscolhida] = useState<string>("");
  const [conta, setConta] = useState<string>("");
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (liquidacoes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma fila aberta</strong> —
        não há liquidação com saldo a pagar.
      </div>
    );
  }
  if (contas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhuma conta bancária cadastrada
        </strong>{" "}
        — o dinheiro tem de sair de algum lugar, e a TR 5.23 amarra a fonte do pagamento
        à da conta. O cadastro de contas bancárias ainda não tem tela.
      </div>
    );
  }

  const alvo = liquidacoes.find((l) => l.liquidacaoId === escolhida);
  const foraDaOrdem = alvo !== undefined && alvo.posicao !== 1;
  const selecionada = contas.find((c) => c.codigo === conta);

  return (
    <form
      ref={ref}
      action={action}
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Pagar
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Liquidação na fila</span>
          <select
            name="liquidacaoId"
            required
            defaultValue=""
            className={CAMPO}
            onChange={(e) => setEscolhida(e.target.value)}
          >
            <option value="" disabled>
              Escolha a liquidação…
            </option>
            {liquidacoes.map((l) => (
              <option key={l.liquidacaoId} value={l.liquidacaoId}>
                {l.posicao === 1 ? "★ " : ""}
                {l.posicao}ª · {l.numero} — {l.credorCpfCnpj} · a pagar {l.saldoAPagar} ·
                fonte {l.fonteCodigo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº do pagamento</span>
          <input name="numero" required placeholder="2026NP000001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>
            Valor (R$){alvo !== undefined ? ` — até ${alvo.saldoAPagar}` : ""}
          </span>
          <CampoValor name="valor" required placeholder="2.500,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do pagamento</span>
          <input name="data" type="date" required className={CAMPO} />
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

      {foraDaOrdem ? (
        <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-status-alerta-fg)]">
            Quebra da ordem cronológica — art. 141, §1º
          </legend>
          <p className="mb-3 text-xs text-[color:var(--color-status-alerta-fg)]">
            Esta liquidação está na <strong>{alvo.posicao}ª posição</strong> da fila
            (fonte {alvo.fonteCodigo}). Pagá-la antes das anteriores exige{" "}
            <strong>justificativa prévia</strong> numa das cinco hipóteses taxativas, e
            ela vira prova se o §2º mandar apurar preterição.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Hipótese (§1º)</span>
              <select name="hipotese" defaultValue="" className={CAMPO}>
                <option value="" disabled>
                  Escolha a hipótese…
                </option>
                {Object.entries(ROTULO_HIPOTESE).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quem autorizou</span>
              <input
                name="autorizadoPor"
                placeholder="Secretário de Finanças"
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
              <span className={ROTULO}>Justificativa (mín. 30 caracteres)</span>
              <textarea
                name="justificativa"
                rows={3}
                placeholder="por que este credor é pago antes dos que estão na frente dele"
                className={CLASSE_AREA_TEXTO}
              />
            </label>
          </div>
        </fieldset>
      ) : null}

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

      <button
        type="submit"
        disabled={pendente}
        className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? "Pagando…" : foraDaOrdem ? "Pagar fora da ordem" : "Pagar"}
      </button>
    </form>
  );
}
