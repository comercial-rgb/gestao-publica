"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { encaminharAction, receberAction, responderAction, triarAction, type EstadoDaOuvidoria } from "./actions";

/** As ilhas da mesa da ouvidoria: triagem (tipo confirmado + anotação interna) e resposta ao manifestante. */

function Mensagens({ estado, acao }: { readonly estado: EstadoDaOuvidoria; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} data-resultado-seq="1" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

export function FormTriagem({ manifestacaoId, protocolo, tipos, tipoInformado, motivo }: {
  readonly manifestacaoId: string;
  readonly protocolo: string;
  readonly tipos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly tipoInformado: string;
  readonly motivo: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(triarAction, {});
  const id = useId();
  if (motivo !== null) return estado.sucesso !== undefined ? <Mensagens estado={estado} acao="triar-manifestacao" /> : <p className="text-xs text-[color:var(--color-ink-2)]" data-motivo-da-triagem>Triagem: {motivo}</p>;
  return (
    <form action={disparar} data-acao="triar-manifestacao" data-manifestacao-alvo={protocolo} className="mt-3 grid gap-3 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={manifestacaoId} />
      <label htmlFor={`${id}-tipo`} className="text-xs">
        <span className={CLASSE_ROTULO}>Tipo confirmado</span>
        <select id={`${id}-tipo`} name="tipoConfirmado" defaultValue={tipoInformado} className={CLASSE_CAMPO}>
          {tipos.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-anotacao`} className="text-xs">
        <span className={CLASSE_ROTULO}>Anotação interna da triagem</span>
        <textarea id={`${id}-anotacao`} name="anotacaoInterna" required minLength={5} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={estado} acao="triar-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar triagem"}</button>
    </form>
  );
}

export function FormRespostaDaOuvidoria({ manifestacaoId, protocolo, motivo }: { readonly manifestacaoId: string; readonly protocolo: string; readonly motivo: string | null }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(responderAction, {});
  const id = useId();
  if (motivo !== null) return estado.sucesso !== undefined ? <Mensagens estado={estado} acao="responder-manifestacao" /> : <p className="text-xs text-[color:var(--color-ink-2)]" data-motivo-da-resposta>Resposta: {motivo}</p>;
  return (
    <form action={disparar} data-acao="responder-manifestacao" data-manifestacao-alvo={protocolo} className="mt-3 grid gap-3 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={manifestacaoId} />
      <label htmlFor={`${id}-texto`} className="text-xs">
        <span className={CLASSE_ROTULO}>Resposta ao manifestante</span>
        <textarea id={`${id}-texto`} name="texto" required minLength={10} aria-describedby={`${id}-ajuda`} className={CLASSE_AREA_TEXTO} />
        <span id={`${id}-ajuda`} className="mt-1 block text-[color:var(--color-ink-2)]">Este texto será exibido ao manifestante na consulta pelo código. Não inclua informações internas ou de terceiros.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="conclusiva" value="sim" className="h-4 w-4" />
        <span>Resposta conclusiva (encerra o processo)</span>
      </label>
      <Mensagens estado={estado} acao="responder-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar resposta"}</button>
    </form>
  );
}

/**
 * ═══ ENCAMINHAR A MANIFESTAÇÃO A OUTRO SETOR (V9 N3) ═══
 *
 * ⚠️ O MOTIVO É OBRIGATÓRIO, e não é burocracia: ele é o texto do movimento, é o que o setor de
 * destino lê para saber o que se espera dele, e é o que fica no histórico quando alguém perguntar,
 * meses depois, por que o caso foi parar ali. Um encaminhamento sem motivo chega como uma pasta
 * sobre a mesa, sem bilhete.
 *
 * ⚠️ O AGENTE NOMEADO É OPCIONAL de propósito. Encaminhar ao SETOR é o caso normal — qualquer
 * pessoa lotada lá pode trabalhar o caso. Nomear alguém restringe a notificação a essa pessoa, e
 * fazer disso o padrão faria manifestação parar na caixa de quem entrou de férias.
 */
export function FormEncaminharManifestacao({ processoId, protocolo, setores, motivo }: {
  readonly processoId: string;
  readonly protocolo: string;
  readonly setores: readonly { readonly id: string; readonly rotulo: string }[];
  readonly motivo: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(encaminharAction, {});
  const id = useId();
  if (motivo !== null) {
    return estado.sucesso !== undefined ? (
      <Mensagens estado={estado} acao="encaminhar-manifestacao" />
    ) : (
      <p className="mt-3 border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-ink-2)]" data-motivo-do-encaminhamento>
        Encaminhar: {motivo}
      </p>
    );
  }
  return (
    <form action={disparar} data-acao="encaminhar-manifestacao" data-manifestacao-alvo={protocolo} className="mt-3 grid gap-3 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__processo" value={processoId} />
      <label htmlFor={`${id}-setor`} className="text-xs">
        <span className={CLASSE_ROTULO}>Setor de destino</span>
        <select id={`${id}-setor`} name="setorDestinoId" required defaultValue="" className={CLASSE_CAMPO}>
          <option value="" disabled>Escolha o setor</option>
          {setores.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-agente`} className="text-xs">
        <span className={CLASSE_ROTULO}>Agente designado (opcional)</span>
        <input id={`${id}-agente`} name="usuarioDestino" type="text" placeholder="identificação do responsável" className={CLASSE_CAMPO} />
        <span className="mt-1 block text-[color:var(--color-ink-3)]">
          Se não for informado, qualquer servidor lotado no setor de destino poderá tratar a manifestação, e todos serão notificados.
        </span>
      </label>
      <label htmlFor={`${id}-motivo`} className="text-xs">
        <span className={CLASSE_ROTULO}>Motivo do encaminhamento</span>
        <textarea id={`${id}-motivo`} name="motivo" required minLength={5} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={estado} acao="encaminhar-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Encaminhando…" : "Encaminhar"}</button>
    </form>
  );
}

/** RECEBER no destino — separado do encaminhar porque é ato de OUTRA pessoa, em outro setor. */
export function FormReceberManifestacao({ processoId, protocolo, motivo }: {
  readonly processoId: string;
  readonly protocolo: string;
  readonly motivo: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOuvidoria, FormData>(receberAction, {});
  if (motivo !== null) {
    return estado.sucesso !== undefined ? (
      <Mensagens estado={estado} acao="receber-manifestacao" />
    ) : (
      <p className="mt-3 text-xs text-[color:var(--color-ink-2)]" data-motivo-do-recebimento>Receber: {motivo}</p>
    );
  }
  return (
    <form action={disparar} data-acao="receber-manifestacao" data-manifestacao-alvo={protocolo} className="mt-3 grid gap-2 border-t border-[color:var(--color-border)] pt-3">
      <ChaveDeComando />
      <input type="hidden" name="__processo" value={processoId} />
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Esta manifestação foi encaminhada para o seu setor e aguarda recebimento. O prazo da etapa
        passa a contar a partir do recebimento.
      </p>
      <Mensagens estado={estado} acao="receber-manifestacao" />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Recebendo…" : "Receber neste setor"}</button>
    </form>
  );
}
