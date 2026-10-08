"use client";

import { useActionState, useRef, useState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarPesquisaAction, type EstadoDaPesquisa } from "./actions";

/**
 * FORM DE PESQUISA DE PREÇOS — ilha client (TR 5.17.46/5.17.48): itens com quantidade e até duas cotações por item, no MESMO ato; média, mínimo e máximo são derivados na leitura.
 * ⚠️ LINHAS `itens.N.*`: a ilha oferece uma linha a mais; a vazia é ignorada no servidor. Quem valida
 * (material obrigatório, quantidade > 0, item repetido, saldo) é o domínio, e a recusa sobe como veio.
 */
export function FormPesquisaDePrecos(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPesquisa, FormData>(criarPesquisaAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState<number>(1);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} data-acao="criar-pesquisa" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Nova pesquisa de preços</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número</span>
          <input name="numero" required placeholder="PP-2026-001" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Objeto (mínimo 5 caracteres)</span>
          <input name="objeto" required minLength={5} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
            <CampoReferenciado
              name={`itens.${i}.materialId`}
              rotulo="Material"
              catalogo="materiais-para-compra"
              placeholder="Código, CATMAT ou descrição"
              largura={3}
            />
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quantidade</span>
              <input name={`itens.${i}.quantidade`} inputMode="decimal" placeholder="10" className={CAMPO} />
            </label>
            {[0, 1].map((j) => (
              <div key={j} data-cotacao={j} className="contents">
                <CampoReferenciado
                  name={`itens.${i}.cotacoes.${j}.fornecedorId`}
                  rotulo={`Cotação ${String(j + 1)} — fornecedor (opcional)`}
                  catalogo="pessoas-para-cotacao"
                  placeholder="CPF, CNPJ ou nome"
                  largura={2}
                />
                <label className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={ROTULO}>Valor unitário</span>
                  <input name={`itens.${i}.cotacoes.${j}.valorUnitario`} inputMode="decimal" placeholder="12,50" className={CAMPO} />
                </label>
                <label className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={ROTULO}>Origem</span>
                  <input name={`itens.${i}.cotacoes.${j}.origem`} placeholder="proposta por e-mail" className={CAMPO} />
                </label>
              </div>
            ))}
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
        {pendente ? "Gravando…" : "Registrar pesquisa"}
      </button>
    </form>
  );
}
