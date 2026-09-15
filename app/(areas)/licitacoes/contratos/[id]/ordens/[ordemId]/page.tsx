import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "../../../../../../../components/ui/Badge";
import { Card } from "../../../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../../../components/ui/ValorMonetario";
import { qtdBr } from "../../../../../../../lib/format/quantidade";
import { execucaoDoContratoPara, medicaoPelaPlanilhaParaTela, ordemDaExecucao } from "../../../../../../../lib/portas/execucao-do-contrato";
import { exigirSessao } from "../../../../../../../lib/portas/sessao";
import { SITUACAO } from "../../ExecucaoDoContrato";
import {
  FormCancelarSaldo, FormDecidirControversia, FormDescartarOrdem, FormEmitirOrdem, FormEstornarMedicao, FormLiquidarParcelas, FormMedirOrdem, FormMedirPelaPlanilha, FormMovimentarOrdem, FormRecebimentoDefinitivo, FormRecebimentoProvisorio,
} from "../../FormulariosDaExecucao";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../../../components/ui/ResultadosDosAtos";

/**
 * A ORDEM DE SERVIÇO — página de trabalho (V7 M2 U4): resumo e próximas ações, itens e saldos, os atos do gestor com a
 * prévia do efeito, as medições com a conferência por item (conforme, em controvérsia, decisão, recebido, elegível), os
 * termos em PDF e a preparação da liquidação das parcelas recebidas.
 *
 * ⚠️ QUEM ENTRA: quem alcança o contrato — fiscalização por designação ou administrador, ou a projeção financeira
 * (leitura de licitações ou da despesa, ou ato da despesa). Fora disso, 404 — a mesma resposta de ordem inexistente ou de outro contrato. Na projeção
 * financeira não aparecem motivos de controvérsia, verificações nem fundamentos das decisões.
 */
export const dynamic = "force-dynamic";

const DOC = (contratoId: string, tipo: string, id: string): string => `/licitacoes/contratos/${contratoId}/documentos/${tipo}/${id}`;

export default async function OrdemDeServico({ params }: { readonly params: Promise<{ readonly id: string; readonly ordemId: string }> }): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const { id, ordemId } = await params;
  // O alcance do contrato (fiscalização por designação/administrador, ou financeira — que inclui quem lê licitações)
  // é decidido por `execucaoDoContratoPara`; sem ele, 404.
  const e = await execucaoDoContratoPara(sessao, id);
  if (e === null) notFound();
  const o = ordemDaExecucao(e, ordemId);
  if (o === null) notFound();
  const p = e.papeis;
  const planilha = await medicaoPelaPlanilhaParaTela(e, o.id);
  const ativas = o.medicoes.filter((m) => m.estorno === null);
  const emitida = o.situacao === "EMITIDA" || o.situacao === "SUSPENSA";
  const itemDoContrato = new Map(e.itensDoContrato.map((i) => [i.numero, i]));
  const impacto = o.itens.map((i) => {
    const c = itemDoContrato.get(i.item);
    const disponivel = Number(c?.aAutorizar ?? "0");
    const depois = disponivel - Number(i.quantidade);
    return { item: `${i.item} — ${i.descricao}`, pedido: i.quantidade, disponivel: c?.aAutorizar ?? "0.0000", depois: depois.toFixed(4), unidade: i.unidade, cabe: depois >= 0 };
  });
  const aLiquidar = o.medicoes.flatMap((m) => m.definitivos.filter((d) => Number(d.aLiquidar) > 0).map((d) => ({ id: d.id, rotulo: `Medição nº ${m.numero}, recebimento definitivo nº ${d.numero} (${d.data})`, aLiquidar: d.aLiquidar })));
  const proximas = [
    o.situacao === "RASCUNHO" ? (p.podeEmitir ? "Revisar e emitir a ordem" : "A ordem é rascunho: aguarda a emissão pelo gestor") : null,
    emitida && o.itens.some((i) => Number(i.aExecutar) > 0) ? (p.podeMedir ? "Registrar a medição do que foi executado" : "Há quantidade a executar: a medição é do fiscal") : null,
    ativas.some((m) => m.provisorio === null) ? (p.podeReceberProvisorio ? "Conferir e receber provisoriamente a medição pendente" : "Medição aguardando o recebimento provisório do fiscal") : null,
    o.medicoes.some((m) => m.itens.some((i) => Number(i.pendenteDeDecisao) > 0)) ? (p.podeReceberDefinitivo ? "Decidir a controvérsia pendente" : "Controvérsia aguardando a decisão do recebedor definitivo") : null,
    o.medicoes.some((m) => m.provisorio !== null && m.itens.some((i) => Number(i.elegivel) > 0)) ? (p.podeReceberDefinitivo ? "Receber em definitivo o que é elegível" : "Parcela elegível aguardando o recebimento definitivo") : null,
    aLiquidar.length > 0 ? (p.podeLiquidar ? "Liquidar as parcelas recebidas" : "Parcela recebida aguardando a liquidação pela área financeira") : null,
  ].filter((x): x is string => x !== null);

  return (
    <ResultadosDosAtos>
    <div className="space-y-4" data-ordem-de-servico-pagina={`${o.numero}/${o.ano}`}>
      <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
        <Link href="/licitacoes/contratos" className="underline underline-offset-2">Contratos</Link> / <Link href={`/licitacoes/contratos/${id}`} className="underline underline-offset-2">Contrato</Link> / Ordem de serviço
      </nav>
      <header>
        <h1 className="text-xl font-semibold">Ordem de serviço nº {o.numero}/{o.ano} <Badge status={SITUACAO[o.situacao]?.tom ?? "neutro"}>{SITUACAO[o.situacao]?.texto ?? o.situacao}</Badge></h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{o.finalidade}</p>
      </header>
      <AvisosDosAtos />

      <Card>
        <h2 className="text-sm font-semibold">Situação da ordem</h2>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Período</dt><dd>{o.inicioAutorizado === null ? `previsto de ${o.inicioPrevisto}` : `autorizado a partir de ${o.inicioAutorizado}`} a {o.fimPrevisto}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Gestor e fiscal</dt><dd>{o.gestor}; {o.fiscal}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Empenho indicado</dt><dd>{o.empenho === null ? "nenhum" : o.empenho.numero}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Condições de recebimento</dt><dd className="[overflow-wrap:anywhere]">{o.condicoesDeRecebimento}</dd></div>
          {o.emitidaEm !== null && o.sha256 !== null ? <div><dt className="text-xs text-[color:var(--color-ink-2)]">Espelho</dt><dd>emitida em {o.emitidaEm} · <a href={DOC(id, "ordem", o.id)} data-documento="ordem" className="text-[color:var(--color-primary)] underline underline-offset-2">baixar a ordem (PDF)</a></dd></div> : null}
        </dl>
        <div className="mt-3 grid gap-3 sm:grid-cols-5" data-valores-da-ordem>
          {([["Previsto", o.valores.previsto], ["Autorizado", o.valores.autorizado], ["Medido", o.valores.medido], ["Recebido", o.valores.recebido], ["Liquidado", o.valores.liquidado]] as const).map(([r, v]) => (
            <div key={r} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2"><p className="text-xs text-[color:var(--color-ink-2)]">{r}</p><p className="text-sm font-semibold"><ValorMonetario valor={v} comSimbolo /></p></div>
          ))}
        </div>
        <div className="mt-3 border-t border-[color:var(--color-border)] pt-2" data-proximas-acoes>
          <p className="text-xs font-semibold">Próximas ações</p>
          {proximas.length === 0 ? <p className="text-xs text-[color:var(--color-ink-2)]">Nada pendente nesta ordem.</p> : <ul className="mt-1 list-disc pl-5 text-xs">{proximas.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Itens da ordem</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm" data-itens-da-ordem>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Unitário</th><th className="py-1 pr-2 text-right">Na ordem</th><th className="py-1 pr-2 text-right">Cancelado</th><th className="py-1 pr-2 text-right">Autorizado</th><th className="py-1 pr-2 text-right">Medido</th><th className="py-1 text-right">A executar</th></tr></thead>
            <tbody>
              {o.itens.map((i) => (
                <tr key={i.id} data-item-da-ordem={i.item} className="border-t border-[color:var(--color-border)]">
                  <td className="py-2 pr-2">{i.item} — {i.descricao}</td><td className="py-2 pr-2">{i.unidade}</td><td className="py-2 pr-2 text-right"><ValorMonetario valor={Number(i.valorUnitario).toFixed(2)} /></td>
                  <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.quantidade)}</td><td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.cancelado)}</td><td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.autorizado)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(i.medido)}</td><td className="py-2 text-right tabular-nums" data-a-executar>{qtdBr(i.aExecutar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {o.movimentos.length > 0 ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-movimentos-da-ordem>{o.movimentos.map((m) => `${m.tipo === "SUSPENSAO" ? "Suspensa" : "Retomada"} em ${m.data}: ${m.motivo}`).join(" · ")}</p> : null}
        {o.cancelamentos.length > 0 ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{o.cancelamentos.map((c) => `Cancelado ${qtdBr(c.quantidade)} do item ${c.item} em ${c.data}: ${c.motivo}`).join(" · ")}</p> : null}
        {p.podeEmitir ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">{p.motivos.emitir}</p>}
      </Card>

      {p.podeEmitir && o.situacao === "RASCUNHO" ? (<><FormEmitirOrdem contratoId={id} ordemId={o.id} previsto={`R$ ${o.valores.previsto.replace(".", ",")}`} inicio={e.hoje} impacto={impacto} /><FormDescartarOrdem contratoId={id} ordemId={o.id} /></>) : null}
      {p.podeEmitir && emitida ? <FormMovimentarOrdem contratoId={id} ordemId={o.id} tipo={o.situacao === "SUSPENSA" ? "RETOMADA" : "SUSPENSAO"} hoje={e.hoje} /> : null}
      {p.podeEmitir && emitida && o.itens.some((i) => Number(i.aExecutar) > 0) ? <FormCancelarSaldo contratoId={id} ordemId={o.id} itens={o.itens.filter((i) => Number(i.aExecutar) > 0).map((i) => ({ id: i.id, rotulo: `${i.item} — ${i.descricao}`, aExecutar: i.aExecutar, unidade: i.unidade }))} hoje={e.hoje} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Medições e recebimentos</h2>
        {o.medicoes.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-medicao>Nenhuma medição nesta ordem.</p> : (
          <ol className="space-y-4">
            {o.medicoes.map((m) => (
              <li key={m.id} data-medicao-da-ordem={m.numero} className="border-t border-[color:var(--color-border)] pt-3">
                <p className="text-sm"><strong>Medição nº {m.numero}</strong> · {m.periodo} · {m.fiscal}{m.estorno === null ? null : <> <Badge status="neutro">estornada em {m.estorno.data}</Badge></>}</p>
                {m.estorno === null ? null : <p className="text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]" data-estorno-da-medicao={m.numero}>Estornada por {m.estorno.por}{m.estorno.motivo === null ? "" : `: ${m.estorno.motivo}`}. Fica no histórico e fora das somas.</p>}
                {m.pelaPlanilha === null ? null : <p className="text-xs" data-medicao-pela-planilha={m.pelaPlanilha.versao}>Medida pela planilha da obra <Link href={`/licitacoes/obras/${m.pelaPlanilha.obraId}/planilha/versoes/${m.pelaPlanilha.planilhaId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{m.pelaPlanilha.obra}, versão {m.pelaPlanilha.versao}</Link> · <a href={DOC(id, "memoria", m.id)} data-documento="memoria" className="text-[color:var(--color-primary)] underline underline-offset-2">memória da medição (PDF)</a></p>}
                {m.evidencias.length === 0 ? null : <p className="text-xs" data-evidencias-da-medicao>Evidências: {m.evidencias.map((ev, k) => <span key={ev.id}>{k > 0 ? ", " : ""}<a href={`/documentos/anexos/${ev.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{ev.nome}</a></span>)}</p>}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-left text-xs" data-conferencia-da-medicao>
                    <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2 text-right">Medido</th><th className="py-1 pr-2 text-right">Conforme</th><th className="py-1 pr-2 text-right">Em controvérsia</th><th className="py-1 pr-2">Decisão</th><th className="py-1 pr-2 text-right">Recebido</th><th className="py-1 text-right">Elegível</th></tr></thead>
                    <tbody>
                      {m.itens.map((i) => (
                        <tr key={i.id} data-item-medido={i.item} className="border-t border-[color:var(--color-border)] align-top">
                          <td className="py-1 pr-2">{i.item} — {i.descricao} ({i.unidade}){i.motivo === null ? null : <span className="block text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">Motivo: {i.motivo}</span>}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(i.medido)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{i.conforme === null ? "a conferir" : qtdBr(i.conforme)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{i.emControversia === null ? "—" : qtdBr(i.emControversia)}</td>
                          <td className="py-1 pr-2">{i.decisao === null ? (Number(i.pendenteDeDecisao) > 0 ? <Badge status="alerta">aguardando decisão</Badge> : "—") : <span><Badge status={i.decisao.resultado === "ACEITA" ? "ok" : "neutro"}>{i.decisao.resultado === "ACEITA" ? "aceita" : "rejeitada (glosa)"}</Badge> {i.decisao.data}{i.decisao.fundamento === null ? null : <span className="block [overflow-wrap:anywhere]">{i.decisao.fundamento}</span>}</span>}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(i.recebido)}</td>
                          <td className="py-1 text-right tabular-nums" data-elegivel>{qtdBr(i.elegivel)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs" data-valores-da-medicao>
                  Medido <ValorMonetario valor={m.valores.medido} comSimbolo /> · conforme <ValorMonetario valor={m.valores.conforme} comSimbolo /> · em controvérsia <ValorMonetario valor={m.valores.emControversia} comSimbolo /> · aceito <ValorMonetario valor={m.valores.aceito} comSimbolo /> · glosado <ValorMonetario valor={m.valores.glosado} comSimbolo /> · recebido <ValorMonetario valor={m.valores.recebido} comSimbolo /> · liquidado <ValorMonetario valor={m.valores.liquidado} comSimbolo />
                </p>
                <ul className="mt-1 space-y-1 text-xs" data-termos-da-medicao>
                  {m.provisorio === null ? <li>Recebimento provisório: pendente.</li> : <li>Recebimento provisório em {m.provisorio.data} por {m.provisorio.por}{e.visao === "FISCALIZACAO" ? <> · <a href={DOC(id, "provisorio", m.provisorio.id)} data-documento="provisorio" className="text-[color:var(--color-primary)] underline underline-offset-2">termo (PDF)</a></> : null}</li>}
                  {m.definitivos.map((d) => <li key={d.id}>Recebimento definitivo nº {d.numero} em {d.data} por {d.por}: <ValorMonetario valor={d.valor} comSimbolo /> (liquidado <ValorMonetario valor={d.liquidado} comSimbolo />) · <a href={DOC(id, "definitivo", d.id)} data-documento="definitivo" className="text-[color:var(--color-primary)] underline underline-offset-2">termo (PDF)</a></li>)}
                  {e.visao === "FISCALIZACAO" ? m.itens.filter((i) => i.decisao !== null && i.conferenciaId !== null).map((i) => <li key={`dec-${i.id}`}>Decisão do item {i.item} · <a href={DOC(id, "decisao", i.id)} data-documento="decisao" className="text-[color:var(--color-primary)] underline underline-offset-2">documento (PDF)</a></li>) : null}
                </ul>
                {m.estorno === null && m.provisorio === null && p.podeMedir ? <FormEstornarMedicao contratoId={id} medicaoId={m.id} numero={m.numero} /> : null}
                {m.estorno === null && m.provisorio === null && p.podeReceberProvisorio ? <FormRecebimentoProvisorio contratoId={id} medicaoId={m.id} itens={m.itens.map((i) => ({ id: i.id, rotulo: `${i.item} — ${i.descricao}`, medido: i.medido, unidade: i.unidade }))} hoje={e.hoje} /> : null}
                {p.podeReceberDefinitivo ? m.itens.filter((i) => Number(i.pendenteDeDecisao) > 0 && i.conferenciaId !== null).map((i) => <FormDecidirControversia key={i.id} contratoId={id} conferenciaId={i.conferenciaId!} rotulo={`item ${i.item}, ${qtdBr(i.pendenteDeDecisao)} ${i.unidade}`} hoje={e.hoje} />) : null}
                {m.provisorio !== null && p.podeReceberDefinitivo && m.itens.some((i) => Number(i.elegivel) > 0) ? <FormRecebimentoDefinitivo contratoId={id} medicaoId={m.id} itens={m.itens.map((i) => ({ id: i.id, rotulo: `${i.item} — ${i.descricao}`, elegivel: i.elegivel, pendente: i.pendenteDeDecisao, unidade: i.unidade }))} hoje={e.hoje} /> : null}
              </li>
            ))}
          </ol>
        )}
        {!p.podeMedir ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-da-medicao>{p.motivos.medir}</p> : null}
        {!p.podeReceberDefinitivo ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)]" data-motivo-do-definitivo>{p.motivos.definitivo}</p> : null}
      </Card>
      {p.podeMedir && emitida && planilha.versoes.length > 0 ? <FormMedirPelaPlanilha contratoId={id} ordemId={o.id} versoes={planilha.versoes} hoje={e.hoje} /> : null}
      {p.podeMedir && emitida && planilha.itensDaPlanilha.length > 0 ? <p className="text-xs text-[color:var(--color-ink-2)]" data-itens-pela-planilha>Os itens {planilha.itensDaPlanilha.join(", ")} estão vinculados à planilha da obra e se medem pela planilha.</p> : null}
      {p.podeMedir && emitida && o.itens.some((i) => Number(i.aExecutar) > 0 && !planilha.itensDaPlanilha.includes(i.item)) ? <FormMedirOrdem contratoId={id} ordemId={o.id} itens={o.itens.filter((i) => Number(i.aExecutar) > 0 && !planilha.itensDaPlanilha.includes(i.item)).map((i) => ({ id: i.id, rotulo: `${i.item} — ${i.descricao}`, aExecutar: i.aExecutar, unidade: i.unidade }))} hoje={e.hoje} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Liquidação das parcelas recebidas</h2>
        {aLiquidar.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-parcela-a-liquidar>Nenhuma parcela recebida em definitivo aguardando liquidação.</p> : <p className="text-sm" data-parcelas-a-liquidar={aLiquidar.length}>{aLiquidar.length} parcela(s) recebida(s) com saldo a liquidar.</p>}
        {!p.podeLiquidar ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-da-liquidacao>{p.motivos.liquidar}</p> : null}
        {p.podeLiquidar && aLiquidar.length > 0 && (e.opcoes.documentos.length === 0 || e.opcoes.empenhos.length === 0) ? <p className="mt-2 text-xs font-semibold" data-impedimento-da-liquidacao>{e.opcoes.documentos.length === 0 ? "Não há documento de cobrança conferido do contratado com saldo: registre e confira a nota antes." : "Não há empenho vivo deste contrato (de serviço) para suportar a liquidação."}</p> : null}
      </Card>
      {p.podeLiquidar && aLiquidar.length > 0 && e.opcoes.documentos.length > 0 && e.opcoes.empenhos.length > 0 ? <FormLiquidarParcelas contratoId={id} parcelas={aLiquidar} empenhos={e.opcoes.empenhos} documentos={e.opcoes.documentos} hoje={e.hoje} /> : null}
    </div>
    </ResultadosDosAtos>
  );
}
