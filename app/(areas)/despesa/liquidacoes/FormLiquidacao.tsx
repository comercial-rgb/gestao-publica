"use client";

import { useActionState, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { liquidarAction, type EstadoLiquidacao } from "./actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { formatarDocumento } from "../../../../packages/documento/index";

/**
 * As opções das entradas de material, JÁ LIDAS pelo Server Component — a ilha client não importa
 * porta (a porta puxa o Prisma). A forma é a mesma que a porta de liquidação devolve.
 */
export interface OpcoesDasEntradasDeMaterial {
  readonly classes: readonly { readonly id: string; readonly rotulo: string; readonly contaCodigo: string }[];
  readonly materiais: readonly { readonly id: string; readonly rotulo: string; readonly classeDeMaterialId: string; readonly controlaLote: boolean }[];
  readonly depositos: readonly { readonly id: string; readonly rotulo: string }[];
}

/** O empenho liquidável, já filtrado pelo Server Component (saldo a liquidar > 0). */
export interface EmpenhoLiquidavel {
  readonly id: string;
  readonly numero: string;
  readonly credorCpfCnpj: string;
  readonly saldoALiquidar: string;
  /** V4 (§6): o elemento da natureza liquida em ESTOQUE — a liquidação leva as entradas no almoxarifado. */
  readonly ehMaterial: boolean;
  readonly naturezaCodigo: string;
}

/**
 * FORM DE LIQUIDAÇÃO — ilha client, Server Action autenticada.
 *
 * ⚠️ O TETO DO VALOR É SUGESTÃO, NÃO GUARD. O `max` do input ajuda quem digita, mas
 * quem RECUSA liquidar acima do empenhado é o domínio, lendo o SUM real dentro da
 * transação. Confiar no `max` seria confiar num número que o navegador pode ignorar e
 * que já está velho quando o form é enviado — duas requisições concorrentes liquidariam
 * o mesmo saldo.
 *
 * ═══ V4 (§6) — AS ENTRADAS DE MATERIAL, NO MESMO ATO ═══
 * Quando o empenho é de material (o elemento debita estoque), o formulário abre as linhas
 * das entradas: uma por classe de material, com o valor, e a perna física (material,
 * depósito, quantidade, unitário, lote) opcional. A soma das linhas tem de fechar com o
 * valor liquidado — a tela mostra a diferença, e quem recusa é o domínio. Documento fiscal
 * misto (material e serviço) são duas liquidações, uma por empenho.
 */
export function FormLiquidacao({
  empenhos,
  opcoesDeMaterial,
  documentos = [],
  empenhoInicial,
}: {
  readonly empenhos: readonly EmpenhoLiquidavel[];
  readonly opcoesDeMaterial: OpcoesDasEntradasDeMaterial;
  readonly documentos?: readonly { readonly id: string; readonly rotulo: string }[];
  /** V33 — o empenho que veio escolhido de outra tela (diárias, a pagar). Sem saldo a liquidar, é ignorado. */
  readonly empenhoInicial?: string | undefined;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLiquidacao, FormData>(
    liquidarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const inicial = empenhoInicial !== undefined && empenhos.some((e) => e.id === empenhoInicial) ? empenhoInicial : "";
  const [escolhido, setEscolhido] = useState<string>(inicial);
  const [linhas, setLinhas] = useState<number>(1);
  if (estado.sucesso !== undefined) ref.current?.reset();

  if (empenhos.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhum empenho com saldo a liquidar
        </strong>{" "}
        na unidade e no exercício selecionados. A liquidação é registrada a partir de um empenho.
      </div>
    );
  }

  const alvo = empenhos.find((e) => e.id === escolhido);
  const deMaterial = alvo?.ehMaterial === true;

  return (
    <form
      ref={ref}
      action={action}
      data-acao="liquidar"
      data-material={deMaterial ? "sim" : "nao"}
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar liquidação
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Empenho (com saldo a liquidar)</span>
          <select
            name="empenhoId"
            required
            defaultValue={inicial}
            className={CAMPO}
            onChange={(e) => setEscolhido(e.target.value)}
          >
            <option value="" disabled>
              Escolha o empenho…
            </option>
            {empenhos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numero} · credor {formatarDocumento(e.credorCpfCnpj)} · a liquidar R$ {formatarMoeda(e.saldoALiquidar).texto}
                {e.ehMaterial ? " · material de consumo" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da liquidação</span>
          <input name="numero" required inputMode="numeric" placeholder="0000001" className={CAMPO} />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só números, até 7 dígitos: é assim que o SAGRES recebe.</span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>
            Valor (R$){alvo !== undefined ? `, até ${formatarMoeda(alvo.saldoALiquidar).texto}` : ""}
          </span>
          <CampoValor name="valor" required placeholder="6.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data da liquidação</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Responsável pelo atesto</span>
          <input
            name="atesto"
            required
            placeholder="servidor que atestou o recebimento"
            className={CAMPO}
          />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Documento fiscal conferido (opcional)</span>
          <select name="documentoFiscalId" defaultValue="" className={CAMPO}>
            <option value="">— sem documento fiscal —</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="recebimento conforme nota fiscal 1234"
            className={CAMPO}
          />
        </label>
      </div>

      {deMaterial ? (
        <fieldset data-secao="entradas-de-material" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">
            Entradas no almoxarifado
          </legend>
          <p className="mb-3 text-[11px] text-[color:var(--color-ink-2)]">
            Informe uma linha por classe de material; a soma dos valores deve ser igual ao valor liquidado. Material,
            depósito, quantidade e valor unitário são opcionais. Documento fiscal com material e serviço exige duas
            liquidações, uma por empenho.
            {opcoesDeMaterial.classes.length === 0 ? (
              <strong className="block text-[color:var(--color-status-erro-fg)]">
                Nenhuma classe de material cadastrada. Cadastre a classe antes de liquidar material.
              </strong>
            ) : null}
          </p>
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
                <span className={ROTULO}>Classe de material</span>
                <select name={`entradas.${i}.classeDeMaterialId`} defaultValue="" className={CAMPO}>
                  <option value="">— escolha —</option>
                  {opcoesDeMaterial.classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.rotulo} (conta {c.contaCodigo})</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor da classe (R$)</span>
                <CampoValor name={`entradas.${i}.valor`} placeholder="6.000,00" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Recebimento da ordem de compra (opcional)</span>
                <input name={`entradas.${i}.recebimentoDeItemId`} placeholder="recebimento já registrado" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
                <span className={ROTULO}>Material (opcional)</span>
                <select name={`entradas.${i}.materialId`} defaultValue="" className={CAMPO}>
                  <option value="">— sem entrada física —</option>
                  {opcoesDeMaterial.materiais.map((m) => (
                    <option key={m.id} value={m.id}>{m.rotulo}{m.controlaLote ? " (controla lote)" : ""}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Depósito</span>
                <select name={`entradas.${i}.depositoId`} defaultValue="" className={CAMPO}>
                  <option value="">—</option>
                  {opcoesDeMaterial.depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.rotulo}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Quantidade</span>
                <input name={`entradas.${i}.quantidade`} inputMode="decimal" placeholder="100" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor unitário (R$)</span>
                <input name={`entradas.${i}.valorUnitario`} inputMode="decimal" placeholder="60.00" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Lote (se o material controla)</span>
                <input name={`entradas.${i}.loteIdentificacao`} className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Validade do lote</span>
                <input name={`entradas.${i}.loteValidade`} type="date" className={CAMPO} />
              </label>
            </div>
          ))}
          <button type="button" data-acao="mais-uma-classe" className="text-xs underline underline-offset-2" onClick={() => setLinhas((n) => n + 1)}>
            Mais uma classe de material
          </button>
        </fieldset>
      ) : null}

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
        {pendente ? "Liquidando…" : "Liquidar"}
      </button>
    </form>
  );
}
