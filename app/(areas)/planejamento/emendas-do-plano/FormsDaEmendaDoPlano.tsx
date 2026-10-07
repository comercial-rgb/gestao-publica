"use client";

import { useActionState, useId, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  bloquearLinhaAction,
  cadastrarEmendaDoPlanoAction,
  liberarLinhaAction,
  sancionarEmendaDoPlanoAction,
  type EstadoDaEmendaDoPlano,
} from "./actions";

/**
 * V36 — OS ATOS DAS EMENDAS AO PPA E À LDO. As opções de linha vêm prontas do servidor, uma por par linha × valor que
 * existe na peça; cada formulário mostra a resposta do servidor logo abaixo dele, e fica montado depois do envio.
 */
export interface OpcaoDeLinha {
  readonly valor: string;
  readonly rotulo: string;
}

function Resultado({ estado, nome }: { readonly estado: EstadoDaEmendaDoPlano; readonly nome: string }): React.ReactElement | null {
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
const ITENS = 5;

export function FormNovaEmendaDoPlano({ peca, linhas }: { readonly peca: string; readonly linhas: readonly OpcaoDeLinha[] }): React.ReactElement {
  const uid = useId();
  const id = (n: string): string => `${uid}-${n}`;
  const [estado, action, pendente] = useActionState<EstadoDaEmendaDoPlano, FormData>(cadastrarEmendaDoPlanoAction, {});
  return (
    <section aria-labelledby={id("t")} className={QUADRO}>
      <h3 className="text-sm font-semibold" id={id("t")}>Registrar emenda</h3>
      <form action={action} className="mt-2 space-y-2" data-acao="cadastrar-emenda-do-plano">
        <ChaveDeComando />
        <input name="peca" type="hidden" value={peca} />
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={id("d")}>Data</label>
            <input className={CAMPO} id={id("d")} name="data" required type="date" />
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
        <fieldset className="space-y-2">
          <legend className={ROTULO}>Linhas com acréscimo ou redução (redução com sinal de menos; deixe em branco as que não usar)</legend>
          {Array.from({ length: ITENS }, (_, k) => (
            <div className="grid gap-2 sm:grid-cols-3" data-item-da-emenda={k + 1} key={k}>
              <label className="text-xs sm:col-span-2">
                <span className="sr-only">Linha do item {k + 1}</span>
                <select className={CAMPO} defaultValue="" name="linha">
                  <option value="">Item {k + 1}: escolha a linha…</option>
                  {linhas.map((l) => <option key={l.valor} value={l.valor}>{l.rotulo}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="sr-only">Valor do item {k + 1}</span>
                <CampoValor className={CAMPO} name="valor" placeholder="50.000,00 ou -50.000,00" />
              </label>
            </div>
          ))}
        </fieldset>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando…" : "Registrar emenda"}</button>
      </form>
      <Resultado estado={estado} nome="cadastrar-emenda-do-plano" />
    </section>
  );
}

export function FormsDoBloqueioDoPlano({
  linhas,
  bloqueadas,
}: {
  readonly linhas: readonly OpcaoDeLinha[];
  readonly bloqueadas: readonly { readonly id: string; readonly rotulo: string }[];
}): React.ReactElement {
  const uid = useId();
  const id = (n: string): string => `${uid}-${n}`;
  const [eb, bloquear, pb] = useActionState<EstadoDaEmendaDoPlano, FormData>(bloquearLinhaAction, {});
  const [el, liberar, pl] = useActionState<EstadoDaEmendaDoPlano, FormData>(liberarLinhaAction, {});
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section aria-labelledby={id("tb")} className={QUADRO}>
        <h3 className="text-sm font-semibold" id={id("tb")}>Bloquear linha para emendas</h3>
        <form action={bloquear} className="mt-2 space-y-2" data-acao="bloquear-linha">
          <ChaveDeComando />
          <label className={ROTULO} htmlFor={id("bl")}>Linha</label>
          <select className={CAMPO} defaultValue="" id={id("bl")} name="linha" required>
            <option value="">Escolha…</option>
            {linhas.map((l) => <option key={l.valor} value={l.valor}>{l.rotulo}</option>)}
          </select>
          <label className={ROTULO} htmlFor={id("bm")}>Motivo</label>
          <input className={CAMPO} id={id("bm")} name="motivo" required />
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pb} type="submit">{pb ? "Gravando…" : "Bloquear"}</button>
        </form>
        <Resultado estado={eb} nome="bloquear-linha" />
      </section>
      <section aria-labelledby={id("tl")} className={QUADRO}>
        <h3 className="text-sm font-semibold" id={id("tl")}>Liberar linha bloqueada</h3>
        {bloqueadas.length === 0 ? (
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Nenhuma linha bloqueada.</p>
        ) : (
          <form action={liberar} className="mt-2 space-y-2" data-acao="liberar-linha">
            <ChaveDeComando />
            <label className={ROTULO} htmlFor={id("ll")}>Linha bloqueada</label>
            <select className={CAMPO} defaultValue="" id={id("ll")} name="bloqueioId" required>
              <option value="">Escolha…</option>
              {bloqueadas.map((b) => <option key={b.id} value={b.id}>{b.rotulo}</option>)}
            </select>
            <label className={ROTULO} htmlFor={id("lm")}>Motivo</label>
            <input className={CAMPO} id={id("lm")} name="motivo" required />
            <button className={CLASSE_BOTAO_PRIMARIO} disabled={pl} type="submit">{pl ? "Gravando…" : "Liberar"}</button>
          </form>
        )}
        <Resultado estado={el} nome="liberar-linha" />
      </section>
    </div>
  );
}

/** Fica montado depois da sanção (`sancionada`): o formulário sai, a resposta do servidor fica. */
export function FormSancaoDoPlano({
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
  const [estado, action, pendente] = useActionState<EstadoDaEmendaDoPlano, FormData>(sancionarEmendaDoPlanoAction, {});
  const [resultado, setResultado] = useState("APROVADA");
  return (
    <section aria-label={`Sanção da emenda nº ${String(numero)}`} className={sancionada ? "mt-2" : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-2"}>
      {sancionada ? null : (
        <form action={action} className="mt-1 space-y-2 text-xs" data-acao="sancionar-emenda-do-plano" data-emenda={emendaId}>
          <h4 className="text-xs font-semibold">Sanção da emenda nº {numero}</h4>
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
              <legend className={ROTULO}>Linhas sancionadas</legend>
              {itens.map((i) => (
                <label className="flex items-center gap-1" key={i.id}>
                  <input name="itemAprovado" type="checkbox" value={i.id} />
                  {i.rotulo}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className={ROTULO} htmlFor={id("n")}>Número da lei ou do ato</label>
              <input className={CAMPO} id={id("n")} name="leiNumero" required />
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("a")}>Ano</label>
              <input className={CAMPO} id={id("a")} inputMode="numeric" maxLength={4} name="leiAno" required />
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("d")}>Data</label>
              <input className={CAMPO} id={id("d")} name="data" required type="date" />
            </div>
            <div>
              <label className={ROTULO} htmlFor={id("p")}>Publicação</label>
              <input className={CAMPO} id={id("p")} name="dataPublicacao" required type="date" />
            </div>
          </div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando…" : "Registrar sanção"}</button>
        </form>
      )}
      <Resultado estado={estado} nome={`sancionar-emenda-do-plano-${String(numero)}`} />
    </section>
  );
}
