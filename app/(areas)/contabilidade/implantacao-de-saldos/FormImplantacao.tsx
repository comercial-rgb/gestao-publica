"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { implantacaoAction, type EstadoDaImplantacao } from "./actions";

/**
 * O FORMULÁRIO DA IMPLANTAÇÃO (V32). O arquivo é lido no navegador para dentro da caixa de texto: o que se
 * confere e o que se implanta é o que o operador vê.
 */
export function FormImplantacao(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaImplantacao, FormData>(implantacaoAction, {});
  const [texto, setTexto] = useState("");
  // Controlada: o React limpa os campos não controlados quando a ação volta, e a data sumiria depois de "Conferir".
  const [dia, setDia] = useState("");
  return (
    <form action={action} data-painel="implantar-saldos" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Balancete do sistema anterior</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Arquivo (texto separado por ponto e vírgula)</span>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className={CAMPO}
            onChange={(e) => {
              const arq = e.target.files?.[0];
              if (arq !== undefined) void arq.text().then(setTexto);
            }}
          />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data da implantação</span>
          <input name="dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Balancete: conta;saldo devedor;saldo credor (uma conta por linha)</span>
          <textarea
            name="balancete"
            rows={10}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"1.1.1.1.1.01.00;10.500,00;\n2.1.1.1.1.01.00;;4.000,00"}
            className={`${CLASSE_AREA_TEXTO} font-mono`}
          />
        </label>
      </div>

      {estado.previa !== undefined ? (
        <div className="mt-3 text-xs" data-resultado-da-acao="conferir-balancete" data-pode-implantar={estado.previa.podeImplantar ? "sim" : "nao"}>
          <p className="mb-2 text-[color:var(--color-ink-2)]">
            {estado.previa.contas} conta(s) com saldo.{" "}
            {estado.previa.podeImplantar ? <strong>O balancete fecha e pode ser implantado.</strong> : <strong>O balancete não pode ser implantado:</strong>}
          </p>
          <table className="mb-2 w-full text-left">
            <caption className="sr-only">Totais do balancete por subsistema</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1 pr-3">Subsistema</th>
                <th scope="col" className="py-1 pr-3">Devedor</th>
                <th scope="col" className="py-1 pr-3">Credor</th>
                <th scope="col" className="py-1 pr-3">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {estado.previa.totais.map((t) => (
                <tr key={t.subsistema} className="border-t border-[color:var(--color-border)]">
                  <th scope="row" className="py-1 pr-3 font-normal">{t.subsistema === "PATRIMONIAL" ? "Patrimonial" : t.subsistema === "ORCAMENTARIO" ? "Orçamentário" : "Controle"}</th>
                  <td className="py-1 pr-3">{t.devedor}</td>
                  <td className="py-1 pr-3">{t.credor}</td>
                  <td className="py-1 pr-3">{t.diferenca}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {estado.previa.problemas.length > 0 ? (
            <ul role="alert" className="list-disc pl-5 text-[color:var(--color-status-erro-fg)]">
              {estado.previa.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="implantar-saldos" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="implantar-saldos" className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" name="etapa" value="conferir" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Conferindo…" : "Conferir"}
        </button>
        <button type="submit" name="etapa" value="implantar" disabled={pendente || estado.previa?.podeImplantar !== true} className={CLASSE_BOTAO_PRIMARIO}>
          Implantar os saldos
        </button>
      </div>
    </form>
  );
}
