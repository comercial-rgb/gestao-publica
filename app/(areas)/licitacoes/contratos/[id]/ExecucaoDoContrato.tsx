import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import type { ExecucaoParaTela } from "../../../../../lib/portas/execucao-do-contrato";
import { qtdBr } from "../../../../../lib/format/quantidade";
import { FormAditivoPorItens, FormEstornarAditivo, FormNovaOrdem } from "./FormulariosDaExecucao";

const dataBr = (dia: string): string => dia.split("-").reverse().join("/");

/**
 * A EXECUÇÃO DO CONTRATO NA PÁGINA DO CONTRATO (V7 M2 U4) — o resumo e a entrada para cada ordem de serviço.
 *
 * Cada valor tem a definição ao lado (autorizado, medido, recebido, liquidado) e nenhum é derivado do outro. As
 * quantidades ficam por item, na unidade dele; só valores se somam. O trabalho (medir, conferir, receber, liquidar)
 * acontece na página da ordem.
 */

export const SITUACAO: Readonly<Record<string, { readonly texto: string; readonly tom: "ok" | "alerta" | "neutro" }>> = {
  RASCUNHO: { texto: "rascunho", tom: "neutro" },
  DESCARTADA: { texto: "descartada", tom: "neutro" },
  EMITIDA: { texto: "emitida", tom: "ok" },
  SUSPENSA: { texto: "suspensa", tom: "alerta" },
};

function Valor({ rotulo, valor, definicao, dado }: { readonly rotulo: string; readonly valor: string; readonly definicao: string; readonly dado: string }): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-valor-da-execucao={dado}>
      <p className="text-xs text-[color:var(--color-ink-2)]">{rotulo}</p>
      <p className="mt-1 text-base font-semibold"><ValorMonetario valor={valor} comSimbolo /></p>
      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{definicao}</p>
    </div>
  );
}

export function ExecucaoDoContrato({ e, contratoId }: { readonly e: ExecucaoParaTela; readonly contratoId: string }): React.ReactElement {
  return (
    <section aria-label="Execução do contrato" className="space-y-4" data-execucao-do-contrato={e.visao}>
      <Card>
        <h2 className="text-sm font-semibold">Execução por ordens de serviço</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Valor dado="autorizado" rotulo="Autorizado" valor={e.totais.autorizado} definicao="Ordens emitidas, menos os saldos cancelados, pelo unitário da ordem." />
          <Valor dado="medido" rotulo="Medido" valor={e.totais.medido} definicao="Executado informado pelo fiscal nas medições das ordens." />
          <Valor dado="recebido" rotulo="Recebido em definitivo" valor={e.totais.recebido} definicao="Parcelas aceitas pelo recebedor designado (art. 140, I, b)." />
          <Valor dado="liquidado" rotulo="Liquidado pelas parcelas" valor={e.totais.liquidado} definicao="O que as liquidações vivas da despesa consumiram das parcelas recebidas." />
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Saldo dos itens do contrato</h2>
        {e.itensDoContrato.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum item cadastrado: sem itens, não há ordem de serviço.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm" data-saldo-dos-itens>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Original</th><th className="py-1 pr-2 text-right">Contratado hoje</th><th className="py-1 pr-2 text-right">Unitário hoje</th><th className="py-1 pr-2 text-right">Autorizado em ordens</th><th className="py-1 pr-2 text-right">Medido sem ordem</th><th className="py-1 text-right">A autorizar</th></tr></thead>
              <tbody>
                {e.itensDoContrato.map((i) => (
                  <tr key={i.id} data-item-do-contrato={i.numero} className="border-t border-[color:var(--color-border)]">
                    <td className="py-2 pr-2">{i.numero} — {i.descricao}</td><td className="py-2 pr-2">{i.unidade}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.original)}</td><td className="py-2 pr-2 text-right tabular-nums" data-contratado-hoje>{qtdBr(i.contratado)}</td>
                    <td className="py-2 pr-2 text-right"><ValorMonetario valor={i.valorUnitario} /></td><td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.autorizadoEmOrdens)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.medidoSemOrdem)}</td><td className="py-2 text-right tabular-nums" data-a-autorizar>{qtdBr(i.aAutorizar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Aditivos por itens</h2>
        {e.aditivosPorItens.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-aditivos-por-itens>Nenhum aditivo alterou itens deste contrato.</p> : (
          <ul className="space-y-3">
            {e.aditivosPorItens.map((a) => (
              <li key={a.id} data-aditivo-por-itens={a.numeroAditivo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Termo aditivo nº {a.numeroAditivo}</span>
                  {a.estornado === null ? <Badge status="ok">vigente desde {dataBr(a.vigenciaInicio)}</Badge> : <Badge status="neutro">estornado em {dataBr(a.estornado.data)}</Badge>}
                  <span className="text-sm">variação <ValorMonetario valor={a.variacao} comSimbolo /></span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">Assinado em {dataBr(a.dataAssinatura)} · {a.fundamento} · {a.motivo}</p>
                {a.estornado === null ? null : <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Motivo do estorno: {a.estornado.motivo}</p>}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-xs">
                    <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2 text-right">Quantidade</th><th className="py-1 pr-2 text-right">Unitário</th><th className="py-1 text-right">Variação</th></tr></thead>
                    <tbody>
                      {a.itens.map((x) => (
                        <tr key={x.item} className="border-t border-[color:var(--color-border)]">
                          <td className="py-1 pr-2">{x.item} — {x.descricao}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.quantidadeAnterior)} → {qtdBr(x.quantidade)} {x.unidade}</td>
                          <td className="py-1 pr-2 text-right tabular-nums"><ValorMonetario valor={x.valorUnitarioAnterior} /> → <ValorMonetario valor={x.valorUnitario} /></td>
                          <td className="py-1 text-right"><ValorMonetario valor={x.variacao} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {a.estornado === null && e.papeis.podeEstornarAditivo ? <FormEstornarAditivo contratoId={contratoId} aditivoId={a.id} numero={a.numeroAditivo} hoje={e.hoje} /> : null}
              </li>
            ))}
          </ul>
        )}
        {e.papeis.podeRegistrarAditivo ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-do-aditivo>{e.papeis.motivos.aditivo}</p>}
      </Card>
      {e.papeis.podeRegistrarAditivo && e.itensDoContrato.length > 0 ? <FormAditivoPorItens contratoId={contratoId} hoje={e.hoje} itens={e.itensDoContrato.map((i) => ({ id: i.id, numero: i.numero, descricao: i.descricao, unidade: i.unidade, contratado: i.contratado, valorUnitario: i.valorUnitario }))} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Ordens de serviço</h2>
        {e.ordens.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-ordens>Nenhuma ordem de serviço neste contrato.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm" data-ordens-de-servico>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Ordem</th><th className="py-1 pr-2">Situação</th><th className="py-1 pr-2">Período</th><th className="py-1 pr-2 text-right">Autorizado</th><th className="py-1 pr-2 text-right">Medido</th><th className="py-1 pr-2 text-right">Recebido</th><th className="py-1 text-right">Liquidado</th></tr></thead>
              <tbody>
                {e.ordens.map((o) => (
                  <tr key={o.id} data-ordem-de-servico={`${o.numero}/${o.ano}`} className="border-t border-[color:var(--color-border)]">
                    <td className="py-2 pr-2"><Link href={`/licitacoes/contratos/${contratoId}/ordens/${o.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">nº {o.numero}/{o.ano}</Link><span className="block text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{o.finalidade}</span></td>
                    <td className="py-2 pr-2"><Badge status={SITUACAO[o.situacao]?.tom ?? "neutro"}>{SITUACAO[o.situacao]?.texto ?? o.situacao}</Badge></td>
                    <td className="py-2 pr-2">{o.inicioAutorizado ?? o.inicioPrevisto} a {o.fimPrevisto}</td>
                    <td className="py-2 pr-2 text-right"><ValorMonetario valor={o.situacao === "RASCUNHO" || o.situacao === "DESCARTADA" ? o.valores.previsto : o.valores.autorizado} /></td>
                    <td className="py-2 pr-2 text-right"><ValorMonetario valor={o.valores.medido} /></td>
                    <td className="py-2 pr-2 text-right"><ValorMonetario valor={o.valores.recebido} /></td>
                    <td className="py-2 text-right"><ValorMonetario valor={o.valores.liquidado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {e.papeis.podeEmitir ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-da-ordem>{e.papeis.motivos.emitir}</p>}
      </Card>
      {e.papeis.podeEmitir && e.itensDoContrato.length > 0 ? <FormNovaOrdem contratoId={contratoId} itens={e.opcoes.itensDoContrato} fiscais={e.opcoes.fiscais} empenhos={e.opcoes.empenhos} hoje={e.hoje} /> : null}
    </section>
  );
}
