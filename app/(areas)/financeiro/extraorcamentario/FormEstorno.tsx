"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { estornarRecolhimentoAction, type EstadoDoEstornoExtra } from "./actions";

/**
 * ESTORNAR UM RECOLHIMENTO — uma ilha por linha, em divulgação progressiva.
 *
 * ⚠️ UM FORMULÁRIO POR LINHA, e não um select com todos os recolhimentos: o operador estorna O
 * QUE ESTÁ VENDO. Um seletor separado da lista é onde nasce o estorno da guia errada — e estorno da
 * guia errada não se desfaz apagando, só com outro ato.
 *
 * ⚠️ E O `<details>` FECHADO É DELIBERADO: o estorno é excepcional. Um botão sempre aberto em cada
 * linha de uma tabela de recolhimentos convida ao clique acidental.
 */
export function FormEstornoDoRecolhimento({
  movimentoId,
  rotulo,
}: {
  readonly movimentoId: string;
  readonly rotulo: string;
}): React.ReactElement {
  return (
    <FormEstornoDoMovimento
      movimentoId={movimentoId}
      acao="estornar-recolhimento"
      explicacao={`Estornar ${rotulo}. O recolhimento original continua na lista, e o valor volta a constar como a recolher.`}
    />
  );
}

/**
 * V36 — O ESTORNO DE QUALQUER MOVIMENTO EXTRA LISTADO (o recolhimento e, agora, o ingresso avulso). A regra é
 * do domínio (`estornarMovimentoExtra`: um estorno não se estorna, nem duas vezes; a retenção não se estorna
 * sozinha); aqui só muda o texto que diz ao operador o efeito.
 */
export function FormEstornoDoMovimento({
  movimentoId,
  acao,
  explicacao,
}: {
  readonly movimentoId: string;
  readonly acao: "estornar-recolhimento" | "estornar-ingresso";
  readonly explicacao: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoEstornoExtra, FormData>(
    estornarRecolhimentoAction,
    {}
  );

  return (
    <details data-estorno={movimentoId}>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)] hover:underline">
        Estornar
      </summary>
      <form action={action} className="mt-2 space-y-2" data-acao={acao}>
        <ChaveDeComando />
        <input name="movimentoId" type="hidden" value={movimentoId} />
        <p className="text-xs text-[color:var(--color-ink-2)]">{explicacao}</p>
        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do estorno</span>
          <input className={CAMPO} name="data" required type="date" />
        </label>
        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Motivo</span>
          <input
            className={CAMPO}
            minLength={10}
            name="motivo"
            placeholder="repasse devolvido pelo banco"
            required
          />
        </label>
        {estado.erro !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-2 py-1 text-xs text-[color:var(--color-status-erro-fg)]"
            data-resultado-da-acao={acao}
            role="alert"
          >
            {estado.erro}
          </p>
        ) : null}
        {estado.sucesso !== undefined ? (
          <p
            className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-xs text-[color:var(--color-status-ok-fg)]"
            data-resultado-da-acao={acao}
          >
            {estado.sucesso}
          </p>
        ) : null}
        <button
          className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-xs font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Estornando…" : "Confirmar estorno"}
        </button>
      </form>
    </details>
  );
}
