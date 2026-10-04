"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO } from "../../../../components/ui/Formulario";
import { carregarTabelaAction, type EstadoDaCarga } from "./actions";

export function FormCarga({ vazio }: { readonly vazio: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaCarga, FormData>(carregarTabelaAction, {});
  return (
    <form action={action} data-acao="carregar-tabela-de-fontes" className="space-y-2" aria-label="Carregar a tabela oficial de fontes de recurso">
      <ChaveDeComando />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Carregando…" : vazio ? "Carregar a tabela oficial" : "Conferir e completar com a tabela oficial"}
      </button>
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="carregar-tabela-de-fontes" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="carregar-tabela-de-fontes" className="whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
