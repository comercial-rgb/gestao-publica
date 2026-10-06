"use client";

import { useActionState } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { duplicarEmpenhoAction, type EstadoDuplicacao } from "../actions";

/**
 * V36 — DUPLICAR O EMPENHO (TR 5.10.1.12). O usuário informa número, data, valor e histórico; ficha, tipo, credor,
 * categoria e vínculos vêm do original no servidor. O saldo da dotação e o lançamento são os da emissão comum.
 */
export function FormDuplicar({
  empenhoId,
  numeroSugerido,
  valorSugerido,
  historicoSugerido,
}: {
  readonly empenhoId: string;
  readonly numeroSugerido?: string | undefined;
  readonly valorSugerido: string;
  readonly historicoSugerido: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDuplicacao, FormData>(duplicarEmpenhoAction, {});
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none font-semibold text-[color:var(--color-primary)] hover:underline">Duplicar este empenho</summary>
      <form action={action} data-acao="duplicar-empenho" className="mt-2 grid gap-2 sm:grid-cols-2">
        <ChaveDeComando />
        <input type="hidden" name="empenhoOrigemId" value={empenhoId} />
        <p className="text-[color:var(--color-ink-3)] sm:col-span-2">
          O novo empenho repete a ficha, o tipo, o credor, a categoria e os vínculos deste. Informe o número, a data, o valor e o histórico.
        </p>
        <label className="block">
          <span className={ROTULO}>Nº do novo empenho</span>
          <input name="numero" required inputMode="numeric" defaultValue={numeroSugerido} className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Data do novo empenho</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required defaultValue={valorSugerido} className={CAMPO} />
        </label>
        <label className="block sm:col-span-2">
          <span className={ROTULO}>Histórico</span>
          <textarea name="historico" required rows={2} defaultValue={historicoSugerido} className={CAMPO} />
        </label>
        {estado.erro !== undefined ? (
          <p role="alert" data-resultado-da-acao="duplicar-empenho" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-[color:var(--color-status-erro-fg)] sm:col-span-2">
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p role="status" data-resultado-da-acao="duplicar-empenho" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-[color:var(--color-status-ok-fg)] sm:col-span-2">
            {estado.sucesso}{" "}
            {estado.novoId !== undefined ? (
              <a className="underline" data-elo="empenho-duplicado" href={`/despesa/empenhos/${estado.novoId}`}>
                Abrir o novo empenho
              </a>
            ) : null}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendente || estado.sucesso !== undefined} className={CLASSE_BOTAO_PRIMARIO}>
            {pendente ? "Emitindo…" : "Emitir o novo empenho"}
          </button>
        </div>
      </form>
    </details>
  );
}
