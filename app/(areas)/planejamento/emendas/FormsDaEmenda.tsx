"use client";

import { useActionState, useId, useRef, useState } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  bloquearDotacaoAction,
  cadastrarEmendaAction,
  liberarDotacaoAction,
  sancionarEmendaAction,
  type EstadoDaEmenda,
} from "./actions";

/**
 * V36 — OS ATOS DAS EMENDAS AO PROJETO DA LOA. Cada formulário fica montado no mesmo lugar e mostra a resposta do
 * servidor (sucesso ou recusa com o motivo) logo abaixo dele.
 */
function Resultado({ estado, nome }: { readonly estado: EstadoDaEmenda; readonly nome: string }): React.ReactElement | null {
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }
  if (texto === undefined) return null;
  return (
    <p
      className={
        estado.erro !== undefined
          ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
          : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
      }
      data-resultado-da-acao={nome}
      data-resultado-seq={seq}
      role={estado.erro !== undefined ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

const QUADRO = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3";

export function FormNovaEmenda({ propostaId }: { readonly propostaId: string }): React.ReactElement {
  const uid = useId();
  const id = (n: string): string => `${uid}-${n}`;
  const [estado, action, pendente] = useActionState<EstadoDaEmenda, FormData>(cadastrarEmendaAction, {});
  return (
    <section aria-labelledby={id("t")} className={QUADRO}>
      <h3 className="text-sm font-semibold" id={id("t")}>Registrar emenda</h3>
      <form action={action} className="mt-2 space-y-2" data-acao="cadastrar-emenda">
        <ChaveDeComando />
        <input name="propostaId" type="hidden" value={propostaId} />
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={id("d")}>Data (dd/mm/aaaa)</label>
            <input className={CAMPO} id={id("d")} name="data" required />
          </div>
          <div className="sm:col-span-2">
            <label className={ROTULO} htmlFor={id("v")}>Vereador responsável</label>
            <input className={CAMPO} id={id("v")} name="vereador" required />
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={id("o")}>Objetivo</label>
          <input className={CAMPO} id={id("o")} name="objetivo" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={id("j")}>Justificativa</label>
          <textarea className={`${CAMPO} h-16`} id={id("j")} name="justificativa" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={id("tj")}>Texto jurídico</label>
          <textarea className={`${CAMPO} h-16`} id={id("tj")} name="textoJuridico" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={id("i")}>Dotações, uma por linha: ficha; valor (redução com sinal de menos)</label>
          <textarea className={`${CAMPO} h-20 font-mono`} id={id("i")} name="itens" placeholder={"12; 50.000,00\n31; -50.000,00"} required />
        </div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando…" : "Registrar emenda"}</button>
      </form>
      <Resultado estado={estado} nome="cadastrar-emenda" />
    </section>
  );
}

export function FormsDoBloqueio({
  propostaId,
  bloqueadas,
}: {
  readonly propostaId: string;
  readonly bloqueadas: readonly { readonly bloqueioId: string; readonly rotulo: string }[];
}): React.ReactElement {
  const uid = useId();
  const id = (n: string): string => `${uid}-${n}`;
  const [eb, bloquear, pb] = useActionState<EstadoDaEmenda, FormData>(bloquearDotacaoAction, {});
  const [el, liberar, pl] = useActionState<EstadoDaEmenda, FormData>(liberarDotacaoAction, {});
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section aria-labelledby={id("tb")} className={QUADRO}>
        <h3 className="text-sm font-semibold" id={id("tb")}>Bloquear dotação para emendas</h3>
        <form action={bloquear} className="mt-2 space-y-2" data-acao="bloquear-dotacao">
          <ChaveDeComando />
          <input name="propostaId" type="hidden" value={propostaId} />
          <label className={ROTULO} htmlFor={id("bl")}>Número da ficha</label>
          <input className={CAMPO} id={id("bl")} inputMode="numeric" name="ficha" required />
          <label className={ROTULO} htmlFor={id("bm")}>Motivo</label>
          <input className={CAMPO} id={id("bm")} name="motivo" required />
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pb} type="submit">{pb ? "Gravando…" : "Bloquear"}</button>
        </form>
        <Resultado estado={eb} nome="bloquear-dotacao" />
      </section>
      <section aria-labelledby={id("tl")} className={QUADRO}>
        <h3 className="text-sm font-semibold" id={id("tl")}>Liberar dotação bloqueada</h3>
        {bloqueadas.length === 0 ? (
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Nenhuma dotação bloqueada.</p>
        ) : (
          <form action={liberar} className="mt-2 space-y-2" data-acao="liberar-dotacao">
            <ChaveDeComando />
            <label className={ROTULO} htmlFor={id("ll")}>Dotação bloqueada</label>
            <select className={CAMPO} defaultValue="" id={id("ll")} name="bloqueioId" required>
              <option value="">Escolha…</option>
              {bloqueadas.map((b) => <option key={b.bloqueioId} value={b.bloqueioId}>{b.rotulo}</option>)}
            </select>
            <label className={ROTULO} htmlFor={id("lm")}>Motivo</label>
            <input className={CAMPO} id={id("lm")} name="motivo" required />
            <button className={CLASSE_BOTAO_PRIMARIO} disabled={pl} type="submit">{pl ? "Gravando…" : "Liberar"}</button>
          </form>
        )}
        <Resultado estado={el} nome="liberar-dotacao" />
      </section>
    </div>
  );
}

/**
 * ⚠️ FICA MONTADO DEPOIS DA SANÇÃO (`sancionada`): a emenda deixa de aguardar e o formulário sai, mas o componente
 * continua no mesmo lugar para a resposta do servidor não sumir com ele — o defeito que o percurso acusou.
 */
export function FormSancao({
  emendaId,
  numero,
  itens,
  sancionada,
}: {
  readonly emendaId: string;
  readonly numero: number;
  readonly sancionada: boolean;
  readonly itens: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const uid = useId();
  const id = (n: string): string => `${uid}-${n}`;
  const [estado, action, pendente] = useActionState<EstadoDaEmenda, FormData>(sancionarEmendaAction, {});
  const [resultado, setResultado] = useState("APROVADA");
  return (
    <section aria-label={`Sanção da emenda nº ${String(numero)}`} className={sancionada ? "mt-2" : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-2"}>
      {sancionada ? null : <h4 className="text-xs font-semibold" id={id("t")}>Sanção da emenda nº {numero}</h4>}
      {sancionada ? null : (
      <form action={action} className="mt-1 space-y-2 text-xs" data-acao="sancionar-emenda" data-emenda={emendaId}>
        <ChaveDeComando />
        <input name="emendaId" type="hidden" value={emendaId} />
        <fieldset className="flex flex-wrap gap-3">
          <legend className={ROTULO}>Resultado</legend>
          {[
            ["APROVADA", "Aprovação total"],
            ["REJEITADA", "Reprovação total"],
            ["PARCIAL", "Sanção parcial"],
          ].map(([v, r]) => (
            <label className="flex items-center gap-1" key={v}>
              <input checked={resultado === v} name="resultado" onChange={() => setResultado(v!)} type="radio" value={v} />
              {r}
            </label>
          ))}
        </fieldset>
        {resultado === "PARCIAL" ? (
          <fieldset className="space-y-1">
            <legend className={ROTULO}>Dotações sancionadas</legend>
            {itens.map((i) => (
              <label className="flex items-center gap-1" key={i.id}>
                <input name="itemAprovado" type="checkbox" value={i.id} />
                {i.rotulo}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={id("d")}>Data (dd/mm/aaaa)</label>
            <input className={CAMPO} id={id("d")} name="data" required />
          </div>
          <div className="sm:col-span-2">
            <label className={ROTULO} htmlFor={id("a")}>Ato da sanção ou do veto</label>
            <input className={CAMPO} id={id("a")} name="ato" required />
          </div>
        </div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando…" : "Registrar sanção"}</button>
      </form>
      )}
      <Resultado estado={estado} nome={`sancionar-emenda-${String(numero)}`} />
    </section>
  );
}
