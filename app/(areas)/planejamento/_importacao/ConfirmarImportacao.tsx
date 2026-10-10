"use client";

import { useActionState } from "react";
import { CLASSE_BOTAO_PRIMARIO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { confirmarImportacaoAction, type EstadoDaImportacao } from "./actions";

/** V39-R2 — confirma a prévia apresentada (a versão dela vai junto; se o que seria copiado mudou, o servidor recusa). */
export function ConfirmarImportacao(props: {
  readonly peca: "LDO" | "PPA";
  readonly origemId: string;
  readonly destinoId: string;
  readonly blocos: readonly string[];
  readonly anos: string;
  readonly versaoDaPrevia: string;
  readonly podeConfirmar: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaImportacao, FormData>(confirmarImportacaoAction, {});
  const texto = estado.erro ?? estado.sucesso;
  return (
    <form action={action} className="mt-3" data-acao="confirmar-importacao">
      <ChaveDeComando />
      <input name="peca" type="hidden" value={props.peca} />
      <input name="origemId" type="hidden" value={props.origemId} />
      <input name="destinoId" type="hidden" value={props.destinoId} />
      {props.blocos.map((b) => <input key={b} name="bloco" type="hidden" value={b} />)}
      <input name="anos" type="hidden" value={props.anos} />
      <input name="versaoDaPrevia" type="hidden" value={props.versaoDaPrevia} />
      {props.podeConfirmar ? (
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Importando..." : "Confirmar a importação desta prévia"}
        </button>
      ) : null}
      {texto !== undefined ? (
        <p
          className={
            estado.erro !== undefined
              ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
              : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
          }
          data-resultado-da-acao="confirmar-importacao"
          role={estado.erro !== undefined ? "alert" : "status"}
        >
          {texto}
        </p>
      ) : null}
    </form>
  );
}
