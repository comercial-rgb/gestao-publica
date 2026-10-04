"use client";

import { formatarMoeda } from "../../../packages/contracts/moeda";
import { useActionState, useRef, useState } from "react";
import { anularDespesaAction, type EstadoAnulacao } from "./anular-actions";
import { CampoValor } from "../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../components/ui/ChaveDeComando";
import { desmascararValor } from "../../../lib/format/mascaras";

/**
 * ⚠️ DECLARADO AQUI, não importado de `lib/portas/anulacao`. Seria `import type` (some na
 * compilação), mas o grep trivalente é TEXTUAL e barra qualquer `from ".../lib/portas/"` numa ilha
 * client — e está certo em ser cego. O mesmo padrão do `FichaParaEmpenho` do FormEmpenho.
 */
type TipoAnulavel = "empenho" | "liquidacao" | "pagamento";

/** O valor ("1.234,56" digitado, ou "1234.56" cru) em centavos inteiros, pela MESMA leitura da action — só para a conferência. */
function centavos(v: string): number | null {
  const cru = desmascararValor(v);
  const m = /^(\d+)\.(\d{2})$/.exec(cru);
  return m === null ? null : Number(m[1]) * 100 + Number(m[2]);
}
const reais = (c: number): string => `R$ ${formatarMoeda(`${String(Math.trunc(c / 100))}.${String(c % 100).padStart(2, "0")}`).texto}`;

/**
 * O EFEITO PREVISTO, dito antes da confirmação. É texto: quem conta é o domínio, dentro da transação, e a
 * tela mostra o que ele vai fazer com os números que ela tem agora (o saldo pode ter andado — aí o domínio
 * recusa, e a recusa sobe como veio).
 */
function efeitoPrevisto(tipo: TipoAnulavel, saldo: number, valor: number): string {
  const depois = reais(saldo - valor);
  if (tipo === "empenho") return `O saldo a liquidar do empenho passa de ${reais(saldo)} para ${depois}, e ${reais(valor)} volta ao saldo disponível da dotação.`;
  if (tipo === "liquidacao") return `O saldo a pagar desta liquidação passa de ${reais(saldo)} para ${depois}; ${reais(valor)} volta a ser saldo a liquidar do empenho.`;
  return `O pago desta liquidação passa de ${reais(saldo)} para ${depois}; a obrigação a pagar volta a crescer ${reais(valor)}.`;
}

/**
 * FORM DE ANULAÇÃO (TR 5.35; V33 com conferência) — ilha client, uma por linha, dentro de um `<details>`.
 *
 * ⚠️ DOIS PASSOS. "Conferir" mostra objeto, valor, se é integral ou parcial, o motivo e o efeito previsto; só
 * então "Confirmar anulação" envia. Depois de gravada, a confirmação FICA (o `<details>` não fecha sozinho) com
 * os links para o documento original e para o lançamento da anulação.
 *
 * ⚠️ O valor nasce no SALDO ANULÁVEL e não passa dele (a máscara é apresentação; o guard é do
 * domínio). Se o valor esgota o saldo E o fato é estornável, a action escolhe o estorno TOTAL;
 * senão, a parcial. O `motivo` cobra 10 caracteres — o mínimo que a anulação parcial exige, e que
 * serve também de histórico do estorno total.
 */
export function FormAnular({
  tipo,
  id,
  anulavelSaldo,
  estornavel,
  objeto,
}: {
  readonly tipo: TipoAnulavel;
  readonly id: string;
  /** O saldo ainda anulável (valor cru "1234.56"), teto e default do campo de valor. */
  readonly anulavelSaldo: string;
  /** `true` quando o fato inteiro pode ser estornado (nível de baixo vazio). */
  readonly estornavel: boolean;
  /** V33 — o que se anula, dito na conferência ("Empenho 12/2026 · Fornecedor X"). */
  readonly objeto?: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAnulacao, FormData>(anularDespesaAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [conferencia, setConferencia] = useState<{ readonly valor: number; readonly motivo: string; readonly numero: string; readonly data: string } | null>(null);
  const saldo = centavos(anulavelSaldo) ?? 0;

  function conferir(): void {
    const f = formRef.current;
    if (f === null || !f.reportValidity()) return;
    const d = new FormData(f);
    const valor = centavos(String(d.get("valor") ?? ""));
    if (valor === null || valor <= 0) return;
    setConferencia({ valor, motivo: String(d.get("motivo") ?? ""), numero: String(d.get("numero") ?? ""), data: String(d.get("data") ?? "") });
  }

  const integral = conferencia !== null && estornavel && conferencia.valor === saldo;

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Anular
      </summary>
      <form ref={formRef} action={action} data-acao={`anular-${tipo}`} className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <ChaveDeComando />
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="anulavelSaldo" value={anulavelSaldo} />
        <input type="hidden" name="estornavel" value={estornavel ? "1" : "0"} />

        <fieldset disabled={conferencia !== null} className="space-y-2">
          <label className="block">
            <span className={ROTULO}>Valor a anular (R$)</span>
            <CampoValor name="valor" required defaultValue={anulavelSaldo} className={CAMPO} />
          </label>
          <label className="block">
            <span className={ROTULO}>Nº do documento de anulação</span>
            <input name="numero" required inputMode="numeric" placeholder="0000001" className={CAMPO} />
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só números, até 7 dígitos: é assim que o SAGRES recebe.</span>
          </label>
          <label className="block">
            <span className={ROTULO}>Motivo (de 10 a 120 caracteres, sem aspas)</span>
            {/* V21/V23 — o motivo vai à prestação de contas do Tribunal (SAGRES §4.9, §4.11, §4.13), num campo de 120
                caracteres sem aspas. O servidor recusa o que não cabe; o navegador só antecipa o limite de tamanho. */}
            <input name="motivo" required minLength={10} maxLength={120} placeholder="cancelamento por erro de classificação" className={CAMPO} />
          </label>
          <label className="block">
            <span className={ROTULO}>Data da anulação</span>
            <input name="data" type="date" required className={CAMPO} />
          </label>
        </fieldset>
        {/* Um fieldset desabilitado não envia os campos: na confirmação eles vão por estes ocultos. */}
        {conferencia !== null ? (
          <>
            <input type="hidden" name="valor" value={(conferencia.valor / 100).toFixed(2)} />
            <input type="hidden" name="numero" value={conferencia.numero} />
            <input type="hidden" name="motivo" value={conferencia.motivo} />
            <input type="hidden" name="data" value={conferencia.data} />
            <div data-conferencia-da-anulacao className="space-y-1 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-surface)] p-2">
              <p><strong>O que se anula:</strong> {objeto ?? "este documento"}</p>
              <p><strong>Valor:</strong> {reais(conferencia.valor)} ({integral ? "anulação integral, por estorno" : "anulação parcial"})</p>
              <p><strong>Motivo:</strong> {conferencia.motivo}</p>
              <p data-efeito-previsto><strong>Efeito:</strong> {conferencia.valor > saldo ? "o valor passa do saldo anulável; a anulação será recusada." : efeitoPrevisto(tipo, saldo, conferencia.valor)}</p>
            </div>
          </>
        ) : null}

        {estado.erro !== undefined ? (
          <p role="alert" data-resultado-da-acao={`anular-${tipo}`} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-[color:var(--color-status-erro-fg)]">
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p role="status" data-resultado-da-acao={`anular-${tipo}`} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-[color:var(--color-status-ok-fg)]">
            {estado.sucesso}{" "}
            {estado.originalHref !== undefined ? <a className="underline" href={estado.originalHref}>Abrir o original</a> : null}
            {estado.lancamentoId !== undefined ? (
              <>
                {" · "}
                <a className="underline" href={`/contabilidade/lancamentos/${estado.lancamentoId}`}>Abrir o lançamento da anulação</a>
              </>
            ) : null}
          </p>
        ) : null}

        {conferencia === null ? (
          <button type="button" onClick={conferir} className={CLASSE_BOTAO_PRIMARIO}>
            Conferir
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="submit" disabled={pendente || estado.sucesso !== undefined} className={CLASSE_BOTAO_PRIMARIO}>
              {pendente ? "Anulando…" : "Confirmar anulação"}
            </button>
            <button type="button" disabled={pendente} onClick={() => setConferencia(null)} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3">
              Corrigir
            </button>
          </div>
        )}
      </form>
    </details>
  );
}
