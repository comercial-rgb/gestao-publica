import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { criarM04DepsNaTx } from "./adapter-prisma.js";
import {
  roteiroArrecadacao,
  type RegistrarArrecadacaoInput,
  type RoteiroContabil,
} from "./dominio.js";
import { registrarArrecadacao } from "./servico.js";
import { parsearNaturezaReceita } from "./natureza.js";
import { roteiroArrecadacao as roteiroDaGuiaComum } from "../m01-core-contabil/roteiros.js";
import type { NaturezaDaFonteDdr } from "../m01-core-contabil/roteiros.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  vincularReconhecimentoNaTx,
  type VinculoDeReconhecimento,
} from "./reconhecimento.js";

/**
 * M04 — A ARRECADAÇÃO VINCULADA A RECONHECIMENTO. TR 5.87.
 *
 * ═══ POR QUE ELA É PERMUTATIVA, E O QUE ISSO MUDA NO ROTEIRO ═══
 * A arrecadação COMUM faz D caixa × C VPA — o dinheiro entra E a riqueza nasce, no mesmo ato.
 * Mas quando o crédito JÁ FOI RECONHECIDO (a VPA nasceu no fato gerador), arrecadá-lo não gera
 * riqueza nova: só TROCA um ativo (o crédito a receber) por outro (o caixa). A perna de crédito
 * deixa de ser a VPA e passa a ser o **crédito a receber**:
 *
 *     comum      →  D caixa × C VPA               (D receita a realizar × C receita realizada)
 *     vinculada  →  D caixa × C crédito a receber  (mesmo orçamentário)
 *
 * ⚠️ E A MECÂNICA É A DA COMPOSTA DA DÍVIDA ATIVA (precedente `arrecadarRecebimentoDividaAtiva`):
 * a arrecadação e a baixa dos reconhecimentos são UM fato, numa transação só. Ou as duas pernas
 * gravam, ou nenhuma. `criarM04DepsNaTx(tx)` faz `registrarArrecadacao` rodar na MESMA tx — e a
 * autorização (REGISTRAR_ARRECADACAO) roda uma vez, na borda pública, como toda composta.
 *
 * ⚠️ LIMITE HONESTO (levantado no passo 0(a)): uma guia só quita reconhecimentos que compartilhem
 * a MESMA conta de crédito a receber. O motor do M04 carimba o mesmo valor em todas as pernas —
 * ele não faz lançamento composto de pernas com contas de crédito DIFERENTES. Reconhecimentos de
 * origens com contas distintas exigem guias separadas. Não é limitação escondida: é o mesmo
 * princípio da anulação parcial com retenção (uma dimensão por documento).
 */

export interface ArrecadarComVinculoInput {
  readonly arrecadacao: RegistrarArrecadacaoInput;
  /**
   * As contas do roteiro — MAS a perna de crédito patrimonial é o CRÉDITO A RECEBER, não a VPA.
   * Quem monta o roteiro (a borda) sabe qual conta de crédito a receber corresponde à origem;
   * ela é a mesma que o `RoteiroReconhecimento` daquela origem debitou no reconhecimento.
   */
  readonly contas: {
    readonly disponibilidade: string;
    /** A conta de CRÉDITO A RECEBER (classe 1) — NÃO a VPA. É o que torna a operação permutativa. */
    readonly creditoAReceber: string;
    readonly receitaARealizar: string;
    readonly receitaRealizada: string;
  };
  /** Os reconhecimentos que esta guia quita, com o valor de cada baixa. */
  readonly vinculos: readonly VinculoDeReconhecimento[];
}

/**
 * ARRECADA + BAIXA os reconhecimentos, numa transação só.
 *
 * ⚠️ Σ DOS VÍNCULOS == VALOR DA GUIA. A guia arrecadou um valor; ele tem de ser inteiramente
 * distribuído entre os reconhecimentos que baixa — senão o crédito a receber baixaria menos (ou
 * mais) do que o caixa recebeu, e a amarração razão×derivação passaria a acusar para sempre. É a
 * mesma trava do `exigirSomaExata` da dívida ativa.
 */
export async function arrecadarComVinculo(
  prisma: PrismaClient,
  input: ArrecadarComVinculoInput
): Promise<{
  readonly receitaId: string;
  readonly lancamentoId: string;
  readonly vinculoIds: readonly string[];
}> {
  const valorGuia = toMoney(String(input.arrecadacao.valor));
  let somaVinculos = toMoney("0.00");
  for (const v of input.vinculos) somaVinculos = toMoney(somaVinculos.plus(toMoney(v.valor)));

  if (!somaVinculos.equals(valorGuia)) {
    throw new Error(
      `VÍNCULO NÃO FECHA COM A GUIA: os vínculos somam ${somaVinculos.toFixed(2)} e a guia ` +
        `arrecadou ${valorGuia.toFixed(2)} (diferença ${valorGuia.minus(somaVinculos).toFixed(2)}). ` +
        `A perna de crédito a receber é baixada pelo valor INTEIRO da guia — distribuir menos ` +
        `deixaria o caixa à frente do crédito baixado, e a amarração acusaria para sempre. ` +
        `Uma guia pode quitar VÁRIOS reconhecimentos, mas a soma tem de fechar com ela.`
    );
  }

  // ⚠️ A PERNA DE CRÉDITO É O CRÉDITO A RECEBER — é ISTO que faz a VPA não se repetir.
  const roteiro: RoteiroContabil = roteiroArrecadacao({
    disponibilidade: input.contas.disponibilidade,
    variacaoAumentativa: input.contas.creditoAReceber,
    receitaARealizar: input.contas.receitaARealizar,
    receitaRealizada: input.contas.receitaRealizada,
  });

  return prisma.$transaction(async (tx) => {
    const r = await registrarArrecadacao(
      input.arrecadacao,
      roteiro,
      criarM04DepsNaTx(tx),
      { origem: "OPERACAO_COMPOSTA_M10" } // reusa o canal interno: a composta é a dona
    );

    const vinculoIds = await vincularReconhecimentoNaTx(
      tx,
      r.receitaId,
      input.vinculos
    );

    return { receitaId: r.receitaId, lancamentoId: r.lancamentoId, vinculoIds };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A GUIA DA TELA QUITANDO UM CRÉDITO JÁ RECONHECIDO (V28)
// ═══════════════════════════════════════════════════════════════════════════

export interface ArrecadarQuitandoReconhecimentoInput {
  readonly arrecadacao: RegistrarArrecadacaoInput;
  /** A conta contábil da conta bancária que recebeu — do cadastro, como na guia comum. */
  readonly disponibilidade: string;
  /** A natureza de controle da fonte (classe 7), do cadastro do ente, como na guia comum. */
  readonly naturezaDaFonte: NaturezaDaFonteDdr;
  /** O crédito que esta guia quita, pelo valor inteiro da guia. */
  readonly reconhecimentoId: string;
}

/**
 * ARRECADA pela tela e BAIXA o crédito reconhecido que a guia quita — um fato, uma transação.
 *
 * ⚠️ POR QUE EXISTE AO LADO DE `arrecadarComVinculo`. A guia da tela creditava sempre uma VPA:
 * se o crédito do IPTU já tinha sido constituído (D crédito a receber × C VPA), pagar a guia
 * lançava a VPA DE NOVO e deixava o crédito a receber aberto para sempre. A composta antiga faz
 * a troca certa, mas monta o roteiro sem a perna de classe 7 que a guia da tela grava desde a
 * V11 (a natureza da fonte). Aqui a guia é a MESMA da tela — mesmo roteiro do M01, mesmas cinco
 * pernas —, e só a contrapartida patrimonial muda: o crédito a receber da origem, lido do
 * `RoteiroReconhecimento` que o debitou, nunca escolhido no código.
 *
 * ⚠️ AS CONFERÊNCIAS VÊM ANTES DE GRAVAR: o reconhecimento existe e está vivo, é da mesma
 * natureza e da mesma fonte da guia, e a origem tem roteiro. O saldo é conferido DENTRO da trava
 * por `vincularReconhecimentoNaTx` — duas guias concorrentes não baixam o mesmo saldo.
 */
export async function arrecadarQuitandoReconhecimento(
  prisma: PrismaClient,
  input: ArrecadarQuitandoReconhecimentoInput
): Promise<{ readonly receitaId: string; readonly lancamentoId: string; readonly vinculoId: string }> {
  await autorizarNo(prisma, input.arrecadacao.criadoPor, ACAO_DO_SERVICO.arrecadarQuitandoReconhecimento, "ENTE");

  const rec = await prisma.receitaReconhecida.findUnique({
    where: { id: input.reconhecimentoId },
    select: {
      id: true, naturezaCodigo: true, contribuinteRef: true, historico: true,
      estornoDeId: true, estornos: { select: { id: true } },
      fonte: { select: { codigo: true } },
    },
  });
  if (rec === null) {
    throw new Error(`O crédito reconhecido indicado não existe. Escolha o crédito na lista de créditos a receber. Nada foi gravado.`);
  }
  if (rec.estornoDeId !== null || rec.estornos.length > 0) {
    throw new Error(`O crédito "${rec.historico}" foi estornado e não pode ser quitado. Nada foi gravado.`);
  }
  if (rec.naturezaCodigo !== input.arrecadacao.naturezaReceita) {
    throw new Error(
      `A guia é da natureza ${input.arrecadacao.naturezaReceita} e o crédito "${rec.historico}" é da natureza ` +
        `${rec.naturezaCodigo}. A guia só quita crédito da mesma natureza. Nada foi gravado.`
    );
  }
  if (rec.fonte.codigo !== input.arrecadacao.fonte) {
    throw new Error(
      `A guia é da fonte ${input.arrecadacao.fonte} e o crédito "${rec.historico}" é da fonte ${rec.fonte.codigo}. ` +
        `A guia só quita crédito da mesma fonte. Nada foi gravado.`
    );
  }
  const origem = parsearNaturezaReceita(rec.naturezaCodigo).origem;
  const roteiro = await prisma.roteiroReconhecimento.findUnique({
    where: { origem },
    select: { contaCreditoAReceber: { select: { codigo: true } } },
  });
  if (roteiro === null) {
    throw new Error(
      `A origem ${origem} não tem roteiro de reconhecimento, então não se sabe qual crédito a receber baixar. ` +
        `Cadastre o roteiro da origem em Contabilidade. Nada foi gravado.`
    );
  }

  const roteiroDaGuia = roteiroDaGuiaComum({
    disponibilidade: input.disponibilidade,
    // ⚠️ A PERNA QUE TORNA O ATO PERMUTATIVO: o crédito a receber, e não a VPA.
    variacaoAumentativa: roteiro.contaCreditoAReceber.codigo,
    naturezaDaFonte: input.naturezaDaFonte,
  });

  return prisma.$transaction(async (tx) => {
    const r = await registrarArrecadacao(input.arrecadacao, roteiroDaGuia, criarM04DepsNaTx(tx));
    const [vinculoId] = await vincularReconhecimentoNaTx(tx, r.receitaId, [
      { reconhecimentoId: rec.id, valor: toMoney(String(input.arrecadacao.valor)).toFixed(2) },
    ]);
    return { receitaId: r.receitaId, lancamentoId: r.lancamentoId, vinculoId: vinculoId! };
  });
}
