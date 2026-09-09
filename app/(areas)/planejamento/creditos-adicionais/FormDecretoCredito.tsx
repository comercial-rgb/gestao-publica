"use client";

import { useActionState, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { cadastrarDecretoAction, type EstadoDecreto } from "./actions";
import {
  desequilibrioPorFonte,
  errosDoRascunho,
  ORIGENS,
  type MovimentoRascunho,
  type TipoMovimento,
} from "./rascunho";

/**
 * CADASTRO DE DECRETO + MOVIMENTOS — ilha client CONTROLADA, Server Action autenticada (TR 4.20–4.40).
 *
 * ═══ ⚠️ POR QUE CONTROLADO, quando o `FormEmpenho` ao lado é não-controlado ═══
 * O empenho é um formulário de campos FIXOS: o browser valida (`required`) e o `FormData` basta.
 * Este tem uma LISTA de tamanho variável (as pernas do decreto) e um indicador que depende de
 * TODAS elas ao mesmo tempo — o balanceamento por fonte da TR 5.111. Nada disso é expressável em
 * atributos HTML: só há como mostrá-lo enquanto se digita se o React tiver o estado. É o custo que
 * a validação em tempo real cobra, e é por isso que só ESTE form o paga.
 *
 * ═══ ⚠️ A TELA SUGERE, O DOMÍNIO DECIDE (MODULO-UI.md) ═══
 * O que trava o botão é `errosDoRascunho` — validação de FORMA (campo em branco, valor que não é
 * decimal, decreto sem perna). O que NÃO trava o botão é o desequilíbrio por fonte: ele aparece
 * como AVISO, e o envio segue. Quem recusa um decreto que não fecha é o `validarBalanceamento` do
 * M03, no domínio puro, antes de qualquer I/O — e a mensagem dele é melhor do que qualquer
 * paráfrase daqui. Um bloqueio na tela viraria um segundo domínio, livre para divergir do primeiro.
 *
 * ⚠️ O TETO DA LEI E O SALDO DA FICHA NÃO SÃO CONFERIDOS AQUI, e não é esquecimento: os dois
 * dependem de um `SUM` lido DENTRO da transação de gravação. Um número lido agora já envelheceu
 * quando o decreto grava — é a corrida que o INVARIANTE 3 do M05 existe para impedir. O saldo
 * exibido ao lado de cada ficha é ORIENTAÇÃO para escolher, nunca a decisão.
 *
 * ⚠️ A FONTE DE CADA PERNA NÃO É UM CAMPO — ela é a fonte da ficha escolhida, e o form só a
 * EXIBE. Ver `MovimentoRascunho.fonteId`.
 *
 * ⚠️ ILHA CLIENT NÃO IMPORTA PORTA (grep trivalente, regra 3): as fichas e as leis chegam como
 * props, já lidas pelo Server Component. Os tipos abaixo são DECLARADOS aqui pelo mesmo motivo
 * que o `FormEmpenho` declara os dele.
 */

export interface LeiParaDecreto {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly tipoCredito: string;
  readonly valorAutorizado: string;
}

export interface FichaParaCredito {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly dotacaoAtualizada: string;
  readonly saldoDisponivel: string;
}

/** Uma linha do form: a ficha ainda pode estar vazia, então o `fichaId` é o que o estado guarda. */
interface LinhaForm {
  readonly chave: number;
  readonly fichaId: string;
  readonly tipo: TipoMovimento;
  readonly valor: string;
}

const LINHA_VAZIA = (chave: number): LinhaForm => ({ chave, fichaId: "", tipo: "SUPLEMENTACAO", valor: "" });

const ORIGEM_ROTULO: Record<string, string> = {
  ANULACAO: "Anulação (remanejamento entre fichas)",
  SUPERAVIT_FINANCEIRO: "Superávit financeiro do exercício anterior",
  EXCESSO_ARRECADACAO: "Excesso de arrecadação",
  OPERACAO_CREDITO: "Operação de crédito",
};

const TIPO_ROTULO: Record<string, string> = { SUPLEMENTAR: "Suplementar", ESPECIAL: "Especial", EXTRAORDINARIO: "Extraordinário" };

export function FormDecretoCredito({
  exercicio,
  leis,
  fichas,
}: {
  readonly exercicio: number;
  readonly leis: readonly LeiParaDecreto[];
  readonly fichas: readonly FichaParaCredito[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDecreto, FormData>(cadastrarDecretoAction, {});
  const [aberto, setAberto] = useState(false);
  const [leiId, setLeiId] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [origemRecurso, setOrigemRecurso] = useState("");
  const [linhas, setLinhas] = useState<readonly LinhaForm[]>([LINHA_VAZIA(0)]);
  const [proximaChave, setProximaChave] = useState(1);

  const porId = new Map(fichas.map((f) => [f.id, f]));

  /** As linhas com a fonte já DERIVADA da ficha — a forma que o rascunho (e a action) consomem. */
  const movimentos: readonly MovimentoRascunho[] = linhas.map((l) => {
    const ficha = porId.get(l.fichaId);
    return {
      fichaId: l.fichaId,
      tipo: l.tipo,
      valor: l.valor,
      fonteId: ficha?.fonteId ?? "",
      fonteCodigo: ficha?.fonteCodigo ?? "",
    };
  });

  // ⚠️ RECALCULADO A CADA RENDER, não guardado em estado. Um erro memorizado é um erro que
  // sobrevive à correção do campo que o causou — e o usuário fica olhando para uma mensagem que
  // já não vale. Derivar é a única forma de o aviso morrer junto com o motivo dele.
  const erros = errosDoRascunho({ leiId, numero, data, origemRecurso, movimentos });
  const desequilibrios = desequilibrioPorFonte(movimentos);
  const balanceamentoImporta = origemRecurso === "ANULACAO";

  const atualizar = (chave: number, campo: Partial<LinhaForm>): void =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));

  if (leis.length === 0 || fichas.length === 0) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-xs text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">
          {leis.length === 0 ? "Sem lei de crédito neste exercício" : "Sem fichas neste exercício"}
        </strong>{" "}
        {leis.length === 0
          ? "— um decreto executa o TETO de uma lei autorizadora (TR 4.30); sem lei, não há o que executar. O cadastro de LEIS ainda não tem formulário nesta tela: hoje ele entra pelo serviço/seed do M03, e fica NOMEADO aqui como a próxima fatia."
          : "— as pernas do decreto suplementam ou anulam FICHAS da LOA. Sem ficha, não há dotação a alterar."}
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Novo decreto de crédito adicional</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              Executa (parte d)o teto de uma lei, suplementando e anulando fichas. As travas (teto da
              lei, saldo da ficha, fonte, TR 5.111) são do domínio, aplicadas na gravação.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Cadastrar decreto
          </button>
        </div>
        {estado.sucesso !== undefined ? (
          <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
            {estado.sucesso}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Novo decreto de crédito adicional">
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Novo decreto de crédito adicional</h2>

      {/* O exercício NÃO é escolhido no form: ele é o recorte da página (a URL). Um decreto de 2025
          numa tela de 2026 sumiria da lista logo depois de gravado. */}
      <input type="hidden" name="ano" value={String(exercicio)} />
      <input type="hidden" name="movimentos" value={JSON.stringify(movimentos)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Lei autorizadora (teto)</span>
          <select name="leiId" value={leiId} onChange={(e) => setLeiId(e.target.value)} className={CAMPO}>
            <option value="">Escolha a lei…</option>
            {leis.map((l) => (
              <option key={l.id} value={l.id}>
                {l.numero}/{l.ano} — {TIPO_ROTULO[l.tipoCredito] ?? l.tipoCredito} · teto{" "}
                {formatarMoeda(l.valorAutorizado).texto}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº do decreto</span>
          <input name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="D-001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do decreto</span>
          <input name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Origem do recurso</span>
          {/* ⚠️ SEM DEFAULT. A origem decide CONTRA O QUÊ o domínio valida: ANULACAO exige que as
              pernas fechem por fonte (5.111); as outras três são recurso NOVO e batem contra a
              disponibilidade declarada da fonte. Um default escolheria essa amarração no lugar do
              usuário — e em silêncio. */}
          <select name="origemRecurso" value={origemRecurso} onChange={(e) => setOrigemRecurso(e.target.value)} className={CAMPO}>
            <option value="">Escolha a origem…</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>{ORIGEM_ROTULO[o] ?? o}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
        Movimentos (as pernas do decreto)
      </h3>

      <div className="mt-2 space-y-2">
        {linhas.map((l, i) => {
          const ficha = porId.get(l.fichaId);
          return (
            <div key={l.chave} className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Ficha (dotação)</span>
                <select
                  aria-label={`Ficha do movimento ${i + 1}`}
                  value={l.fichaId}
                  onChange={(e) => atualizar(l.chave, { fichaId: e.target.value })}
                  className={CAMPO}
                >
                  <option value="">Escolha a ficha…</option>
                  {fichas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.numero} — {f.naturezaCodigo} {f.naturezaDescricao} · UG {f.unidadeCodigo} · fonte{" "}
                      {f.fonteCodigo} · atualizada {formatarMoeda(f.dotacaoAtualizada).texto}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Tipo</span>
                <select
                  aria-label={`Tipo do movimento ${i + 1}`}
                  value={l.tipo}
                  onChange={(e) => atualizar(l.chave, { tipo: e.target.value === "ANULACAO" ? "ANULACAO" : "SUPLEMENTACAO" })}
                  className={CAMPO}
                >
                  <option value="SUPLEMENTACAO">Suplementação (+)</option>
                  <option value="ANULACAO">Anulação (−)</option>
                </select>
              </label>

              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor (R$)</span>
                {/* ⚠️ `name=""`: quem atravessa a fronteira é o JSON de `movimentos` (a lista tem
                    tamanho variável), então o hidden do campo não é submetido — um input sem
                    `name` o browser não manda. A MÁSCARA continua sendo a do design system; o
                    `aoMudarValorCru` só espelha o cru no estado, porque o indicador de
                    balanceamento precisa dele a cada tecla, e não só no submit. */}
                <CampoValor
                  name=""
                  aria-label={`Valor do movimento ${i + 1}`}
                  defaultValue={l.valor}
                  placeholder="10.000,00"
                  className={CAMPO}
                  aoMudarValorCru={(v) => atualizar(l.chave, { valor: v })}
                />
              </label>

              <div className="flex items-end justify-between gap-2 text-xs text-[color:var(--color-ink-3)]">
                <span>
                  {/* ⚠️ CAMPO NOMEADO, NÃO PREENCHIDO: sem ficha escolhida a fonte não existe ainda,
                      e a tela diz isso em vez de exibir um código plausível. */}
                  Fonte: <strong>{ficha?.fonteCodigo ?? "— escolha a ficha"}</strong>
                </span>
                {linhas.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remover movimento ${i + 1}`}
                    onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                    className="text-[color:var(--color-status-erro-fg)] hover:underline"
                  >
                    remover
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          setLinhas((atual) => [...atual, LINHA_VAZIA(proximaChave)]);
          setProximaChave((k) => k + 1);
        }}
        className="mt-2 text-xs font-medium text-[color:var(--color-primary)] hover:underline"
      >
        + incluir movimento
      </button>

      {/* ── O AVISO DE BALANCEAMENTO (TR 5.111) — informa, não bloqueia. Ver o cabeçalho. ── */}
      {balanceamentoImporta ? (
        <div
          data-teste="balanceamento"
          className={`mt-4 rounded-[var(--radius-md)] px-3 py-2 text-xs ${
            desequilibrios.length === 0
              ? "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]"
              : "bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]"
          }`}
        >
          {desequilibrios.length === 0 ? (
            <>As pernas <strong>fecham por fonte</strong> — o total suplementado iguala o anulado em cada fonte.</>
          ) : (
            <>
              <strong>As pernas ainda não fecham por fonte</strong> (TR 5.111):{" "}
              {desequilibrios.map((d) => `fonte ${d.fonteCodigo} sobra ${formatarMoeda(d.diferenca).texto}`).join("; ")}.
              Num decreto por anulação, cada fonte tem de sair no zero. Quem recusa é o domínio, na
              gravação — este aviso só antecipa a conversa.
            </>
          )}
        </div>
      ) : null}

      {erros.length > 0 ? (
        <ul data-teste="erros-forma" className="mt-3 list-disc space-y-0.5 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-6 py-2 text-xs text-[color:var(--color-ink-2)]">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente || erros.length > 0} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Cadastrando…" : "Cadastrar decreto e lançar movimentos"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
