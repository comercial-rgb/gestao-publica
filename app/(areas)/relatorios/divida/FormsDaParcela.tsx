"use client";

import { useActionState, useId, useRef, useState } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { corrigirParcelaAction, informarParcelasAction, type EstadoDaParcela } from "./actions";

/**
 * V36 — OS DOIS ATOS DO CRONOGRAMA DA DÍVIDA: colar as parcelas e corrigir uma. Ficam sempre montados no mesmo
 * lugar (a mensagem não some quando o comparativo passa de vazio a preenchido).
 */
function useResultado(estado: EstadoDaParcela): { texto: string | undefined; seq: number } {
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }
  return { texto, seq };
}

function Resultado({ estado, nome, texto, seq }: { readonly estado: EstadoDaParcela; readonly nome: string; readonly texto: string | undefined; readonly seq: number }): React.ReactElement | null {
  if (texto === undefined) return null;
  return (
    <p
      className={
        estado.erro !== undefined
          ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
          : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
      }
      data-resultado-da-acao={nome}
      data-resultado-seq={seq}
      role={estado.erro !== undefined ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

export function FormInformarParcelas({ dividaId }: { readonly dividaId: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaParcela, FormData>(informarParcelasAction, {});
  const { texto, seq } = useResultado(estado);
  return (
    <section aria-labelledby={`${uid}-t`} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <h3 className="text-sm font-semibold" id={`${uid}-t`}>Informar parcelas do contrato</h3>
      <form action={action} className="mt-2 space-y-2" data-acao="informar-parcelas-da-divida">
        <ChaveDeComando />
        <input name="dividaId" type="hidden" value={dividaId} />
        <label className={ROTULO} htmlFor={`${uid}-c`}>
          Uma parcela por linha: número; vencimento (dd/mm/aaaa); principal; encargos (opcional). Pode colar da planilha.
        </label>
        <textarea className={`${CAMPO} h-28 font-mono`} id={`${uid}-c`} name="cronograma" placeholder={"1;28/02/2026;10.000,00;512,30\n2;31/03/2026;10.000,00;498,10"} required />
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : "Informar parcelas"}
        </button>
      </form>
      <Resultado estado={estado} nome="informar-parcelas-da-divida" seq={seq} texto={texto} />
    </section>
  );
}

export function FormCorrigirParcela({
  parcelas,
}: {
  readonly parcelas: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaParcela, FormData>(corrigirParcelaAction, {});
  const { texto, seq } = useResultado(estado);
  const id = (n: string): string => `${uid}-${n}`;
  return (
    <section aria-labelledby={id("t")} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <h3 className="text-sm font-semibold" id={id("t")}>Corrigir uma parcela</h3>
      {parcelas.length === 0 ? (
        <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Nenhuma parcela informada ainda.</p>
      ) : (
        <form action={action} className="mt-2 space-y-2" data-acao="corrigir-parcela-da-divida">
          <ChaveDeComando />
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className={ROTULO} htmlFor={id("p")}>Parcela</label>
              <select className={CAMPO} defaultValue="" id={id("p")} name="parcelaId" required>
                <option value="">Escolha…</option>
                {parcelas.map((p) => (
                  <option key={p.id} value={p.id}>{p.rotulo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("v")}>Vencimento (dd/mm/aaaa)</label>
              <input className={CAMPO} id={id("v")} name="vencimento" required />
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("pr")}>Principal</label>
              <input className={CAMPO} id={id("pr")} inputMode="decimal" name="principal" placeholder="0,00" required />
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("e")}>Encargos (opcional)</label>
              <input className={CAMPO} id={id("e")} inputMode="decimal" name="encargos" placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("m")}>Motivo da correção</label>
            <input className={CAMPO} id={id("m")} name="motivo" required />
          </div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Gravando…" : "Corrigir parcela"}
          </button>
        </form>
      )}
      <Resultado estado={estado} nome="corrigir-parcela-da-divida" seq={seq} texto={texto} />
    </section>
  );
}
