"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { vincularSolicitacaoAction, type EstadoDaOrdem } from "../actions";

export interface ItemDaOrdemParaVincular {
  readonly itemDeOrdemId: string;
  readonly materialId: string;
  readonly rotulo: string;
  readonly disponivel: string;
}
export interface SolicitacaoDaIlha {
  readonly id: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly itens: readonly { readonly itemDeSolicitacaoId: string; readonly materialId: string; readonly rotulo: string; readonly pendente: string }[];
}

/**
 * VINCULAR PARCELAS DE UMA SOLICITAÇÃO A ESTA ORDEM (V6 P1.1) — ilha client. O operador escolhe a
 * solicitação AUTORIZADA (só as com pendente do mesmo material aparecem) e informa, por item, a
 * quantidade que esta ordem atende — cada item da solicitação casa com a linha da ordem do MESMO
 * material. Nada é casado sozinho; quantidade vazia não vincula.
 */
export function FormVincularSolicitacao({
  ordemId,
  itensDaOrdem,
  solicitacoes,
}: {
  readonly ordemId: string;
  readonly itensDaOrdem: readonly ItemDaOrdemParaVincular[];
  readonly solicitacoes: readonly SolicitacaoDaIlha[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(vincularSolicitacaoAction, {});
  const [escolhida, setEscolhida] = useState<string>(solicitacoes[0]?.id ?? "");
  const sol = solicitacoes.find((s) => s.id === escolhida);
  const linhas = (sol?.itens ?? []).flatMap((item) => {
    const daOrdem = itensDaOrdem.find((o) => o.materialId === item.materialId);
    return daOrdem === undefined ? [] : [{ item, daOrdem }];
  });
  return (
    <form action={action} data-acao="vincular-solicitacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="ordemId" value={ordemId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Vincular parcela de solicitação a esta ordem</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">São listadas as solicitações autorizadas com itens pendentes dos materiais desta ordem. A quantidade não pode exceder o pendente da solicitação nem o disponível no item da ordem.</p>
      {solicitacoes.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma solicitação autorizada com pendente dos materiais desta ordem.</p>
      ) : (
        <>
          <label className="block text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Solicitação</span>
            <select name="solicitacaoId" value={escolhida} onChange={(e) => setEscolhida(e.target.value)} className={CAMPO}>
              {solicitacoes.map((s) => (
                <option key={s.id} value={s.id}>{s.rotulo}</option>
              ))}
            </select>
          </label>
          <fieldset data-secao="linhas" className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
            <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Parcelas</legend>
            {linhas.length === 0 ? <p className="text-xs text-[color:var(--color-ink-3)]">Esta solicitação não tem item pendente do material desta ordem.</p> : null}
            {linhas.map(({ item, daOrdem }, i) => (
              <div key={item.itemDeSolicitacaoId} data-linha={i} className="mb-2 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name={`linhas.${i}.itemDeSolicitacaoId`} value={item.itemDeSolicitacaoId} />
                <input type="hidden" name={`linhas.${i}.itemDeOrdemId`} value={daOrdem.itemDeOrdemId} />
                <div className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
                  <div className="text-[color:var(--color-ink)]">{item.rotulo}</div>
                  <div className="text-[color:var(--color-ink-3)]">pendente na solicitação {item.pendente} · disponível no item da ordem {daOrdem.disponivel}</div>
                </div>
                <label className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={ROTULO}>Quantidade desta ordem</span>
                  <input name={`linhas.${i}.quantidade`} inputMode="decimal" placeholder={item.pendente} className={CAMPO} />
                </label>
              </div>
            ))}
          </fieldset>
        </>
      )}
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      {solicitacoes.length > 0 ? (
        <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
          {pendente ? "Gravando…" : "Vincular parcelas"}
        </button>
      ) : null}
    </form>
  );
}
