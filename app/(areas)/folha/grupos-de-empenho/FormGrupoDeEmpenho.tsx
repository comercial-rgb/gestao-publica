"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarGrupoAction, type EstadoDoGrupo } from "./actions";

/** Uma opção como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}
export interface RubricaDaIlha extends OpcaoDaIlha {
  /** O código do grupo que já a empenha, quando houver — ela aparece marcada como indisponível. */
  readonly jaNoGrupo: string | null;
}

/**
 * FORM DO GRUPO DE EMPENHO — ilha client (M33, V6 P2.3b).
 *
 * ⚠️ ILHA POR DUAS RAZÕES, as duas do limite 2 do molde: as RUBRICAS são várias (uma caixa por
 * rubrica, `rubricas.N.id`), e o campo do CREDOR só existe quando o empenho NÃO é por servidor —
 * oferecer os dois sempre seria um formulário que mente sobre o que vai gravar.
 *
 * ⚠️ A RUBRICA QUE JÁ ESTÁ EM OUTRO GRUPO APARECE DESABILITADA, com o grupo que a tem. Escondê-la
 * faria o operador procurar o que não some da lista dele; oferecê-la faria o servidor recusar
 * depois de preencher tudo.
 */
export function FormGrupoDeEmpenho({ fichas, credores, rubricas }: { readonly fichas: readonly OpcaoDaIlha[]; readonly credores: readonly OpcaoDaIlha[]; readonly rubricas: readonly RubricaDaIlha[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoGrupo, FormData>(criarGrupoAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [porServidor, setPorServidor] = useState<boolean>(true);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form ref={ref} action={action} data-acao="criar-grupo-de-empenho" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Novo grupo de empenho</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O grupo diz QUAIS rubricas de provento viram despesa, em QUAL ficha e para QUEM. Só provento entra: desconto é
        retenção do pagamento, e empenhá-lo somaria à despesa do ente um valor que ele nunca gastou.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Código</span>
          <input name="codigo" required placeholder="FOLHA-VENC" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Descrição (vai no histórico do empenho)</span>
          <input name="descricao" required placeholder="Vencimentos e vantagens fixas" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Série do número (A-Z, 0-9)</span>
          <input name="serie" required placeholder="FP" pattern="[A-Za-z0-9-]{1,10}" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Ficha orçamentária</span>
          <select name="fichaId" required defaultValue="" className={CAMPO}>
            <option value="">— escolha —</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>{f.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo de empenho</span>
          <select name="tipoEmpenho" required defaultValue="ORDINARIO" className={CAMPO}>
            <option value="ORDINARIO">Ordinário</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVO">Estimativo</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Categoria da ordem cronológica (art. 141)</span>
          <select name="categoriaOrdemCronologica" required defaultValue="PRESTACAO_SERVICOS" className={CAMPO}>
            <option value="FORNECIMENTO_BENS">Fornecimento de bens</option>
            <option value="LOCACAO">Locação</option>
            <option value="PRESTACAO_SERVICOS">Prestação de serviços</option>
            <option value="REALIZACAO_OBRAS">Realização de obras</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <input type="checkbox" name="porServidor" value="sim" checked={porServidor} onChange={(e) => setPorServidor(e.target.checked)} className="h-4 w-4" />
          <span>Um empenho por servidor (credor = o CPF de cada um)</span>
        </label>
        {porServidor ? null : (
          <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
            <span className={ROTULO}>Credor do empenho único</span>
            <select name="credorId" required defaultValue="" className={CAMPO}>
              <option value="">— escolha —</option>
              {credores.map((c) => (
                <option key={c.id} value={c.id}>{c.rotulo}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset data-secao="rubricas" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Rubricas de provento deste grupo</legend>
        {rubricas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Não há rubrica de provento cadastrada. Cadastre-as antes.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rubricas.map((r, i) => (
              <label key={r.id} className="flex items-start gap-2 text-xs text-[color:var(--color-ink-2)]">
                <input type="checkbox" name={`rubricas.${i}.id`} value={r.id} disabled={r.jaNoGrupo !== null} className="mt-0.5 h-4 w-4" />
                <span>
                  {r.rotulo}
                  {r.jaNoGrupo !== null ? <em className="block text-[11px] text-[color:var(--color-ink-3)]">já empenhada pelo grupo {r.jaNoGrupo}</em> : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Cadastrar grupo"}
      </button>
    </form>
  );
}
