"use client";

import { useActionState, useRef } from "react";
import { anularDespesaAction, type EstadoAnulacao } from "./anular-actions";
import { CampoValor } from "../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../components/ui/Formulario";

/**
 * ⚠️ DECLARADO AQUI, não importado de `lib/portas/anulacao`. Seria `import type` (some na
 * compilação), mas o grep trivalente é TEXTUAL e barra qualquer `from ".../lib/portas/"` numa ilha
 * client — e está certo em ser cego. O mesmo padrão do `FichaParaEmpenho` do FormEmpenho.
 */
type TipoAnulavel = "empenho" | "liquidacao" | "pagamento";

/**
 * FORM DE ANULAÇÃO (TR 5.35) — ilha client, uma por linha, dentro de um `<details>` compacto.
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
}: {
  readonly tipo: TipoAnulavel;
  readonly id: string;
  /** O saldo ainda anulável (valor cru "1234.56"), teto e default do campo de valor. */
  readonly anulavelSaldo: string;
  /** `true` quando o fato inteiro pode ser estornado (nível de baixo vazio). */
  readonly estornavel: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAnulacao, FormData>(anularDespesaAction, {});
  const ref = useRef<HTMLDetailsElement>(null);
  if (estado.sucesso !== undefined && ref.current?.open === true) ref.current.open = false;

  return (
    <details ref={ref} className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Anular
      </summary>
      <form action={action} className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="anulavelSaldo" value={anulavelSaldo} />
        <input type="hidden" name="estornavel" value={estornavel ? "1" : "0"} />

        <label className="block">
          <span className={ROTULO}>Valor a anular (R$)</span>
          <CampoValor name="valor" required defaultValue={anulavelSaldo} className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Nº do documento de anulação</span>
          <input name="numero" required placeholder="2026NA000001" className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Motivo (mín. 10 caracteres)</span>
          <input name="motivo" required minLength={10} placeholder="cancelamento por erro de classificação" className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Data da anulação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        {estado.erro !== undefined ? (
          <p role="alert" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-[color:var(--color-status-erro-fg)]">
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-[color:var(--color-status-ok-fg)]">
            {estado.sucesso}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pendente}
          className={CLASSE_BOTAO_PRIMARIO}
        >
          {pendente ? "Anulando…" : "Confirmar anulação"}
        </button>
      </form>
    </details>
  );
}
