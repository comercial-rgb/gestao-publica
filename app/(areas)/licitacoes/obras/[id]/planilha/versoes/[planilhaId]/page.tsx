import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../../../../components/ui/ValorMonetario";
import { qtdBr } from "../../../../../../../../lib/format/quantidade";
import { exigirLeitura } from "../../../../../../../../lib/portas/molde";
import { planilhaParaTela } from "../../../../../../../../lib/portas/planilha-da-obra";
import { FormRevogarVinculo, FormVincular } from "../../FormulariosDaPlanilha";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../../../../components/ui/ResultadosDosAtos";

/** UMA VERSÃO DA PLANILHA ORÇAMENTÁRIA (V7 M2 U6) — itens, grupos, totais e os vínculos com o contrato. */
export const dynamic = "force-dynamic";

const br = (dia: string): string => dia.split("-").reverse().join("/");
const SITUACAO_DA_MEDICAO: Readonly<Record<string, string>> = { ESTORNADA: "estornada", AGUARDANDO_PROVISORIO: "aguardando o recebimento provisório", RECEBIDA_PROVISORIAMENTE: "recebida provisoriamente", COM_RECEBIMENTO_DEFINITIVO: "com recebimento definitivo" };

export default async function VersaoDaPlanilhaPage({ params }: { readonly params: Promise<{ readonly id: string; readonly planilhaId: string }> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id, planilhaId } = await params;
  const v = await planilhaParaTela(id, planilhaId);
  if (v === null) notFound();
  return (
    <ResultadosDosAtos>
    <div className="space-y-4" data-versao-da-planilha={v.versao}>
      <AvisosDosAtos />
      <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
        <Link href="/licitacoes/obras" className="underline underline-offset-2">Obras</Link> / <Link href={`/licitacoes/obras/${id}/planilha`} className="underline underline-offset-2">Planilha orçamentária</Link> / Versão {v.versao}
      </nav>
      <header>
        <h1 className="text-xl font-semibold">Planilha orçamentária — versão {v.versao}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{v.descricao}</p>
      </header>
      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Total da versão</dt><dd data-total-da-versao><ValorMonetario valor={v.valorTotal} comSimbolo /></dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Vale para medir desde</dt><dd>{br(v.vigenciaInicio)}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Referência de preços</dt><dd className="[overflow-wrap:anywhere]">{v.referenciaDePrecos} · data-base {br(v.dataBaseDosPrecos)}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Contrato</dt><dd>{v.contrato === null ? "não informado" : <Link href={`/licitacoes/contratos/${v.contrato.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{v.contrato.numero}</Link>}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Versões</dt><dd>{v.versaoAnterior === null ? "primeira" : <Link href={`/licitacoes/obras/${id}/planilha/versoes/${v.versaoAnterior.id}`} className="underline underline-offset-2">anterior: {v.versaoAnterior.versao}</Link>}{v.versaoSeguinte === null ? "" : <> · <Link href={`/licitacoes/obras/${id}/planilha/versoes/${v.versaoSeguinte.id}`} className="underline underline-offset-2">seguinte: {v.versaoSeguinte.versao}</Link></>}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Arquivo de origem</dt><dd className="[overflow-wrap:anywhere]">{v.arquivo.nome} ({v.arquivo.formato}) · <span className="break-all font-mono text-xs">{v.arquivo.sha256}</span></dd></div>
        </dl>
        <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Motivo: {v.motivo}</p>
        {v.divergenciasCientes === 0 ? null : <div className="mt-2 text-xs" data-divergencias-cientes><p className="font-semibold">Confirmada com ciência de {v.divergenciasCientes} divergência(s):</p><ul className="list-disc pl-5">{v.divergencias.map((d, k) => <li key={k}>{d.linha === 0 ? "total geral" : `linha ${d.linha}`}: {d.mensagem}</li>)}</ul></div>}
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Itens</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm" data-itens-da-versao>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Descrição</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Quantidade</th><th className="py-1 pr-2 text-right">Preço unitário</th><th className="py-1 pr-2 text-right">Total</th><th className="py-1">Item do contrato</th></tr></thead>
            <tbody>
              {v.itens.map((i) => (
                <tr key={i.id} className={`border-t border-[color:var(--color-border)] align-top ${i.tipo === "GRUPO" ? "font-semibold" : ""}`} data-item-da-planilha={i.codigo}>
                  <td className="py-2 pr-2">{i.codigo}</td>
                  <td className="py-2 pr-2 [overflow-wrap:anywhere]" style={{ paddingLeft: `${(i.nivel - 1) * 0.75}rem` }}>{i.descricao}{i.referencia === null ? "" : <span className="block text-xs font-normal text-[color:var(--color-ink-2)]">{i.referencia}</span>}</td>
                  <td className="py-2 pr-2">{i.unidade ?? ""}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{i.quantidade === null ? "" : qtdBr(i.quantidade)}</td>
                  <td className="py-2 pr-2 text-right">{i.precoUnitario === null ? "" : <ValorMonetario valor={i.precoUnitario} />}</td>
                  <td className="py-2 pr-2 text-right"><ValorMonetario valor={i.valor} /></td>
                  <td className="py-2 font-normal">
                    {i.vinculos.length === 0 ? (i.tipo === "SERVICO" ? <span className="text-xs text-[color:var(--color-ink-2)]">sem vínculo</span> : null) : (
                      <ul className="space-y-1 text-xs">
                        {i.vinculos.map((x) => (
                          <li key={x.id} data-vinculo={x.revogado ? "revogado" : "vivo"}>
                            item {x.item.numero} — {x.item.descricao}{x.revogado ? ` (revogado: ${x.motivoDaRevogacao})` : ""}
                            {!x.revogado && v.podeGerir ? <FormRevogarVinculo obraId={id} vinculoId={x.id} /> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {i.tipo === "SERVICO" && v.podeGerir && v.contrato !== null && v.contrato.itens.length > 0 ? <FormVincular obraId={id} itemDaPlanilhaId={i.id} codigo={i.codigo} itensDoContrato={v.contrato.itens} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {v.andamento === null ? null : (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Andamento da obra por serviço</h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">Medido: soma das medições de ordem de serviço feitas pela planilha desta obra (todas as versões, pelo código do serviço), sem as estornadas. Previsto e saldo são desta versão. Recebido e liquidado estão na página de cada ordem.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm" data-andamento-da-planilha>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Serviço</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Previsto</th><th className="py-1 pr-2 text-right">Medido</th><th className="py-1 pr-2 text-right">Saldo</th><th className="py-1 text-right">Medido a preços da planilha</th></tr></thead>
              <tbody>
                {v.andamento.servicos.map((x) => (
                  <tr key={x.codigo} data-andamento-do-servico={x.codigo} className="border-t border-[color:var(--color-border)]">
                    <td className="py-1 pr-2 [overflow-wrap:anywhere]">{x.codigo} — {x.descricao}</td><td className="py-1 pr-2">{x.unidade}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.previsto)}</td><td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.medido)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.saldo)}</td><td className="py-1 text-right"><ValorMonetario valor={x.valorMedidoNaPlanilha} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-3 text-xs font-semibold">Medições pela planilha</h3>
          {v.andamento.medicoes.length === 0 ? <p className="text-xs text-[color:var(--color-ink-2)]" data-sem-medicao-pela-planilha>Nenhuma medição de ordem de serviço feita pela planilha desta obra.</p> : (
            <ul className="mt-1 space-y-1 text-xs" data-medicoes-pela-planilha>
              {v.andamento.medicoes.map((m) => (
                <li key={m.medicaoId}>
                  <Link href={`/licitacoes/contratos/${m.contratoId}/ordens/${m.ordemId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">Ordem nº {m.ordem}, medição nº {m.numero}</Link> · versão {m.versao} · {m.periodo} · <ValorMonetario valor={m.valorNoContrato} comSimbolo /> no contrato (<ValorMonetario valor={m.valorNaPlanilha} comSimbolo /> na planilha) · {SITUACAO_DA_MEDICAO[m.situacao]}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
    </ResultadosDosAtos>
  );
}
