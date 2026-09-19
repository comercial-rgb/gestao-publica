"use client";

import { useActionState, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { declararAction, type EstadoDeclaracao } from "./actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";

/**
 * DECLARAR A DISPONIBILIDADE DE RECURSO NOVO (TR 4.37).
 *
 * ═══ ⚠️ O NÚMERO QUE ESTE FORMULÁRIO GRAVA É O QUE AUTORIZA A DESPESA ═══
 * Um crédito adicional por superávit, excesso de arrecadação ou operação de crédito é conferido
 * contra ele, e contra mais nada. Um zero a mais aqui vira orçamento crescendo contra dinheiro
 * que nunca existiu — o que o art. 43 § 1º proíbe. Por isso:
 *
 *   · SEM DEFAULT na origem e na fonte. Cada uma amarra contra uma apuração diferente, e um
 *     default escolheria a amarração no lugar de quem apurou.
 *   · A EXPLICAÇÃO É OBRIGATÓRIA, com tamanho mínimo de frase — quem cobra é o domínio. É ela
 *     que a prestação de contas lê para saber contra o que o crédito foi autorizado.
 *
 * ⚠️ `ANULACAO` NÃO ESTÁ NA LISTA, e não é recorte de tela: crédito por anulação não traz
 * dinheiro novo, ele REMANEJA — o que o autoriza é o saldo da ficha anulada, conferido por SUM
 * dentro da transação. Uma opção aqui criaria uma declaração que nada lê.
 *
 * ⚠️ ILHA CLIENT NÃO IMPORTA PORTA (grep trivalente): as fontes chegam como props.
 */

const ORIGENS = [
  { valor: "SUPERAVIT_FINANCEIRO", rotulo: "Superávit financeiro do exercício anterior" },
  { valor: "EXCESSO_ARRECADACAO", rotulo: "Excesso de arrecadação" },
  { valor: "OPERACAO_CREDITO", rotulo: "Operação de crédito contratada" },
] as const;

export interface FonteParaDeclaracao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}

export function FormDeclaracao({
  exercicio,
  fontes,
}: {
  readonly exercicio: number;
  readonly fontes: readonly FonteParaDeclaracao[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDeclaracao, FormData>(declararAction, {});
  const [aberto, setAberto] = useState(false);
  const [ultimoSucesso, setUltimoSucesso] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  // Fecha no sucesso e deixa a confirmação FORA do formulário — ver `FormLeiCredito`, onde o
  // mesmo padrão nasceu depois de um ato que gravava sem dizer nada.
  if (estado.sucesso !== undefined && estado.sucesso !== ultimoSucesso) {
    setUltimoSucesso(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  if (fontes.length === 0) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-xs text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">Sem fonte de recurso cadastrada</strong> — a
        disponibilidade é apurada POR FONTE, e sem fonte não há o que declarar.
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Declarar disponibilidade apurada</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              Registra quanto uma fonte tem de recurso novo no exercício. É contra este número que o
              crédito adicional por superávit, excesso ou operação de crédito é conferido.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Declarar disponibilidade
          </button>
        </div>
        {estado.sucesso !== undefined ? (
          <p
            role="status"
            data-resultado-da-acao="declarar-disponibilidade"
            data-resultado-seq={String(seq)}
            className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          >
            {estado.sucesso}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={action}
      data-acao="declarar-disponibilidade"
      className={CLASSE_PAINEL_FORMULARIO}
      aria-label="Declarar disponibilidade de recurso novo"
    >
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Declarar disponibilidade apurada</h2>

      {/* O exercício é o recorte da PÁGINA, como no decreto e na lei. */}
      <input type="hidden" name="exercicio" value={String(exercicio)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Fonte de recurso</span>
          <select name="fonteId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a fonte…</option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.descricao}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Origem do recurso</span>
          <select name="origem" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a origem…</option>
            {ORIGENS.map((o) => (
              <option key={o.valor} value={o.valor}>{o.rotulo}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Valor apurado (R$)</span>
          <CampoValor name="valor" required placeholder="100.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-4">
          <span className={ROTULO}>De onde saiu este número</span>
          <input
            name="descricao"
            required
            minLength={10}
            placeholder="Balanço de 2025 — quadro do superávit financeiro, fonte 500"
            className={CAMPO}
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
        Declarar de novo a mesma fonte <strong>não apaga</strong> a declaração anterior: cria uma
        versão. O que cada decreto enxergou no dia continua legível. E não se declara abaixo do que
        a fonte já suplementou — isso deixaria decreto vivo sem lastro.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Declarando…" : "Declarar disponibilidade"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
        ) : null}
      </div>
    </form>
  );
}
