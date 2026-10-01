import { travar } from "../../packages/locks/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil } from "../../packages/datas/index.js";
import { roteiroArrecadacao } from "../m01-core-contabil/roteiros.js";
import { exigirNaturezaDaFonte } from "../m01-core-contabil/natureza-da-fonte.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { criarM04DepsNaTx } from "./adapter-prisma.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";

/**
 * V26 — A RECEITA DE UMA RETENÇÃO PRÓPRIA DO TESOURO, gravada DENTRO da transação do pagamento.
 *
 * MCASP 11ª ed., Parte I 3.6.2 e Parte III 6.2.6 (`docs/oficial/stn-sof/mcasp-11-irrf-trechos.txt`): o IR
 * retido sobre o que o ente paga é receita tributária dele; o ISS retido pelo município tomador também.
 * Cadeia A da ordem V26 (desenho fundamentado no manual, não roteiro homologado pelo TCE-PB):
 *
 *   guia por retenção (este arquivo)          D 1.1.2.1 crédito tributário  × C 4.1.1.x VPA do imposto   R
 *                                             D 6.2.1.1 receita a realizar  × C 6.2.1.2 receita realizada R
 *                                             D 7.2.1.1.x (natureza da fonte) × C 8.2.1.1.1.01 disponível R
 *   pagamento (M05, mesmo commit da tx)       D obrigação G × C banco L × C 1.1.2.1 crédito tributário R
 *
 * No conjunto: o banco sai pelo LÍQUIDO, a obrigação morre pelo BRUTO, a VPA nasce uma vez e o crédito
 * tributário nasce e morre no mesmo ato — sem débito fictício no banco para imitar a entrada do dinheiro.
 *
 * ⚠️ A GUIA NÃO DECLARA CONTA BANCÁRIA, e não é lacuna: o dinheiro retido não entrou em conta nenhuma, ele
 * deixou de sair. A conciliação e o caixa (M09) somam só guia com conta; o pagamento já sai pelo líquido.
 *
 * ⚠️ A DESTINAÇÃO É A DA CLASSIFICAÇÃO DO ENTE, não a fonte da despesa paga: o IR retido de um pagamento do
 * FUNDEB é imposto do Tesouro, não recurso do FUNDEB.
 */

export interface ReceitaPorRetencaoParaGravar {
  readonly fato: string;
  readonly classificacaoId: string;
  readonly valor: Money;
  readonly contaCredito: string;
  readonly contaVpa: string;
  readonly naturezaReceitaCodigo: string;
  readonly fonteCodigo: string;
  readonly entidadeTitularId: string | null;
  readonly grupoDaFolhaId?: string | undefined;
  /** A memória do cálculo (IR de PJ e ISS calculados no pagamento). */
  readonly memoria?:
    | { readonly base: Money | null; readonly aliquota: { toString(): string } | null; readonly fundamento: string; readonly entrada: Record<string, unknown> }
    | undefined;
}

/** O número da guia de receita por retenção: o próximo numérico do exercício (7 posições do SAGRES). */
async function proximoNumeroDeReceita(tx: Tx, exercicio: number): Promise<string> {
  await travar(tx, "NumeradorDaReceita", [String(exercicio)]);
  const linhas = (await tx.$queryRawUnsafe(
    `SELECT COALESCE(MAX(r."numeroReceita"::bigint), 0)::text AS maior
       FROM "ReceitaArrecadada" r
      WHERE r.exercicio = $1 AND r."numeroReceita" ~ '^[0-9]{1,7}$'`,
    exercicio
  )) as { maior: string }[];
  const proximo = Number(linhas[0]?.maior ?? "0") + 1;
  if (proximo > 9_999_999) {
    throw new Error(`O exercício ${exercicio} já usou o número de receita 9999999, o maior que cabe nas 7 posições do SAGRES. Nada foi gravado.`);
  }
  return String(proximo);
}

/**
 * Grava, para cada retenção própria do pagamento, a guia de receita por retenção e o elo
 * pagamento → retenção → receita. Roda na tx do pagamento: falha aqui desfaz o pagamento inteiro.
 */
export async function registrarReceitasPorRetencaoNaTx(
  tx: Tx,
  p: {
    readonly pagamentoId: string;
    readonly numeroDoPagamento: string;
    readonly data: Date;
    readonly criadoPor: string;
    readonly proprias: readonly ReceitaPorRetencaoParaGravar[];
  }
): Promise<readonly string[]> {
  const exercicio = anoCivil(p.data);
  const ids: string[] = [];
  for (const r of p.proprias) {
    // A natureza da fonte escolhe a conta de classe 7 — recusa nomeando, antes de qualquer gravação desta guia.
    const natureza = await exigirNaturezaDaFonte(tx, r.fonteCodigo);
    const numeroReceita = await proximoNumeroDeReceita(tx, exercicio);
    const g = await registrarArrecadacao(
      {
        exercicio,
        naturezaReceita: r.naturezaReceitaCodigo,
        fonte: r.fonteCodigo,
        exercicioFonte: 1,
        valor: r.valor.toFixed(2),
        dataArrecadacao: p.data,
        numeroReceita,
        criadoPor: p.criadoPor,
      },
      roteiroArrecadacao({
        disponibilidade: r.contaCredito,
        variacaoAumentativa: r.contaVpa,
        naturezaDaFonte: natureza.natureza,
      }),
      criarM04DepsNaTx(tx),
      { origem: "RETENCAO_PROPRIA_NO_PAGAMENTO", entidadeTitularId: r.entidadeTitularId }
    );
    const elo = await tx.retencaoPropriaDoPagamento.create({
      data: {
        pagamentoId: p.pagamentoId,
        classificacaoId: r.classificacaoId,
        fato: r.fato,
        valor: r.valor.toFixed(2),
        receitaArrecadadaId: g.receitaId,
        ...(r.grupoDaFolhaId !== undefined ? { grupoDaFolhaId: r.grupoDaFolhaId } : {}),
        ...(r.memoria !== undefined
          ? {
              base: r.memoria.base === null ? null : r.memoria.base.toFixed(2),
              aliquota: r.memoria.aliquota === null ? null : r.memoria.aliquota.toString(),
              fundamento: r.memoria.fundamento,
              entrada: r.memoria.entrada as object,
            }
          : {}),
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    ids.push(elo.id);
  }
  return ids;
}

/**
 * A ANULAÇÃO DO PAGAMENTO desfaz cada receita por retenção dele, na MESMA transação: a guia é anulada pelo
 * motor do M04 (partidas invertidas, entidade e destinação herdadas) e o elo ganha a linha de estorno.
 * O lançamento de estorno do pagamento já inverteu a perna do crédito tributário; esta função inverte a
 * guia — sem ela, a receita ficaria arrecadada de um pagamento que não existe mais.
 */
export async function anularReceitasPorRetencaoNaTx(
  tx: Tx,
  p: { readonly pagamentoOriginalId: string; readonly data: Date; readonly criadoPor: string }
): Promise<readonly string[]> {
  const vivas = await tx.retencaoPropriaDoPagamento.findMany({
    where: { pagamentoId: p.pagamentoOriginalId, estornoDeId: null },
    select: {
      id: true,
      classificacaoId: true,
      fato: true,
      valor: true,
      grupoDaFolhaId: true,
      receitaArrecadadaId: true,
      receitaArrecadada: { select: { numeroReceita: true } },
      estornos: { select: { id: true } },
    },
    orderBy: { criadoEm: "asc" },
  });
  const ids: string[] = [];
  for (const r of vivas) {
    if (r.estornos.length > 0) {
      throw new Error(`A receita retida ${r.receitaArrecadada.numeroReceita} deste pagamento já foi anulada. Nada foi gravado.`);
    }
    const a = await anularArrecadacao(
      {
        receitaId: r.receitaArrecadadaId,
        numeroReceita: r.receitaArrecadada.numeroReceita,
        dataAnulacao: p.data,
        criadoPor: p.criadoPor,
      },
      criarM04DepsNaTx(tx),
      { origem: "ANULACAO_DO_PAGAMENTO" }
    );
    const e = await tx.retencaoPropriaDoPagamento.create({
      data: {
        pagamentoId: p.pagamentoOriginalId,
        classificacaoId: r.classificacaoId,
        fato: r.fato,
        valor: toMoney(r.valor.toFixed(2)).toFixed(2),
        receitaArrecadadaId: a.receitaId,
        ...(r.grupoDaFolhaId !== null ? { grupoDaFolhaId: r.grupoDaFolhaId } : {}),
        estornoDeId: r.id,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    ids.push(e.id);
  }
  return ids;
}
