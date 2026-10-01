import { z } from "zod";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ehTributoDoProprioTesouro, fatosDaOrigemDoPagamento } from "../m07-extraorcamentario/retencao-propria.js";
import { saldoReconhecidoDe } from "./reconhecimento.js";
import { exigirIrDaFolhaAindaPendente } from "../m33-folha/ir-da-folha.js";
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
  readonly contrachequesDaFolha?: readonly { readonly contrachequeId: string; readonly valor: Money }[] | undefined;
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
    // Folha: sob a trava do número (que serializa toda receita por retenção do exercício), o IR destes contracheques
    // ainda não foi retido por outro pagamento da mesma folha.
    const contracheques = r.contrachequesDaFolha ?? [];
    if (r.fato === "IRRF_FOLHA") {
      const soma = contracheques.reduce((s, c) => toMoney(s.plus(c.valor)), toMoney("0.00"));
      if (contracheques.length === 0 || !soma.equals(r.valor)) {
        throw new Error("O IR da folha retido no pagamento tem de ser a soma do IR dos contracheques que ele cobre. Nada foi gravado.");
      }
      await exigirIrDaFolhaAindaPendente(tx, contracheques.map((c) => c.contrachequeId));
    }
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
    for (const c of contracheques) {
      await tx.irDoContrachequeRetido.create({ data: { contrachequeId: c.contrachequeId, retencaoPropriaId: elo.id, valor: c.valor.toFixed(2), criadoPor: p.criadoPor } });
    }
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// V26 — A REGULARIZAÇÃO DO LEGADO: o IR/ISS do próprio Tesouro que ficou como consignação
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export const zRegularizarConsignacaoPropria = z.object({
  /** O INGRESSO de retenção (de pagamento) que está na consignação. */
  ingressoId: z.string().min(1),
  data: z.date(),
  motivo: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(10, "Diga por que a retenção está sendo regularizada, com pelo menos 10 caracteres.")),
  /** Quando a receita JÁ foi reconhecida (crédito tributário lançado), o reconhecimento que esta guia baixa. */
  reconhecimentoId: z.string().min(1).nullable(),
  criadoPor: z.string().min(1),
});
export type RegularizarConsignacaoPropriaInput = z.input<typeof zRegularizarConsignacaoPropria>;

/**
 * Baixa, contra a receita, o que resta de UMA retenção antiga de IR/ISS do próprio Tesouro na consignação — sem
 * saída de banco e sem apagar nada. A retenção original continua; nascem a guia de receita, o movimento de
 * apropriação (que reduz o saldo do consignatário) e a alocação que diz de qual retenção ele saiu.
 *
 * - Receita ainda não reconhecida: D consignação × C VPA, mais a receita realizada e o controle da disponibilidade.
 * - Receita já reconhecida (o reconhecimento é informado): D consignação × C crédito tributário daquele
 *   reconhecimento, e o vínculo o baixa — a VPA já nasceu nele e não se repete.
 *
 * Idempotente pela retenção de origem: a segunda tentativa é recusada nomeando a guia da primeira. Não reaplica o
 * roteiro de um pagamento novo: o pagamento antigo, o banco e a obrigação com o fornecedor não mudam.
 */
export async function regularizarConsignacaoPropria(
  prisma: PrismaClient,
  input: RegularizarConsignacaoPropriaInput
): Promise<{ readonly apropriacaoId: string; readonly receitaId: string; readonly numeroReceita: string; readonly valor: string }> {
  const d = zRegularizarConsignacaoPropria.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.regularizarConsignacaoPropria, "ENTE");

    const ja = await tx.apropriacaoDaConsignacaoPropria.findUnique({
      where: { ingressoId: d.ingressoId },
      select: { receitaArrecadada: { select: { numeroReceita: true } } },
    });
    if (ja !== null) {
      throw new Error(`Esta retenção já foi regularizada (guia de receita ${ja.receitaArrecadada.numeroReceita}). Nada foi gravado.`);
    }

    // A ORDEM DOS TRINCOS: o reconhecimento (10), a retenção (30) e, dentro da guia, o número da receita (33).
    if (d.reconhecimentoId !== null) await travar(tx, "ReceitaReconhecida", [d.reconhecimentoId]);
    await travar(tx, "MovimentoExtraorcamentario", [d.ingressoId]);

    const ing = await tx.movimentoExtraorcamentario.findUnique({
      where: { id: d.ingressoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        pagamentoId: true,
        fonteId: true,
        contaBancariaId: true,
        tipoConsignacaoId: true,
        credorConsignatario: true,
        criadoEm: true,
        tipoConsignacao: { select: { codigo: true, contaPassivo: { select: { codigo: true } } } },
        estornos: { select: { id: true } },
        lancamento: { select: { partidas: { select: { tipo: true, subsistema: true, conta: { select: { codigo: true } } } } } },
        alocacoesRecebidas: { select: { valor: true, recolhimento: { select: { estornos: { select: { id: true } } } } } },
      },
    });
    if (ing === null) throw new Error("Retenção não encontrada. Nada foi gravado.");
    if (ing.tipo !== "INGRESSO" || ing.pagamentoId === null) {
      throw new Error("Só se regulariza retenção feita num pagamento. Nada foi gravado.");
    }
    if (ing.estornos.length > 0) throw new Error("Esta retenção foi estornada com o pagamento dela: não há o que regularizar. Nada foi gravado.");

    const c = await ehTributoDoProprioTesouro(tx, {
      tipoConsignacaoId: ing.tipoConsignacaoId,
      credorConsignatario: ing.credorConsignatario,
      contaBancariaId: ing.contaBancariaId,
      data: d.data,
      fatos: await fatosDaOrigemDoPagamento(tx, ing.pagamentoId),
    });
    if (c === null) {
      throw new Error(
        `A retenção de ${ing.tipoConsignacao.codigo} para ${ing.credorConsignatario} não é imposto do próprio município no mesmo caixa ` +
          `(ou não há decisão vigente para o imposto): é dívida com terceiro, ou repasse real de outra entidade, e se recolhe pelo caminho de sempre. Nada foi gravado.`
      );
    }

    let alocado = toMoney("0.00");
    for (const a of ing.alocacoesRecebidas) if (a.recolhimento.estornos.length === 0) alocado = toMoney(alocado.plus(a.valor.toString()));
    const pendente = toMoney(toMoney(ing.valor.toFixed(2)).minus(alocado));
    if (!pendente.greaterThan(0)) throw new Error("Esta retenção não tem saldo na consignação (já foi recolhida ou regularizada). Nada foi gravado.");

    // A conta do passivo é a que o cadastro do tipo dizia QUANDO a retenção foi gravada (a mesma que a gravação
    // conferiu) — não a decisão de hoje — e ela tem de estar entre as pernas de consignação do pagamento.
    const decisao = await tx.decisaoDoTipoDeConsignacao.findFirst({
      where: { tipoId: ing.tipoConsignacaoId, criadoEm: { lte: ing.criadoEm } },
      orderBy: { criadoEm: "desc" },
      select: { contaPassivo: { select: { codigo: true } } },
    });
    const contaPassivo = decisao?.contaPassivo?.codigo ?? ing.tipoConsignacao.contaPassivo?.codigo ?? null;
    const pernas = ing.lancamento.partidas.filter((p) => p.tipo === "CREDITO" && p.subsistema === "PATRIMONIAL").map((p) => p.conta.codigo);
    if (contaPassivo === null || !pernas.includes(contaPassivo)) {
      throw new Error(
        `Não foi possível identificar a conta de consignação desta retenção no lançamento do pagamento (cadastro: ${contaPassivo ?? "sem conta"}). Regularize com o contador. Nada foi gravado.`
      );
    }

    let creditoDoReconhecimento: string | null = null;
    if (d.reconhecimentoId !== null) {
      const rec = await tx.receitaReconhecida.findUnique({
        where: { id: d.reconhecimentoId },
        select: { naturezaCodigo: true, lancamento: { select: { partidas: { select: { tipo: true, subsistema: true, conta: { select: { codigo: true } } } } } } },
      });
      if (rec === null) throw new Error("O reconhecimento informado não existe. Nada foi gravado.");
      if (rec.naturezaCodigo !== c.naturezaReceitaCodigo) {
        throw new Error(`O reconhecimento informado é da natureza ${rec.naturezaCodigo}, e a decisão do município para este imposto é ${c.naturezaReceitaCodigo}. Nada foi gravado.`);
      }
      const saldo = await saldoReconhecidoDe(tx, d.reconhecimentoId);
      if (pendente.greaterThan(saldo)) {
        throw new Error(`O reconhecimento informado tem saldo de ${saldo.toFixed(2)}, menor que os ${pendente.toFixed(2)} a regularizar. Nada foi gravado.`);
      }
      const debito = rec.lancamento.partidas.find((p) => p.tipo === "DEBITO" && p.subsistema === "PATRIMONIAL");
      if (debito === undefined) throw new Error("O lançamento do reconhecimento não tem a perna do crédito a receber. Nada foi gravado.");
      creditoDoReconhecimento = debito.conta.codigo;
    }

    const natureza = await exigirNaturezaDaFonte(tx, c.fonteCodigo);
    const exercicio = anoCivil(d.data);
    const numeroReceita = await proximoNumeroDeReceita(tx, exercicio);
    const g = await registrarArrecadacao(
      {
        exercicio,
        naturezaReceita: c.naturezaReceitaCodigo,
        fonte: c.fonteCodigo,
        exercicioFonte: 1,
        valor: pendente.toFixed(2),
        dataArrecadacao: d.data,
        numeroReceita,
        criadoPor: d.criadoPor,
      },
      roteiroArrecadacao({
        // D consignação: a dívida "com o consignatário" era com o próprio Tesouro — ela se extingue aqui.
        disponibilidade: contaPassivo,
        // C VPA (receita ainda não reconhecida) ou C crédito tributário do reconhecimento (já reconhecida).
        variacaoAumentativa: creditoDoReconhecimento ?? c.contaVpa,
        naturezaDaFonte: natureza.natureza,
      }),
      criarM04DepsNaTx(tx),
      { origem: "REGULARIZACAO_DE_CONSIGNACAO_PROPRIA", entidadeTitularId: c.entidadeTitularId }
    );

    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: ing.tipoConsignacaoId,
        credorConsignatario: ing.credorConsignatario,
        contaBancariaId: ing.contaBancariaId,
        ...(ing.fonteId !== null ? { fonteId: ing.fonteId } : {}),
        tipo: "APROPRIACAO_COMO_RECEITA",
        valor: pendente.toFixed(2),
        data: d.data,
        lancamentoId: g.lancamentoId,
        historico: `Regularização de ${ing.tipoConsignacao.codigo} retido como receita do município (guia ${numeroReceita})`,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    await tx.alocacaoDoRecolhimento.create({ data: { recolhimentoId: mov.id, ingressoId: ing.id, valor: pendente.toFixed(2), criadoPor: d.criadoPor } });
    if (d.reconhecimentoId !== null) {
      await tx.vinculoArrecadacaoReconhecimento.create({
        data: { arrecadacaoId: g.receitaId, reconhecimentoId: d.reconhecimentoId, valor: pendente.toFixed(2), criadoPor: d.criadoPor },
      });
    }
    const a = await tx.apropriacaoDaConsignacaoPropria.create({
      data: {
        ingressoId: ing.id,
        movimentoId: mov.id,
        classificacaoId: c.id,
        receitaArrecadadaId: g.receitaId,
        reconhecimentoId: d.reconhecimentoId,
        valor: pendente.toFixed(2),
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { apropriacaoId: a.id, receitaId: g.receitaId, numeroReceita, valor: pendente.toFixed(2) };
  });
}
