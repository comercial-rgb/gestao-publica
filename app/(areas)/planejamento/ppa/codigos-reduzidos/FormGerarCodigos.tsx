"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_PAINEL_FORMULARIO } from "../../../../../components/ui/Formulario";
import { gerarCodigosAction, type EstadoDosCodigos } from "./actions";

/** V36 — o gerador dos códigos reduzidos das ações do plano que ainda não têm. */
export function FormGerarCodigos({ planoId, acoesParaGerar, acoesSemClassificacao }: { readonly planoId: string; readonly acoesParaGerar: number; readonly acoesSemClassificacao: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDosCodigos, FormData>(gerarCodigosAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Gerar códigos reduzidos" data-acao="gerar-codigos-reduzidos">
      <ChaveDeComando />
      <input type="hidden" name="planoId" value={planoId} />
      <h2 className="mb-1 text-sm font-semibold">Gerar os códigos que faltam</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A ação cadastrada no PPA já nasce com o seu código. Este botão atribui código às ações cadastradas antes, na ordem da classificação; os números já
        dados não mudam. {acoesParaGerar > 0 ? `${String(acoesParaGerar)} ação(ões) classificada(s) sem código.` : "Todas as ações classificadas têm código."}
        {acoesSemClassificacao > 0 ? ` ${String(acoesSemClassificacao)} ação(ões) sem unidade, função ou subfunção: complete a classificação no programa do PPA para que recebam código.` : ""}
      </p>
      {estado.erro !== undefined ? <p role="alert" data-resultado-da-acao="gerar-codigos-reduzidos" className="mb-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="gerar-codigos-reduzidos" className="mb-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gerando..." : "Gerar os códigos que faltam"}</button>
    </form>
  );
}
