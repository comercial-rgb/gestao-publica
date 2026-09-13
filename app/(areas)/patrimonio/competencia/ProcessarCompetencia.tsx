"use client";

import { useActionState } from "react";
import { CLASSE_BOTAO_PRIMARIO as BOTAO } from "../../../../components/ui/Formulario";
import { useChaveDeComando } from "../../../../components/ui/useChaveDeComando";
import { processarCompetenciaAction, type EstadoDaCompetencia } from "./actions";

/**
 * O botão que LANÇA a competência — só aparece quando a prévia está PRONTA e o servidor
 * autoriza. Leva a chave de comando: reenviar o mesmo formulário não lança duas vezes.
 */
export function ProcessarCompetencia({
  classeDeBensId,
  competencia,
  resumo,
}: {
  readonly classeDeBensId: string;
  readonly competencia: string;
  readonly resumo: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaCompetencia, FormData>(processarCompetenciaAction, {});
  const chave = useChaveDeComando(estado.sucesso);
  return (
    <form action={action} data-acao="processar-competencia" className="space-y-2">
      <input type="hidden" name="classeDeBensId" value={classeDeBensId} />
      <input type="hidden" name="competencia" value={competencia} />
      <input type="hidden" name="__chave" value={chave} />
      <p className="text-sm">{resumo}</p>
      <button type="submit" className={BOTAO} disabled={pendente || estado.sucesso !== undefined}>
        {pendente ? "Processando…" : "Processar competência"}
      </button>
      {estado.erro !== undefined ? (
        <p role="alert" className="whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p data-resultado="processada" className="text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
    </form>
  );
}
