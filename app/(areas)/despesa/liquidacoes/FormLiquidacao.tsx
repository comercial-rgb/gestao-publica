"use client";

import { useActionState, useRef, useState } from "react";
import type { OpcaoDoSeletor } from "../../../../components/ui/CampoReferenciado";
import { CampoValor } from "../../../../components/ui/Campos";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { liquidarAction, type EstadoLiquidacao } from "./actions";
import { extrasDoEmpenhoAction } from "./leitura-actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { AvisoDeDebitoDoCredor } from "../../../../components/ui/AvisoDeDebitoDoCredor";

/**
 * As opções das entradas de material, JÁ LIDAS pelo Server Component — a ilha client não importa
 * porta (a porta puxa o Prisma). A forma é a mesma que a porta de liquidação devolve.
 */
export interface OpcoesDasEntradasDeMaterial {
  readonly classes: readonly { readonly id: string; readonly rotulo: string; readonly contaCodigo: string }[];
  readonly depositos: readonly { readonly id: string; readonly rotulo: string }[];
}

/** O empenho escolhido na busca (catálogo `empenhos-para-liquidar`), com o que a tela precisa dele. */
interface EmpenhoLiquidavel {
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
  exercicio,
  unidadeCodigo,
  opcoesDeMaterial,
  documentos = [],
  empenhoInicial,
  numeroSugerido,
  subempenhoInicial,
}: {
  /** V37 — o recorte da página: a busca do empenho só oferece os deste exercício (e desta unidade, se houver). */
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly opcoesDeMaterial: OpcoesDasEntradasDeMaterial;
  readonly documentos?: readonly { readonly id: string; readonly rotulo: string }[];
  /** V33 — o empenho que veio escolhido de outra tela (diárias, a pagar). Sem saldo a liquidar, é ignorado. */
  readonly empenhoInicial?: string | undefined;
  /** V37 — o próximo número livre do exercício (inclusive os reservados pelo sistema), já no campo. */
  readonly numeroSugerido?: string | undefined;
  /** V36 — o subempenho que veio escolhido da tela do empenho. */
  readonly subempenhoInicial?: string | undefined;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLiquidacao, FormData>(
    liquidarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  // V37 — o empenho vem da BUSCA; o aviso de débito do credor e os subempenhos, de uma leitura só dele, na escolha
  // (antes a página calculava os dois para todos os liquidáveis, para um `select` com todos eles).
  const [alvo, setAlvo] = useState<EmpenhoLiquidavel | undefined>(undefined);
  const [extras, setExtras] = useState<Awaited<ReturnType<typeof extrasDoEmpenhoAction>> | undefined>(undefined);
  const consulta = useRef(0);
  function escolherEmpenho(o: OpcaoDoSeletor | null): void {
    const minha = ++consulta.current;
    setExtras(undefined);
    if (o === null || o.dados === undefined) {
      setAlvo(undefined);
      return;
    }
    const d = o.dados;
    setAlvo({ id: o.valor, numero: d["numero"] ?? "", credorCpfCnpj: d["credorCpfCnpj"] ?? "", saldoALiquidar: d["saldoALiquidar"] ?? "0.00", ehMaterial: d["ehMaterial"] === "sim", naturezaCodigo: d["naturezaCodigo"] ?? "" });
    void extrasDoEmpenhoAction(o.valor).then((r) => {
      if (minha === consulta.current) setExtras(r);
    });
  }
  const [linhas, setLinhas] = useState<number>(1);
  // V37 — a linha que um RECEBIMENTO escolhido sugere (material, classe, quantidade, unitário, valor). A `versao`
  // remonta os campos da linha com a sugestão; tudo continua editável, e o domínio confere de novo.
  const [sugestoes, setSugestoes] = useState<Readonly<Record<number, { readonly dados: Readonly<Record<string, string>>; readonly versao: number }>>>({});
  if (estado.sucesso !== undefined) ref.current?.reset();

  const deMaterial = alvo?.ehMaterial === true;
  const repartido = extras !== undefined && extras !== null && extras !== "indisponivel" ? (extras.repartido ?? undefined) : undefined;
  const debito = alvo === undefined || extras === undefined || extras === null ? undefined : extras === "indisponivel" ? ("indisponivel" as const) : (extras.debito ?? undefined);

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
        {/* O recorte da página entra na busca: só os empenhos deste exercício (e desta unidade). */}
        <input type="hidden" name="exercicio" value={String(exercicio)} />
        <input type="hidden" name="ug" value={unidadeCodigo ?? ""} />
        <div className="sm:col-span-2">
          <CampoReferenciado
            name="empenhoId"
            rotulo="Empenho (com saldo a liquidar)"
            catalogo="empenhos-para-liquidar"
            contexto={["exercicio", "ug"]}
            obrigatorio
            placeholder="Número do empenho ou CPF/CNPJ do credor"
            largura={4}
            {...(empenhoInicial !== undefined && empenhoInicial !== "" ? { valorInicial: empenhoInicial, avisarInicial: true } : {})}
            aoEscolher={escolherEmpenho}
          />
          <AvisoDeDebitoDoCredor debito={debito} />
        </div>

        {repartido !== undefined ? (
          <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-1">
            <span className={ROTULO}>Subempenho</span>
            <select key={alvo?.id} name="subempenhoId" defaultValue={repartido.subempenhos.some((s) => s.id === subempenhoInicial) ? subempenhoInicial : ""} className={CAMPO}>
              <option value="">Direto no empenho · livre R$ {formatarMoeda(repartido.livre).texto}</option>
              {repartido.subempenhos.map((s) => (
                <option key={s.id} value={s.id}>{s.rotulo} · saldo R$ {formatarMoeda(s.saldo).texto}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da liquidação</span>
          <input name="numero" required inputMode="numeric" defaultValue={numeroSugerido} placeholder={numeroSugerido !== undefined && numeroSugerido !== "" ? numeroSugerido : "0000001"} className={CAMPO} />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só números, até 7 dígitos: é assim que o SAGRES recebe. Já vem o próximo número livre do exercício.</span>
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

        <label className="flex items-start gap-2 text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="despesaSemEmpenhoPrevio" className="mt-0.5" />
          <span>
            <span className="font-semibold">Despesa realizada sem empenho prévio</span>
            <span className="block text-[11px] text-[color:var(--color-ink-3)]">Marque quando o serviço ou o material foi entregue antes de o empenho ser emitido, e o empenho veio depois para regularizar.</span>
          </span>
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
                Nenhuma classe de material cadastrada. <a href="/patrimonio/almoxarifado/classes" className="font-medium text-[color:var(--color-primary)] underline" data-atalho-de-cadastro>Cadastre a classe</a> antes de liquidar material.
              </strong>
            ) : null}
          </p>
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
              {/* V37 — o recebimento da ordem do empenho, por busca (antes, o identificador interno digitado). */}
              <CampoReferenciado
                name={`entradas.${i}.recebimentoDeItemId`}
                rotulo="Recebimento da ordem de compra (opcional; preenche a linha)"
                catalogo="recebimentos-para-liquidacao"
                contexto={["empenhoId"]}
                placeholder="Material recebido na ordem deste empenho"
                largura={4}
                aoEscolher={(o) => {
                  if (o === null || o.dados === undefined) return;
                  const dados = o.dados;
                  setSugestoes((atual) => ({ ...atual, [i]: { dados, versao: (atual[i]?.versao ?? 0) + 1 } }));
                }}
              />
              <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-2">
                <span className={ROTULO}>Classe de material</span>
                <select key={`classe-${String(sugestoes[i]?.versao ?? 0)}`} name={`entradas.${i}.classeDeMaterialId`} defaultValue={sugestoes[i]?.dados["classeDeMaterialId"] ?? ""} className={CAMPO}>
                  <option value="">— escolha —</option>
                  {opcoesDeMaterial.classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.rotulo} (conta {c.contaCodigo})</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor da classe (R$)</span>
                <CampoValor key={`valor-${String(sugestoes[i]?.versao ?? 0)}`} name={`entradas.${i}.valor`} defaultValue={sugestoes[i]?.dados["valor"] ?? ""} placeholder="6.000,00" className={CAMPO} />
              </label>
              {/* A busca oferece só os materiais da classe escolhida nesta linha; em branco, não há entrada física. */}
              <CampoReferenciado
                key={`material-${String(sugestoes[i]?.versao ?? 0)}`}
                {...(sugestoes[i]?.dados["materialId"] !== undefined ? { valorInicial: sugestoes[i].dados["materialId"] } : {})}
                name={`entradas.${i}.materialId`}
                rotulo="Material (opcional; em branco, sem entrada física)"
                catalogo="materiais-de-estoque"
                contexto={[`entradas.${i}.classeDeMaterialId`]}
                placeholder="Código, CATMAT ou descrição"
                largura={2}
              />
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
                <input key={`qtd-${String(sugestoes[i]?.versao ?? 0)}`} name={`entradas.${i}.quantidade`} defaultValue={sugestoes[i]?.dados["quantidade"] ?? ""} inputMode="decimal" placeholder="100" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor unitário (R$)</span>
                <input key={`unit-${String(sugestoes[i]?.versao ?? 0)}`} name={`entradas.${i}.valorUnitario`} defaultValue={sugestoes[i]?.dados["valorUnitario"] ?? ""} inputMode="decimal" placeholder="60.00" className={CAMPO} />
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
