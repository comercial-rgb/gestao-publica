"use client";

import { useActionState, useRef, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_AREA_TEXTO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { pagarAction, type EstadoPagamento } from "./actions";

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
export function FormPagamento({
  liquidacoes,
  contas,
  tiposDeConsignacao,
}: {
  readonly liquidacoes: readonly LiquidacaoPagavel[];
  readonly contas: readonly ContaParaPagar[];
  readonly tiposDeConsignacao: readonly TipoDeConsignacaoParaTela[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPagamento, FormData>(
    pagarAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  const [escolhida, setEscolhida] = useState<string>("");
  const [conta, setConta] = useState<string>("");
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
  if (estado.sucesso !== undefined) {
    ref.current?.reset();
  }

  if (liquidacoes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma fila aberta</strong> —
        não há liquidação com saldo a pagar.
      </div>
    );
  }
  if (contas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">
          Nenhuma conta bancária cadastrada
        </strong>{" "}
        — o dinheiro tem de sair de algum lugar, e a regra de fonte amarra o pagamento
        à da conta. O cadastro de contas bancárias ainda não tem tela.
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
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Pagar
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Liquidação na fila</span>
          <select
            name="liquidacaoId"
            required
            defaultValue=""
            className={CAMPO}
            onChange={(e) => setEscolhida(e.target.value)}
          >
            <option value="" disabled>
              Escolha a liquidação…
            </option>
            {liquidacoes.map((l) => (
              <option key={l.liquidacaoId} value={l.liquidacaoId}>
                {l.posicao === 1 ? "★ " : ""}
                {l.posicao}ª · {l.numero} — {l.credorCpfCnpj} · a pagar {l.saldoAPagar} ·
                fonte {l.fonteCodigo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº do pagamento</span>
          <input name="numero" required placeholder="2026NP000001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>
            Valor (R$){alvo !== undefined ? ` — até ${alvo.saldoAPagar}` : ""}
          </span>
          <CampoValor name="valor" required placeholder="2.500,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do pagamento</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária (traz a fonte)</span>
          <select
            name="contaBancaria"
            required
            defaultValue=""
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

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input
            name="historico"
            required
            placeholder="pagamento conforme liquidação"
            className={CAMPO}
          />
        </label>
      </div>

      {foraDaOrdem ? (
        <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-status-alerta-fg)]">
            Quebra da ordem cronológica — art. 141, §1º
          </legend>
          <p className="mb-3 text-xs text-[color:var(--color-status-alerta-fg)]">
            Esta liquidação está na <strong>{alvo.posicao}ª posição</strong> da fila
            (fonte {alvo.fonteCodigo}). Pagá-la antes das anteriores exige{" "}
            <strong>justificativa prévia</strong> numa das cinco hipóteses taxativas, e
            ela vira prova se o §2º mandar apurar preterição.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Hipótese (§1º)</span>
              <select name="hipotese" defaultValue="" className={CAMPO}>
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
                placeholder="Secretário de Finanças"
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
              <span className={ROTULO}>Justificativa (mín. 30 caracteres)</span>
              <textarea
                name="justificativa"
                rows={3}
                placeholder="por que este credor é pago antes dos que estão na frente dele"
                className={CLASSE_AREA_TEXTO}
              />
            </label>
          </div>
        </fieldset>
      ) : null}

      <Retencoes
        tipos={tiposDeConsignacao}
        linhas={linhasRetencao}
        aoMudar={setLinhasRetencao}
      />

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
 * ═══ ⚠️ O VALOR É INFORMADO, NÃO CALCULADO ═══
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
        O que se retém <strong>não sai do caixa</strong>: a obrigação com o credor é
        extinta pelo <strong>valor cheio</strong>, o banco paga o líquido e o valor retido
        vira <strong>dívida com o consignatário</strong>. Informe o valor — ele{" "}
        <strong>não é calculado</strong> pelo sistema.
      </p>

      {disponiveis.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Nenhum tipo de consignação está pronto para receber retenção. Os tipos existem,
          mas falta parametrizar a conta de passivo de cada um — reter sem ela deixaria o
          lançamento sem a perna da dívida.
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
                  placeholder="INSS  ·  Município de Campina Grande"
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
