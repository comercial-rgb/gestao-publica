"use client";

import { useActionState, useId, useRef } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { arrecadarAction, type EstadoArrecadacao } from "./actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";

/** Uma natureza prevista na LOA — o vocabulário do form. */
export interface NaturezaParaGuia {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
}

/**
 * FORM DE ARRECADAÇÃO — ilha client, Server Action autenticada.
 *
 * ⚠️ NATUREZA E FONTE SÃO CAMPOS DE TEXTO, não selects fechados. O rol da LOA aparece
 * como `datalist` (sugestão), e não como `<select>` (restrição), porque **receita não
 * prevista existe**: o domínio aceita arrecadar numa natureza que a LOA não previu — é
 * assim que o Anexo 1 do RREO mostra "arrecadado além do previsto". Um select fechado
 * ensinaria que só se arrecada o que foi previsto, o que é falso.
 *
 * A LOA orienta; o domínio valida a FORMA (8 dígitos, 3 dígitos) e a existência.
 *
 * ⚠️ SEM UNIDADE GESTORA: a receita é do ENTE (CF art. 167, IV).
 */
/** Uma conta bancária como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface ContaParaGuiaDaIlha {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteCodigo: string;
  readonly contaContabil: string | null;
}

/** V36 (TR 5.10.2.5) — os dados de uma guia escolhida em "duplicar". Declarado aqui: ilha client não importa porta. */
export interface CopiaParaArrecadacao {
  readonly origem: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly contaBancaria: string;
  readonly co: string;
  readonly exercicioFonte: 1 | 2;
  readonly valor: string;
}

export function FormArrecadacao({
  exercicio,
  naturezas,
  contas = [],
  copia,
}: {
  readonly exercicio: number;
  readonly naturezas: readonly NaturezaParaGuia[];
  /** V6 P1.2 — as contas bancárias que a guia pode declarar (a que recebeu o dinheiro). */
  readonly contas?: readonly ContaParaGuiaDaIlha[];
  /** V36 — preenchimento a partir de uma guia existente; a data e o número ficam para o usuário. */
  readonly copia?: CopiaParaArrecadacao | undefined;
}): React.ReactElement {
  // ⚠️ O ID DO `<datalist>` VEM DO `useId`, e não é literal.
  //
  // `<input list="x">` acha o `<datalist id="x">` pelo id, que é GLOBAL ao documento. Hoje
  // esta tela renderiza o formulário uma vez só e um literal funcionaria — mas o dia em que
  // ela renderizar dois (uma arrecadação por conta, digamos) haverá dois `#naturezas-loa`, e
  // o `list` do segundo passará a apontar para as sugestões do primeiro. Nada estoura: a
  // lista simplesmente sugere as naturezas erradas.
  //
  // É a mesma doença dos catorze formulários da tela do processo, num atributo diferente —
  // e o grep de `test/ui/formularios-na-mesma-pagina.test.tsx` foi quem apontou este aqui.
  const idNaturezas = `naturezas-loa-${useId()}`;

  const [estado, action, pendente] = useActionState<EstadoArrecadacao, FormData>(
    arrecadarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form
      ref={ref}
      action={action}
      data-acao="registrar-guia"
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar guia de arrecadação
      </h2>
      <input type="hidden" name="exercicio" value={exercicio} />
      {copia !== undefined ? (
        <p data-copia-de={copia.origem} className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
          Preenchido a partir da {copia.origem}. Informe a data e o número da guia nova e confira o valor antes de registrar.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Natureza da receita (8 dígitos)</span>
          <input
            name="natureza"
            required
            pattern="\d{8}"
            list={idNaturezas}
            defaultValue={copia?.natureza}
            placeholder="11121101"
            className={CAMPO}
          />
          {/* SUGESTÃO, não restrição — ver o cabeçalho: receita não prevista existe. */}
          <datalist id={idNaturezas}>
            {naturezas.map((n) => (
              <option key={`${n.naturezaCodigo}-${n.fonteCodigo}`} value={n.naturezaCodigo}>
                {n.naturezaDescricao} · fonte {n.fonteCodigo}
              </option>
            ))}
          </datalist>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fonte (3 dígitos)</span>
          <input name="fonte" required pattern="\d{3}" defaultValue={copia?.fonte} placeholder="500" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Conta bancária que recebeu</span>
          <select name="contaBancaria" required defaultValue={copia?.contaBancaria ?? ""} className={CAMPO}>
            <option value="" disabled>
              Escolha a conta…
            </option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo} disabled={c.contaContabil === null}>
                {c.codigo} — {c.descricao} · fonte {c.fonteCodigo}{c.contaContabil === null ? " (sem conta contábil vinculada)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>CO (4 dígitos, opcional)</span>
          <input name="co" pattern="\d{4}" defaultValue={copia?.co} placeholder="0001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Exercício da fonte</span>
          <select name="exercicioFonte" defaultValue={String(copia?.exercicioFonte ?? 1)} className={CAMPO}>
            <option value="1">1 — atual</option>
            <option value="2">2 — anterior</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required defaultValue={copia?.valor} placeholder="1.500,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data de arrecadação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <CampoReferenciado
          name="reconhecimentoId"
          rotulo="Crédito lançado que esta guia quita (opcional)"
          catalogo="creditos-a-receber"
          contexto={["natureza", "fonte"]}
          placeholder="Digite parte do histórico ou do contribuinte"
          ajuda="Escolha quando a guia paga um crédito já lançado, como o IPTU constituído. A receita já foi reconhecida no lançamento; a guia baixa o crédito a receber em vez de reconhecê-la de novo."
          largura={3}
        />

        <CampoReferenciado
          name="dividaAtivaId"
          rotulo="Dívida ativa que esta guia recebe (opcional)"
          catalogo="dividas-ativas-a-receber"
          placeholder="Digite a inscrição, o devedor ou o CPF/CNPJ"
          ajuda="Escolha quando a guia paga uma dívida ativa inscrita. O valor inteiro da guia baixa o saldo da dívida, e a receita não é reconhecida de novo."
          largura={3}
        />

        <CampoReferenciado
          name="dividaFundadaId"
          rotulo="Operação de crédito que esta guia ingressa (opcional)"
          catalogo="dividas-fundadas"
          placeholder="Digite o contrato ou o credor"
          ajuda="Escolha quando o dinheiro é a liberação de um empréstimo. O valor entra como dívida do município, e não como ganho."
          largura={3}
        />

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da guia</span>
          <input
            name="numeroReceita"
            required
            placeholder="2026RC000001"
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
        {pendente ? "Registrando…" : "Registrar guia"}
      </button>
    </form>
  );
}
