import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ M04 — A DEDUÇÃO DA RECEITA REALIZADA: A TRANSFERÊNCIA AO FUNDEB (V35, onda B1) ═══
 *
 * O FPM, o ICMS, o IPVA, o ITR e o IPI-exportação chegam ao município com 20% retidos na origem para o FUNDEB
 * (CF art. 212-A; Lei 14.113/2020, art. 3º). O banco credita o líquido. O MCASP (11ª ed., Parte V, cap. 1.4.2) manda
 * registrar a receita pelo BRUTO e a retenção como DEDUÇÃO da receita, com a mesma natureza — e o Balanço
 * Orçamentário apresenta a receita líquida das deduções (Parte V, cap. do BO). Até aqui o sistema não tinha dedução
 * realizada: a receita ia bruta ao balanço, e a disponibilidade da fonte ficava 20% acima do que o banco tinha.
 *
 * O VALOR É O DO DOCUMENTO BANCÁRIO (o demonstrativo de distribuição da arrecadação), não 20% calculado aqui: a
 * retenção é fato do banco, com centavos próprios, e um percentual escrito no código seria alíquota inventada.
 *
 * ⚠️ A DEDUÇÃO CABE NA RECEITA: o deduzido da natureza e fonte no exercício (com esta) não passa do arrecadado
 * líquido dela até a data — sob trinco da natureza, para duas deduções simultâneas não passarem juntas.
 *
 * As contas são as analíticas do PCASP do TCE-PB 2025 que o MCASP nomeia. Conta ausente ou sintética recusa.
 */

export const CONTA_DEDUCAO_FUNDEB_REALIZADA = "6.2.1.3.1.01.00";
export const CONTA_RECEITA_A_REALIZAR_DA_DEDUCAO = "6.2.1.1.0.00.00";
export const CONTA_VPD_TRANSFERENCIA_AO_FUNDEB = "3.5.2.2.4.00.00";
export const CONTA_DDR_DISPONIVEL = "8.2.1.1.1.01.00";
export const CONTA_DDR_UTILIZADA_POR_DEDUCAO = "8.2.1.1.4.04.00";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um dia civil AAAA-MM-DD.");

export const zRegistrarDeducao = z.object({
  naturezaReceita: z.string().regex(/^\d{8}$/, "A natureza da receita deduzida tem 8 dígitos."),
  fonte: z.string().regex(/^\d{3}$/, "A fonte tem 3 dígitos."),
  valor: zMoney,
  dia: zDia,
  contaBancaria: z.string().trim().min(1, "Escolha a conta em que a receita foi creditada."),
  documento: z.string().trim().min(10, "Cite o documento bancário da retenção (o demonstrativo da distribuição da arrecadação)."),
  criadoPor: z.string().min(1),
});

/** As contas do lançamento, todas analíticas no plano carregado — conferidas antes de gravar. */
async function contasDoLancamento(tx: Tx, codigos: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const contas = await tx.contaPcasp.findMany({ where: { codigo: { in: [...codigos] } }, select: { id: true, codigo: true, analitica: true } });
  const ids = new Map<string, string>();
  for (const codigo of codigos) {
    const c = contas.find((x) => x.codigo === codigo);
    if (c === undefined) throw new Error(`A conta ${codigo} da dedução da receita não está no plano carregado. Nada foi gravado.`);
    if (!c.analitica) throw new Error(`A conta ${codigo} da dedução da receita é sintética no plano carregado. Nada foi gravado.`);
    ids.set(codigo, c.id);
  }
  return ids;
}

/** Arrecadado líquido (arrecadações − anulações) e deduzido líquido (deduções − estornos) de uma natureza e fonte. */
async function arrecadadoEDeduzido(tx: Tx, exercicio: number, naturezaReceitaId: string, fonteId: string, ate: Date): Promise<{ arrecadado: Money; deduzido: Money }> {
  const [guias, deducoes] = await Promise.all([
    tx.receitaArrecadada.findMany({ where: { exercicio, naturezaReceitaId, fonteId, dataArrecadacao: { lte: ate } }, select: { tipo: true, valor: true } }),
    tx.deducaoDaReceitaRealizada.findMany({ where: { exercicio, naturezaReceitaId, fonteId }, select: { valor: true, estornoDeId: true } }),
  ]);
  let arrecadado = toMoney("0.00");
  for (const g of guias) {
    if (g.tipo === "RETIFICACAO") throw new Error("Há guia de retificação nesta natureza: o sinal dela é indefinido e a dedução não se confere. Nada foi gravado.");
    arrecadado = g.tipo === "ANULACAO" ? toMoney(arrecadado.minus(g.valor.toFixed(2))) : toMoney(arrecadado.plus(g.valor.toFixed(2)));
  }
  let deduzido = toMoney("0.00");
  for (const d of deducoes) deduzido = d.estornoDeId === null ? toMoney(deduzido.plus(d.valor.toFixed(2))) : toMoney(deduzido.minus(d.valor.toFixed(2)));
  return { arrecadado, deduzido };
}

/**
 * REGISTRA a dedução do FUNDEB sobre uma receita arrecadada. As três naturezas de informação num lançamento, na
 * mesma transação. Recusa antes de gravar: exercício fechado, conta sem a fonte, valor maior que o arrecadado.
 */
export async function registrarDeducaoDaReceita(
  prisma: PrismaClient,
  input: z.input<typeof zRegistrarDeducao>
): Promise<{ readonly deducaoId: string; readonly lancamentoId: string }> {
  const d = zRegistrarDeducao.parse(input);
  if (!d.valor.greaterThan(0)) throw new Error("O valor da dedução tem de ser maior que zero. Nada foi gravado.");
  const quando = inicioDoDiaCivil(d.dia);
  const exercicio = Number(d.dia.slice(0, 4));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarDeducaoDaReceita, "ENTE");
    await exigirExercicioAberto(tx, exercicio, `dedução da receita ${d.naturezaReceita}`);
    const [natureza, fonte, conta] = await Promise.all([
      tx.naturezaReceita.findUnique({ where: { codigo: d.naturezaReceita }, select: { id: true } }),
      tx.fonteRecurso.findUnique({ where: { codigo: d.fonte }, select: { id: true } }),
      tx.contaBancaria.findUnique({ where: { codigo: d.contaBancaria }, select: { id: true, codigo: true, contaContabil: { select: { id: true, codigo: true, analitica: true } } } }),
    ]);
    if (natureza === null) throw new Error(`A natureza ${d.naturezaReceita} não está no cadastro. Nada foi gravado.`);
    if (fonte === null) throw new Error(`A fonte ${d.fonte} não está no cadastro. Nada foi gravado.`);
    if (conta === null) throw new Error(`A conta bancária ${d.contaBancaria} não existe. Nada foi gravado.`);
    if (conta.contaContabil === null || !conta.contaContabil.analitica) {
      throw new Error(`A conta bancária ${conta.codigo} não tem conta contábil analítica vinculada: a saída do dinheiro não tem onde ser escriturada. Nada foi gravado.`);
    }

    // A dedução cabe na receita da natureza e fonte — sob trinco, contra a corrida.
    await travar(tx, "DeducaoDaReceita", [natureza.id, fonte.id]);
    // ⚠️ O ARRECADADO É O DO DIA INTEIRO. A guia é gravada no meio do dia civil; cortar no início do dia deixava
    // de fora a guia do próprio dia, e a dedução feita no dia do crédito (o caso comum: o banco credita o FPM e
    // retém o FUNDEB na mesma data) era sempre recusada com "cabem 0,00". Achado ao semear a base fictícia (V36).
    const { arrecadado, deduzido } = await arrecadadoEDeduzido(tx, exercicio, natureza.id, fonte.id, fimDoDiaCivil(d.dia));
    const cabe = toMoney(arrecadado.minus(deduzido));
    if (d.valor.greaterThan(cabe)) {
      throw new Error(
        `A natureza ${d.naturezaReceita} na fonte ${d.fonte} tem ${arrecadado.toFixed(2)} arrecadados e ${deduzido.toFixed(2)} já deduzidos até ` +
          `${d.dia}; cabem ${cabe.toFixed(2)}, e a dedução pede ${d.valor.toFixed(2)}. Registre a arrecadação antes da dedução. Nada foi gravado.`
      );
    }

    const ids = await contasDoLancamento(tx, [CONTA_DEDUCAO_FUNDEB_REALIZADA, CONTA_RECEITA_A_REALIZAR_DA_DEDUCAO, CONTA_VPD_TRANSFERENCIA_AO_FUNDEB, CONTA_DDR_DISPONIVEL, CONTA_DDR_UTILIZADA_POR_DEDUCAO]);
    const deducaoId = randomUUID();
    const lancamentoId = randomUUID();
    const v = d.valor.toFixed(2);
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `DED-FUNDEB-${d.dia}-${deducaoId.slice(0, 8)}`,
      dataTransacao: quando,
      historico: `Dedução da receita ${d.naturezaReceita} (fonte ${d.fonte}) para o FUNDEB — ${d.documento}`,
      origemTipo: "DEDUCAO_DA_RECEITA",
      origemId: deducaoId,
      criadoPor: d.criadoPor,
      partidas: [
        { contaId: ids.get(CONTA_DEDUCAO_FUNDEB_REALIZADA)!, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: v },
        { contaId: ids.get(CONTA_RECEITA_A_REALIZAR_DA_DEDUCAO)!, tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: v },
        { contaId: ids.get(CONTA_VPD_TRANSFERENCIA_AO_FUNDEB)!, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: v },
        { contaId: conta.contaContabil.id, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: v },
        { contaId: ids.get(CONTA_DDR_DISPONIVEL)!, tipo: "DEBITO", subsistema: "CONTROLE", valor: v },
        { contaId: ids.get(CONTA_DDR_UTILIZADA_POR_DEDUCAO)!, tipo: "CREDITO", subsistema: "CONTROLE", valor: v },
      ],
    });
    await tx.deducaoDaReceitaRealizada.create({
      data: {
        id: deducaoId, exercicio, naturezaReceitaId: natureza.id, fonteId: fonte.id, exercicioFonte: 1, tipo: "FUNDEB", valor: v,
        data: quando, documento: d.documento, contaBancariaId: conta.id, lancamentoId, criadoPor: d.criadoPor,
      },
    });
    return { deducaoId, lancamentoId };
  });
}

export const zEstornarDeducao = z.object({
  deducaoId: z.string().min(1),
  dia: zDia,
  motivo: z.string().trim().min(10, "Diga por que a dedução é estornada."),
  criadoPor: z.string().min(1),
});

/** ESTORNA a dedução: lançamento novo com as mesmas pernas invertidas, apontando a original. Uma vez só. */
export async function estornarDeducaoDaReceita(
  prisma: PrismaClient,
  input: z.input<typeof zEstornarDeducao>
): Promise<{ readonly estornoId: string; readonly lancamentoId: string }> {
  const d = zEstornarDeducao.parse(input);
  const quando = inicioDoDiaCivil(d.dia);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarDeducaoDaReceita, "ENTE");
    const o = await tx.deducaoDaReceitaRealizada.findUnique({
      where: { id: d.deducaoId },
      select: {
        id: true, exercicio: true, naturezaReceitaId: true, fonteId: true, exercicioFonte: true, tipo: true, valor: true, documento: true, contaBancariaId: true,
        estornoDeId: true, estorno: { select: { id: true } }, naturezaReceita: { select: { codigo: true } },
        lancamento: { select: { id: true, partidas: { select: { contaId: true, tipo: true, subsistema: true, valor: true } } } },
      },
    });
    if (o === null) throw new Error("A dedução indicada não existe. Nada foi gravado.");
    if (o.estornoDeId !== null) throw new Error("Isto já é um estorno: estorno não se estorna. Nada foi gravado.");
    if (o.estorno !== null) throw new Error(`A dedução da receita ${o.naturezaReceita.codigo} já foi estornada. Nada foi gravado.`);
    await exigirExercicioAberto(tx, o.exercicio, `estorno da dedução da receita ${o.naturezaReceita.codigo}`);
    const estornoId = randomUUID();
    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `DED-FUNDEB-EST-${d.dia}-${estornoId.slice(0, 8)}`,
      dataTransacao: quando,
      historico: `Estorno da dedução da receita ${o.naturezaReceita.codigo} — ${d.motivo}`,
      origemTipo: "DEDUCAO_DA_RECEITA_ESTORNADA",
      origemId: estornoId,
      estornoDeId: o.lancamento.id,
      criadoPor: d.criadoPor,
      partidas: o.lancamento.partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const),
        subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
        valor: p.valor.toFixed(2),
      })),
    });
    await tx.deducaoDaReceitaRealizada.create({
      data: {
        id: estornoId, exercicio: o.exercicio, naturezaReceitaId: o.naturezaReceitaId, fonteId: o.fonteId, exercicioFonte: o.exercicioFonte,
        tipo: o.tipo, valor: o.valor.toFixed(2), data: quando, documento: o.documento, contaBancariaId: o.contaBancariaId,
        lancamentoId, estornoDeId: o.id, motivo: d.motivo, criadoPor: d.criadoPor,
      },
    });
    return { estornoId, lancamentoId };
  });
}

export interface DeducaoLida {
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly fonteId: string;
  readonly exercicioFonte: number;
  /** Com sinal: a dedução é positiva; o estorno, negativo. */
  readonly valor: Money;
  readonly data: Date;
}

/** As deduções realizadas do exercício (com os estornos com sinal), até o corte. Leitura pura. */
export async function deducoesRealizadas(prisma: Tx, exercicio: number, corte: Date | null): Promise<readonly DeducaoLida[]> {
  const ds = await prisma.deducaoDaReceitaRealizada.findMany({
    where: { exercicio, ...(corte !== null ? { data: { lte: corte } } : {}) },
    select: { valor: true, data: true, estornoDeId: true, fonteId: true, exercicioFonte: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  return ds.map((x) => ({
    naturezaCodigo: x.naturezaReceita.codigo,
    fonteCodigo: x.fonte.codigo,
    fonteId: x.fonteId,
    exercicioFonte: x.exercicioFonte,
    valor: x.estornoDeId === null ? toMoney(x.valor.toFixed(2)) : toMoney(x.valor.negated().toFixed(2)),
    data: x.data,
  }));
}
