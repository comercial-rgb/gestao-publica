"use client";

import { createContext, useContext, useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { declararNaturezaAction, type EstadoDaNatureza } from "./actions";

/**
 * O FORMULÁRIO DA NATUREZA DA FONTE (V11 V9.3).
 *
 * ⚠️ UM PROVEDOR PARA A TABELA INTEIRA, pela mesma razão medida da tela irmã dos roteiros
 * orçamentários: declarar muda a LINHA da fonte, e a confirmação guardada dentro dela morreria
 * junto com a linha que o React remonta.
 *
 * ⚠️ DENTRO DE UM `<details>`, e não atrás de um toggle de React. É a divulgação progressiva que
 * o resto do sistema usa, e é a que os percursos de navegador sabem abrir.
 *
 * ⚠️ SEM DEFAULT NA NATUREZA. Esta é exatamente a escolha que a pendência
 * `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` existia para NÃO tomar no lugar do ente — um default a
 * tomaria de novo, em silêncio, e classificaria FUNDEB como ordinário.
 */

export interface NaturezaEscolhivelNaTela {
  readonly valor: string;
  readonly rotulo: string;
  readonly conta: string;
}

interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
  readonly naturezas: readonly NaturezaEscolhivelNaTela[];
}
const C = createContext<Ctx | null>(null);

export function NaturezasDoEnte({
  naturezas,
  children,
}: {
  readonly naturezas: readonly NaturezaEscolhivelNaTela[];
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaNatureza, FormData>(
    declararNaturezaAction,
    {}
  );
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);

  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
  }

  return (
    <C.Provider value={{ action, pendente, naturezas }}>
      {estado.sucesso !== undefined ? (
        <p
          role="status"
          data-resultado-da-acao="declarar-natureza-da-fonte"
          data-resultado-seq={String(seq)}
          className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        >
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p
          role="alert"
          data-resultado-da-acao="declarar-natureza-da-fonte"
          className="mb-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {children}
    </C.Provider>
  );
}

export function FormDaNatureza({
  fonteCodigo,
  fonteDescricao,
  naturezaAtual,
  contaAtual,
}: {
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly naturezaAtual: string | null;
  readonly contaAtual: string | null;
}): React.ReactElement {
  const ctx = useContext(C);
  if (ctx === null) {
    return (
      <span className="text-xs text-[color:var(--color-status-erro-fg)]">
        Configuração indisponível nesta tela.
      </span>
    );
  }

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs underline">
        {naturezaAtual === null ? "Declarar a natureza" : "Reclassificar a fonte"}
      </summary>
      <form
        action={ctx.action}
        data-acao="declarar-natureza-da-fonte"
        data-fonte={fonteCodigo}
        className="mt-2 grid gap-3 text-xs sm:grid-cols-2"
        aria-label={`Declarar a natureza da fonte ${fonteCodigo} — ${fonteDescricao}`}
      >
        <ChaveDeComando />
        <input type="hidden" name="fonteCodigo" value={fonteCodigo} />

        <label className="text-xs">
          <span className={ROTULO}>Natureza do recurso</span>
          <select name="natureza" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a natureza…</option>
            {ctx.naturezas.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.rotulo} — {n.conta}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className={ROTULO}>Por que esta natureza</span>
          <input
            name="fundamento"
            required
            minLength={20}
            maxLength={500}
            placeholder="A lei ou o ato que vincula (ou não vincula) o recurso"
            className={CAMPO}
          />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={ctx.pendente} className={CLASSE_BOTAO_PRIMARIO}>
            {ctx.pendente ? "Declarando…" : "Declarar natureza"}
          </button>
          {contaAtual !== null ? (
            <span className="text-xs text-[color:var(--color-ink-3)]">
              Hoje escritura em {contaAtual}. Declarar cria uma versão — o que já foi arrecadado
              permanece na conta em que entrou.
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
