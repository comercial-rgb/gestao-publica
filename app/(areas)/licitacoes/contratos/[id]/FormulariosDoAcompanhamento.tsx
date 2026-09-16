"use client";

import { useActionState, useId, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";
import { acompanhamentoAction, type EstadoDoAcompanhamento } from "../fiscalizacao-actions";

/**
 * AS ILHAS DO CONTRATO ACOMPANHADO (V7 M2.1). Um formulário por ato; todos passam pela mesma action, com
 * `__acao`. O resultado fica na ilha (recarregada a página, a mensagem continua visível).
 */

type Opcao = { readonly valor: string; readonly rotulo: string };

function Mensagens({ estado, acao }: { readonly estado: EstadoDoAcompanhamento; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} data-resultado-seq="1" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

function useAto() {
  const [estado, disparar, pendente] = useActionState<EstadoDoAcompanhamento, FormData>(acompanhamentoAction, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return { estado, disparar, pendente, ref, id: useId() };
}

function Campo({ id, nome, rotulo, tipo = "text", obrigatorio = true, ...resto }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly tipo?: string; readonly obrigatorio?: boolean } & React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <input id={`${id}-${nome}`} name={nome} type={tipo} required={obrigatorio} className={CLASSE_CAMPO} {...resto} />
    </label>
  );
}

function Selecao({ id, nome, rotulo, opcoes, obrigatorio = true }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly opcoes: readonly Opcao[]; readonly obrigatorio?: boolean }): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <select id={`${id}-${nome}`} name={nome} required={obrigatorio} defaultValue="" className={CLASSE_CAMPO}>
        <option value="" disabled={obrigatorio}>{obrigatorio ? "Escolha…" : "Nenhuma"}</option>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </label>
  );
}

function Ocultos({ contratoId, acao }: { readonly contratoId: string; readonly acao: string }): React.ReactElement {
  return (
    <>
      <input type="hidden" name="__id" value={contratoId} />
      <input type="hidden" name="__acao" value={acao} />
    </>
  );
}

export function FormDesignar({ contratoId, usuarios }: { readonly contratoId: string; readonly usuarios: readonly Opcao[] }): React.ReactElement {
  const a = useAto();
  return (
    <form ref={a.ref} action={a.disparar} data-acao="designar-no-contrato" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="designar" />
      <h3 className="mb-3 text-sm font-semibold">Designar gestor, fiscal ou recebedor definitivo</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao id={a.id} nome="papel" rotulo="Papel" opcoes={[{ valor: "GESTOR", rotulo: "Gestor do contrato" }, { valor: "FISCAL", rotulo: "Fiscal do contrato" }, { valor: "RECEBEDOR_DEFINITIVO", rotulo: "Recebedor definitivo (servidor ou membro da comissão)" }]} />
        <Selecao id={a.id} nome="usuario" rotulo="Conta (com pessoa vinculada)" opcoes={usuarios} />
        <Campo id={a.id} nome="ato" rotulo="Ato de designação" placeholder="Portaria 45/2026" minLength={3} />
        <Campo id={a.id} nome="inicio" rotulo="Início" tipo="date" />
        <Campo id={a.id} nome="fim" rotulo="Fim (opcional)" tipo="date" obrigatorio={false} />
      </div>
      <Mensagens estado={a.estado} acao="designar-no-contrato" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Designar"}</button>
    </form>
  );
}

/** ⚠️ A ilha fica montada depois do ato (`feito`): o aviso de sucesso sobrevive à recarga. */
export function FormRevogar({ contratoId, designacaoId, nome, feito }: { readonly contratoId: string; readonly designacaoId: string; readonly nome: string; readonly feito: boolean }): React.ReactElement | null {
  const a = useAto();
  if (feito) return a.estado.sucesso !== undefined ? <Mensagens estado={a.estado} acao="revogar-designacao" /> : null;
  return (
    <form ref={a.ref} action={a.disparar} data-acao="revogar-designacao" data-designacao-alvo={designacaoId} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="revogar" />
      <input type="hidden" name="designacaoId" value={designacaoId} />
      <Campo id={a.id} nome="dataEfeito" rotulo="Efeito" tipo="date" />
      <Campo id={a.id} nome="motivo" rotulo={`Motivo da revogação de ${nome}`} minLength={5} />
      <button type="submit" disabled={a.pendente} className={CLASSE_BOTAO_PRIMARIO}>{a.pendente ? "Revogando…" : "Revogar"}</button>
      <div className="sm:col-span-3"><Mensagens estado={a.estado} acao="revogar-designacao" /></div>
    </form>
  );
}

export function FormItem({ contratoId }: { readonly contratoId: string }): React.ReactElement {
  const a = useAto();
  return (
    <form ref={a.ref} action={a.disparar} data-acao="cadastrar-item-do-contrato" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="item" />
      <h3 className="mb-3 text-sm font-semibold">Cadastrar item do contrato</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Campo id={a.id} nome="descricao" rotulo="Descrição" minLength={3} /></div>
        <Campo id={a.id} nome="unidade" rotulo="Unidade" placeholder="m3" />
        <Campo id={a.id} nome="quantidade" rotulo="Quantidade" inputMode="decimal" placeholder="100" />
        <Campo id={a.id} nome="valorUnitario" rotulo="Valor unitário (R$)" inputMode="decimal" placeholder="300,00" />
      </div>
      <Mensagens estado={a.estado} acao="cadastrar-item-do-contrato" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Cadastrar item"}</button>
    </form>
  );
}

export function FormProgramar({ contratoId, fiscais }: { readonly contratoId: string; readonly fiscais: readonly Opcao[] }): React.ReactElement {
  const a = useAto();
  return (
    <form ref={a.ref} action={a.disparar} data-acao="programar-fiscalizacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="programar" />
      <h3 className="mb-3 text-sm font-semibold">Programar fiscalização (gestor)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao id={a.id} nome="fiscalDesignacaoId" rotulo="Fiscal designado" opcoes={fiscais} />
        <Campo id={a.id} nome="dataPrevista" rotulo="Data prevista" tipo="date" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Campo id={a.id} nome="horaInicio" rotulo="Horário (opcional)" tipo="time" obrigatorio={false} />
        <Campo id={a.id} nome="duracaoMinutos" rotulo="Duração em minutos (opcional)" obrigatorio={false} inputMode="numeric" />
        <Campo id={a.id} nome="local" rotulo="Local (opcional)" obrigatorio={false} />
      </div>
      <label htmlFor={`${a.id}-objetivo`} className="mt-3 block text-xs"><span className={CLASSE_ROTULO}>O que verificar</span>
        <textarea id={`${a.id}-objetivo`} name="objetivo" required minLength={10} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={a.estado} acao="programar-fiscalizacao" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Programar"}</button>
    </form>
  );
}

/** V7 M2 U8 — o formulário do tipo configurado: as perguntas da versão VIGENTE, respondidas na própria ocorrência. */
export interface TipoConfigurado {
  readonly tipoId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly natureza: string;
  readonly versaoVigente: {
    readonly id: string; readonly versao: number; readonly exigeGravidade: boolean; readonly encaminhamentoPadrao: "NENHUM" | "GESTOR";
    readonly perguntas: readonly { readonly id: string; readonly codigo: string; readonly rotulo: string; readonly tipoDeResposta: string; readonly obrigatoria: boolean; readonly opcoes: readonly string[] }[];
  } | null;
}

export function FormOcorrencia({ contratoId, ordens, hoje, tipos = [] }: { readonly contratoId: string; readonly ordens: readonly Opcao[]; readonly hoje: string; readonly tipos?: readonly TipoConfigurado[] }): React.ReactElement {
  const a = useAto();
  const comFormulario = tipos.filter((t) => t.versaoVigente !== null);
  const [tipoId, setTipoId] = useState("");
  const escolhido = comFormulario.find((t) => t.tipoId === tipoId) ?? null;
  return (
    <form ref={a.ref} action={a.disparar} data-acao="registrar-ocorrencia" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="ocorrencia" />
      <h3 className="mb-3 text-sm font-semibold">Registrar ocorrência (fiscal)</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={a.id} nome="data" rotulo="Data do fato" tipo="date" max={hoje} defaultValue={hoje} />
        <Selecao id={a.id} nome="tipo" rotulo="Tipo" opcoes={[{ valor: "CONFORMIDADE", rotulo: "Conformidade" }, { valor: "NAO_CONFORMIDADE", rotulo: "Não conformidade" }, { valor: "ATRASO", rotulo: "Atraso" }, { valor: "IMPEDIMENTO", rotulo: "Impedimento" }, { valor: "OUTRO", rotulo: "Outro" }]} />
        <Selecao id={a.id} nome="ordemId" rotulo="Ordem de fiscalização" opcoes={ordens} obrigatorio={false} />
      </div>
      <label htmlFor={`${a.id}-descricao`} className="mt-3 block text-xs"><span className={CLASSE_ROTULO}>O que foi verificado</span>
        <textarea id={`${a.id}-descricao`} name="descricao" required minLength={10} className={CLASSE_AREA_TEXTO} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Selecao id={a.id} nome="encaminhamento" rotulo="Encaminhamento" opcoes={[{ valor: "NENHUM", rotulo: "Só registro" }, { valor: "GESTOR", rotulo: "Encaminhar ao gestor" }]} />
        <label htmlFor={`${a.id}-evidencias`} className="text-xs"><span className={CLASSE_ROTULO}>Evidências (fotos, PDF)</span>
          <input id={`${a.id}-evidencias`} name="evidencias" type="file" multiple accept="application/pdf,image/png,image/jpeg" className={CLASSE_CAMPO} />
        </label>
      </div>
      {comFormulario.length === 0 ? (
        <p className="mt-3 text-xs text-[color:var(--color-ink-2)]" data-sem-tipo-configurado>Nenhum tipo de ocorrência do ente com formulário publicado: a ocorrência fica só com o tipo do sistema.</p>
      ) : (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-formulario-do-tipo={escolhido?.codigo ?? "nenhum"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor={`${a.id}-tipoConfigurado`} className="text-xs"><span className={CLASSE_ROTULO}>Tipo de ocorrência do ente (opcional)</span>
              <select id={`${a.id}-tipoConfigurado`} name="tipoConfigurado" value={tipoId} onChange={(ev) => setTipoId(ev.currentTarget.value)} className={CLASSE_CAMPO}>
                <option value="">Sem formulário</option>
                {comFormulario.map((t) => <option key={t.tipoId} value={t.tipoId}>{t.codigo} — {t.nome} (versão {t.versaoVigente!.versao})</option>)}
              </select>
            </label>
            {escolhido?.versaoVigente?.exigeGravidade === true ? (
              <label htmlFor={`${a.id}-gravidade`} className="text-xs"><span className={CLASSE_ROTULO}>Gravidade</span>
                <select id={`${a.id}-gravidade`} name="gravidade" required defaultValue="" className={CLASSE_CAMPO}>
                  <option value="" disabled>Escolha…</option>
                  <option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option>
                </select>
              </label>
            ) : null}
          </div>
          {escolhido === null ? null : (
            <>
              <input type="hidden" name="versaoDoTipoId" value={escolhido.versaoVigente!.id} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2" data-perguntas-do-formulario={escolhido.versaoVigente!.perguntas.length}>
                {escolhido.versaoVigente!.perguntas.map((p) => (
                  <label key={p.id} htmlFor={`${a.id}-resposta-${p.id}`} className="text-xs" data-pergunta={p.codigo}>
                    <span className={CLASSE_ROTULO}>{p.rotulo}{p.obrigatoria ? " (obrigatória)" : ""}</span>
                    {p.tipoDeResposta === "OPCAO" ? (
                      <select id={`${a.id}-resposta-${p.id}`} name={`resposta.${p.id}`} required={p.obrigatoria} defaultValue="" className={CLASSE_CAMPO}>
                        <option value="">Escolha…</option>
                        {p.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : p.tipoDeResposta === "SIM_NAO" ? (
                      <select id={`${a.id}-resposta-${p.id}`} name={`resposta.${p.id}`} required={p.obrigatoria} defaultValue="" className={CLASSE_CAMPO}>
                        <option value="">Escolha…</option><option value="SIM">Sim</option><option value="NAO">Não</option>
                      </select>
                    ) : (
                      <input id={`${a.id}-resposta-${p.id}`} name={`resposta.${p.id}`} required={p.obrigatoria} type={p.tipoDeResposta === "DATA" ? "date" : "text"} inputMode={p.tipoDeResposta === "NUMERO" ? "decimal" : undefined} className={CLASSE_CAMPO} />
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <Mensagens estado={a.estado} acao="registrar-ocorrencia" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Registrar ocorrência"}</button>
    </form>
  );
}

export function FormResolver({ contratoId, ocorrenciaId, numero, feito }: { readonly contratoId: string; readonly ocorrenciaId: string; readonly numero: number; readonly feito: boolean }): React.ReactElement | null {
  const a = useAto();
  if (feito) return a.estado.sucesso !== undefined ? <Mensagens estado={a.estado} acao="resolver-ocorrencia" /> : null;
  return (
    <form ref={a.ref} action={a.disparar} data-acao="resolver-ocorrencia" data-ocorrencia-alvo={numero} className="mt-2 grid gap-2">
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="resolver" />
      <input type="hidden" name="ocorrenciaId" value={ocorrenciaId} />
      <label htmlFor={`${a.id}-texto`} className="text-xs"><span className={CLASSE_ROTULO}>Resolução do gestor (ocorrência nº {numero})</span>
        <textarea id={`${a.id}-texto`} name="texto" required minLength={10} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={a.estado} acao="resolver-ocorrencia" />
      <button type="submit" disabled={a.pendente} className={CLASSE_BOTAO_PRIMARIO}>{a.pendente ? "Gravando…" : "Registrar resolução"}</button>
    </form>
  );
}

export function FormMedicaoPorItens({ contratoId, obras, itens, proximoNumero }: {
  readonly contratoId: string;
  readonly obras: readonly Opcao[];
  readonly itens: readonly { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string; readonly saldo: string }[];
  readonly proximoNumero: number;
}): React.ReactElement {
  const a = useAto();
  return (
    <form ref={a.ref} action={a.disparar} data-acao="medir-por-itens" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="medir" />
      <h3 className="mb-3 text-sm font-semibold">Medir por itens (fiscal)</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Selecao id={a.id} nome="obraId" rotulo="Obra" opcoes={obras} /></div>
        <Campo id={a.id} nome="numero" rotulo="Nº da medição na obra" tipo="number" min={1} defaultValue={proximoNumero} />
        <span />
        <Campo id={a.id} nome="diaInicio" rotulo="Período — início" tipo="date" />
        <Campo id={a.id} nome="diaFim" rotulo="Período — fim" tipo="date" />
        <Campo id={a.id} nome="responsavelTecnico" rotulo="Responsável técnico" minLength={3} />
        <Campo id={a.id} nome="registroProfissional" rotulo="CREA/CAU" minLength={3} />
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Quantidades medidas no período (deixe em branco o item não medido)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {itens.map((i) => (
            <Campo key={i.id} id={a.id} nome={`item.${i.id}`} rotulo={`${i.numero} — ${i.descricao} (${i.unidade}; a medir ${i.saldo})`} obrigatorio={false} inputMode="decimal" />
          ))}
        </div>
      </fieldset>
      <Mensagens estado={a.estado} acao="medir-por-itens" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Registrar medição"}</button>
    </form>
  );
}

export function FormRegimeDeMedicao({ contratoId, hoje }: { readonly contratoId: string; readonly hoje: string }): React.ReactElement {
  const a = useAto();
  return (
    <form ref={a.ref} action={a.disparar} data-acao="configurar-regime-de-medicao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos contratoId={contratoId} acao="regime" />
      <h3 className="mb-1 text-sm font-semibold">Configurar o regime de período das medições</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Sem configuração, duas medições no mesmo período passam se forem parcelas distintas: o que impede medir duas vezes é o saldo de cada item. Período indivisível só com fundamento no contrato ou em regulamento.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao id={a.id} nome="regime" rotulo="Regime" opcoes={[{ valor: "PERIODO_LIVRE", rotulo: "Período livre (a parcela é o saldo por item)" }, { valor: "PERIODO_INDIVISIVEL", rotulo: "Período indivisível (sem sobreposição)" }]} />
        <Campo id={a.id} nome="inicio" rotulo="Vale para medições que começam a partir de" tipo="date" defaultValue={hoje} />
        <label htmlFor={`${a.id}-fundamento`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={CLASSE_ROTULO}>Fundamento (cláusula do contrato ou regulamento)</span>
          <textarea id={`${a.id}-fundamento`} name="fundamento" required minLength={5} rows={2} className={CLASSE_AREA_TEXTO} />
        </label>
      </div>
      <Mensagens estado={a.estado} acao="configurar-regime-de-medicao" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Configurar"}</button>
    </form>
  );
}
