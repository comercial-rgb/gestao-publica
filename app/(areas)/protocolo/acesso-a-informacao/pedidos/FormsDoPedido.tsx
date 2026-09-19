"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import {
  decidirRecursoAction,
  distribuirAction,
  interporAction,
  prorrogarAction,
  protocolarAction,
  receberAction,
  responderAction,
  type EstadoDoAto,
} from "./actions";

/**
 * OS FORMULÁRIOS DO RITO DO ACESSO À INFORMAÇÃO (V11 V5.3).
 *
 * ⚠️ RÓTULO EM TODO CAMPO. Campo sem rótulo é caixa muda para leitor de tela.
 *
 * ⚠️ O FORMULÁRIO SÓ APARECE QUANDO O SERVIDOR AUTORIZA — e quando ele não aparece, a tela diz
 * POR QUÊ em vez de sumir em silêncio. Botão oculto não é proteção; o que protege é o
 * `comEscritaAutenticada` do outro lado. Isto aqui é para a pessoa não perder tempo.
 */

function Mensagens({ estado }: { readonly estado: EstadoDoAto }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

const CAIXA = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3";

export function FormProtocolar({
  assuntos,
  setores,
  exercicios,
}: {
  readonly assuntos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly setores: readonly { readonly id: string; readonly rotulo: string }[];
  readonly exercicios: readonly number[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(protocolarAction, {});
  const uid = useId();
  return (
    <form action={action} data-acao="protocolar-pedido" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Protocolar um pedido</h2>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        O pedido é executado por um processo do protocolo. A norma que vale para ele é a publicada
        hoje, e ela fica registrada no pedido — publicar uma versão nova depois não muda o prazo
        deste.
      </p>
      <label className="block text-xs" htmlFor={`${uid}-p-exercicio`}>
        <span className={ROTULO}>Exercício</span>
        <select id={`${uid}-p-exercicio`} name="exercicio" required className={CAMPO}>
          {exercicios.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs" htmlFor={`${uid}-p-assunto`}>
        <span className={ROTULO}>Assunto</span>
        <select id={`${uid}-p-assunto`} name="assuntoId" required className={CAMPO}>
          <option value="">Escolha o assunto</option>
          {assuntos.map((a) => (
            <option key={a.id} value={a.id}>{a.rotulo}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs" htmlFor={`${uid}-p-setor`}>
        <span className={ROTULO}>Setor de entrada</span>
        <select id={`${uid}-p-setor`} name="setorAberturaId" required className={CAMPO}>
          <option value="">Escolha o setor</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>{s.rotulo}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs" htmlFor={`${uid}-p-contato`}>
        <span className={ROTULO}>Contato do requerente</span>
        <input id={`${uid}-p-contato`} name="contatoAnonimo" type="text" required minLength={5} className={CAMPO} />
      </label>
      <label className="block text-xs" htmlFor={`${uid}-p-texto`}>
        <span className={ROTULO}>Informação pedida</span>
        <textarea id={`${uid}-p-texto`} name="pedido" required minLength={10} rows={3} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>Protocolar pedido</button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormDistribuir({
  pedidoId,
  setores,
}: {
  readonly pedidoId: string;
  readonly setores: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(distribuirAction, {});
  const uid = useId();
  return (
    <form action={action} data-acao="distribuir-pedido" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Encaminhar ao setor</h3>
      <p className="text-xs text-[color:var(--color-ink-2)]">O processo tramita junto, no mesmo ato.</p>
      <label className="block text-xs" htmlFor={`${uid}-d-setor`}>
        <span className={ROTULO}>Setor de destino</span>
        <select id={`${uid}-d-setor`} name="setorDestinoId" required className={CAMPO}>
          <option value="">Escolha o setor</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>{s.rotulo}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs" htmlFor={`${uid}-d-motivo`}>
        <span className={ROTULO}>Por que este setor (registro interno)</span>
        <textarea id={`${uid}-d-motivo`} name="fundamentoInterno" required minLength={10} rows={2} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>Encaminhar</button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormReceber({ pedidoId }: { readonly pedidoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(receberAction, {});
  const uid = useId();
  return (
    <form action={action} data-acao="receber-pedido" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Receber no setor</h3>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Receber é ato de quem está no destino. Quem enviou não recebe em nome de quem não abriu.
      </p>
      <button type="submit" disabled={pendente} className={BOTAO}>Receber pedido</button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormProrrogar({
  pedidoId,
  motivoSeNaoPode,
}: {
  readonly pedidoId: string;
  readonly motivoSeNaoPode: string | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(prorrogarAction, {});
  const uid = useId();
  if (motivoSeNaoPode !== null) {
    return (
      <div className={CAIXA} data-sem-prorrogacao>
        <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Prorrogar o prazo</h3>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{motivoSeNaoPode}</p>
      </div>
    );
  }
  return (
    <form action={action} data-acao="prorrogar-pedido" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Prorrogar o prazo</h3>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        A prorrogação é motivada, e o requerente é avisado. São dois textos porque são duas coisas:
        o que instrui o processo e o que o cidadão lê.
      </p>
      <label className="block text-xs" htmlFor={`${uid}-pr-motivo`}>
        <span className={ROTULO}>Motivo (registro interno)</span>
        <textarea id={`${uid}-pr-motivo`} name="fundamentoInterno" required minLength={10} rows={2} className={AREA} />
      </label>
      <label className="block text-xs" htmlFor={`${uid}-pr-mensagem`}>
        <span className={ROTULO}>Mensagem ao requerente</span>
        <textarea id={`${uid}-pr-mensagem`} name="mensagemAoRequerente" required minLength={10} rows={2} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>Prorrogar</button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormResponder({ pedidoId, entregar }: { readonly pedidoId: string; readonly entregar: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(responderAction, {});
  const uid = useId();
  const id = entregar ? "entregar" : "previa";
  return (
    <form action={action} data-acao={`responder-pedido-${id}`} className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="entregar" value={entregar ? "sim" : "nao"} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
        {entregar ? "Entregar a resposta" : "Registrar uma prévia"}
      </h3>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        {entregar
          ? "A entrega é o ato: ela inicia o prazo de recurso e aparece para o requerente. Negar o acesso exige fundamento."
          : "A prévia é o texto que o setor preparou e ainda NÃO entregou. Ela não aparece para o requerente e não inicia prazo nenhum."}
      </p>
      {entregar ? (
        <>
          <label className="block text-xs" htmlFor={`${uid}-r-classificacao`}>
            <span className={ROTULO}>Classificação da resposta</span>
            <select id={`${uid}-r-classificacao`} name="classificacao" required className={CAMPO}>
              <option value="ACESSO_CONCEDIDO">Acesso concedido</option>
              <option value="ACESSO_PARCIAL">Acesso parcial</option>
              <option value="ACESSO_NEGADO">Acesso negado</option>
            </select>
          </label>
          <label className="block text-xs" htmlFor={`${uid}-r-mensagem`}>
            <span className={ROTULO}>Mensagem ao requerente</span>
            <textarea id={`${uid}-r-mensagem`} name="mensagemAoRequerente" required minLength={10} rows={3} className={AREA} />
          </label>
        </>
      ) : null}
      <label className="block text-xs" htmlFor={`${uid}-r-fundamento`}>
        <span className={ROTULO}>Fundamento (registro interno)</span>
        <textarea id={`${uid}-r-fundamento`} name="fundamentoInterno" rows={2} required={!entregar} minLength={entregar ? 0 : 10} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>
        {entregar ? "Entregar resposta" : "Registrar prévia"}
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormInterporRecurso({
  pedidoId,
  motivoSeNaoPode,
}: {
  readonly pedidoId: string;
  readonly motivoSeNaoPode: string | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(interporAction, {});
  const uid = useId();
  if (motivoSeNaoPode !== null) {
    return (
      <div className={CAIXA} data-sem-recurso>
        <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Registrar recurso do requerente</h3>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{motivoSeNaoPode}</p>
      </div>
    );
  }
  return (
    <form action={action} data-acao="interpor-recurso" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Registrar recurso do requerente</h3>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        O recurso é ato do requerente; quem o registra é o setor que o recebe. As razões ficam como ele as escreveu.
      </p>
      <label className="block text-xs" htmlFor={`${uid}-rc-razoes`}>
        <span className={ROTULO}>Razões do recurso</span>
        <textarea id={`${uid}-rc-razoes`} name="razoes" required minLength={10} rows={3} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>Registrar recurso</button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormDecidirRecurso({ pedidoId }: { readonly pedidoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(decidirRecursoAction, {});
  const uid = useId();
  return (
    <form action={action} data-acao="decidir-recurso" className={`${CAIXA} space-y-3`}>
      <ChaveDeComando />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Decidir o recurso</h3>
      <label className="block text-xs" htmlFor={`${uid}-dr-resultado`}>
        <span className={ROTULO}>Resultado</span>
        <select id={`${uid}-dr-resultado`} name="resultado" required className={CAMPO}>
          <option value="PROVIDO">Provido</option>
          <option value="PROVIDO_EM_PARTE">Provido em parte</option>
          <option value="DESPROVIDO">Desprovido</option>
        </select>
      </label>
      <label className="block text-xs" htmlFor={`${uid}-dr-mensagem`}>
        <span className={ROTULO}>Mensagem ao requerente</span>
        <textarea id={`${uid}-dr-mensagem`} name="mensagemAoRequerente" required minLength={10} rows={3} className={AREA} />
      </label>
      <label className="block text-xs" htmlFor={`${uid}-dr-fundamento`}>
        <span className={ROTULO}>Fundamento (registro interno)</span>
        <textarea id={`${uid}-dr-fundamento`} name="fundamentoInterno" rows={2} className={AREA} />
      </label>
      <button type="submit" disabled={pendente} className={BOTAO}>Decidir recurso</button>
      <Mensagens estado={estado} />
    </form>
  );
}
