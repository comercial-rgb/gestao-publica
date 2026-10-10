"use client";

import { AvisoDeDebitoDoCredor } from "../../../../components/ui/AvisoDeDebitoDoCredor";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { guardarNaAba, lerRascunho, serializarRascunho, tirarDaAba } from "../../../../lib/rascunho-do-formulario";
import { desmascararValor } from "../../../../lib/format/mascaras";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_AREA_TEXTO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { pagarAction, type EstadoPagamento } from "./actions";
import { previaRetencoesAction, type EstadoDaPrevia } from "./previa-actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { formatarDocumento } from "../../../../packages/documento/index";

/** Uma liquidação pagável, como a página a passa (já com a posição que o M06 deu). */
export interface LiquidacaoPagavel {
  readonly liquidacaoId: string;
  readonly posicao: number;
  readonly numero: string;
  readonly credorCpfCnpj: string;
  readonly saldoAPagar: string;
  readonly fonteCodigo: string;
  readonly categoria: string;
}

export interface ContaParaPagar {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

/**
 * ⚠️ DECLARADO AQUI, não importado de `lib/portas/pagamento`. Seria `import type` (some na
 * compilação), mas o grep trivalente da fronteira é TEXTUAL e barra qualquer
 * `from ".../lib/portas/"` numa ilha client — e está certo em ser cego. Mesmo padrão do
 * `FichaParaEmpenho` e do `TipoAnulavel`.
 */
/** Uma ordem AUTORIZADA, esperando o pagamento que a consome (T07). */
export interface OrdemAutorizadaParaTela {
  readonly id: string;
  readonly numero: string;
  readonly liquidacaoNumero: string;
  readonly credorCpfCnpj: string;
  readonly valor: string;
}

export interface TipoDeConsignacaoParaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly disponivel: boolean;
  readonly motivoIndisponivel: string | null;
}

const ROTULO_HIPOTESE: Record<string, string> = {
  I_EMERGENCIA_CALAMIDADE: "I — emergência ou calamidade pública",
  II_ME_EPP_RISCO: "II — ME/EPP em risco de descontinuidade",
  III_SISTEMAS_ESTRUTURANTES: "III — sistemas estruturantes de TI",
  IV_FALENCIA_RECUPERACAO: "IV — falência ou recuperação judicial",
  V_ATIVIDADE_FINALISTICA: "V — atividade finalística",
};

/**
 * FORM DE PAGAMENTO — ilha client, Server Action autenticada.
 *
 * ═══ ⚠️ A JUSTIFICATIVA APARECE SOZINHA FORA DA POSIÇÃO 1 — E ISSO É UI, NÃO REGRA ═══
 * Escolher uma liquidação que não é a cabeça da fila abre o bloco do §1º. É conveniência:
 * o usuário vê o que vai precisar antes de digitar o resto. **A regra continua sendo do
 * domínio** — entre este render e o submit, outro pagamento pode andar a fila, e a
 * posição que está na tela já não é a de agora. Por isso o bloco é *mostrado* pela
 * posição, mas *nada aqui impede* enviar sem ele: quem recusa é o art. 141 §2º, dentro
 * da transação, contra a fila real.
 *
 * A fonte NÃO é um campo: ela vem da conta bancária escolhida (TR 5.23 — a fonte do
 * pagamento tem de casar com a do banco). Pedir as duas seria oferecer ao usuário a
 * chance de errar num guard que o sistema já sabe responder.
 */
/** V36 (TR 5.10.2.5) — os dados de um pagamento escolhido em "duplicar". */
export interface CopiaParaPagamento {
  readonly origem: string;
  readonly liquidacaoId: string;
  readonly contaBancaria: string;
  readonly valor: string;
  readonly historico: string;
}

/**
 * V39-009 (AUD-034/039) — O RASCUNHO DO PAGAMENTO QUE ATRAVESSA O ATALHO DO PERFIL FISCAL. Ao clicar em "Cadastrar ou
 * alterar o perfil fiscal" na prévia das retenções, os campos SEGUROS (a liquidação, número, valor, data, histórico e
 * cheque) ficam na aba; a volta (com a mesma liquidação na URL) os repõe uma vez e apaga. Nada de retenção, ordem ou
 * justificativa: a prévia se recalcula com o perfil novo. O mesmo mecanismo do empenho (V38, AUD-015).
 */
const CHAVE_DO_RASCUNHO = "rascunho-do-pagamento";
const CAMPOS_DO_RASCUNHO = ["liquidacaoId", "numero", "valor", "data", "historico", "numeroDoCheque"] as const;

export function FormPagamento({
  liquidacoes,
  contas,
  tiposDeConsignacao,
  ordensAutorizadas,
  opcoesDaRetencao,
  liquidacaoInicial,
  copia,
  debitos = {},
}: {
  readonly liquidacoes: readonly LiquidacaoPagavel[];
  /** V33 — a liquidação que veio escolhida de outra tela (a pagar, dossiê). Fora da fila, é ignorada. */
  readonly liquidacaoInicial?: string | undefined;
  readonly contas: readonly ContaParaPagar[];
  readonly tiposDeConsignacao: readonly TipoDeConsignacaoParaTela[];
  readonly ordensAutorizadas: readonly OrdemAutorizadaParaTela[];
  readonly opcoesDaRetencao: OpcoesDaRetencaoParaTela;
  /** V36 — preenchimento a partir de um pagamento existente; número, data, ordem e retenções ficam para o usuário. */
  readonly copia?: CopiaParaPagamento | undefined;
  /** V36 (TR 5.10.1.38) — os débitos inscritos em dívida ativa dos credores da fila, por documento. */
  readonly debitos?: Readonly<Record<string, { readonly inscricoes: number; readonly saldo: string }>>;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPagamento, FormData>(
    pagarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const pedida = copia?.liquidacaoId ?? liquidacaoInicial;
  const inicial = pedida !== undefined && liquidacoes.some((l) => l.liquidacaoId === pedida) ? pedida : "";
  const [escolhida, setEscolhida] = useState<string>(inicial);
  const [rascunho, setRascunho] = useState<Readonly<Record<string, string>> | null>(null);
  const rascunhoLido = useRef(false);
  useEffect(() => {
    // Uma vez (o React de desenvolvimento roda a montagem duas vezes; a segunda leitura da aba viria vazia).
    if (rascunhoLido.current) return;
    rascunhoLido.current = true;
    if (inicial === "") return;
    const r = lerRascunho(tirarDaAba(CHAVE_DO_RASCUNHO), CAMPOS_DO_RASCUNHO, new Date());
    if (r === null || r["liquidacaoId"] !== inicial) return;
    for (const nome of ["numero", "data", "historico", "numeroDoCheque"] as const) {
      const el = ref.current?.elements.namedItem(nome);
      const v = r[nome];
      if (v !== undefined && el instanceof HTMLInputElement) el.value = v;
    }
    setRascunho(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem: o rascunho volta uma vez
  }, []);
  /** Guarda o rascunho ao sair pelo atalho do perfil fiscal (o clique no link, antes de a página trocar). */
  function guardarRascunhoSeForAtalho(e: React.MouseEvent<HTMLFormElement>): void {
    const alvo = e.target instanceof Element ? e.target.closest("[data-atalho-de-cadastro]") : null;
    if (alvo === null || ref.current === null) return;
    const dados = new FormData(ref.current);
    const campos: Record<string, string> = {};
    for (const nome of CAMPOS_DO_RASCUNHO) {
      const v = dados.get(nome);
      if (typeof v === "string" && v !== "") campos[nome] = nome === "valor" ? desmascararValor(v) : v;
    }
    guardarNaAba(CHAVE_DO_RASCUNHO, serializarRascunho(campos, new Date()));
  }
  const [conta, setConta] = useState<string>(copia?.contaBancaria ?? "");
  /**
   * As linhas de retenção. Só o NÚMERO delas é estado; os valores vivem no DOM e chegam
   * ao servidor por `getAll` do nome repetido.
   *
   * ⚠️ E O ESTADO NÃO CALCULA NADA. Não há "total retido" nem "líquido" mostrado aqui de
   * propósito: seria uma conta feita no navegador sobre um valor que o servidor ainda vai
   * conferir, e um número na tela que discordasse do gravado é pior que número nenhum.
   * Quem soma é o motor do M07, dentro da transação; o resultado aparece no dossiê do
   * empenho, depois de gravado.
   */
  const [linhasRetencao, setLinhasRetencao] = useState<number>(0);
  /** V24 — retenção calculada ligada: IR, INSS e ISS pelas tabelas, no lugar das linhas manuais. */
  const [calculada, setCalculada] = useState<boolean>(false);
  if (estado.sucesso !== undefined) {
    ref.current?.reset();
  }

  if (liquidacoes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma liquidação aguardando pagamento.</strong>
      </div>
    );
  }
  if (contas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhuma conta bancária cadastrada.
        </strong>{" "}
        O pagamento exige uma conta bancária vinculada à fonte de recursos. Cadastre a conta em{" "}
        <a href="/financeiro/contas-bancarias" className="font-medium text-[color:var(--color-primary)] underline" data-atalho-de-cadastro>Financeiro, Contas bancárias</a>.
      </div>
    );
  }

  const alvo = liquidacoes.find((l) => l.liquidacaoId === escolhida);
  const foraDaOrdem = alvo !== undefined && alvo.posicao !== 1;
  const selecionada = contas.find((c) => c.codigo === conta);

  return (
    <form
      ref={ref}
      action={action}
      data-acao="pagar"
      className={CLASSE_PAINEL_FORMULARIO}
      onClickCapture={guardarRascunhoSeForAtalho}
    >
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Pagar
      </h2>
      {copia !== undefined ? (
        <p data-copia-de={copia.origem} className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
          Preenchido a partir do {copia.origem}.{" "}
          {inicial === ""
            ? "A liquidação dele não tem mais saldo a pagar na fila: escolha a liquidação."
            : "Informe o número e a data e confira o valor, a ordem e as retenções antes de pagar."}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Liquidação na fila</span>
          <select
            name="liquidacaoId"
            required
            defaultValue={inicial}
            className={CAMPO}
            onChange={(e) => setEscolhida(e.target.value)}
          >
            <option value="" disabled>
              Escolha a liquidação…
            </option>
            {liquidacoes.map((l) => (
              <option key={l.liquidacaoId} value={l.liquidacaoId}>
                {l.posicao === 1 ? "★ " : ""}
                {l.posicao}ª · {l.numero} · {formatarDocumento(l.credorCpfCnpj)} · a pagar R${" "}
                {formatarMoeda(l.saldoAPagar).texto} · fonte {l.fonteCodigo}
              </option>
            ))}
          </select>
          <AvisoDeDebitoDoCredor debito={alvo === undefined ? undefined : debitos[alvo.credorCpfCnpj]} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº do pagamento</span>
          <input name="numero" required inputMode="numeric" placeholder="0000001" className={CAMPO} />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só números, até 7 dígitos: é assim que o SAGRES recebe.</span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>
            Valor (R$){alvo !== undefined ? `, até ${formatarMoeda(alvo.saldoAPagar).texto}` : ""}
          </span>
          <CampoValor key={rascunho === null ? "valor" : "valor-do-rascunho"} name="valor" required defaultValue={rascunho?.["valor"] ?? copia?.valor} placeholder="2.500,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do pagamento</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária (define a fonte)</span>
          <select
            name="contaBancaria"
            required
            defaultValue={copia?.contaBancaria ?? ""}
            className={CAMPO}
            onChange={(e) => setConta(e.target.value)}
          >
            <option value="" disabled>
              Escolha a conta…
            </option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} — {c.descricao} · fonte {c.fonteCodigo}
              </option>
            ))}
          </select>
        </label>
        {/* A fonte acompanha a conta: o usuário não a digita (TR 5.23). */}
        <input type="hidden" name="fonteId" value={selecionada?.fonteId ?? ""} />

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do cheque (opcional)</span>
          <input name="numeroDoCheque" maxLength={15} placeholder="000123" className={CAMPO} />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só quando o pagamento sai por cheque. O cheque fica com o valor líquido, depois das retenções.</span>
        </label>

        {/*
          ⚠️ A ORDEM É OPCIONAL, e a tela diz por quê em vez de deixar o campo mudo. Os
          pagamentos anteriores a T07 não têm ordem, e inventar uma autorização retroativa
          para eles seria pior que não ter nenhuma. Escolhida uma ordem, o domínio confere
          liquidação e valor EXATOS — uma escolha errada é recusada com o motivo, não
          silenciosamente aceita.
        */}
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Ordem autorizada (opcional)</span>
          <select name="ordemDePagamentoId" defaultValue="" className={CAMPO}>
            <option value="">Sem ordem de pagamento</option>
            {ordensAutorizadas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.numero} · liquidação {o.liquidacaoNumero} · {formatarDocumento(o.credorCpfCnpj)} · R$ {formatarMoeda(o.valor).texto}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            defaultValue={copia?.historico}
            placeholder="pagamento conforme liquidação"
            className={CAMPO}
          />
        </label>
      </div>

      {foraDaOrdem ? (
        <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-status-alerta-fg)]">
            Pagamento fora da ordem cronológica (art. 141, §1º)
          </legend>
          <p className="mb-3 text-xs text-[color:var(--color-status-alerta-fg)]">
            Esta liquidação está na <strong>{alvo.posicao}ª posição</strong> da fila
            (fonte {alvo.fonteCodigo}). O pagamento antes das anteriores exige{" "}
            <strong>justificativa prévia</strong> em uma das hipóteses do §1º, que fica registrada
            para eventual apuração (§2º).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Hipótese (§1º)</span>
              <select name="hipotese" defaultValue="" required className={CAMPO}>
                <option value="" disabled>
                  Escolha a hipótese…
                </option>
                {Object.entries(ROTULO_HIPOTESE).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quem autorizou</span>
              <input
                name="autorizadoPor"
                required
                placeholder="Secretário de Finanças"
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
              <span className={ROTULO}>Justificativa (mín. 30 caracteres)</span>
              <textarea
                name="justificativa"
                rows={3}
                required
                minLength={30}
                placeholder="motivo do pagamento antes dos credores anteriores na fila"
                className={CLASSE_AREA_TEXTO}
              />
            </label>
          </div>
        </fieldset>
      ) : null}

      <details className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-painel="precatorio-fora-da-ordem">
        <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-ink)]">Pagamento de precatório fora da ordem cronológica</summary>
        <label className="mt-2 block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Justificativa (mín. 20 caracteres)</span>
          <textarea
            name="justificativaOrdemConstitucional"
            rows={2}
            minLength={20}
            placeholder="Acordo homologado judicialmente, sequestro de verba ou outra razão que autoriza pagar antes dos anteriores"
            className={CLASSE_AREA_TEXTO}
          />
        </label>
        <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
          Só se aplica quando o empenho paga um precatório e há outros mais antigos na fila. Sem justificativa, o pagamento fora da ordem não é aceito.
        </p>
      </details>

      <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">IR, INSS e ISS do fornecedor</legend>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
          <input type="checkbox" name="retencaoCalculada" checked={calculada} onChange={(e) => setCalculada(e.target.checked)} />
          <span>
            Calcular as retenções pelas tabelas oficiais (o fornecedor vem do empenho, e o perfil fiscal dele, do cadastro de pessoas)
          </span>
        </label>
        {calculada ? <RetencaoCalculada opcoes={opcoesDaRetencao} formulario={ref} documento={alvo?.credorCpfCnpj} liquidacaoId={escolhida} /> : null}
      </fieldset>

      {/* As duas formas não se somam: com o cálculo ligado, as linhas manuais saem do formulário. */}
      {calculada ? null : <Retencoes tipos={tiposDeConsignacao} linhas={linhasRetencao} aoMudar={setLinhasRetencao} />}

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
        {pendente ? "Pagando…" : foraDaOrdem ? "Pagar fora da ordem" : "Pagar"}
      </button>
    </form>
  );
}

/**
 * RETENÇÃO NA FONTE — o bloco que faltava para o pagamento composto existir pela TELA.
 *
 * ═══ ⚠️ O QUE ACONTECE QUANDO SE RETÉM, E POR QUE A TELA DIZ ISSO ═══
 * Pagar 1.000 retendo 100 é UM fato, não dois. A obrigação com o fornecedor morre
 * INTEIRA (1.000); do caixa saem 900; e nascem 100 de dívida nova, com o consignatário.
 * Nenhuma outra perna muda de valor — nem a orçamentária: retenção NÃO é desconto de
 * despesa. Quem escreve isso na tela evita a pergunta que sempre vem depois ("cadê os
 * 100 reais?") e, pior, a correção manual que ela costuma provocar.
 *
 * ═══ ⚠️ O VALOR É INFORMADO, NÃO CALCULADO (para IR, INSS e ISS há, desde a V24, o bloco calculado) ═══
 * Alíquota de INSS ou de ISS depende de legislação tributária que este sistema não
 * conhece — regime do prestador, base, retenção mínima, o município de incidência. Um
 * cálculo automático aqui seria dinheiro recolhido a menor com o ente respondendo pela
 * diferença. O sistema garante o que ele PODE garantir: que o lançamento feche, que o
 * passivo nasça na conta parametrizada e que o caixa saia pelo líquido.
 *
 * ═══ ⚠️ O TIPO INDISPONÍVEL APARECE, DESABILITADO, COM O MOTIVO ═══
 * Esconder "ISS" de quem precisa reter ISS faz o operador concluir que o sistema não
 * retém ISS — e gravar o pagamento cheio. Mostrá-lo dizendo "sem conta de passivo
 * parametrizada" transforma um beco sem saída numa pendência de cadastro.
 */
function Retencoes({
  tipos,
  linhas,
  aoMudar,
}: {
  readonly tipos: readonly TipoDeConsignacaoParaTela[];
  readonly linhas: number;
  readonly aoMudar: (n: number) => void;
}): React.ReactElement {
  const disponiveis = tipos.filter((t) => t.disponivel);

  return (
    <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
      <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">
        Retenção na fonte (opcional)
      </legend>

      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A obrigação com o credor é quitada pelo <strong>valor bruto</strong>, o banco paga o
        valor líquido e o valor retido passa a ser devido ao <strong>consignatário</strong>.
        Aqui se informa o valor retido de outras consignações (pensão, empréstimo, caução). Para IR,
        INSS e ISS do fornecedor, use o cálculo pelas tabelas oficiais, acima.
      </p>

      {disponiveis.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Nenhum tipo de consignação disponível para retenção. É necessário parametrizar a
          conta de passivo de cada tipo.
        </p>
      ) : (
        <>
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} className="mb-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Consignação</span>
                {/*
                  ⚠️ NOMES REPETIDOS, DE PROPÓSITO. Três campos com o mesmo `name` chegam
                  ao servidor como três listas paralelas (`getAll`), na ordem do DOM. Um
                  índice no nome (`retencaoValor-0`) obrigaria a action a adivinhar quantas
                  linhas existiram — e a errar quando uma do meio fosse removida.
                */}
                <select name="retencaoTipo" defaultValue="" required className={CAMPO}>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id} disabled={!t.disponivel}>
                      {t.codigo} — {t.descricao}
                      {t.disponivel ? "" : ` (indisponível: ${t.motivoIndisponivel})`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>A favor de (consignatário)</span>
                <input
                  name="retencaoCredor"
                  required
                  placeholder="INSS, Município"
                  className={CAMPO}
                />
              </label>

              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor retido (R$)</span>
                <CampoValor name="retencaoValor" required placeholder="100,00" className={CAMPO} />
              </label>
            </div>
          ))}

          <div className="flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              onClick={() => aoMudar(linhas + 1)}
              className="font-medium text-[color:var(--color-primary)] hover:underline"
            >
              Acrescentar retenção
            </button>
            {linhas === 0 ? null : (
              <button
                type="button"
                onClick={() => aoMudar(linhas - 1)}
                className="font-medium text-[color:var(--color-ink-2)] hover:underline"
              >
                Remover a última
              </button>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}

/** As opções da retenção calculada, como a página as passa (declaradas aqui pelo mesmo motivo dos outros tipos). */
export interface OpcoesDaRetencaoParaTela {
  readonly naturezasIR: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly servicosINSS: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly basesMinimas: readonly { readonly codigo: string; readonly rotulo: string }[];
  readonly itensISS: readonly { readonly subitem: string; readonly rotulo: string }[];
  readonly municipioDoEnte: string | null;
  readonly faltas: readonly string[];
}

/**
 * V24 — IR, INSS E ISS CALCULADOS PELAS TABELAS OFICIAIS.
 *
 * A tela só COLETA os dados da operação e mostra a prévia; quem calcula é o servidor, de novo, no
 * pagamento (a prévia não vale como valor gravado). O fornecedor e o perfil fiscal dele vêm do
 * empenho e do cadastro da pessoa, nunca daqui.
 *
 * ⚠️ A PRÉVIA NÃO É AÇÃO DO FORMULÁRIO: uma ação de `<form>` limpa os campos ao terminar, e o operador
 * perderia o que digitou. O botão monta o FormData e chama a função do servidor por fora.
 */
function RetencaoCalculada({
  opcoes,
  formulario,
  documento,
  liquidacaoId,
}: {
  readonly opcoes: OpcoesDaRetencaoParaTela;
  readonly formulario: React.RefObject<HTMLFormElement | null>;
  /** V38 — o CPF/CNPJ do credor da liquidação escolhida: a pessoa física não entra na tabela do IR das pessoas jurídicas. */
  readonly documento?: string | undefined;
  /** V39-009 — a liquidação escolhida, para o atalho do perfil fiscal voltar a ela. */
  readonly liquidacaoId: string;
}): React.ReactElement {
  const [previa, setPrevia] = useState<EstadoDaPrevia>({});
  const pessoaFisica = (documento ?? "").replace(/\D/g, "").length === 11;
  // V38 — a contadora não achou onde informar o IR de uma pessoa física: o "valor informado" ficava fechado.
  const semCalculo = (previa.linhas ?? []).some((l) => l.situacao === "Sem cálculo");
  const [calculando, iniciar] = useTransition();
  const [enquadramento, setEnquadramento] = useState<string>("VALOR_BRUTO");
  const idDaLista = useId();
  const calcular = (): void => {
    const f = formulario.current;
    if (f === null) return;
    const dados = new FormData(f);
    iniciar(async () => setPrevia(await previaRetencoesAction({}, dados)));
  };
  const campo = "text-xs text-[color:var(--color-ink-2)]";
  const caixa = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3";
  const titulo = "px-1 text-xs font-semibold text-[color:var(--color-ink)]";

  return (
    <div className="mt-3 grid gap-4">
      {opcoes.faltas.length > 0 ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
          Para calcular falta: {opcoes.faltas.join("; ")}. O tributo afetado fica sem cálculo e pede o valor informado.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={campo}>
          <span className={ROTULO}>Valor bruto do documento fiscal (R$)</span>
          <CampoValor name="rcValorDocumento" placeholder="igual ao valor pago" className={CAMPO} />
        </label>
        <label className={`${campo} flex items-end gap-2 pb-2`}>
          <input type="checkbox" name="rcGlosa" />
          <span>Pagamento com glosa, sem nota fiscal nova</span>
        </label>
      </div>

      <fieldset className={caixa}>
        <legend className={titulo}>Imposto de renda</legend>
        {pessoaFisica ? (
          <p data-ir-pessoa-fisica className="text-[color:var(--color-ink-2)]">
            O credor é pessoa física: a tabela por natureza do bem ou serviço vale só para pessoas jurídicas, e o sistema
            não calcula o imposto de renda da pessoa física. Calcule a prévia e informe o valor retido em &quot;Valor
            informado&quot;, abaixo, com o motivo.
          </p>
        ) : (
          <label className={campo}>
            <span className={ROTULO}>Natureza do bem ou serviço (IN RFB 1.234/2012, Anexo I)</span>
            <select name="rcNaturezaIR" defaultValue="" className={CAMPO}>
              <option value="">Escolha a natureza…</option>
              {opcoes.naturezasIR.map((n) => (
                <option key={n.codigo} value={n.codigo}>
                  {n.rotulo}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className={caixa}>
        <legend className={titulo}>Retenção previdenciária (INSS)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={`${campo} sm:col-span-2`}>
            <span className={ROTULO}>Serviço (IN RFB 2.110/2022, arts. 111 e 112)</span>
            <select name="rcInssServico" defaultValue="" className={CAMPO}>
              <option value="">Não é serviço sujeito à retenção previdenciária</option>
              {opcoes.servicosINSS.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className={campo}>
            <span className={ROTULO}>Forma de contratação</span>
            <select name="rcInssModalidade" defaultValue="" className={CAMPO}>
              <option value="">Escolha…</option>
              <option value="CESSAO_DE_MAO_DE_OBRA">Cessão de mão de obra</option>
              <option value="EMPREITADA_PARCIAL">Empreitada parcial</option>
              <option value="EMPREITADA_TOTAL">Empreitada total</option>
            </select>
          </label>
          <label className={`${campo} sm:col-span-2`}>
            <span className={ROTULO}>Materiais e equipamentos</span>
            <select name="rcInssEnquadramento" value={enquadramento} onChange={(e) => setEnquadramento(e.target.value)} className={CAMPO}>
              <option value="VALOR_BRUTO">Não há: a base é o valor bruto</option>
              <option value="MATERIAIS_DISCRIMINADOS">Discriminados no contrato e no documento: deduzir o valor</option>
              <option value="PREVISTO_SEM_VALOR_NO_CONTRATO">Previstos no contrato sem valor, discriminados no documento</option>
              <option value="EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO">Equipamento inerente ao serviço, sem valores no contrato</option>
            </select>
          </label>
          {enquadramento === "MATERIAIS_DISCRIMINADOS" || enquadramento === "PREVISTO_SEM_VALOR_NO_CONTRATO" ? (
            <label className={campo}>
              <span className={ROTULO}>Valor dos materiais e equipamentos (R$)</span>
              <CampoValor name="rcInssMateriais" placeholder="0,00" className={CAMPO} />
            </label>
          ) : null}
          {enquadramento === "PREVISTO_SEM_VALOR_NO_CONTRATO" || enquadramento === "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO" ? (
            <label className={`${campo} sm:col-span-2`}>
              <span className={ROTULO}>Base mínima</span>
              <select name="rcInssBaseMinima" defaultValue="" className={CAMPO}>
                <option value="">Escolha a hipótese…</option>
                {opcoes.basesMinimas
                  .filter((b) => b.codigo.startsWith(enquadramento === "PREVISTO_SEM_VALOR_NO_CONTRATO" ? "117" : "118"))
                  .map((b) => (
                    <option key={b.codigo} value={b.codigo}>
                      {b.rotulo}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <label className={campo}>
            <span className={ROTULO}>Alimentação e vale-transporte no documento (R$)</span>
            <CampoValor name="rcInssDeducoes" placeholder="0,00" className={CAMPO} />
          </label>
          <label className={campo}>
            <span className={ROTULO}>Dispensa declarada</span>
            <select name="rcInssDispensa" defaultValue="" className={CAMPO}>
              <option value="">Nenhuma</option>
              <option value="II">Sem empregados, serviço pessoal do titular (art. 115, II)</option>
              <option value="III">Profissão regulamentada ou treinamento, pelos sócios (art. 115, III)</option>
            </select>
          </label>
          <label className={`${campo} sm:col-span-2`}>
            <span className={ROTULO}>Declaração da dispensa (onde está arquivada)</span>
            <input name="rcInssDeclaracao" placeholder="declaração de 01/09/2026, processo 123/2026" className={CAMPO} />
          </label>
        </div>
      </fieldset>

      <fieldset className={caixa}>
        <legend className={titulo}>ISS</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={`${campo} sm:col-span-2`}>
            <span className={ROTULO}>Subitem da lista de serviços (digite o número ou parte da descrição)</span>
            <input name="rcIssSubitem" list={idDaLista} placeholder="vazio = fornecimento de bens, sem ISS" className={CAMPO} />
            <datalist id={idDaLista}>
              {opcoes.itensISS.map((i) => (
                <option key={i.subitem} value={i.rotulo} />
              ))}
            </datalist>
          </label>
          <label className={campo}>
            <span className={ROTULO}>Município onde o serviço foi prestado (código IBGE)</span>
            <input name="rcIssMunicipio" inputMode="numeric" maxLength={7} defaultValue={opcoes.municipioDoEnte ?? ""} className={CAMPO} />
          </label>
          <label className={campo}>
            <span className={ROTULO}>Alíquota do ISS no documento, se optante do Simples (%)</span>
            <input name="rcIssAliquotaSimples" inputMode="decimal" placeholder="2,01" className={CAMPO} />
          </label>
        </div>
      </fieldset>

      <details className={`${caixa} text-xs`} open={semCalculo || pessoaFisica} data-valor-informado>
        <summary className="cursor-pointer font-semibold text-[color:var(--color-ink)]">Valor informado, quando o cálculo não cobre o caso</summary>
        <p className="mt-2 text-[color:var(--color-ink-2)]">
          Só vale para o tributo que a prévia mostrar como &quot;Sem cálculo&quot;. Informe o valor (zero, se não houver retenção) e o motivo.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(["IRRF", "INSS", "ISS"] as const).map((t) => (
            <div key={t} className="grid gap-2">
              <label className={campo}>
                <span className={ROTULO}>{t}: valor (R$)</span>
                <CampoValor name={`rcInformado${t}`} placeholder="0,00" className={CAMPO} />
              </label>
              <label className={campo}>
                <span className={ROTULO}>{t}: justificativa</span>
                <input name={`rcJustificativa${t}`} placeholder="orientação do fisco municipal, ofício" className={CAMPO} />
              </label>
            </div>
          ))}
        </div>
      </details>

      <div>
        <button type="button" onClick={calcular} disabled={calculando} data-acao="calcular-retencoes" className="text-xs font-medium text-[color:var(--color-primary)] hover:underline">
          {calculando ? "Calculando…" : "Calcular a prévia das retenções"}
        </button>
      </div>

      {previa.erro !== undefined ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {previa.erro}
        </p>
      ) : null}
      {previa.linhas !== undefined ? (
        <div role="status" data-previa-das-retencoes="" className={`${caixa} text-xs`}>
          <p className="mb-2 text-[color:var(--color-ink-2)]">
            Fornecedor {formatarDocumento(previa.fornecedor ?? "")}:{" "}
            {previa.perfil === null || previa.perfil === undefined ? "sem perfil fiscal cadastrado" : `perfil fiscal ${previa.perfil}`}. O
            valor é calculado de novo ao pagar.
            {previa.pessoaId === null || previa.pessoaId === undefined ? null : (
              <>
                {" "}
                <a
                  href={`/cadastros/pessoas/${previa.pessoaId}?retorno=${encodeURIComponent(`/despesa/pagamentos?liquidacao=${liquidacaoId}`)}#perfil-fiscal`}
                  className="font-medium text-[color:var(--color-primary)] hover:underline"
                  data-atalho-de-cadastro
                >
                  {previa.perfil === null ? "Cadastrar o perfil fiscal" : "Alterar o perfil fiscal"}
                </a>{" "}
                (o que você digitou neste pagamento volta com você).
              </>
            )}
          </p>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[color:var(--color-ink-2)]">
                <th className="py-1 pr-2">Tributo</th>
                <th className="py-1 pr-2">Situação</th>
                <th className="py-1 pr-2">Base</th>
                <th className="py-1 pr-2">Alíquota</th>
                <th className="py-1 pr-2">Valor</th>
                <th className="py-1">Por quê</th>
              </tr>
            </thead>
            <tbody>
              {previa.linhas.map((l) => (
                <tr key={l.tributo} data-tributo={l.tributo} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="py-1 pr-2 font-medium">{l.tributo}</td>
                  <td className="py-1 pr-2">{l.situacao}</td>
                  <td className="py-1 pr-2">{l.base === null ? "" : `R$ ${formatarMoeda(l.base).texto}`}</td>
                  <td className="py-1 pr-2">{l.aliquota ?? ""}</td>
                  <td className="py-1 pr-2" data-valor={l.valor ?? ""}>
                    {l.valor === null ? "" : `R$ ${formatarMoeda(l.valor).texto}`}
                  </td>
                  <td className="py-1">{l.explicacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
