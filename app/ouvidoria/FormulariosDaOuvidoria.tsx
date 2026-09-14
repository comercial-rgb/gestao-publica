"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../components/ui/Formulario";
import { acompanharAction, manifestarAction, opinarAction, type EstadoDaManifestacao, type EstadoDaOpiniao, type EstadoDoAcompanhamento } from "./actions";

/**
 * AS ILHAS PÚBLICAS DA OUVIDORIA E DA OPINIÃO (V7 M1 U4).
 *
 * ⚠️ O SEGREDO APARECE UMA VEZ, nesta ilha, depois do registro. Não vai para a URL, para o
 * armazenamento do navegador nem para outra página; recarregar some com ele — e a tela diz isso antes.
 */

const ERRO = "mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]";
const OK = "whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]";

interface CampoDaTela {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: "texto" | "textoLongo" | "data" | "email" | "telefone";
  readonly obrigatorio: boolean;
}

const TIPO_DO_INPUT: Readonly<Record<string, string>> = { texto: "text", data: "date", email: "email", telefone: "tel" };

export function FormManifestacao({ slug, campos, tipos, termoDeAceite }: {
  readonly slug: string;
  readonly campos: readonly CampoDaTela[];
  readonly tipos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly termoDeAceite: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaManifestacao, FormData>(manifestarAction, {});
  const base = useId();
  if (estado.protocolo !== undefined && estado.segredo !== undefined) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO} data-manifestacao-registrada>
        <p role="status" data-resultado-da-acao="registrar-manifestacao" data-resultado-seq="1" className={OK}>
          Manifestação registrada sob o protocolo <strong data-protocolo-da-manifestacao>{estado.protocolo}</strong>.
        </p>
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-4 text-sm text-[color:var(--color-status-alerta-fg)]">
          <p className="font-semibold">Anote agora o código de acompanhamento</p>
          <p className="mt-2 break-all font-mono text-lg tracking-wider" data-segredo-da-manifestacao>{estado.segredo}</p>
          <p className="mt-2">
            Ele aparece só esta vez. O ente não guarda o código em claro e não consegue reenviá-lo: sem ele, não há como acompanhar a
            resposta. Não o compartilhe — quem tiver o protocolo e o código lê as respostas da ouvidoria.
          </p>
        </div>
        <p className="mt-4 text-sm"><Link href="/ouvidoria/acompanhar" className="text-[color:var(--color-primary)] underline">Acompanhar uma manifestação</Link></p>
      </div>
    );
  }
  return (
    <form action={disparar} data-acao="registrar-manifestacao" className={CLASSE_PAINEL_FORMULARIO}>
      <input type="hidden" name="__servico" value={slug} />
      <fieldset className="mb-4">
        <legend className={CLASSE_ROTULO}>Tipo de manifestação</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {tipos.map((t, i) => (
            <label key={t.valor} className="flex min-h-11 items-center gap-2 text-sm text-[color:var(--color-ink)]">
              <input type="radio" name="tipo" value={t.valor} defaultChecked={i === 0} required className="h-4 w-4" />
              <span>{t.rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4">
        {campos.map((c) => (
          <label key={c.nome} htmlFor={`${base}-${c.nome}`} className="text-xs text-[color:var(--color-ink-2)]">
            <span className={CLASSE_ROTULO}>{c.rotulo}{c.obrigatorio ? " (obrigatório)" : ""}</span>
            {c.tipo === "textoLongo" ? (
              <textarea id={`${base}-${c.nome}`} name={`resposta.${c.nome}`} required={c.obrigatorio} maxLength={5000} className={CLASSE_AREA_TEXTO} />
            ) : (
              <input id={`${base}-${c.nome}`} name={`resposta.${c.nome}`} type={TIPO_DO_INPUT[c.tipo] ?? "text"} required={c.obrigatorio} maxLength={300} className={CLASSE_CAMPO} />
            )}
          </label>
        ))}
        <label htmlFor={`${base}-contato`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={CLASSE_ROTULO}>Contato (opcional)</span>
          <input id={`${base}-contato`} name="contato" type="text" maxLength={200} aria-describedby={`${base}-contato-ajuda`} className={CLASSE_CAMPO} />
          <span id={`${base}-contato-ajuda`} className="mt-1 block">Deixe em branco para manter a manifestação anônima. Se informar, só a ouvidoria vê.</span>
        </label>
      </div>
      {termoDeAceite !== null ? (
        <label className="mt-4 flex items-start gap-2 text-sm text-[color:var(--color-ink)]">
          <input type="checkbox" name="aceitouTermo" value="sim" required className="mt-1 h-4 w-4" />
          <span className="whitespace-pre-line">{termoDeAceite}</span>
        </label>
      ) : null}
      {estado.erro !== undefined ? <p role="alert" className={ERRO}>{estado.erro}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Registrando…" : "Registrar manifestação"}</button>
    </form>
  );
}

export function FormAcompanhar(): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoAcompanhamento, FormData>(acompanharAction, {});
  const base = useId();
  return (
    <div className="space-y-4">
      <form action={disparar} data-acao="acompanhar-manifestacao" className={CLASSE_PAINEL_FORMULARIO} autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor={`${base}-protocolo`} className="text-xs text-[color:var(--color-ink-2)]">
            <span className={CLASSE_ROTULO}>Protocolo</span>
            <input id={`${base}-protocolo`} name="protocolo" required placeholder="12/2026" inputMode="numeric" maxLength={15} className={CLASSE_CAMPO} />
          </label>
          <label htmlFor={`${base}-segredo`} className="text-xs text-[color:var(--color-ink-2)]">
            <span className={CLASSE_ROTULO}>Código de acompanhamento</span>
            <input id={`${base}-segredo`} name="segredo" type="password" required minLength={20} maxLength={40} spellCheck={false} className={CLASSE_CAMPO} />
          </label>
        </div>
        {estado.erro !== undefined ? <p role="alert" className={ERRO}>{estado.erro}</p> : null}
        <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Consultando…" : "Consultar"}</button>
      </form>
      {estado.naoEncontrada === true ? (
        <p role="status" data-manifestacao-nao-encontrada className="text-sm text-[color:var(--color-ink-2)]">Nenhuma manifestação com esse protocolo e esse código. Confira os dois — a resposta é a mesma para protocolo inexistente e código errado.</p>
      ) : null}
      {estado.resultado !== undefined ? (
        <section className={CLASSE_PAINEL_FORMULARIO} data-acompanhamento={estado.resultado.situacao} aria-live="polite">
          <h2 className="text-base font-semibold text-[color:var(--color-ink)]">Manifestação {estado.resultado.protocolo}</h2>
          <p className="mt-1 text-sm"><strong>Situação:</strong> {estado.resultado.rotuloDaSituacao}</p>
          <p className="text-xs text-[color:var(--color-ink-3)]">Recebida em {estado.resultado.recebidaEm}</p>
          {estado.resultado.respostas.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">Ainda sem resposta da ouvidoria.</p>
          ) : (
            <ol className="mt-3 space-y-3" data-respostas-da-ouvidoria>
              {estado.resultado.respostas.map((r, i) => (
                <li key={i} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-sm">
                  <p className="text-xs text-[color:var(--color-ink-3)]">{r.em}{r.conclusiva ? " · resposta conclusiva" : ""}</p>
                  <p className="mt-1 whitespace-pre-line">{r.texto}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}

export interface EscalaDaTela {
  readonly minima: number;
  readonly maxima: number;
  readonly rotulos: readonly { readonly nota: number; readonly rotulo: string }[];
}

const DIMENSOES = [
  { nome: "satisfacao", rotulo: "Satisfação com o serviço" },
  { nome: "atendimento", rotulo: "Atendimento recebido" },
  { nome: "prazos", rotulo: "Cumprimento de prazos e compromissos" },
] as const;

/** As três dimensões em escala de rádios (rótulo por ponto) e a descrição privada. Só apresentação. */
export function CamposDaAvaliacao({ escala, idBase }: { readonly escala: EscalaDaTela; readonly idBase: string }): React.ReactElement {
  return (
    <>
      {DIMENSOES.map((d) => (
        <fieldset key={d.nome} className="mb-4" data-dimensao={d.nome}>
          <legend className={CLASSE_ROTULO}>{d.rotulo}</legend>
          <div className="flex flex-wrap gap-2">
            {escala.rotulos.map((r) => (
              <label key={r.nota} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-sm text-[color:var(--color-ink)] has-[:checked]:border-[color:var(--color-primary)] has-[:checked]:font-semibold">
                <input type="radio" name={d.nome} value={r.nota} required className="h-4 w-4" />
                <span>{r.nota} — {r.rotulo}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label htmlFor={`${idBase}-descricao`} className="text-xs text-[color:var(--color-ink-2)]">
        <span className={CLASSE_ROTULO}>Descrição (opcional)</span>
        <textarea id={`${idBase}-descricao`} name="descricao" maxLength={2000} aria-describedby={`${idBase}-descricao-ajuda`} className={CLASSE_AREA_TEXTO} />
        <span id={`${idBase}-descricao-ajuda`} className="mt-1 block">A descrição não é publicada: vai para quem modera as avaliações. Não inclua dados pessoais.</span>
      </label>
    </>
  );
}

export function FormOpiniao({ slug, escala }: { readonly slug: string; readonly escala: EscalaDaTela }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaOpiniao, FormData>(opinarAction, {});
  const base = useId();
  return (
    <form action={disparar} data-acao="opinar-sobre-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <input type="hidden" name="__servico" value={slug} />
      <CamposDaAvaliacao escala={escala} idBase={base} />
      {estado.erro !== undefined ? <p role="alert" className={ERRO}>{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="opinar-sobre-servico" data-resultado-seq="1" className={`mt-3 ${OK}`}>{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Enviando…" : "Enviar opinião"}</button>
    </form>
  );
}
