"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_PAINEL_FORMULARIO } from "../../../../../components/ui/Formulario";
import { cadastrarPeloAvisoAction, type EstadoPessoa } from "../actions";

/**
 * A PESSOA JÁ ESTÁ NO CADASTRO, SEM O PAPEL (V37): só se concede o papel — cadastrar de novo seria
 * recusado por documento duplicado. A mesma ação do atalho; sem dados cadastrais, ela não cria nada.
 */
export function FormConcederPeloAviso({
  documento,
  nome,
  rotuloDoPapel,
  children,
}: {
  readonly documento: string;
  readonly nome: string;
  readonly rotuloDoPapel: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPessoa, FormData>(cadastrarPeloAvisoAction, {});
  return (
    <form action={action} data-acao="conceder-papel-pelo-aviso" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="documento" value={documento} />
      <p className="text-sm text-[color:var(--color-ink)]">
        <strong>{nome}</strong> já está no cadastro de pessoas, mas não tem o papel de {rotuloDoPapel.toLowerCase()} vigente.
      </p>
      {children}
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : `Conceder e voltar`}
      </button>
    </form>
  );
}
