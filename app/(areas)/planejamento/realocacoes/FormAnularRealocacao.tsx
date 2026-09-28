"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { anularRealocacaoAction, type EstadoDaRealocacao } from "./actions";

/**
 * DESFAZER um ato de realocação.
 *
 * ⚠️ UM FORMULÁRIO NÃO PODE DESAPARECER COM O PRÓPRIO SUCESSO (a lição da virada dos controles). Ele
 * fica FORA da tabela e fica MONTADO enquanto houver qualquer ato no exercício; quando não sobra ato
 * vigente, ele diz isso em vez de sumir — e a confirmação da anulação que acabou de acontecer
 * continua na tela.
 */
export function FormAnularRealocacao({
  atos,
}: {
  readonly atos: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaRealocacao, FormData>(anularRealocacaoAction, {});

  return (
    <details className={PAINEL} data-forma="anular-realocacao">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">Desfazer um ato de realocação</summary>
      <form action={action} className="mt-4 space-y-3" data-acao="anular-realocacao">
        <ChaveDeComando />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          <strong className="text-[color:var(--color-ink)]">O que desfazer faz.</strong> Devolve a dotação a quem
          cedeu e tira de quem recebeu, com um lançamento que inverte o original — o ato continua registrado,
          com a anulação ao lado. Não se desfaz se a ficha que recebeu já empenhou o que ganhou.
        </div>
        <label className="block">
          <span className={ROTULO}>Ato a desfazer</span>
          <select className={CAMPO} defaultValue="" disabled={atos.length === 0} name="atoId" required>
            <option disabled value="">
              {atos.length === 0 ? "Nenhum ato vigente para desfazer" : "Escolha o ato"}
            </option>
            {atos.map((a) => (
              <option key={a.id} value={a.id}>{a.rotulo}</option>
            ))}
          </select>
        </label>
        {atos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-sem-ato-vigente>
            Todos os atos deste exercício já foram desfeitos, ou nenhum foi registrado.
          </p>
        ) : null}
        <label className="block">
          <span className={ROTULO}>Data da anulação</span>
          <input className={CAMPO} name="data" type="date" required />
        </label>
        <label className="block">
          <span className={ROTULO}>Motivo</span>
          <textarea className={AREA} minLength={10} name="motivo" required />
        </label>

        {estado.erro !== undefined ? (
          <p role="alert" data-resultado-da-acao="anular-realocacao" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p role="status" data-resultado-da-acao="anular-realocacao" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
            {estado.sucesso}
          </p>
        ) : null}

        <button
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-4 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente || atos.length === 0}
          type="submit"
        >
          {pendente ? "Desfazendo…" : "Confirmar a anulação"}
        </button>
      </form>
    </details>
  );
}
