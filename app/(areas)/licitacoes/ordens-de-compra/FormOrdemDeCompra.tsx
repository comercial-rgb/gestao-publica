"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoValor } from "../../../../components/ui/Campos";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { CADASTRO_DE_CREDOR } from "../../../../lib/atalho-de-cadastro";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { emitirOrdemAction, type EstadoDaOrdem } from "./actions";

/** Uma opção como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * FORM DE ORDEM DE COMPRA — ilha client (TR 5.17.96/5.17.97): cabeçalho (tipo, fornecedor, processo, ficha, datas, finalidade) e itens com unitário, no MESMO ato.
 * ⚠️ LINHAS `itens.N.*`: a ilha oferece uma linha a mais; a vazia é ignorada no servidor. Quem valida
 * (material obrigatório, quantidade > 0, item repetido, saldo) é o domínio, e a recusa sobe como veio.
 */
export function FormOrdemDeCompra({ materiais, processos, fichas, fornecedorPadrao, podeCadastrarFornecedor = false }: { readonly materiais: readonly OpcaoDaIlha[]; readonly processos: readonly OpcaoDaIlha[]; readonly fichas: readonly OpcaoDaIlha[]; /** V37 — o fornecedor que volta do atalho de cadastro (id da pessoa). */ readonly fornecedorPadrao?: string | undefined; readonly podeCadastrarFornecedor?: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(emitirOrdemAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState<number>(1);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} data-acao="criar-ordem" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Nova ordem de compra</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número</span>
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
        <CampoReferenciado
          name="fornecedorId"
          rotulo="Fornecedor"
          catalogo="fornecedores"
          obrigatorio
          placeholder="Digite o CPF, o CNPJ ou o nome"
          largura={2}
          {...(fornecedorPadrao !== undefined && fornecedorPadrao !== "" ? { valorInicial: fornecedorPadrao } : {})}
          {...(podeCadastrarFornecedor ? { cadastro: { href: CADASTRO_DE_CREDOR, rotulo: "Cadastrar este fornecedor" } } : {})}
        />
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Processo licitatório (opcional)</span>
          <select name="processoId" defaultValue="" className={CAMPO}>
            <option value="">— sem processo (dispensa) —</option>
            {processos.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
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
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Desconto (R$, opcional)</span>
          <CampoValor name="desconto" placeholder="0,00" className={CAMPO} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
          <input name="consumoImediato" type="checkbox" value="1" />
          <span>Consumo imediato (não passa pelo estoque)</span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Finalidade (mínimo 5 caracteres)</span>
          <textarea name="finalidade" required minLength={5} rows={2} className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
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
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Valor unitário (R$)</span>
              <input name={`itens.${i}.valorUnitario`} inputMode="decimal" placeholder="12,50" className={CAMPO} />
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
        {pendente ? "Gravando…" : "Emitir ordem"}
      </button>
    </form>
  );
}
