"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { registrarDocumentoFiscalAction, type EstadoDoDocumentoFiscal } from "./actions";

export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * FORM DE DOCUMENTO FISCAL RECEBIDO — ilha client: cabeçalho e itens no mesmo ato.
 * Quem valida totais, emitente e duplicidade é o domínio.
 */
export function FormDocumentoFiscal({
  emitentes,
  ordens,
  contratos,
  empenhos,
}: {
  readonly emitentes: readonly OpcaoDaIlha[];
  readonly ordens: readonly OpcaoDaIlha[];
  readonly contratos: readonly OpcaoDaIlha[];
  readonly empenhos: readonly OpcaoDaIlha[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDocumentoFiscal, FormData>(
    registrarDocumentoFiscalAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState<number>(2);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} data-acao="registrar-documento-fiscal" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Registrar documento fiscal</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Registrar a nota não dá entrada em estoque, não liquida e não paga. A conferência é um
        ato seguinte. Sem chave de acesso o documento ainda pode ser digitado.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Emitente</span>
          <select name="emitenteId" required defaultValue="" className={CAMPO}>
            <option value="">— escolha —</option>
            {emitentes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Modelo</span>
          <select name="modelo" required defaultValue="NFE" className={CAMPO}>
            <option value="NFE">NF-e</option>
            <option value="NFCE">NFC-e</option>
            <option value="NF_AVULSA">Nota avulsa</option>
            <option value="CTE">CT-e</option>
            <option value="RPS">RPS</option>
            <option value="RECIBO">Recibo</option>
            <option value="OUTRO">Outro</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Série</span>
          <input name="serie" required placeholder="1" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número</span>
          <input name="numero" required placeholder="1234" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Emissão</span>
          <input name="dataEmissao" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Recebimento</span>
          <input name="dataRecebimento" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Chave de acesso (quando o modelo a tiver)</span>
          <input name="chaveAcesso" inputMode="numeric" placeholder="44 dígitos" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Ordem de compra (opcional)</span>
          <select name="ordemId" defaultValue="" className={CAMPO}>
            <option value="">— sem ordem —</option>
            {ordens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Contrato (opcional)</span>
          <select name="contratoId" defaultValue="" className={CAMPO}>
            <option value="">— sem contrato —</option>
            {contratos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Empenho (opcional)</span>
          <select name="empenhoId" defaultValue="" className={CAMPO}>
            <option value="">— sem empenho —</option>
            {empenhos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Bruto (R$)</span>
          <CampoValor name="valorBruto" required placeholder="210,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Descontos (R$)</span>
          <CampoValor name="valorDescontos" placeholder="0,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Acréscimos (R$)</span>
          <CampoValor name="valorAcrescimos" placeholder="0,00" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Total (R$)</span>
          <CampoValor name="valorTotal" required placeholder="210,00" className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div
            key={i}
            data-linha={i}
            className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
              <span className={ROTULO}>Descrição</span>
              <input name={`itens.${i}.descricao`} className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Unidade</span>
              <input name={`itens.${i}.unidade`} placeholder="UN" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quantidade</span>
              <input name={`itens.${i}.quantidade`} inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Unitário (R$)</span>
              <CampoValor name={`itens.${i}.valorUnitario`} className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Total da linha (R$)</span>
              <CampoValor name={`itens.${i}.valorTotal`} className={CAMPO} />
            </label>
          </div>
        ))}
        <button
          type="button"
          data-acao="mais-um-item"
          className="text-xs underline underline-offset-2"
          onClick={() => setLinhas((n) => n + 1)}
        >
          Mais um item
        </button>
      </fieldset>
      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p
          role="status"
          className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        >
          {estado.sucesso}
        </p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Registrar documento"}
      </button>
    </form>
  );
}
