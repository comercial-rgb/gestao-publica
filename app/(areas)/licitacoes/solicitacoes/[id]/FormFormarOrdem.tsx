"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { formarOrdemAction, type EstadoDaSolicitacao } from "../actions";

/** Uma opção como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}
export interface ItemPendenteDaIlha {
  readonly itemDeSolicitacaoId: string;
  readonly materialId: string;
  readonly rotulo: string;
  readonly pendente: string;
}

/**
 * FORMAR ORDEM A PARTIR DA SOLICITAÇÃO (V6 P1.1) — ilha client no detalhe da solicitação AUTORIZADA.
 * Oferece SÓ os itens com pendente > 0, com a quantidade pré-preenchida pelo pendente (o operador
 * reduz para atender em parte). O cabeçalho é o da ordem; a origem nasce na mesma transação.
 * ⚠️ Quem decide excesso, item incompatível e situação é o domínio; a recusa sobe como veio.
 */
export function FormFormarOrdem({
  solicitacaoId,
  itensPendentes,
  fornecedores,
  processos,
  fichas,
}: {
  readonly solicitacaoId: string;
  readonly itensPendentes: readonly ItemPendenteDaIlha[];
  readonly fornecedores: readonly OpcaoDaIlha[];
  readonly processos: readonly OpcaoDaIlha[];
  readonly fichas: readonly OpcaoDaIlha[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(formarOrdemAction, {});
  return (
    <form action={action} data-acao="formar-ordem" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="solicitacaoId" value={solicitacaoId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Emitir ordem de compra a partir desta solicitação</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">Somente itens pendentes são listados. Para atendimento parcial, reduza a quantidade; o saldo permanece pendente para outra ordem.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número da ordem</span>
          <input name="numero" required placeholder="OC-2026-001" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" required defaultValue="ORDINARIA" className={CAMPO}>
            <option value="ORDINARIA">Ordinária</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVA">Estimativa</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fornecedor</span>
          <select name="fornecedorId" required defaultValue="" className={CAMPO}>
            <option value="">— escolha —</option>
            {fornecedores.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Processo licitatório (opcional)</span>
          <select name="processoId" defaultValue="" className={CAMPO}>
            <option value="">— sem processo (dispensa) —</option>
            {processos.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Recurso orçamentário (opcional)</span>
          <select name="fichaId" defaultValue="" className={CAMPO}>
            <option value="">— sem ficha —</option>
            {fichas.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Emissão</span>
          <input name="dataEmissao" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vencimento (opcional)</span>
          <input name="dataVencimento" type="date" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Finalidade (mínimo 5 caracteres)</span>
          <textarea name="finalidade" required rows={2} className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens pendentes da solicitação</legend>
        {itensPendentes.map((item, i) => (
          <div key={item.itemDeSolicitacaoId} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name={`itens.${i}.itemDeSolicitacaoId`} value={item.itemDeSolicitacaoId} />
            <input type="hidden" name={`itens.${i}.materialId`} value={item.materialId} />
            <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
              <input type="checkbox" name={`itens.${i}.incluir`} defaultChecked />
              <span>{item.rotulo} <span className="text-[color:var(--color-ink-3)]">· pendente {item.pendente}</span></span>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quantidade</span>
              <input name={`itens.${i}.quantidade`} inputMode="decimal" defaultValue={item.pendente} className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
              <span className={ROTULO}>Valor unitário (R$)</span>
              <input name={`itens.${i}.valorUnitario`} inputMode="decimal" placeholder="12,50" className={CAMPO} />
            </label>
          </div>
        ))}
      </fieldset>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
          {estado.ordemId !== undefined ? (
            <>
              {" "}
              <Link href={`/licitacoes/ordens-de-compra/${estado.ordemId}`} className="font-medium underline" data-ordem-gerada={estado.ordemId}>Abrir a ordem</Link>
            </>
          ) : null}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Emitir ordem com os itens marcados"}
      </button>
    </form>
  );
}
