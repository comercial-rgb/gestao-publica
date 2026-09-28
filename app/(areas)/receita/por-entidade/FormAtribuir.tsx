"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { atribuirEntidadeAction, type EstadoDaAtribuicao } from "./actions";

export interface OpcaoDeEntidade {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

export interface OpcaoDeAto {
  readonly codigo: string;
  readonly rotulo: string;
}

/**
 * ═══ O PROVEDOR DA FILA (V11 V9.3) — `MENSAGEM-SOME-COM-A-LINHA` ═══
 *
 * ⚠️ A CONFIRMAÇÃO MORRIA COM A LINHA, e o formulário já se defendia do que NÃO era a causa:
 * ele fechava no sucesso e renderizava o resultado também no ramo fechado. Não bastava, pela
 * mesma razão medida na anulação de guia — quem some não é o formulário, é o `<li>`. A fila é
 * a das guias NÃO ATRIBUÍDAS; atribuída, a guia sai da fila, o item inteiro é desmontado, e
 * leva junto a mensagem que acabou de receber.
 *
 * O percurso J9 vinha notando isso desde a V9.2, no passo 9.5: "a tela não confirmou por
 * escrito; o efeito é conferido a seguir". Conferir o efeito é o certo — mas o servidor
 * municipal que atribui uma guia de receita a uma entidade não tem rodapé para conferir: ele
 * precisa ler que o ato foi gravado.
 *
 * Mesma cura do guichê (V8), do roteiro orçamentário (V8.4), da natureza das fontes e da
 * anulação de guia (V9.3): o estado do ato mora ACIMA da lista que ele muda.
 *
 * ⚠️ E "ACIMA DA LISTA" NÃO BASTOU — foi preciso ficar acima da SEÇÃO. Medido no passo 9.5 contra
 * o artefato `6789a1f`: com o provedor dentro da `<section>` da fila, atribuir a ÚLTIMA guia
 * pendente esvazia a fila, a seção deixa de ser renderizada (`pendentes.length > 0 ? … : null`) e
 * o aviso morre de novo — um invólucro mais externo, o mesmo defeito. Este componente morreu três
 * vezes antes de a regra ficar clara: **o aviso de um ato vive FORA de tudo o que o ato muda.**
 */
interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
  readonly sucessoDe: string | undefined;
}
const C = createContext<Ctx | null>(null);

export function AtribuicoesDaFila({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaAtribuicao, FormData>(
    atribuirEntidadeAction,
    {}
  );
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const marca = estado.sucesso ?? estado.erro;
  if (marca !== undefined && marca !== ultimo) {
    setUltimo(marca);
    setSeq((n) => n + 1);
  }

  return (
    <C.Provider value={{ action, pendente, sucessoDe: estado.sucesso }}>
      {marca === undefined ? null : (
        <p
          role={estado.erro !== undefined ? "alert" : "status"}
          data-resultado-da-acao="atribuir-entidade"
          data-resultado-seq={String(seq)}
          className={`mb-3 rounded-[var(--radius-md)] px-3 py-2 text-sm ${
            estado.erro !== undefined
              ? "bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]"
              : "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]"
          }`}
        >
          {estado.erro ?? estado.sucesso}
        </p>
      )}
      {children}
    </C.Provider>
  );
}

export function FormAtribuir({
  receitaArrecadadaId,
  numeroReceita,
  entidades,
  tiposDeAto,
}: {
  readonly receitaArrecadadaId: string;
  readonly numeroReceita: string;
  readonly entidades: readonly OpcaoDeEntidade[];
  readonly tiposDeAto: readonly OpcaoDeAto[];
}): React.ReactElement {
  const ctx = useContext(C);
  const [aberto, setAberto] = useState(false);
  const [fechadoPor, setFechadoPor] = useState<string | undefined>(undefined);

  if (ctx === null) {
    return (
      <span className="text-xs text-[color:var(--color-status-erro-fg)]">
        Atribuição indisponível nesta tela.
      </span>
    );
  }
  // ⚠️ FECHA NO SUCESSO — e só uma vez por sucesso, senão o painel não reabriria para a guia
  // seguinte enquanto a mensagem anterior estivesse na tela.
  if (ctx.sucessoDe !== undefined && ctx.sucessoDe !== fechadoPor) {
    setFechadoPor(ctx.sucessoDe);
    if (aberto) setAberto(false);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs underline"
        data-papel={`atribuir-${numeroReceita}`}
      >
        Atribuir entidade a esta guia
      </button>
    );
  }

  return (
    <form
      action={ctx.action}
      className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
    >
      <ChaveDeComando />
      <input type="hidden" name="receitaArrecadadaId" value={receitaArrecadadaId} />
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
        A atribuição <strong>não altera a guia</strong>: é registrada com o responsável, o motivo e o
        ato que a fundamenta. O ato deve mencionar a entidade escolhida.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Entidade titular</span>
          <select name="entidadeId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a entidade…</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} — {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={5} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tipo do ato</span>
          <select name="atoTipo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {tiposDeAto.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Número do ato</span>
          <input name="atoNumero" required className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Ano do ato</span>
          <input name="atoAno" required inputMode="numeric" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Dispositivo</span>
          <input name="atoDispositivo" required className={CAMPO} placeholder="art. 2º" />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Trecho citado do ato</span>
          <textarea name="atoCitacao" required rows={3} className={CAMPO} />
        </label>
      </div>
      <button type="submit" disabled={ctx.pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>
        {ctx.pendente ? "Atribuindo…" : "Atribuir entidade"}
      </button>
    </form>
  );
}
