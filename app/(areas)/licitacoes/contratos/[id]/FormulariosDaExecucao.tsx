"use client";

import { useActionState, useId, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { useResultadoDoAto } from "../../../../../components/ui/ResultadosDosAtos";
import { useRestaurarAposEnvio } from "../../../../../components/ui/useRestaurarAposEnvio";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";
import { qtdBr } from "../../../../../lib/format/quantidade";
import { execucaoAction, type EstadoDaExecucao } from "../execucao-actions";

/**
 * AS ILHAS DA EXECUÇÃO DO CONTRATO (V7 M2 U4) — ordem de serviço, medição, recebimentos e liquidação da parcela.
 * Um formulário por ato, todos pela mesma action com `__acao`. Números em formato brasileiro (vírgula decimal). As
 * PRÉVIAS só somam o que foi digitado, para orientar: quem confere saldo, elegível e documento é o servidor.
 */

type Opcao = { readonly valor: string; readonly rotulo: string };


const numero = (v: string): number => {
  const n = Number(v.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
// Número, não data: formatador explícito de moeda (a guarda da data civil vigia `toLocaleString`, que também imprime datas pelo relógio do hospedeiro).
const FORMATO_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (n: number): string => FORMATO_BRL.format(n);

function Mensagens({ estado, acao }: { readonly estado: EstadoDaExecucao; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

function useAto(acao: string) {
  const publicar = useResultadoDoAto(acao);
  // O resultado é publicado quando a action RESPONDE — antes de a recarga decidir se este formulário continua na página.
  let guardar: (dados: FormData) => void = () => undefined;
  const [estado, disparar, pendente] = useActionState<EstadoDaExecucao, FormData>(async (anterior, dados) => {
    guardar(dados);
    const r = await execucaoAction(anterior, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});
  // Gravou: o formulário volta limpo. Recusou: volta com o que foi digitado.
  const restauracao = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined);
  guardar = restauracao.guardar;
  return { estado, disparar, pendente, ref: restauracao.ref, id: useId() };
}

function Campo({ id, nome, rotulo, tipo = "text", obrigatorio = true, ...resto }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly tipo?: string; readonly obrigatorio?: boolean } & React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <input id={`${id}-${nome}`} name={nome} type={tipo} required={obrigatorio} className={CLASSE_CAMPO} {...resto} />
    </label>
  );
}

function Texto({ id, nome, rotulo, obrigatorio = true, linhas = 2 }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly obrigatorio?: boolean; readonly linhas?: number }): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <textarea id={`${id}-${nome}`} name={nome} required={obrigatorio} minLength={obrigatorio ? 5 : undefined} rows={linhas} className={CLASSE_AREA_TEXTO} />
    </label>
  );
}

function Selecao({ id, nome, rotulo, opcoes, obrigatorio = true, vazio }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly opcoes: readonly Opcao[]; readonly obrigatorio?: boolean; readonly vazio?: string }): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <select id={`${id}-${nome}`} name={nome} required={obrigatorio} defaultValue="" className={CLASSE_CAMPO}>
        <option value="" disabled={obrigatorio}>{vazio ?? (obrigatorio ? "Escolha…" : "Nenhum")}</option>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </label>
  );
}

function Ocultos({ contratoId, acao, extra = {} }: { readonly contratoId: string; readonly acao: string; readonly extra?: Readonly<Record<string, string>> }): React.ReactElement {
  return (
    <>
      <input type="hidden" name="__id" value={contratoId} />
      <input type="hidden" name="__acao" value={acao} />
      {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

function Enviar({ pendente, rotulo }: { readonly pendente: boolean; readonly rotulo: string }): React.ReactElement {
  return <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : rotulo}</button>;
}

// ═══ A ORDEM DE SERVIÇO ═══

export function FormNovaOrdem({ contratoId, itens, fiscais, empenhos, hoje }: {
  readonly contratoId: string;
  readonly itens: readonly { readonly valor: string; readonly rotulo: string; readonly aAutorizar: string; readonly unidade: string }[];
  readonly fiscais: readonly Opcao[];
  readonly empenhos: readonly Opcao[];
  readonly hoje: string;
}): React.ReactElement {
  const a = useAto("criar-ordem-de-servico");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="criar-ordem-de-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="rascunho" />
      <h3 className="mb-1 text-sm font-semibold">Nova ordem de serviço (rascunho)</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">O rascunho não compromete o saldo do contrato. Unidade, preço e contratado saem do contrato; a emissão confere o saldo de cada item.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto id={a.id} nome="finalidade" rotulo="Finalidade" />
        <Campo id={a.id} nome="local" rotulo="Local (opcional)" obrigatorio={false} />
        <Campo id={a.id} nome="unidadeSolicitante" rotulo="Unidade solicitante (opcional)" obrigatorio={false} />
        <Campo id={a.id} nome="inicioPrevisto" rotulo="Início previsto" tipo="date" defaultValue={hoje} />
        <Campo id={a.id} nome="fimPrevisto" rotulo="Fim previsto" tipo="date" />
        <Selecao id={a.id} nome="fiscalDesignacaoId" rotulo="Fiscal responsável" opcoes={fiscais} />
        <Selecao id={a.id} nome="empenhoId" rotulo="Empenho do contrato (opcional)" opcoes={empenhos} obrigatorio={false} vazio="Sem empenho indicado" />
        <Texto id={a.id} nome="condicoes" rotulo="Condições de recebimento (documentos e verificações exigidos)" />
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Quantidades autorizadas (deixe em branco o item fora desta ordem)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {itens.map((i) => <Campo key={i.valor} id={a.id} nome={`item.${i.valor}`} rotulo={`${i.rotulo} — a autorizar ${qtdBr(i.aAutorizar)} ${i.unidade}`} obrigatorio={false} inputMode="decimal" placeholder="0" />)}
        </div>
      </fieldset>
      <Mensagens estado={a.estado} acao="criar-ordem-de-servico" />
      <Enviar pendente={a.pendente} rotulo="Criar rascunho" />
    </form>
  );
}

export function FormEmitirOrdem({ contratoId, ordemId, previsto, inicio, impacto }: {
  readonly contratoId: string;
  readonly ordemId: string;
  readonly previsto: string;
  readonly inicio: string;
  readonly impacto: readonly { readonly item: string; readonly pedido: string; readonly disponivel: string; readonly depois: string; readonly unidade: string; readonly cabe: boolean }[];
}): React.ReactElement {
  const a = useAto("emitir-ordem-de-servico");
  const cabeTudo = impacto.every((x) => x.cabe);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="emitir-ordem-de-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="emitir" extra={{ ordemId }} />
      <h3 className="mb-1 text-sm font-semibold">Emitir a ordem de serviço</h3>
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">Prévia do efeito: a emissão compromete {previsto} do saldo do contrato nos itens abaixo. Não empenha, não recebe e não paga.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs" data-previa-da-emissao>
          <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2 text-right">Pedido</th><th className="py-1 pr-2 text-right">Disponível hoje</th><th className="py-1 text-right">Depois</th></tr></thead>
          <tbody>
            {impacto.map((x) => (
              <tr key={x.item} className="border-t border-[color:var(--color-border)]">
                <td className="py-1 pr-2">{x.item}</td><td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.pedido)} {x.unidade}</td><td className="py-1 pr-2 text-right tabular-nums">{qtdBr(x.disponivel)}</td>
                <td className={`py-1 text-right tabular-nums ${x.cabe ? "" : "font-semibold text-[color:var(--color-status-erro-fg)]"}`}>{x.cabe ? qtdBr(x.depois) : `faltam ${qtdBr(x.depois.replace("-", ""))}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cabeTudo ? null : <p className="mt-2 text-xs font-semibold text-[color:var(--color-status-erro-fg)]" data-previa-sem-saldo>Algum item não tem saldo: a emissão será recusada pelo servidor. Quantidade acima do contratado exige aditivo antes.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Campo id={a.id} nome="inicioAutorizado" rotulo="Início autorizado" tipo="date" defaultValue={inicio} /></div>
      <Mensagens estado={a.estado} acao="emitir-ordem-de-servico" />
      <Enviar pendente={a.pendente} rotulo="Emitir" />
    </form>
  );
}

export function FormDescartarOrdem({ contratoId, ordemId }: { readonly contratoId: string; readonly ordemId: string }): React.ReactElement {
  const a = useAto("descartar-ordem-de-servico");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="descartar-ordem-de-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="descartar" extra={{ ordemId }} />
      <h3 className="mb-2 text-sm font-semibold">Descartar o rascunho</h3>
      <div className="grid gap-3 sm:grid-cols-2"><Texto id={a.id} nome="motivo" rotulo="Motivo" /></div>
      <Mensagens estado={a.estado} acao="descartar-ordem-de-servico" />
      <Enviar pendente={a.pendente} rotulo="Descartar" />
    </form>
  );
}

export function FormMovimentarOrdem({ contratoId, ordemId, tipo, hoje }: { readonly contratoId: string; readonly ordemId: string; readonly tipo: "SUSPENSAO" | "RETOMADA"; readonly hoje: string }): React.ReactElement {
  const nome = tipo === "SUSPENSAO" ? "suspender-ordem-de-servico" : "retomar-ordem-de-servico";
  const a = useAto(nome);
  return (
    <form ref={a.ref} action={a.disparar} data-acao={nome} className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="movimentar" extra={{ ordemId, tipo }} />
      <h3 className="mb-2 text-sm font-semibold">{tipo === "SUSPENSAO" ? "Suspender a execução" : "Retomar a execução"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="data" rotulo={tipo === "SUSPENSAO" ? "Suspensa a partir de" : "Retomada em"} tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="motivo" rotulo="Motivo" />
      </div>
      <Mensagens estado={a.estado} acao={nome} />
      <Enviar pendente={a.pendente} rotulo={tipo === "SUSPENSAO" ? "Suspender" : "Retomar"} />
    </form>
  );
}

export function FormCancelarSaldo({ contratoId, ordemId, itens, hoje }: { readonly contratoId: string; readonly ordemId: string; readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly aExecutar: string; readonly unidade: string }[]; readonly hoje: string }): React.ReactElement {
  const a = useAto("cancelar-saldo-da-ordem");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="cancelar-saldo-da-ordem" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="cancelarSaldo" extra={{ ordemId }} />
      <h3 className="mb-1 text-sm font-semibold">Cancelar saldo não executado</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Só o que ainda não foi medido. O empenho indicado na ordem não é anulado aqui.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {itens.map((i) => <Campo key={i.id} id={a.id} nome={`cancelar.${i.id}`} rotulo={`${i.rotulo} — não executado ${qtdBr(i.aExecutar)} ${i.unidade}`} obrigatorio={false} inputMode="decimal" placeholder="0" />)}
        <Campo id={a.id} nome="data" rotulo="Data do cancelamento" tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="motivo" rotulo="Motivo" />
      </div>
      <Mensagens estado={a.estado} acao="cancelar-saldo-da-ordem" />
      <Enviar pendente={a.pendente} rotulo="Cancelar saldo" />
    </form>
  );
}

// ═══ A MEDIÇÃO E OS RECEBIMENTOS ═══

export function FormMedirOrdem({ contratoId, ordemId, itens, hoje }: { readonly contratoId: string; readonly ordemId: string; readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly aExecutar: string; readonly unidade: string }[]; readonly hoje: string }): React.ReactElement {
  const a = useAto("medir-ordem-de-servico");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="medir-ordem-de-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="medir" extra={{ ordemId }} />
      <h3 className="mb-1 text-sm font-semibold">Registrar medição (fiscal)</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Quantidades executadas no período, por item. A mesma parcela não se mede duas vezes: o limite é o autorizado ainda não medido.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="diaInicio" rotulo="Período — início" tipo="date" max={hoje} />
        <Campo id={a.id} nome="diaFim" rotulo="Período — fim" tipo="date" max={hoje} />
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Executado no período (em branco: não executado)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {itens.map((i) => <Campo key={i.id} id={a.id} nome={`medir.${i.id}`} rotulo={`${i.rotulo} — a executar ${qtdBr(i.aExecutar)} ${i.unidade}`} obrigatorio={false} inputMode="decimal" placeholder="0" />)}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Texto id={a.id} nome="observacao" rotulo="Observações (opcional)" obrigatorio={false} /></div>
      <Mensagens estado={a.estado} acao="medir-ordem-de-servico" />
      <Enviar pendente={a.pendente} rotulo="Registrar medição" />
    </form>
  );
}

/**
 * O que a porta entrega sobre cada versão (`versoesParaMedirAOrdem`). ⚠️ DECLARADO AQUI, não importado: o grep da fronteira
 * é textual e barra `from ".../lib/portas/"` numa ilha cliente, mesmo `import type`; o tsc da página confere a forma.
 */
interface VersaoParaMedir {
  readonly planilhaId: string;
  readonly obra: string;
  readonly versao: number;
  readonly vigenciaInicio: string;
  readonly ateAntesDe: string | null;
  readonly linhas: readonly {
    readonly itemDaPlanilhaId: string; readonly codigo: string; readonly descricao: string; readonly unidade: string; readonly previsto: string; readonly anterior: string; readonly saldo: string;
    readonly conciliacao: { readonly apto: true; readonly itemDoContrato: string; readonly aExecutarNaOrdem: string } | { readonly apto: false; readonly recusa: string; readonly motivo: string };
  }[];
}

/**
 * V7 M2 U7 — MEDIR PELA PLANILHA DA OBRA. A pessoa escolhe a versão (a tela mostra de quando a quando ela vale); cada
 * serviço mostra previsto, anterior na obra, esta medição, acumulado e saldo — o acumulado e o saldo daqui são só a soma do
 * que foi digitado, para orientar. O serviço que não concilia (sem vínculo, ambíguo, unidade diferente, item fora da
 * ordem) aparece com o motivo e sem campo. Quem confere tudo, inclusive se a versão vale no período, é o servidor.
 */
export function FormMedirPelaPlanilha({ contratoId, ordemId, versoes, hoje }: { readonly contratoId: string; readonly ordemId: string; readonly versoes: readonly VersaoParaMedir[]; readonly hoje: string }): React.ReactElement {
  const a = useAto("medir-pela-planilha");
  const [planilhaId, setPlanilhaId] = useState(versoes[versoes.length - 1]?.planilhaId ?? "");
  const [digitado, setDigitado] = useState<Readonly<Record<string, string>>>({});
  const v = versoes.find((x) => x.planilhaId === planilhaId) ?? versoes[0];
  if (v === undefined) return <></>;
  const br = (d: string): string => d.split("-").reverse().join("/");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="medir-pela-planilha" className={CLASSE_PAINEL_FORMULARIO} encType="multipart/form-data">
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="medirPelaPlanilha" extra={{ ordemId }} />
      <h3 className="mb-1 text-sm font-semibold">Registrar medição pela planilha da obra (fiscal)</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A quantidade de cada serviço vira a quantidade do item vinculado da ordem, valorada pelo unitário do contrato. A versão precisa valer no primeiro dia do período, e o período não pode alcançar a versão seguinte.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label htmlFor={`${a.id}-planilhaId`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={CLASSE_ROTULO}>Versão da planilha</span>
          <select id={`${a.id}-planilhaId`} name="planilhaId" required value={planilhaId} onChange={(ev) => { setPlanilhaId(ev.currentTarget.value); setDigitado({}); }} className={CLASSE_CAMPO}>
            {versoes.map((x) => <option key={x.planilhaId} value={x.planilhaId}>{x.obra} — versão {x.versao} (vale desde {br(x.vigenciaInicio)}{x.ateAntesDe === null ? "" : `, até antes de ${br(x.ateAntesDe)}`})</option>)}
          </select>
        </label>
        <Campo id={a.id} nome="diaInicio" rotulo="Período — início" tipo="date" max={hoje} min={v.vigenciaInicio} />
        <Campo id={a.id} nome="diaFim" rotulo="Período — fim" tipo="date" max={hoje} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-xs" data-servicos-para-medir={v.versao}>
          <caption className="sr-only">Serviços da versão {v.versao}: previsto, anterior, esta medição, acumulado e saldo</caption>
          <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Serviço</th><th className="py-1 pr-2">Item do contrato</th><th className="py-1 pr-2 text-right">Previsto</th><th className="py-1 pr-2 text-right">Anterior na obra</th><th className="py-1 pr-2">Esta medição</th><th className="py-1 pr-2 text-right">Acumulado</th><th className="py-1 text-right">Saldo</th></tr></thead>
          <tbody>
            {v.linhas.map((l) => {
              const atual = numero(digitado[l.itemDaPlanilhaId] ?? "");
              const acumulado = Number(l.anterior) + atual;
              const saldo = Number(l.previsto) - acumulado;
              return (
                <tr key={l.itemDaPlanilhaId} data-servico={l.codigo} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="py-1 pr-2 [overflow-wrap:anywhere]">{l.codigo} — {l.descricao} ({l.unidade})</td>
                  <td className="py-1 pr-2 [overflow-wrap:anywhere]">{l.conciliacao.apto ? <>{l.conciliacao.itemDoContrato}<span className="block text-[color:var(--color-ink-2)]">a executar na ordem: {qtdBr(l.conciliacao.aExecutarNaOrdem)}</span></> : <span data-motivo-do-servico={l.conciliacao.recusa}>Não se mede por aqui: {l.conciliacao.motivo}.</span>}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(l.previsto)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(l.anterior)}</td>
                  <td className="py-1 pr-2">
                    {l.conciliacao.apto ? (
                      <label htmlFor={`${a.id}-planilha-${l.itemDaPlanilhaId}`} className="block">
                        <span className="sr-only">Quantidade medida do serviço {l.codigo}</span>
                        <input id={`${a.id}-planilha-${l.itemDaPlanilhaId}`} name={`planilha.${l.itemDaPlanilhaId}`} inputMode="decimal" placeholder="0" className={CLASSE_CAMPO} onChange={(ev) => { const valor = ev.currentTarget.value; setDigitado((d) => ({ ...d, [l.itemDaPlanilhaId]: valor })); }} />
                      </label>
                    ) : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{qtdBr(acumulado.toFixed(4))}</td>
                  <td className={`py-1 text-right tabular-nums ${saldo < 0 ? "font-semibold text-[color:var(--color-status-erro-fg)]" : ""}`}>{qtdBr(saldo.toFixed(4))}{saldo < 0 ? " (acima do previsto)" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Texto id={a.id} nome="observacao" rotulo="Observações (opcional)" obrigatorio={false} />
        <label htmlFor={`${a.id}-evidencias`} className="text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Evidências (fotos, PDF; opcional)</span>
          <input id={`${a.id}-evidencias`} name="evidencias" type="file" multiple accept="application/pdf,image/png,image/jpeg" className={CLASSE_CAMPO} />
        </label>
      </div>
      <Mensagens estado={a.estado} acao="medir-pela-planilha" />
      <Enviar pendente={a.pendente} rotulo="Registrar medição" />
    </form>
  );
}

/** V7 M2 U7 — o estorno da medição ainda não recebida (o servidor recusa se houver recebimento). */
export function FormEstornarMedicao({ contratoId, medicaoId, numero }: { readonly contratoId: string; readonly medicaoId: string; readonly numero: number }): React.ReactElement {
  const a = useAto(`estornar-medicao-${numero}`);
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Estornar a medição nº {numero}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={`estornar-medicao-${numero}`} className="mt-2">
        <ChaveDeComando />
        <Ocultos contratoId={contratoId} acao="estornarMedicao" extra={{ medicaoId }} />
        <p className="text-xs text-[color:var(--color-ink-2)]">Só enquanto não houver recebimento provisório. A medição fica no histórico, marcada como estornada, e as quantidades voltam a executar.</p>
        <label htmlFor={`${a.id}-motivo`} className="mt-2 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo do estorno</span>
          <textarea id={`${a.id}-motivo`} name="motivo" required minLength={10} rows={2} className={CLASSE_AREA_TEXTO} />
        </label>
        <Mensagens estado={a.estado} acao={`estornar-medicao-${numero}`} />
        <Enviar pendente={a.pendente} rotulo="Estornar medição" />
      </form>
    </details>
  );
}

export function FormRecebimentoProvisorio({ contratoId, medicaoId, itens, hoje }: { readonly contratoId: string; readonly medicaoId: string; readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly medido: string; readonly unidade: string }[]; readonly hoje: string }): React.ReactElement {
  const a = useAto("receber-provisoriamente");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="receber-provisoriamente" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="provisorio" extra={{ medicaoId }} />
      <h3 className="mb-1 text-sm font-semibold">Conferência e recebimento provisório (fiscal)</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Todo item medido é conferido: conforme + em controvérsia = medido. A controvérsia exige o motivo e não é glosa: ela aguarda a decisão do recebedor definitivo.</p>
      <div className="space-y-3">
        {itens.map((i) => (
          <fieldset key={i.id} data-conferencia-do-item={i.rotulo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
            <legend className="px-1 text-xs font-semibold">{i.rotulo} — medido {qtdBr(i.medido)} {i.unidade}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <Campo id={a.id} nome={`conforme.${i.id}`} rotulo="Conforme" inputMode="decimal" defaultValue={qtdBr(i.medido)} />
              <Campo id={a.id} nome={`controversia.${i.id}`} rotulo="Em controvérsia" inputMode="decimal" defaultValue="0" />
              <Campo id={a.id} nome={`motivo.${i.id}`} rotulo="Motivo da controvérsia" obrigatorio={false} />
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="data" rotulo="Data do recebimento" tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="verificacoes" rotulo="O que foi verificado" />
      </div>
      <Mensagens estado={a.estado} acao="receber-provisoriamente" />
      <Enviar pendente={a.pendente} rotulo="Registrar recebimento provisório" />
    </form>
  );
}

export function FormDecidirControversia({ contratoId, conferenciaId, rotulo, hoje }: { readonly contratoId: string; readonly conferenciaId: string; readonly rotulo: string; readonly hoje: string }): React.ReactElement {
  const a = useAto("decidir-controversia");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="decidir-controversia" data-conferencia={conferenciaId} className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="decidir" extra={{ conferenciaId }} />
      <h3 className="mb-2 text-sm font-semibold">Decidir a controvérsia — {rotulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao id={a.id} nome="resultado" rotulo="Resultado" opcoes={[{ valor: "ACEITA", rotulo: "Aceitar (fica elegível ao complemento)" }, { valor: "REJEITADA", rotulo: "Rejeitar (glosa confirmada)" }]} />
        <Campo id={a.id} nome="data" rotulo="Data da decisão" tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="fundamento" rotulo="Fundamento da decisão" />
      </div>
      <Mensagens estado={a.estado} acao="decidir-controversia" />
      <Enviar pendente={a.pendente} rotulo="Registrar decisão" />
    </form>
  );
}

export function FormRecebimentoDefinitivo({ contratoId, medicaoId, itens, hoje }: { readonly contratoId: string; readonly medicaoId: string; readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly elegivel: string; readonly pendente: string; readonly unidade: string }[]; readonly hoje: string }): React.ReactElement {
  const a = useAto("receber-definitivamente");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="receber-definitivamente" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="definitivo" extra={{ medicaoId }} />
      <h3 className="mb-1 text-sm font-semibold">Recebimento definitivo (recebedor designado)</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Só o elegível: conforme + controvérsia aceita − já recebido. A quantidade em controvérsia sem decisão fica fora, e a parte regular segue.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {itens.map((i) => (
          <Campo key={i.id} id={a.id} nome={`receber.${i.id}`} rotulo={`${i.rotulo} — elegível ${qtdBr(i.elegivel)} ${i.unidade}${i.pendente !== "0.0000" ? `; ${qtdBr(i.pendente)} aguardando decisão` : ""}`} obrigatorio={false} inputMode="decimal" defaultValue={i.elegivel === "0.0000" ? "" : qtdBr(i.elegivel)} />
        ))}
        <Campo id={a.id} nome="data" rotulo="Data do recebimento" tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="conclusao" rotulo="Conclusão do termo (o que comprova)" />
      </div>
      <Mensagens estado={a.estado} acao="receber-definitivamente" />
      <Enviar pendente={a.pendente} rotulo="Registrar recebimento definitivo" />
    </form>
  );
}

// ═══ A LIQUIDAÇÃO DA PARCELA ═══

export function FormLiquidarParcelas({ contratoId, parcelas, empenhos, documentos, hoje }: {
  readonly contratoId: string;
  readonly parcelas: readonly { readonly id: string; readonly rotulo: string; readonly aLiquidar: string }[];
  readonly empenhos: readonly Opcao[];
  readonly documentos: readonly (Opcao & { readonly aLiquidar: string })[];
  readonly hoje: string;
}): React.ReactElement {
  const a = useAto("liquidar-parcelas-do-contrato");
  const [valores, setValores] = useState<Readonly<Record<string, string>>>({});
  const [doc, setDoc] = useState("");
  const soma = Object.values(valores).reduce((t, v) => t + numero(v), 0);
  const saldoDoc = numero((documentos.find((d) => d.valor === doc)?.aLiquidar ?? "0").replace(".", ","));
  return (
    <form ref={a.ref} action={a.disparar} data-acao="liquidar-parcelas-do-contrato" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="liquidar" />
      <h3 className="mb-1 text-sm font-semibold">Preparar a liquidação das parcelas recebidas</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A liquidação é gravada no M05 com o documento de cobrança conferido e o empenho do contrato. Informe quanto de cada parcela esta nota cobre; o servidor confere o elegível, o documento e o empenho.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {parcelas.map((p) => (
          <Campo key={p.id} id={a.id} nome={`parcela.${p.id}`} rotulo={`${p.rotulo} — a liquidar ${brl(Number(p.aLiquidar))}`} obrigatorio={false} inputMode="decimal" placeholder="0,00" onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))} />
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${a.id}-documentoFiscalId`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={CLASSE_ROTULO}>Documento de cobrança conferido</span>
          <select id={`${a.id}-documentoFiscalId`} name="documentoFiscalId" required defaultValue="" onChange={(e) => setDoc(e.target.value)} className={CLASSE_CAMPO}>
            <option value="" disabled>Escolha…</option>
            {documentos.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
          </select>
        </label>
        <Selecao id={a.id} nome="empenhoId" rotulo="Empenho do contrato" opcoes={empenhos} />
        <Campo id={a.id} nome="data" rotulo="Data da liquidação" tipo="date" defaultValue={hoje} max={hoje} />
      </div>
      <p className="mt-3 text-xs" data-previa-da-liquidacao aria-live="polite">
        Prévia: {brl(soma)} nas parcelas{doc === "" ? "." : `; o documento tem ${brl(saldoDoc)} a liquidar${soma > saldoDoc + 0.005 ? " — acima do documento: o servidor recusará." : "."}`}
      </p>
      <Mensagens estado={a.estado} acao="liquidar-parcelas-do-contrato" />
      <Enviar pendente={a.pendente} rotulo="Liquidar" />
    </form>
  );
}

// ═══ O ADITIVO POR ITENS (V7 M2 U5) ═══

/**
 * O termo aditivo por itens. "Conferir composição" pede ao servidor a variação por item (nada é gravado e o formulário
 * não se limpa); "Registrar" grava se a variação informada for igual à conferida. Os campos vêm com a quantidade e o
 * unitário vigentes hoje; só o item alterado entra no termo.
 */
export function FormAditivoPorItens({ contratoId, itens, hoje }: {
  readonly contratoId: string;
  readonly itens: readonly { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string; readonly contratado: string; readonly valorUnitario: string }[];
  readonly hoje: string;
}): React.ReactElement {
  let guardar: (dados: FormData) => void = () => undefined;
  const [estado, disparar, pendente] = useActionState<EstadoDaExecucao, FormData>(async (anterior, dados) => {
    guardar(dados);
    return execucaoAction(anterior, dados);
  }, {});
  // A prévia e a recusa não gravam: os campos voltam como estavam. Só o registro limpa o formulário.
  const { ref, guardar: g } = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined || e.acao === "preverAditivo");
  guardar = g;
  const id = useId();
  return (
    <form ref={ref} action={disparar} data-acao="aditivo-por-itens" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={contratoId} />
      <h3 className="mb-1 text-sm font-semibold">Aditivo por itens</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Registre o termo assinado: novas quantidades, novos unitários ou item incluído, a partir da vigência. A variação de valor entra no contrato; ordens emitidas e períodos já medidos mantêm o preço deles.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={id} nome="numeroAditivo" rotulo="Número do termo aditivo" />
        <Campo id={id} nome="dataAssinatura" rotulo="Assinado em" tipo="date" defaultValue={hoje} max={hoje} />
        <Campo id={id} nome="vigenciaInicio" rotulo="Vale a partir de" tipo="date" defaultValue={hoje} />
        <Campo id={id} nome="fundamento" rotulo="Fundamento indicado no termo" placeholder="Ex.: dispositivo legal e cláusula do contrato" />
        <Texto id={id} nome="motivo" rotulo="Motivo" />
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Itens (mantenha o valor atual no item que não muda)</legend>
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.id} className="grid gap-2 sm:grid-cols-2" data-item-do-aditivo={i.numero}>
              <Campo id={id} nome={`aditivoQtd.${i.id}`} rotulo={`Item ${i.numero} — ${i.descricao}: quantidade (${i.unidade})`} inputMode="decimal" defaultValue={qtdBr(i.contratado)} />
              <Campo id={id} nome={`aditivoUnit.${i.id}`} rotulo={`Item ${i.numero}: unitário em R$`} inputMode="decimal" defaultValue={qtdBr(i.valorUnitario)} />
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Item incluído pelo termo (opcional)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo id={id} nome="incluirDescricao" rotulo="Descrição" obrigatorio={false} />
          <Campo id={id} nome="incluirUnidade" rotulo="Unidade" obrigatorio={false} />
          <Campo id={id} nome="incluirQuantidade" rotulo="Quantidade" obrigatorio={false} inputMode="decimal" />
          <Campo id={id} nome="incluirUnitario" rotulo="Unitário em R$" obrigatorio={false} inputMode="decimal" />
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id={id} nome="variacaoDoTermo" rotulo="Variação do valor escrita no termo, em R$ (negativa para redução)" obrigatorio={false} inputMode="decimal" placeholder="0,00" />
      </div>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={estado.acao === "aditivo" ? "aditivo-por-itens" : "previa-do-aditivo"} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="__acao" value="preverAditivo" disabled={pendente} formNoValidate className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm font-medium">{pendente ? "Conferindo…" : "Conferir composição"}</button>
        <button type="submit" name="__acao" value="aditivo" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Registrar aditivo"}</button>
      </div>
    </form>
  );
}

export function FormEstornarAditivo({ contratoId, aditivoId, numero, hoje }: { readonly contratoId: string; readonly aditivoId: string; readonly numero: string; readonly hoje: string }): React.ReactElement {
  const a = useAto("estornar-aditivo-por-itens");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="estornar-aditivo-por-itens" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="estornarAditivo" extra={{ aditivoId }} />
      <h4 className="mb-1 text-sm font-semibold">Estornar o aditivo nº {numero}</h4>
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">Só enquanto nenhuma ordem ou medição usou os itens dele. Itens e valor são desfeitos juntos; o registro fica no histórico.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="data" rotulo="Data do estorno" tipo="date" defaultValue={hoje} max={hoje} />
        <Texto id={a.id} nome="motivo" rotulo="Motivo do estorno" />
      </div>
      <Mensagens estado={a.estado} acao="estornar-aditivo-por-itens" />
      <Enviar pendente={a.pendente} rotulo="Estornar aditivo" />
    </form>
  );
}
