"use client";

import { useActionState, useRef } from "react";
import { CampoCpfCnpj, CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { empenharAction, type EstadoEmpenho } from "./actions";

/**
 * A ficha como ESTE form a consome.
 *
 * ⚠️ DECLARADA AQUI, e não importada de `lib/portas/empenho`. Seria `import type` (some
 * na compilação, não bundla o Prisma), mas o grep trivalente é TEXTUAL e barra qualquer
 * `from ".../lib/portas/"` numa ilha client — e ele está certo em ser cego: a diferença
 * entre `import type` e `import` é uma palavra que alguém apaga sem perceber, e aí o
 * Prisma vai para o browser (ou o build quebra, no melhor caso). O form declara o que
 * precisa; a página mapeia. É o mesmo padrão das outras três frentes.
 */
export interface FichaParaEmpenho {
  readonly id: string;
  readonly numero: number;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly saldoDisponivel: string;
}

/**
 * FORM DE EMPENHO — ilha client, Server Action autenticada.
 *
 * ⚠️ A CATEGORIA DA ORDEM CRONOLÓGICA NASCE VAZIA, de propósito. O `zEmpenharInput`
 * recusa empenho sem contrato e sem categoria, e o comentário dele diz por quê: um
 * default a faria virar FORNECIMENTO_BENS em silêncio, e a fila de obras se misturaria
 * com a de bens sem ninguém perceber. O `required` do select repete a regra do domínio
 * na tela — não a substitui.
 */
export function FormEmpenho({
  fichas,
}: {
  readonly fichas: readonly FichaParaEmpenho[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoEmpenho, FormData>(
    empenharAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (fichas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Sem fichas neste recorte
        </strong>{" "}
        — não há onde empenhar. A despesa sai da dotação de uma ficha da LOA; sem ficha,
        o empenho não tem contra o quê ser emitido.
      </div>
    );
  }

  return (
    <form
      ref={ref}
      action={action}
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Emitir empenho
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Ficha (dotação)</span>
          <select name="fichaId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha a ficha…
            </option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.naturezaCodigo} {f.naturezaDescricao} · fonte{" "}
                {f.fonteCodigo} · disponível {f.saldoDisponivel}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da nota</span>
          <input name="numero" required placeholder="2026NE000001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Credor (CPF/CNPJ)</span>
          {/*
            ⚠️ O `minLength={11}` SAIU com a máscara, e não foi um afrouxamento. Ele contava
            caracteres do que se digita, e agora o que se digita é pontuado: um CPF mascarado tem
            14 caracteres e um CNPJ 18, então o 11 nunca mais dispararia — seria um guard morto
            fingindo guardar. Quem mede o comprimento continua sendo o domínio, sobre os DÍGITOS
            que o hidden submete (`zEmpenharInput`, `min(11)`).
          */}
          <CampoCpfCnpj name="credor" required placeholder="12.345.678/0001-99" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required placeholder="10.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do empenho</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" defaultValue="ORDINARIO" className={CAMPO}>
            <option value="ORDINARIO">Ordinário</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVO">Estimativo</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Categoria (art. 141)</span>
          {/* ⚠️ defaultValue="" — ver o cabeçalho: sem default, por decisão do domínio. */}
          <select name="categoria" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="FORNECIMENTO_BENS">Fornecimento de bens</option>
            <option value="LOCACAO">Locação</option>
            <option value="PRESTACAO_SERVICOS">Prestação de serviços</option>
            <option value="REALIZACAO_OBRAS">Realização de obras</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="aquisição de material de expediente — processo 2026/001"
            className={CAMPO}
          />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? "Emitindo…" : "Emitir empenho"}
      </button>
    </form>
  );
}
