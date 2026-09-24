"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { anularReceitaAction, type EstadoAnulacaoReceita } from "./anular-actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";

/**
 * A ANULAÇÃO DE ARRECADAÇÃO (TR 4.61) — o ato por linha, e a CONFIRMAÇÃO acima da tabela.
 *
 * ⚠️ TOTAL apenas (o serviço não tem parcial), então não há campo de valor: a anulação nega a guia
 * inteira. Só o número da guia DE ANULAÇÃO e a data do fato — o resto é do domínio.
 *
 * ═══ ⚠️ POR QUE O ESTADO SUBIU PARA UM PROVEDOR (V11 V9.3), COM A MEDIÇÃO ═══
 *
 * A confirmação morava DENTRO do formulário, que mora dentro da CÉLULA da linha. E a linha
 * DESAPARECE no sucesso, por desenho: `colunaAcoes` só oferece o ato a guia viva, e depois da
 * anulação ela deixa de ser viva — `{... anuladas.has(l.id) ? null : <FormAnularReceita/>}`.
 * O React desmontava o componente inteiro junto com a mensagem que ele acabara de receber.
 *
 * O resultado era uma anulação de DINHEIRO sem aviso nenhum: quem clicava via o painel fechar,
 * a linha mudar, e nada que dissesse "anulado". A jornada J9 mediu isso duas vezes, no passo
 * 8.1, lendo SILÊNCIO da tela enquanto 8.2 e 8.3 confirmavam pelo rodapé que a anulação tinha
 * acontecido e com a identificação certa. A primeira correção tirou a mensagem do `<details>`
 * que se fecha — e não bastou, porque a causa não era o `<details>`: era a linha.
 *
 * É a mesma cura, pela mesma razão medida, que o guichê (V8), o roteiro orçamentário (V8.4) e a
 * natureza das fontes (V9.3) já usam: UM provedor para a tabela inteira, e o aviso vive nele.
 */

interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
}
const C = createContext<Ctx | null>(null);

export function AnulacoesDaTela({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoAnulacaoReceita, FormData>(
    anularReceitaAction,
    {}
  );
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
  }

  return (
    <C.Provider value={{ action, pendente }}>
      {estado.sucesso !== undefined ? (
        <p
          role="status"
          data-resultado-da-acao="anular-receita"
          data-resultado-seq={String(seq)}
          className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        >
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p
          role="alert"
          data-resultado-da-acao="anular-receita"
          className="mb-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {children}
    </C.Provider>
  );
}

export function FormAnularReceita({
  receitaId,
}: {
  readonly receitaId: string;
}): React.ReactElement {
  const ctx = useContext(C);
  if (ctx === null) {
    return (
      <span className="text-xs text-[color:var(--color-status-erro-fg)]">
        Anulação indisponível nesta tela.
      </span>
    );
  }

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Anular
      </summary>
      <form
        action={ctx.action}
        className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3"
      >
        <ChaveDeComando />
        <input type="hidden" name="receitaId" value={receitaId} />
        <label className="block">
          <span className={ROTULO}>Nº da guia de anulação</span>
          <input name="numero" required placeholder="2026RA000001" className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Data da anulação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>
        <button type="submit" disabled={ctx.pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {ctx.pendente ? "Anulando…" : "Confirmar anulação"}
        </button>
      </form>
    </details>
  );
}
