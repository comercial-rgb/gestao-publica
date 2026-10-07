"use client";

import { useActionState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import {
  acrescentarLoteAction,
  aprovarPreviaAction,
  criarPreviaAction,
  descartarPreviaAction,
  efetivarPreviaAction,
  type EstadoDaPrevia,
} from "./actions";
import { LINHAS_DO_LOTE } from "./linhas";

/** A ficha como ESTE form a consome (ilha client não importa de `lib/portas`). */
export interface FichaSugerida {
  readonly numero: number;
  readonly rotulo: string;
}

function Retorno({ estado, acao }: { readonly estado: EstadoDaPrevia; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return <p role="alert" data-resultado-da-acao={acao} className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  }
  if (estado.sucesso !== undefined) {
    return <p role="status" data-resultado-da-acao={acao} className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  }
  return null;
}

/** As linhas de um lote: ficha (digitada, com sugestão), suplementação ou anulação, valor. */
function LinhasDoLote({ fichas }: { readonly fichas: readonly FichaSugerida[] }): React.ReactElement {
  return (
    <>
      <datalist id="fichas-da-previa">
        {fichas.map((f) => (
          <option key={f.numero} value={String(f.numero)}>{f.rotulo}</option>
        ))}
      </datalist>
      <div className="mt-2 space-y-2">
        {Array.from({ length: LINHAS_DO_LOTE }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[8rem_14rem_10rem]" data-linha-do-lote={i}>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Ficha {i + 1}</span>
              <input name={`ficha${String(i)}`} list="fichas-da-previa" inputMode="numeric" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Movimento {i + 1}</span>
              <select name={`tipo${String(i)}`} defaultValue="SUPLEMENTACAO" className={CAMPO}>
                <option value="SUPLEMENTACAO">Suplementação (+)</option>
                <option value="ANULACAO">Anulação (−), bloqueia o valor</option>
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Valor {i + 1} (R$)</span>
              <CampoValor name={`valor${String(i)}`} placeholder="1.000,00" className={CAMPO} />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

/** V36 — a prévia nova, com o primeiro lote. */
export function FormNovaPrevia({ exercicio, fichas }: { readonly exercicio: number; readonly fichas: readonly FichaSugerida[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPrevia, FormData>(criarPreviaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Registrar prévia de alteração orçamentária" data-acao="criar-previa">
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <h2 className="mb-1 text-sm font-semibold">Nova prévia de alteração orçamentária</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Cada anulação bloqueia o valor na ficha a anular até a prévia ser efetivada ou descartada. Outros lotes podem ser acrescentados enquanto a prévia não for aprovada.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo de crédito</span>
          <select name="tipoCredito" required defaultValue="SUPLEMENTAR" className={CAMPO}>
            <option value="SUPLEMENTAR">Suplementar</option>
            <option value="ESPECIAL">Especial</option>
            <option value="EXTRAORDINARIO">Extraordinário</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Origem do recurso</span>
          <select name="origemRecurso" required defaultValue="ANULACAO" className={CAMPO}>
            <option value="ANULACAO">Anulação de dotações</option>
            <option value="SUPERAVIT_FINANCEIRO">Superávit financeiro</option>
            <option value="EXCESSO_ARRECADACAO">Excesso de arrecadação</option>
            <option value="OPERACAO_CREDITO">Operação de crédito</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-3">
          <span className={ROTULO}>Objeto da alteração</span>
          <input name="descricao" required minLength={10} className={CAMPO} placeholder="Reforço da dotação do transporte escolar" />
        </label>
      </div>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Movimentos do primeiro lote</h3>
      <LinhasDoLote fichas={fichas} />
      <Retorno estado={estado} acao="criar-previa" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Registrando..." : "Registrar a prévia"}</button>
    </form>
  );
}

export function FormAcrescentarLote({ previaId, fichas }: { readonly previaId: string; readonly fichas: readonly FichaSugerida[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPrevia, FormData>(acrescentarLoteAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Acrescentar lote à prévia" data-acao="acrescentar-lote">
      <ChaveDeComando />
      <input type="hidden" name="previaId" value={previaId} />
      <h2 className="mb-1 text-sm font-semibold">Acrescentar lote</h2>
      <LinhasDoLote fichas={fichas} />
      <Retorno estado={estado} acao="acrescentar-lote" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Acrescentando..." : "Acrescentar o lote"}</button>
    </form>
  );
}

export function FormAprovarPrevia({ previaId, hoje }: { readonly previaId: string; readonly hoje: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPrevia, FormData>(aprovarPreviaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Aprovar a prévia" data-acao="aprovar-previa">
      <ChaveDeComando />
      <input type="hidden" name="previaId" value={previaId} />
      <h2 className="mb-1 text-sm font-semibold">Aprovar</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A aprovação confere se as anulações cobrem as suplementações em cada fonte. Depois dela, a prévia não recebe novos lotes.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data da aprovação</span>
          <input name="dia" type="date" required max={hoje} defaultValue={hoje} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Parecer (opcional)</span>
          <input name="parecer" className={CAMPO} />
        </label>
      </div>
      <Retorno estado={estado} acao="aprovar-previa" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Aprovando..." : "Aprovar a prévia"}</button>
    </form>
  );
}

export function FormEfetivarPrevia({ previaId, hoje, leis }: { readonly previaId: string; readonly hoje: string; readonly leis: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPrevia, FormData>(efetivarPreviaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Efetivar a prévia" data-acao="efetivar-previa">
      <ChaveDeComando />
      <input type="hidden" name="previaId" value={previaId} />
      <h2 className="mb-1 text-sm font-semibold">Efetivar</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Gera o decreto com os movimentos da prévia, desfaz os bloqueios e registra a alteração e os lançamentos contábeis, de uma vez.</p>
      {leis.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">Não há lei de crédito do mesmo tipo no exercício. Cadastre a lei em Créditos adicionais.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Lei que autoriza</span>
            <select name="leiId" required defaultValue="" className={CAMPO}>
              <option value="" disabled>Escolha a lei</option>
              {leis.map((l) => (
                <option key={l.id} value={l.id}>{l.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Número do decreto</span>
            <input name="numero" required className={CAMPO} />
          </label>
          <label className="text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Data do decreto</span>
            <input name="dia" type="date" required max={hoje} defaultValue={hoje} className={CAMPO} />
          </label>
        </div>
      )}
      <Retorno estado={estado} acao="efetivar-previa" />
      {leis.length > 0 ? <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Efetivando..." : "Efetivar a prévia"}</button> : null}
    </form>
  );
}

export function FormDescartarPrevia({ previaId }: { readonly previaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPrevia, FormData>(descartarPreviaAction, {});
  return (
    <details className="text-sm" data-descartar-previa>
      <summary className="cursor-pointer text-[color:var(--color-primary)] underline">Descartar a prévia</summary>
      <form action={action} className={`mt-2 ${CLASSE_PAINEL_FORMULARIO}`} aria-label="Descartar a prévia" data-acao="descartar-previa">
        <ChaveDeComando />
        <input type="hidden" name="previaId" value={previaId} />
        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={5} className={CAMPO} />
        </label>
        <Retorno estado={estado} acao="descartar-previa" />
        <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Descartando..." : "Descartar e desfazer os bloqueios"}</button>
      </form>
    </details>
  );
}
