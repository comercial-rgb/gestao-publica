"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_CAMPO as CAMPO } from "../../../../../components/ui/Formulario";
import { desfazerVinculoAction, type EstadoDaOrdem } from "../actions";

/**
 * DESFAZER UMA PARCELA (V6 P1.1) — um formulário pequeno POR parcela viva, com motivo. O servidor
 * recusa parcela com recebimento atribuído; a recusa sobe como veio.
 */
export function FormDesfazerVinculo({ ordemId, alocacaoId, podeDesfazer }: { readonly ordemId: string; readonly alocacaoId: string; readonly podeDesfazer: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(desfazerVinculoAction, {});
  // ⚠️ A ilha fica MONTADA depois do desfazimento (a parcela vira DESFEITA e os controles somem), para
  // a mensagem do resultado não sumir junto com o botão que a produziu.
  return (
    <form action={action} data-acao="desfazer-vinculo" data-alocacao={alocacaoId} data-pode-desfazer={podeDesfazer ? "sim" : "nao"} className="mt-1 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="ordemId" value={ordemId} />
      <input type="hidden" name="alocacaoId" value={alocacaoId} />
      {podeDesfazer ? (
        <>
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className="mb-0.5 block">Motivo para desfazer</span>
            <input name="motivo" required minLength={5} className={`${CAMPO} h-8 w-64`} />
          </label>
          <button type="submit" disabled={pendente} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-60">
            {pendente ? "Desfazendo…" : "Desfazer parcela"}
          </button>
        </>
      ) : null}
      {estado.erro !== undefined ? <p role="alert" className="basis-full text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" className="basis-full text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </form>
  );
}
