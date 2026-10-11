"use client";

import { useActionState, useId, useRef } from "react";
import { CampoValor } from "../../../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../../components/ui/ChaveDeComando";
import { RetencaoCalculada, type OpcoesDaRetencaoParaTela } from "../../../pagamentos/FormPagamento";
import { guardarPreviaAction, type EstadoDaPreviaGuardada } from "./actions";

/**
 * V39-R3 (R3-014) — os dados fiscais da operação, preenchidos na liquidação. Os campos são os mesmos do pagamento
 * (o mesmo componente), para o pagamento poder reaproveitá-los; "Calcular" só mostra, "Guardar" grava a versão.
 */
export function FormPrevia({
  liquidacaoId,
  credor,
  saldoAPagar,
  hoje,
  opcoes,
}: {
  readonly liquidacaoId: string;
  readonly credor: string;
  readonly saldoAPagar: string;
  readonly hoje: string;
  readonly opcoes: OpcoesDaRetencaoParaTela;
}): React.ReactElement {
  const uid = useId();
  const ref = useRef<HTMLFormElement | null>(null);
  const [estado, action, pendente] = useActionState<EstadoDaPreviaGuardada, FormData>(guardarPreviaAction, {});
  const texto = estado.erro ?? estado.sucesso;
  return (
    <form ref={ref} action={action} className="grid gap-3" data-acao="guardar-previa-de-retencao">
      <ChaveDeComando />
      <input name="liquidacaoId" type="hidden" value={liquidacaoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-v`}>Valor previsto do pagamento (R$)</label>
          <CampoValor id={`${uid}-v`} name="valor" defaultValue={saldoAPagar} className={CAMPO} required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-d`}>Data prevista do pagamento</label>
          <input id={`${uid}-d`} name="data" type="date" defaultValue={hoje} className={CAMPO} required />
        </div>
      </div>
      <RetencaoCalculada opcoes={opcoes} formulario={ref} documento={credor} liquidacaoId={liquidacaoId} retorno={`/despesa/liquidacoes/${liquidacaoId}/retencoes`} />
      <div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Guardando..." : "Guardar a prévia na liquidação"}
        </button>
        {texto === undefined ? null : (
          <p
            className={estado.erro !== undefined ? "mt-1 text-xs text-[color:var(--color-status-erro-fg)]" : "mt-1 text-xs text-[color:var(--color-status-ok-fg)]"}
            data-resultado-da-acao="guardar-previa-de-retencao"
            role={estado.erro !== undefined ? "alert" : "status"}
          >
            {texto}
          </p>
        )}
      </div>
    </form>
  );
}
