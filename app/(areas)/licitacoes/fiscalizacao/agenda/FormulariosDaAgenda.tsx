"use client";

import { useActionState, useId, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";
import { useResultadoDoAto } from "../../../../../components/ui/ResultadosDosAtos";
import { useRestaurarAposEnvio } from "../../../../../components/ui/useRestaurarAposEnvio";
import { agendaAction, type EstadoDaAgenda } from "../agenda-actions";

/**
 * AS ILHAS DA AGENDA DA FISCALIZAÇÃO (V7 M2 U8) — reagendar com motivo, cancelar e registrar a realização.
 * Cada formulário pertence a UM compromisso (o `data-acao` leva o número), e o resultado sobrevive à recarga que
 * retira o formulário: reagendada, a fiscalização sai do dia; realizada, o formulário de realizar deixa de existir.
 */

function useAto(acao: string) {
  const publicar = useResultadoDoAto(acao);
  let guardar: (d: FormData) => void = () => undefined;
  const [estado, disparar, pendente] = useActionState<EstadoDaAgenda, FormData>(async (anterior, dados) => {
    guardar(dados);
    const r = await agendaAction(anterior, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});
  const restauracao = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined);
  guardar = restauracao.guardar;
  return { estado, disparar, pendente, ref: restauracao.ref, id: useId() };
}

function Mensagens({ estado, acao }: { readonly estado: EstadoDaAgenda; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

function Campo({ id, nome, rotulo, tipo = "text", obrigatorio = true, ...resto }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly tipo?: string; readonly obrigatorio?: boolean } & React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <input id={`${id}-${nome}`} name={nome} type={tipo} required={obrigatorio} className={CLASSE_CAMPO} {...resto} />
    </label>
  );
}

const Ocultos = ({ acao, ordemId, contratoId }: { readonly acao: string; readonly ordemId: string; readonly contratoId: string }): React.ReactElement => (
  <>
    <input type="hidden" name="__acao" value={acao} />
    <input type="hidden" name="ordemId" value={ordemId} />
    <input type="hidden" name="__contratoId" value={contratoId} />
  </>
);

export function FormReagendar({ ordemId, contratoId, numero, data, horaInicio, duracaoMinutos, local, hoje }: {
  readonly ordemId: string; readonly contratoId: string; readonly numero: number; readonly data: string; readonly horaInicio: string | null; readonly duracaoMinutos: number | null; readonly local: string | null; readonly hoje: string;
}): React.ReactElement {
  const acao = `reagendar-fiscalizacao-${numero}`;
  const a = useAto(acao);
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Reagendar a fiscalização nº {numero}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2">
        <ChaveDeComando />
        <Ocultos acao="reagendar" ordemId={ordemId} contratoId={contratoId} />
        <p className="text-xs text-[color:var(--color-ink-2)]">Hoje: {data.split("-").reverse().join("/")}{horaInicio === null ? "" : ` às ${horaInicio}`}. O compromisso anterior e o motivo ficam no histórico.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Campo id={a.id} nome="dataPrevista" rotulo="Nova data" tipo="date" defaultValue={data} min={hoje} />
          <Campo id={a.id} nome="horaInicio" rotulo="Horário (HH:MM)" tipo="time" obrigatorio={false} defaultValue={horaInicio ?? ""} />
          <Campo id={a.id} nome="duracaoMinutos" rotulo="Duração (minutos)" obrigatorio={false} inputMode="numeric" defaultValue={duracaoMinutos === null ? "" : String(duracaoMinutos)} />
          <Campo id={a.id} nome="local" rotulo="Local" obrigatorio={false} defaultValue={local ?? ""} />
        </div>
        <label htmlFor={`${a.id}-motivo`} className="mt-2 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo da mudança</span>
          <textarea id={`${a.id}-motivo`} name="motivo" required minLength={5} rows={2} className={CLASSE_AREA_TEXTO} />
        </label>
        <Mensagens estado={a.estado} acao={acao} />
        <button type="submit" disabled={a.pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Reagendar"}</button>
      </form>
    </details>
  );
}

export function FormCancelarFiscalizacao({ ordemId, contratoId, numero }: { readonly ordemId: string; readonly contratoId: string; readonly numero: number }): React.ReactElement {
  const acao = `cancelar-fiscalizacao-${numero}`;
  const a = useAto(acao);
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Cancelar a fiscalização nº {numero}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2">
        <ChaveDeComando />
        <Ocultos acao="cancelar" ordemId={ordemId} contratoId={contratoId} />
        <label htmlFor={`${a.id}-motivo`} className="block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo do cancelamento</span>
          <textarea id={`${a.id}-motivo`} name="motivo" required minLength={5} rows={2} className={CLASSE_AREA_TEXTO} />
        </label>
        <Mensagens estado={a.estado} acao={acao} />
        <button type="submit" disabled={a.pendente} className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm">{a.pendente ? "Gravando…" : "Cancelar a fiscalização"}</button>
      </form>
    </details>
  );
}

export function FormRealizar({ ordemId, contratoId, numero, data, hoje }: { readonly ordemId: string; readonly contratoId: string; readonly numero: number; readonly data: string; readonly hoje: string }): React.ReactElement {
  const acao = `realizar-fiscalizacao-${numero}`;
  const a = useAto(acao);
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Registrar a realização da fiscalização nº {numero}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2">
        <ChaveDeComando />
        <Ocultos acao="realizar" ordemId={ordemId} contratoId={contratoId} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Campo id={a.id} nome="data" rotulo="Data da visita" tipo="date" max={hoje} defaultValue={data > hoje ? hoje : data} />
          <Campo id={a.id} nome="horaInicio" rotulo="Começou às (opcional)" tipo="time" obrigatorio={false} />
          <Campo id={a.id} nome="horaFim" rotulo="Terminou às (opcional)" tipo="time" obrigatorio={false} />
        </div>
        <label htmlFor={`${a.id}-relato`} className="mt-2 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Relato da visita</span>
          <textarea id={`${a.id}-relato`} name="relato" required minLength={10} rows={3} className={CLASSE_AREA_TEXTO} />
        </label>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Registrar a realização não é a ocorrência: o que foi constatado se registra como ocorrência, no contrato, com o formulário do tipo.</p>
        <Mensagens estado={a.estado} acao={acao} />
        <button type="submit" disabled={a.pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Registrar realização"}</button>
      </form>
    </details>
  );
}

// ═══ OS TIPOS DE OCORRÊNCIA DO ENTE ═══

export function FormCadastrarTipo(): React.ReactElement {
  const a = useAto("cadastrar-tipo-de-ocorrencia");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="cadastrar-tipo-de-ocorrencia" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="cadastrarTipo" />
      <h2 className="mb-1 text-sm font-semibold">Cadastrar tipo de ocorrência</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">O tipo nasce ativo e sem formulário: publique a primeira versão para que o fiscal possa usá-lo.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={a.id} nome="codigo" rotulo="Código (letras maiúsculas, números e hífen)" maxLength={30} />
        <Campo id={a.id} nome="nome" rotulo="Nome" minLength={3} />
        <label htmlFor={`${a.id}-natureza`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={CLASSE_ROTULO}>Natureza</span>
          <select id={`${a.id}-natureza`} name="natureza" required defaultValue="NAO_CONFORMIDADE" className={CLASSE_CAMPO}>
            {[["CONFORMIDADE", "Conformidade"], ["NAO_CONFORMIDADE", "Não conformidade"], ["ATRASO", "Atraso"], ["IMPEDIMENTO", "Impedimento"], ["OUTRO", "Outro"]].map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
      </div>
      <Mensagens estado={a.estado} acao="cadastrar-tipo-de-ocorrencia" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Cadastrar tipo"}</button>
    </form>
  );
}

export function FormPublicarVersao({ tipoId, codigo, proximaVersao, hoje }: { readonly tipoId: string; readonly codigo: string; readonly proximaVersao: number; readonly hoje: string }): React.ReactElement {
  const acao = `publicar-versao-${codigo}`;
  const a = useAto(acao);
  const [linhas, setLinhas] = useState(3);
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Publicar a versão {proximaVersao} do formulário de {codigo}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2">
        <ChaveDeComando />
        <input type="hidden" name="__acao" value="publicarVersao" />
        <input type="hidden" name="tipoId" value={tipoId} />
        <div className="grid gap-2 sm:grid-cols-4">
          <Campo id={a.id} nome="vigenciaInicio" rotulo="Vale para preencher desde" tipo="date" defaultValue={hoje} />
          <label htmlFor={`${a.id}-exigeGravidade`} className="text-xs text-[color:var(--color-ink-2)]">
            <span className={CLASSE_ROTULO}>Exige gravidade</span>
            <select id={`${a.id}-exigeGravidade`} name="exigeGravidade" defaultValue="nao" className={CLASSE_CAMPO}><option value="nao">Não</option><option value="sim">Sim</option></select>
          </label>
          <label htmlFor={`${a.id}-encaminhamentoPadrao`} className="text-xs text-[color:var(--color-ink-2)]">
            <span className={CLASSE_ROTULO}>Encaminhamento sugerido</span>
            <select id={`${a.id}-encaminhamentoPadrao`} name="encaminhamentoPadrao" defaultValue="NENHUM" className={CLASSE_CAMPO}><option value="NENHUM">Só registro</option><option value="GESTOR">Ao gestor</option></select>
          </label>
          <Campo id={a.id} nome="motivo" rotulo="Motivo da versão" minLength={5} />
        </div>
        <div className="mt-2 space-y-2" data-perguntas-da-versao={linhas}>
          {Array.from({ length: linhas }, (_, i) => (
            <fieldset key={i} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2" data-pergunta={i + 1}>
              <legend className="px-1 text-xs font-semibold">Pergunta {i + 1}</legend>
              <div className="grid gap-2 sm:grid-cols-5">
                <Campo id={a.id} nome={`pergunta.${i}.codigo`} rotulo="Código" obrigatorio={false} maxLength={40} />
                <Campo id={a.id} nome={`pergunta.${i}.rotulo`} rotulo="Pergunta" obrigatorio={false} />
                <label htmlFor={`${a.id}-pergunta.${i}.tipo`} className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={CLASSE_ROTULO}>Resposta</span>
                  <select id={`${a.id}-pergunta.${i}.tipo`} name={`pergunta.${i}.tipo`} defaultValue="TEXTO" className={CLASSE_CAMPO}>
                    {[["TEXTO", "Texto"], ["NUMERO", "Número"], ["DATA", "Data"], ["OPCAO", "Lista de opções"], ["SIM_NAO", "Sim ou não"]].map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </label>
                <label htmlFor={`${a.id}-pergunta.${i}.obrigatoria`} className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={CLASSE_ROTULO}>Obrigatória</span>
                  <select id={`${a.id}-pergunta.${i}.obrigatoria`} name={`pergunta.${i}.obrigatoria`} defaultValue="nao" className={CLASSE_CAMPO}><option value="nao">Não</option><option value="sim">Sim</option></select>
                </label>
                <Campo id={a.id} nome={`pergunta.${i}.opcoes`} rotulo="Opções (separadas por ;)" obrigatorio={false} />
              </div>
            </fieldset>
          ))}
        </div>
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 20))} className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-xs">Acrescentar pergunta</button>
        <Mensagens estado={a.estado} acao={acao} />
        <button type="submit" disabled={a.pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : `Publicar versão ${proximaVersao}`}</button>
      </form>
    </details>
  );
}

export function FormMudarSituacaoDoTipo({ tipoId, codigo, ativo }: { readonly tipoId: string; readonly codigo: string; readonly ativo: boolean }): React.ReactElement {
  const acao = `mudar-situacao-${codigo}`;
  const a = useAto(acao);
  return (
    <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="mudarSituacao" />
      <input type="hidden" name="tipoId" value={tipoId} />
      <input type="hidden" name="ativo" value={ativo ? "nao" : "sim"} />
      <Campo id={a.id} nome="motivo" rotulo={ativo ? "Motivo da desativação" : "Motivo da reativação"} minLength={5} />
      <button type="submit" disabled={a.pendente} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm">{a.pendente ? "Gravando…" : ativo ? "Desativar" : "Reativar"}</button>
      <div className="w-full"><Mensagens estado={a.estado} acao={acao} /></div>
    </form>
  );
}
