import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { diaCivilBr } from "../../../../../packages/datas/index.js";
import type { ControleNaTela } from "../../../../../modules/m11-licitacoes/conferencia-do-controle";

const ROTULO_DO_EVENTO_SEM_ROTEIRO: Readonly<Record<string, string>> = {
  REGISTRO: "registro do contrato",
  ACRESCIMO: "acréscimo de valor",
  SUPRESSAO: "supressão de valor",
  EXECUCAO: "execução pela liquidação",
};

/**
 * V39-R2 (R2-008 a 013) — o controle contábil do contrato: o que o razão registra nas contas de controle (classes 7 e
 * 8) para este contrato, lançamento a lançamento, e o saldo a executar que resulta. Eventos sem roteiro declarado
 * aparecem nomeados: o contrato segue funcionando, mas aquele fato não chega ao controle até o contador declarar.
 */
export function ControleContabilDoContrato({ c, podeDeclararRoteiro }: { readonly c: ControleNaTela; readonly podeDeclararRoteiro: boolean }): React.ReactElement {
  return (
    <Card>
      <section aria-label="Controle contábil do contrato" data-controle-contabil-do-contrato>
        <h2 className="text-sm font-semibold">Controle contábil do contrato</h2>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
          Lançamentos nas contas de controle feitos pelo registro do contrato, pelos aditivos de valor e pela liquidação. Um estorno inverte as contas do lançamento que desfaz.
        </p>
        {c.eventosSemRoteiro.length > 0 ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-warning-border,var(--color-border))] p-3 text-sm" role="status" data-eventos-sem-roteiro={c.eventosSemRoteiro.join(",")}>
            Sem roteiro declarado, não vão ao controle: {c.eventosSemRoteiro.map((e) => ROTULO_DO_EVENTO_SEM_ROTEIRO[e] ?? e).join(", ")}.{" "}
            {podeDeclararRoteiro ? <Link href="/contabilidade/roteiros-patrimoniais" className="underline">Declarar os roteiros</Link> : "Quem declara é a contabilidade."}
          </p>
        ) : null}
        {c.motivoDoControleFechado === "ANTERIOR_AO_ROTEIRO" || c.motivoDoControleFechado === "SEM_VALOR" ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-sm" role="status" data-controle-nao-aberto={c.motivoDoControleFechado}>
            {c.motivoDoControleFechado === "SEM_VALOR"
              ? "O contrato foi cadastrado sem valor: o controle dele não foi aberto, e os aditivos e a execução dele não vão ao controle."
              : "Este contrato foi cadastrado antes de o roteiro do registro ser declarado: o controle dele não foi aberto, e por isso os aditivos e a execução dele também não vão ao controle."}
          </p>
        ) : null}
        {c.diverge ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] p-3 text-sm" role="alert" data-controle-diverge={`${c.aExecutar}|${c.esperado ?? ""}`}>
            O controle registra <ValorMonetario valor={c.aExecutar} comSimbolo /> a executar, mas os fatos do contrato (valor atualizado menos o liquidado) dizem{" "}
            <ValorMonetario valor={c.esperado ?? "0"} comSimbolo />: algum aditivo ou liquidação aconteceu sem roteiro declarado e não foi ao controle.
          </p>
        ) : null}
        <p className="mt-3 text-sm" data-a-executar={c.aExecutar}>
          Saldo a executar registrado no controle: <strong><ValorMonetario valor={c.aExecutar} comSimbolo /></strong>
        </p>
        {c.linhas.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">Nenhum lançamento de controle para este contrato.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-linhas-do-controle>
              <caption className="sr-only">Lançamentos de controle do contrato</caption>
              <thead>
                <tr className="text-xs text-[color:var(--color-ink-2)]">
                  <th scope="col" className="py-1 pr-3">Data</th>
                  <th scope="col" className="py-1 pr-3">Fato</th>
                  <th scope="col" className="py-1 pr-3">Lançamento</th>
                  <th scope="col" className="py-1 pr-3 text-right">Valor</th>
                  <th scope="col" className="py-1 pr-3 text-right">Vale hoje</th>
                  <th scope="col" className="py-1">Roteiro</th>
                </tr>
              </thead>
              <tbody>
                {c.linhas.map((l) => (
                  <tr key={l.numeroControle} className="border-t border-[color:var(--color-border)]" data-evento-do-controle={l.evento}>
                    <td className="py-1 pr-3">{diaCivilBr(l.dia)}</td>
                    <td className="py-1 pr-3">{l.rotulo}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{l.numeroControle}</td>
                    <td className="py-1 pr-3 text-right"><ValorMonetario valor={l.valor} /></td>
                    <td className="py-1 pr-3 text-right">{l.efeito === null ? "—" : <ValorMonetario valor={l.efeito} />}</td>
                    <td className="py-1">{l.versaoDoRoteiro === null ? "contas do original" : `versão ${String(l.versaoDoRoteiro)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Card>
  );
}
