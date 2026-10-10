"use client";

import { useActionState } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import type { RetencaoAntigaNaTela } from "../../../../lib/portas/retencoes-proprias";
import { regularizarAction, type EstadoDoAto } from "./actions";

/**
 * V26 — UMA RETENÇÃO ANTIGA de IR/ISS do próprio município, que ficou na consignação, e o ato que a regulariza como
 * receita. Uma linha, um formulário: o motivo é obrigatório, e o reconhecimento só aparece quando existe um da mesma
 * natureza com saldo (a receita já reconhecida não se reconhece de novo).
 */
export function LinhaDoLegado({ r }: { readonly r: RetencaoAntigaNaTela }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(regularizarAction, {});
  return (
    <tr className="border-b border-[color:var(--color-border)] align-top" data-retencao-antiga={r.ingressoId}>
      <td className="py-1.5 pr-4">
        <strong>{r.tipo}</strong>
        <span className="block text-xs text-[color:var(--color-ink-3)]">pagamento {r.pagamento}, {r.data}</span>
      </td>
      <td className="py-1.5 pr-4 text-xs">
        retido {r.valor}
        <span className="block font-semibold">a regularizar {r.aRegularizar}</span>
        <span className="block text-[color:var(--color-ink-3)]">natureza {r.natureza}</span>
      </td>
      <td className="py-1.5">
        {r.bloqueio !== null ? (
          <p role="status" data-bloqueio-da-regularizacao className="text-xs text-[color:var(--color-status-erro-fg)]">{r.bloqueio}</p>
        ) : estado.sucesso !== undefined ? (
          <p role="status" data-resultado-da-acao="regularizar-retencao-antiga" className="text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
        ) : (
          <form action={action} data-acao="regularizar-retencao-antiga" className="grid gap-2 sm:grid-cols-3" aria-label={`Regularizar a retenção de ${r.tipo} do pagamento ${r.pagamento}`}>
            <ChaveDeComando />
            <input type="hidden" name="ingressoId" value={r.ingressoId} />
            <label className="text-xs sm:col-span-2">
              <span className={ROTULO}>Motivo</span>
              <input name="motivo" required minLength={10} maxLength={500} placeholder="Imposto do município retido como consignação antes da decisão" className={CAMPO} />
            </label>
            {r.reconhecimentos.length > 0 ? (
              <label className="text-xs">
                <span className={ROTULO}>Receita já reconhecida</span>
                <select name="reconhecimentoId" defaultValue="" className={CAMPO}>
                  <option value="">Não: reconhecer agora</option>
                  {r.reconhecimentos.map((x) => (
                    <option key={x.id} value={x.id}>{x.rotulo}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex items-center gap-3 sm:col-span-3">
              <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
                {pendente ? "Gravando…" : "Regularizar como receita"}
              </button>
              {estado.erro !== undefined ? <span role="alert" className="text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</span> : null}
            </div>
          </form>
        )}
      </td>
    </tr>
  );
}
