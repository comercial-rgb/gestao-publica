"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { declararDescontoAction, type EstadoDoDesconto } from "./actions";

/**
 * O FORMULÁRIO DA CONSIGNAÇÃO DE UMA RUBRICA DE DESCONTO (V28).
 *
 * ⚠️ UM PROVEDOR PARA A TABELA INTEIRA, como na natureza das fontes: declarar muda a linha da rubrica, e a
 * confirmação guardada dentro dela morreria junto com a linha que o React remonta.
 */

export interface TipoNaTela {
  readonly id: string;
  readonly rotulo: string;
}

interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
  readonly tipos: readonly TipoNaTela[];
}
const C = createContext<Ctx | null>(null);

export function DescontosDoEnte({ tipos, children }: { readonly tipos: readonly TipoNaTela[]; readonly children: React.ReactNode }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesconto, FormData>(declararDescontoAction, {});
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
  }
  return (
    <C.Provider value={{ action, pendente, tipos }}>
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="declarar-desconto-retido" data-resultado-seq={String(seq)} className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="declarar-desconto-retido" className="mb-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {children}
    </C.Provider>
  );
}

export function FormDesconto({ rubricaId, rubricaRotulo, declarada }: { readonly rubricaId: string; readonly rubricaRotulo: string; readonly declarada: boolean }): React.ReactElement {
  const ctx = useContext(C);
  if (ctx === null) return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Configuração indisponível nesta tela.</span>;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs underline">{declarada ? "Alterar a retenção" : "Declarar a retenção"}</summary>
      <form action={ctx.action} data-acao="declarar-desconto-retido" data-rubrica={rubricaId} className="mt-2 grid gap-3 text-xs sm:grid-cols-2" aria-label={`Declarar a retenção do desconto ${rubricaRotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="rubricaId" value={rubricaId} />
        <label className="text-xs">
          <span className={ROTULO}>Tipo de consignação</span>
          <select name="tipoConsignacaoId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha o tipo…</option>
            {ctx.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>A quem o valor é devido</span>
          <input name="credorConsignatario" required minLength={3} maxLength={120} placeholder="Instituto de previdência, banco, sindicato…" className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Fundamento</span>
          <input name="fundamento" required minLength={20} maxLength={500} placeholder="Lei, convênio ou decisão judicial que obriga o desconto" className={CAMPO} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={ctx.pendente} className={CLASSE_BOTAO_PRIMARIO}>
            {ctx.pendente ? "Registrando…" : "Registrar"}
          </button>
        </div>
      </form>
    </details>
  );
}
