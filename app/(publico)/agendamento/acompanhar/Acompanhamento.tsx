"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  cancelarPublicoAction,
  consultarAction,
  type EstadoDaConsulta,
  type EstadoDoCancelamento,
} from "../actions";

/**
 * ACOMPANHAR E CANCELAR A MARCAÇÃO (V11 V8.1) — pelo código de acompanhamento.
 *
 * ⚠️ NÃO ENCONTRADA É UMA RESPOSTA SÓ. Código errado e código inexistente dizem a mesma coisa:
 * distinguir os dois transformaria a tela num oráculo de quais códigos existem.
 *
 * ⚠️ O CÓDIGO NÃO VAI PARA A URL. Ele é a credencial de quem marcou sem conta; num endereço, ele
 * entraria no histórico do navegador e no `Referer` de qualquer link clicado a partir daqui.
 */

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = {
  MARCADA: "Marcada — compareça no horário",
  CONFIRMADA: "Presença confirmada no atendimento",
  ATENDIDA: "Atendimento realizado",
  CANCELADA: "Cancelada",
};

export function Acompanhamento(): React.ReactElement {
  const [consulta, consultar, buscando] = useActionState<EstadoDaConsulta, FormData>(consultarAction, {});
  const [cancelamento, cancelar, cancelando] = useActionState<EstadoDoCancelamento, FormData>(cancelarPublicoAction, {});

  // ⚠️ A SEQUÊNCIA É CONTADA, NÃO FIXA. O formulário de consulta FICA na tela — consultar outro
  // código é o caso normal. Com a sequência cravada em "1", a segunda resposta seria idêntica à
  // primeira para quem lê a tela de fora (leitor de tela, percurso), e uma consulta que devolveu
  // "não encontramos" duas vezes seguidas pareceria não ter respondido a segunda.
  const [seqConsulta, setSeqConsulta] = useState(0);
  const [ultimaConsulta, setUltimaConsulta] = useState<string | undefined>(undefined);
  const [seqCancelamento, setSeqCancelamento] = useState(0);
  const [ultimoCancelamento, setUltimoCancelamento] = useState<string | undefined>(undefined);

  const r = consulta.reserva;
  const chaveDaConsulta =
    consulta.naoEncontrada === true ? "nao-encontrada" : r === undefined ? undefined : `${r.codigo}|${r.situacao}`;
  if (chaveDaConsulta !== undefined && chaveDaConsulta !== ultimaConsulta) {
    setUltimaConsulta(chaveDaConsulta);
    setSeqConsulta((n) => n + 1);
  }
  if (cancelamento.sucesso !== undefined && cancelamento.sucesso !== ultimoCancelamento) {
    setUltimoCancelamento(cancelamento.sucesso);
    setSeqCancelamento((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <form action={consultar} data-acao="consultar-marcacao" className={CLASSE_PAINEL_FORMULARIO} aria-label="Consultar a minha marcação">
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Acompanhar minha marcação</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          Use o código de acompanhamento que apareceu quando você marcou.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className={ROTULO}>Código de acompanhamento</span>
            <input name="segredo" required maxLength={40} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" className={`${CAMPO} font-mono`} />
          </label>
          <button type="submit" disabled={buscando} className={CLASSE_BOTAO_PRIMARIO}>
            {buscando ? "Procurando…" : "Consultar"}
          </button>
        </div>
        {consulta.erro !== undefined ? (
          <p role="alert" className="mt-3 text-xs text-[color:var(--color-status-erro-fg)]">{consulta.erro}</p>
        ) : null}
        {consulta.naoEncontrada === true ? (
          <p role="status" data-resultado-da-acao="consultar-marcacao" data-resultado-seq={String(seqConsulta)} className="mt-3 text-sm text-[color:var(--color-ink-2)]">
            Não encontramos nenhuma marcação com este código. Confira se digitou exatamente como
            recebeu — inclusive os hifens.
          </p>
        ) : null}
      </form>

      {r === undefined ? null : (
        <div
          role="status"
          data-resultado-da-acao="consultar-marcacao"
          data-resultado-seq={String(seqConsulta)}
          className={CLASSE_PAINEL_FORMULARIO}
        >
          <h2 className="text-base font-semibold">{r.servico}</h2>
          <p className="mt-1 text-sm">
            {r.unidade} — {r.endereco} ({r.guiche})
          </p>
          <p className="mt-2 text-sm">
            <strong data-teste="dia-da-marcacao">{r.dia.split("-").reverse().join("/")}</strong> às{" "}
            <strong data-teste="hora-da-marcacao">{r.hora}</strong> · {r.nome}
          </p>
          <p className="mt-2 text-sm">
            Situação: <strong data-teste="situacao-da-marcacao">{ROTULO_DA_SITUACAO[r.situacao] ?? r.situacao}</strong>
            {r.motivoDoCancelamento === null ? null : <span className="block text-xs text-[color:var(--color-ink-2)]">Motivo: {r.motivoDoCancelamento}</span>}
          </p>
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
            Número de atendimento: <span className="font-mono">{r.codigo}</span>. Leve um documento
            de identificação.
          </p>

          {/* ⚠️ O CANCELAMENTO SÓ APARECE ENQUANTO EXISTE. Atendida e cancelada não se cancelam —
              e quem recusa é o domínio; esconder o formulário é cortesia, não proteção. */}
          {r.situacao === "MARCADA" || r.situacao === "CONFIRMADA" ? (
            <form action={cancelar} data-acao="cancelar-minha-marcacao" className="mt-4 flex flex-wrap items-end gap-3 border-t border-[color:var(--color-border)] pt-3" aria-label="Cancelar a minha marcação">
              {/* ⚠️ O CÓDIGO É DIGITADO DE NOVO, de propósito. Guardá-lo num campo escondido
                  entre a consulta e o cancelamento o deixaria no HTML da página — e num
                  computador compartilhado, de lan house a balcão de biblioteca, a próxima pessoa
                  o encontraria vendo o código-fonte. */}
              <label className="text-xs">
                <span className={ROTULO}>Código de acompanhamento</span>
                <input name="segredo" required maxLength={40} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" className={`${CAMPO} font-mono`} />
              </label>
              <label className="text-xs">
                <span className={ROTULO}>Por que está cancelando?</span>
                <input name="motivo" required maxLength={240} className={CAMPO} />
              </label>
              <button type="submit" disabled={cancelando} className={CLASSE_BOTAO_PRIMARIO}>
                {cancelando ? "Cancelando…" : "Cancelar a marcação"}
              </button>
            </form>
          ) : null}
        </div>
      )}

      {cancelamento.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="cancelar-minha-marcacao" data-resultado-seq={String(seqCancelamento)} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {cancelamento.sucesso}
        </p>
      ) : null}
      {cancelamento.erro !== undefined ? (
        <p role="alert" className="text-sm text-[color:var(--color-status-erro-fg)]">{cancelamento.erro}</p>
      ) : null}
    </div>
  );
}
