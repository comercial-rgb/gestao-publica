"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { importarDocumentoFiscalAction, type EstadoDoDocumentoFiscal } from "./actions";
import type { OpcaoDaIlha } from "./FormDocumentoFiscal";

/**
 * IMPORTAÇÃO DE XML NF-e/NFC-e — ilha client. O parser recusa DTD/ENTITY/SYSTEM.
 * Não afirma autorização da SEFAZ.
 */
export function FormImportarXml({
  ordens,
  contratos,
  empenhos,
}: {
  readonly ordens: readonly OpcaoDaIlha[];
  readonly contratos: readonly OpcaoDaIlha[];
  readonly empenhos: readonly OpcaoDaIlha[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDocumentoFiscal, FormData>(
    importarDocumentoFiscalAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={action} data-acao="importar-documento-fiscal-xml" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Importar XML da NF-e</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Aceita NF-e (modelo 55) e NFC-e (modelo 65), com o emitente já cadastrado. A importação
        guarda o arquivo e verifica sua estrutura, sem consultar a SEFAZ nem dispensar a conferência.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Arquivo XML</span>
          <input name="xml" type="file" accept=".xml,application/xml,text/xml" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data de recebimento</span>
          <input name="dataRecebimento" type="date" required className={CAMPO} />
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
      </div>
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
        {pendente ? "Importando…" : "Importar XML"}
      </button>
    </form>
  );
}
