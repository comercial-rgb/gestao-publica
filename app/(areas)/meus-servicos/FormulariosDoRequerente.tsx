"use client";

import Link from "next/link";
import { useActionState, useId, useRef } from "react";
import { ChaveDeComando } from "../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../components/ui/Formulario";
import { CamposDaAvaliacao, type EscalaDaTela } from "../../(publico)/ouvidoria/FormulariosDaOuvidoria";
import { anexarDoRequerenteAction, avaliarAtendimentoAction, protocolarAction, responderExigenciaAction, type EstadoDoRequerente } from "./actions";

/**
 * AS ILHAS DO REQUERENTE — o formulário do serviço (os campos vêm da VERSÃO publicada, por prop), a
 * resposta à exigência e o envio de documento.
 *
 * ⚠️ OS CAMPOS SÃO OS DA VERSÃO, e o servidor os confere de novo contra a versão publicada no instante
 * do protocolo. Se outra versão for publicada entre abrir e enviar, o envio é recusado nomeando o campo.
 */

interface CampoDaTela {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: "texto" | "textoLongo" | "data" | "email" | "telefone";
  readonly obrigatorio: boolean;
}

function Mensagens({ estado }: { readonly estado: EstadoDoRequerente }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-sucesso className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

const TIPO_DO_INPUT: Readonly<Record<string, string>> = { texto: "text", data: "date", email: "email", telefone: "tel" };

export function FormSolicitar({ slug, campos, titulares, termoDeAceite }: {
  readonly slug: string;
  readonly campos: readonly CampoDaTela[];
  readonly titulares: readonly { readonly valor: string; readonly nome: string; readonly documento: string; readonly via: "PROPRIO" | "REPRESENTACAO" }[];
  readonly termoDeAceite: string | null;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoRequerente, FormData>(protocolarAction, {});
  const base = useId();
  if (estado.solicitacaoId !== undefined) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO} data-protocolada={estado.solicitacaoId}>
        {/* O formulário sai de cena com o protocolo: o resultado fica no marcador que a barra do molde usa. */}
        <p role="status" data-resultado-da-acao="protocolar-solicitacao" data-resultado-seq="1" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
        <p className="mt-3 text-sm"><Link href={`/meus-servicos/${estado.solicitacaoId}`} className="text-[color:var(--color-primary)] underline">Acompanhar esta solicitação</Link></p>
      </div>
    );
  }
  return (
    <form action={disparar} data-acao="protocolar-solicitacao" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__servico" value={slug} />
      <fieldset className="mb-4">
        <legend className={CLASSE_ROTULO}>Em nome de quem</legend>
        {titulares.map((t) => (
          <label key={t.valor} className="mb-1 flex items-center gap-2 text-sm text-[color:var(--color-ink)]">
            <input type="radio" name="titular" value={t.valor} defaultChecked={t === titulares[0]} required className="h-4 w-4" />
            <span>{t.nome} — {t.documento}{t.via === "REPRESENTACAO" ? " (empresa/pessoa que você representa)" : " (você)"}</span>
          </label>
        ))}
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
      </div>
      {termoDeAceite !== null ? (
        <label className="mt-4 flex items-start gap-2 text-sm text-[color:var(--color-ink)]">
          <input type="checkbox" name="aceitouTermo" value="sim" required className="mt-1 h-4 w-4" />
          <span className="whitespace-pre-line">{termoDeAceite}</span>
        </label>
      ) : null}
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Protocolando…" : "Protocolar solicitação"}</button>
    </form>
  );
}

/**
 * ⚠️ A ILHA FICA MONTADA MESMO SEM EXIGÊNCIA PENDENTE. Respondida a exigência, a página recarrega e não
 * há mais o que responder; se a página trocasse a ilha por nada, o aviso de "resposta enviada" sumiria
 * junto (o percurso P3 leu silêncio assim). Quem decide se o formulário aparece é esta ilha, pelo
 * `pendente` que o servidor projetou — o estado da ação sobrevive à recarga.
 */
export function FormResponderExigencia({ solicitacaoId, pendente, motivo }: { readonly solicitacaoId: string; readonly pendente: boolean; readonly motivo: string | null }): React.ReactElement | null {
  const [estado, disparar, carregando] = useActionState<EstadoDoRequerente, FormData>(responderExigenciaAction, {});
  const id = useId();
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  if (!pendente) {
    if (estado.sucesso === undefined) return null;
    return <p role="status" data-resultado-da-acao="responder-exigencia" data-resultado-seq="1" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  }
  if (motivo !== null) return <p className="text-sm">{motivo}</p>;
  return (
    <form ref={ref} action={disparar} data-acao="responder-exigencia" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={solicitacaoId} />
      <label htmlFor={id} className={CLASSE_ROTULO}>Sua resposta à exigência</label>
      <textarea id={id} name="texto" required minLength={5} className={CLASSE_AREA_TEXTO} />
      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Se a exigência pede documento, envie o arquivo abaixo antes de responder.</p>
      <Mensagens estado={estado} />
      <button type="submit" disabled={carregando} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{carregando ? "Enviando…" : "Enviar resposta"}</button>
    </form>
  );
}

export function FormDocumentoDoRequerente({ solicitacaoId, accept, tamanhoMaximoBytes }: { readonly solicitacaoId: string; readonly accept: string; readonly tamanhoMaximoBytes: number }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoRequerente, FormData>(anexarDoRequerenteAction, {});
  const id = useId();
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  return (
    <form ref={ref} action={disparar} data-acao="enviar-documento" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={solicitacaoId} />
      <label htmlFor={id} className={CLASSE_ROTULO}>Enviar documento</label>
      <input id={id} aria-describedby={`${id}-ajuda`} type="file" name="arquivo" accept={accept} required className={CLASSE_CAMPO} />
      <p id={`${id}-ajuda`} className="mt-1 text-xs text-[color:var(--color-ink-2)]">Até {(tamanhoMaximoBytes / 1024 / 1024).toFixed(0)} MB. PDF, DOC, DOCX, XLS, XLSX, ODT, JPG ou PNG. O arquivo fica ligado à sua solicitação com a verificação SHA-256 calculada no envio.</p>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Enviando…" : "Enviar documento"}</button>
    </form>
  );
}

/** V7 M1 U4 — a avaliação do atendimento, depois da decisão. Avaliar de novo revisa a anterior. */
export function FormAvaliarAtendimento({ solicitacaoId, escala, jaAvaliou }: { readonly solicitacaoId: string; readonly escala: EscalaDaTela; readonly jaAvaliou: boolean }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoRequerente, FormData>(avaliarAtendimentoAction, {});
  const id = useId();
  return (
    <form action={disparar} data-acao="avaliar-atendimento" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={solicitacaoId} />
      <CamposDaAvaliacao escala={escala} idBase={id} />
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Enviando…" : jaAvaliou ? "Revisar avaliação" : "Enviar avaliação"}</button>
    </form>
  );
}
