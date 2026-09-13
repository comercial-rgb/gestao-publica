"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarSolicitacaoAction, type EstadoDaSolicitacao } from "./actions";

/** Uma opção como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * FORM DE SOLICITAÇÃO DE COMPRA — ilha client (TR 5.17.51/5.17.56): o cabeçalho e os itens no MESMO ato.
 * ⚠️ LINHAS `itens.N.*`: a ilha oferece uma linha a mais; a vazia é ignorada no servidor. Quem valida
 * (material obrigatório, quantidade > 0, item repetido, saldo) é o domínio, e a recusa sobe como veio.
 */
export function FormSolicitacao({ setores, materiais }: { readonly setores: readonly OpcaoDaIlha[]; readonly materiais: readonly OpcaoDaIlha[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(criarSolicitacaoAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState<number>(1);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} data-acao="criar-solicitacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Nova solicitação de compra</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número</span>
          <input name="numero" required placeholder="SC-2026-001" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Setor solicitante</span>
          <select name="setorId" required defaultValue="" className={CAMPO}>
            <option value="">— escolha —</option>
            {setores.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Solicitante</span>
          <input name="solicitante" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Justificativa (mínimo 10 caracteres)</span>
          <textarea name="justificativa" required rows={2} className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-3">
              <span className={ROTULO}>Material</span>
              <select name={`itens.${i}.materialId`} defaultValue="" className={CAMPO}>
                <option value="">— escolha —</option>
                {materiais.map((o) => (
                  <option key={o.id} value={o.id}>{o.rotulo}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quantidade</span>
              <input name={`itens.${i}.quantidade`} inputMode="decimal" placeholder="10" className={CAMPO} />
            </label>
          </div>
        ))}
        <button type="button" data-acao="mais-um-item" className="text-xs underline underline-offset-2" onClick={() => setLinhas((n) => n + 1)}>
          Mais um item
        </button>
      </fieldset>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Registrar solicitação"}
      </button>
    </form>
  );
}
