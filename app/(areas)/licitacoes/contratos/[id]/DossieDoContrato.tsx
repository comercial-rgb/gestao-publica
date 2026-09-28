import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import type { DossieParaTela } from "../../../../../lib/portas/contrato-acompanhado";
import { FormDesignar, FormItem, FormMedicaoPorItens, FormOcorrencia, FormProgramar, FormRegimeDeMedicao, FormResolver, FormRevogar } from "./FormulariosDoAcompanhamento";

/**
 * O DOSSIÊ DO CONTRATO ACOMPANHADO (V7 M2.1) — abaixo dos dados do molde.
 *
 * Ordem de trabalho: situação (vigência, financeiro e FÍSICO lado a lado, e separados), responsáveis,
 * itens, agenda, ocorrências e medições — cada seção com o formulário de quem pode praticar o ato. Quem
 * não é gestor ou fiscal designado vê o motivo em vez do formulário. Nenhum valor é recalculado aqui.
 */

const PAPEL: Readonly<Record<string, string>> = { GESTOR: "Gestor", FISCAL: "Fiscal", RECEBEDOR_DEFINITIVO: "Recebedor definitivo" };
const TIPO: Readonly<Record<string, string>> = { CONFORMIDADE: "Conformidade", NAO_CONFORMIDADE: "Não conformidade", ATRASO: "Atraso", IMPEDIMENTO: "Impedimento", OUTRO: "Outro" };
const num = (v: string): string => v.replace(/\.?0+$/, "").replace(".", ",");

function Motivo({ texto }: { readonly texto: string }): React.ReactElement {
  return <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-sem-designacao>{texto}</p>;
}

export function DossieDoContrato({ d, hoje }: { readonly d: DossieParaTela; readonly hoje: string }): React.ReactElement {
  const c = d.contrato;
  const alvo = c.id;
  return (
    <div className="space-y-4" data-dossie-do-contrato>
      <section aria-label="Situação do contrato" data-situacao-do-contrato className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold">Acompanhamento do contrato</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
            <p className="text-xs text-[color:var(--color-ink-2)]">Vigência</p>
            <p className="mt-1"><Badge status={c.vigenteHoje ? (c.diasAteOFim <= 90 ? "alerta" : "ok") : "neutro"}>{c.vigenteHoje ? `vigente — ${c.diasAteOFim} dia(s) até o fim` : "fora de vigência"}</Badge></p>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{c.inicio} a {c.fim}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-financeiro>
            <p className="text-xs text-[color:var(--color-ink-2)]">Financeiro (despesa)</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
              <dt>Valor vigente</dt><dd className="text-right"><ValorMonetario valor={d.financeiro.valorVigente} /></dd>
              <dt>Empenhado</dt><dd className="text-right"><ValorMonetario valor={d.financeiro.empenhado} /></dd>
              <dt>Liquidado</dt><dd className="text-right"><ValorMonetario valor={d.financeiro.liquidado} /></dd>
              <dt>Pago</dt><dd className="text-right"><ValorMonetario valor={d.financeiro.pago} /></dd>
            </dl>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-fisico>
            <p className="text-xs text-[color:var(--color-ink-2)]">Físico (medições)</p>
            <p className="mt-1 text-sm">Medido: <ValorMonetario valor={d.fisico.medidoTotal} comSimbolo /></p>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Progresso físico não é pagamento: medir não liquida; a medição precisa de aprovação e a liquidação é da despesa.</p>
          </div>
        </div>
      </section>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Gestor, fiscais e recebedores</h2>
        {d.designacoes.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma designação. Sem gestor e fiscal designados, agenda, ocorrência e medição por itens não se praticam.</p> : (
          <ul className="space-y-3" data-designacoes>
            {d.designacoes.map((x) => (
              <li key={x.id} data-designacao={x.papel} className="text-sm">
                <p><strong>{PAPEL[x.papel] ?? x.papel}:</strong> {x.nome} <span className="text-xs text-[color:var(--color-ink-2)]">· {x.usuario} · {x.ato} · desde {x.inicio}{x.fim === null ? "" : ` até ${x.fim}`}{x.revogadaEm === null ? "" : ` · revogada com efeito em ${x.revogadaEm}`}</span> <Badge status={x.vigenteHoje ? "ok" : "neutro"}>{x.vigenteHoje ? "vigente" : "sem vigência hoje"}</Badge></p>
                {d.papeis.designar ? <FormRevogar contratoId={alvo} designacaoId={x.id} nome={x.nome} feito={x.revogadaEm !== null} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {d.papeis.designar ? <FormDesignar contratoId={alvo} usuarios={d.opcoes.usuarios} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Itens do contrato</h2>
        {d.fisico.itens.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum item cadastrado. A medição por itens exige os itens com quantidade e preço unitário.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-itens-do-contrato>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Contratado</th><th className="py-1 pr-2 text-right">Unitário (R$)</th><th className="py-1 pr-2 text-right">Medido</th><th className="py-1 text-right">Físico</th></tr></thead>
              <tbody>
                {d.fisico.itens.map((i) => (
                  <tr key={i.id} data-item={i.numero} className="border-t border-[color:var(--color-border)]">
                    <td className="py-2 pr-2">{i.numero} — {i.descricao}</td><td className="py-2 pr-2">{i.unidade}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{num(i.quantidade)}</td><td className="py-2 pr-2 text-right tabular-nums">{num(i.valorUnitario)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{num(i.medido)}</td><td className="py-2 text-right tabular-nums" data-percentual-fisico>{i.percentualFisico}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {d.papeis.cadastrarItem ? <FormItem contratoId={alvo} /> : null}

      {d.visao === "FINANCEIRA" ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Fiscalização</h2>
          <p className="text-sm text-[color:var(--color-ink-2)]" data-fiscalizacao-restrita>{d.alcance.motivo} A agenda, as ocorrências e as evidências não fazem parte desta projeção.</p>
        </Card>
      ) : null}
      {d.visao === "FISCALIZACAO" ? (<>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Agenda de fiscalização <a href="/licitacoes/fiscalizacao/agenda" className="text-xs font-normal text-[color:var(--color-primary)] underline underline-offset-2" data-link-da-agenda>ver no calendário</a></h2>
        {d.ordens.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma fiscalização programada.</p> : (
          <ul className="space-y-1 text-sm" data-ordens>
            {d.ordens.map((o) => <li key={o.id} data-ordem={o.numero}>Ordem nº {o.numero} · {o.dataPrevista} · {o.fiscal} · {o.objetivo} <span className="text-xs text-[color:var(--color-ink-2)]">({o.ocorrencias} ocorrência(s))</span></li>)}
          </ul>
        )}
        {d.papeis.podeProgramar ? null : <Motivo texto={d.papeis.gestor ? "Seu perfil não tem a ação de programar fiscalização." : "Programar é do GESTOR designado e vigente neste contrato."} />}
      </Card>
      {d.papeis.podeProgramar ? <FormProgramar contratoId={alvo} fiscais={d.opcoes.fiscais} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Ocorrências</h2>
        {d.ocorrencias.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma ocorrência registrada.</p> : (
          <ol className="space-y-3" data-ocorrencias>
            {d.ocorrencias.map((o) => (
              <li key={o.id} data-ocorrencia={o.numero} className="border-t border-[color:var(--color-border)] pt-2 text-sm">
                <p><strong>nº {o.numero}</strong> · {o.data} · {TIPO[o.tipo] ?? o.tipo} · {o.fiscal}{o.ordem === null ? "" : ` · ordem nº ${o.ordem}`} <Badge status={o.encaminhamento === "GESTOR" ? (o.resolucao === null ? "alerta" : "ok") : "neutro"}>{o.encaminhamento === "GESTOR" ? (o.resolucao === null ? "aguardando o gestor" : "resolvida") : "registro"}</Badge></p>
                <p className="mt-1 whitespace-pre-line">{o.descricao}</p>
                {o.evidencias.length > 0 ? <p className="mt-1 text-xs">Evidências: {o.evidencias.map((e, i) => <span key={e.id}>{i > 0 ? ", " : ""}<a href={`/documentos/anexos/${e.id}`} className="text-[color:var(--color-primary)] underline">{e.nome}</a></span>)}</p> : null}
                {o.resolucao !== null ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Resolução de {o.resolucao.gestor} em {o.resolucao.em}: {o.resolucao.texto}</p> : null}
                {o.encaminhamento === "GESTOR" && d.papeis.podeResolver ? <FormResolver contratoId={alvo} ocorrenciaId={o.id} numero={o.numero} feito={o.resolucao !== null} /> : null}
              </li>
            ))}
          </ol>
        )}
        {d.papeis.podeRegistrarOcorrencia ? null : <Motivo texto={d.papeis.fiscal ? "Seu perfil não tem a ação de registrar ocorrência." : "Registrar ocorrência é do FISCAL designado e vigente neste contrato."} />}
      </Card>
      {d.papeis.podeRegistrarOcorrencia ? <FormOcorrencia contratoId={alvo} ordens={d.opcoes.minhasOrdens} hoje={hoje} tipos={d.opcoes.tiposDeOcorrencia} /> : null}
      </>) : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Medições</h2>
        {d.medicoes.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma medição.</p> : (
          <ul className="space-y-1 text-sm" data-medicoes>
            {d.medicoes.map((m) => <li key={m.id} data-medicao={m.numero}>Obra {m.obra} · nº {m.numero} · {m.periodo} · <ValorMonetario valor={m.valor} comSimbolo /> · {m.porItens ? "por itens" : "por valor"} <Badge status={m.aprovada ? "ok" : "alerta"}>{m.aprovada ? "aprovada" : "aguardando aprovação"}</Badge></li>)}
          </ul>
        )}
        <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-regime-de-medicao={d.regimesDeMedicao[0]?.regime ?? "PERIODO_LIVRE"}>
          {d.regimesDeMedicao[0] === undefined
            ? "Regime de período: livre (sem configuração). Duas parcelas distintas no mesmo período passam; o saldo de cada item impede medir duas vezes."
            : `Regime de período desde ${d.regimesDeMedicao[0].desde}: ${d.regimesDeMedicao[0].regime === "PERIODO_INDIVISIVEL" ? "indivisível" : "livre"} — ${d.regimesDeMedicao[0].fundamento}.`}
        </p>
        {d.papeis.podeMedir ? null : <Motivo texto={d.papeis.fiscal ? "Seu perfil não tem a ação de registrar medição." : "Medir por itens é do FISCAL designado e vigente neste contrato."} />}
      </Card>
      {d.papeis.configurarExecucao ? <FormRegimeDeMedicao contratoId={alvo} hoje={hoje} /> : null}
      {d.papeis.podeMedir && d.fisico.itens.length > 0 ? (
        <FormMedicaoPorItens contratoId={alvo} obras={d.opcoes.obras} proximoNumero={d.opcoes.proximaMedicao} itens={d.fisico.itens.map((i) => ({ id: i.id, numero: i.numero, descricao: i.descricao, unidade: i.unidade, saldo: num(i.aMedir) }))} />
      ) : null}
    </div>
  );
}
