"use client";

import { useActionState, useId, useRef } from "react";
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
      <label htmlFor={`${a.id}-objetivo`} className="mt-3 block text-xs"><span className={CLASSE_ROTULO}>O que verificar</span>
        <textarea id={`${a.id}-objetivo`} name="objetivo" required minLength={10} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={a.estado} acao="programar-fiscalizacao" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Programar"}</button>
    </form>
  );
}

export function FormOcorrencia({ contratoId, ordens, hoje }: { readonly contratoId: string; readonly ordens: readonly Opcao[]; readonly hoje: string }): React.ReactElement {
  const a = useAto();
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
