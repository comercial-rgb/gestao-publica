import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  exigirCapacidade,
  exigirNaturezasCompativeis,
  tetoConciliavelDoPagamento,
  vinculoLiquido,
  zEstornarVinculoInput,
  zVincularInput,
  type EstornarVinculoInput,
  type SentidoInterno,
  type TipoInternoConciliacao,
  type VincularInput,
} from "./dominio.js";

/**
 * VÍNCULO DE CONCILIAÇÃO (M09, bloco 2).
 *
 * ═══ APPEND-ONLY, SIMÉTRICO, DERIVADO ═══
 * Zero UPDATE, zero DELETE. Desvincular é um registro NOVO (ESTORNO_VINCULO), e
 * "conciliado" é o SUM dos vínculos com os sinais — nunca uma flag.
 *
 * ═══ TODA SOMA PASSA POR `vinculoLiquido` ═══
 * Os dois tipos não têm o mesmo sinal. Um `SUM(*)` cru trataria o ESTORNO_VINCULO
 * como MAIS UMA conciliação: o lançamento apareceria conciliado em dobro e ficaria
 * "sem espaço" para o vínculo certo. É o bug do M08 (345af7d) esperando a vez.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// OS TOTAIS — leem SINAL_VINCULO, sempre.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `ate` = data de corte do VÍNCULO (`criadoEm` ≤ corte). `null` = sem corte.
 *
 * Um vínculo feito DEPOIS do corte não pode reduzir o residual de um relatório
 * daquela data: em 31/01 aquela linha ainda estava por explicar. O corte vale
 * para o vínculo também.
 */
type Corte = Date | null;

/** Quanto do lançamento do EXTRATO já está conciliado (líquido dos estornos). */
export async function vinculoLiquidoDoLancamento(
  tx: Tx,
  lancamentoExtratoId: string,
  ate: Corte = null
): Promise<Money> {
  const vinculos = await tx.vinculoConciliacao.findMany({
    where: {
      lancamentoExtratoId,
      ...(ate !== null ? { criadoEm: { lte: ate } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return vinculoLiquido(
    vinculos.map((v) => ({ tipo: v.tipo, valor: toMoney(v.valor.toFixed(2)) }))
  );
}

/** Quanto do movimento INTERNO já está conciliado (líquido dos estornos). */
export async function vinculoLiquidoDoMovimento(
  tx: Tx,
  tipoInterno: TipoInternoConciliacao,
  internoId: string,
  ate: Corte = null
): Promise<Money> {
  const vinculos = await tx.vinculoConciliacao.findMany({
    where: {
      tipoInterno,
      internoId,
      ...(ate !== null ? { criadoEm: { lte: ate } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return vinculoLiquido(
    vinculos.map((v) => ({ tipo: v.tipo, valor: toMoney(v.valor.toFixed(2)) }))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O LADO INTERNO — resolvido conforme o tipo, com a DERIVAÇÃO do módulo de origem
// ═══════════════════════════════════════════════════════════════════════════

interface MovimentoInterno {
  readonly descricao: string;
  readonly sentido: SentidoInterno;
  /**
   * O valor que TOCOU O BANCO. Ver a nota do PAGAMENTO abaixo: não é
   * necessariamente o valor do registro.
   */
  readonly valorConciliavel: Money;
  /** id da ContaBancaria, quando o modelo a tem. */
  readonly contaBancariaId: string | null;
  /** Quando o modelo NÃO tem conta (M04), a fonte é o que dá para conferir. */
  readonly fonteId: string | null;
}

async function carregarPagamento(
  tx: Tx,
  id: string
): Promise<MovimentoInterno> {
  const p = await tx.pagamento.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      valor: true,
      contaBancaria: true, // CÓDIGO, não FK (modelo do M05)
      estornoDeId: true,
      estornos: { select: { id: true } },
      retencoes: { select: { tipo: true, valor: true } },
    },
  });
  if (p === null) throw new Error(`Pagamento ${id} não encontrado.`);

  // (g) ANULADO — DERIVADO da relação `estornos` (o M05 não tem flag, e não vai
  // ter: "está anulado?" é `estornos.length > 0`, como manda o invariante 2).
  if (p.estornos.length > 0) {
    throw new Error(
      `Pagamento ${p.numero} está ANULADO — não recebe vínculo de conciliação. ` +
        `Um pagamento anulado não moveu dinheiro; conciliá-lo com uma linha do ` +
        `extrato seria explicar a saída do banco com um fato que foi desfeito.`
    );
  }
  // Uma ANULAÇÃO de pagamento é dinheiro VOLTANDO — ela não é um pagamento.
  if (p.estornoDeId !== null) {
    throw new Error(
      `Pagamento ${p.numero} É uma ANULAÇÃO de pagamento, não um pagamento. ` +
        `Estorno não é conciliável: concilie o movimento original, ou registre a ` +
        `diferença.`
    );
  }

  // O TETO É O LÍQUIDO (ver `tetoConciliavelDoPagamento`, no domínio): a mesma
  // função que o RELATÓRIO de conciliação usa para o residual. Se as duas
  // divergissem, um pagamento poderia ser conciliável pelo serviço e aparecer
  // como diferença no relatório — ao mesmo tempo.
  const liquido = tetoConciliavelDoPagamento(
    toMoney(p.valor.toFixed(2)),
    p.retencoes.map((r) => ({ tipo: r.tipo, valor: toMoney(r.valor.toFixed(2)) }))
  );

  const conta = await tx.contaBancaria.findUnique({
    where: { codigo: p.contaBancaria },
    select: { id: true, fonteId: true },
  });
  if (conta === null) {
    throw new Error(
      `Conta bancária "${p.contaBancaria}" do pagamento ${p.numero} não existe.`
    );
  }

  return {
    descricao: `o pagamento ${p.numero}`,
    sentido: "SAIDA",
    valorConciliavel: liquido,
    contaBancariaId: conta.id,
    fonteId: conta.fonteId,
  };
}

async function carregarArrecadacao(
  tx: Tx,
  id: string
): Promise<MovimentoInterno> {
  const r = await tx.receitaArrecadada.findUnique({
    where: { id },
    select: {
      id: true,
      numeroReceita: true,
      tipo: true,
      valor: true,
      fonteId: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
    },
  });
  if (r === null) throw new Error(`Receita arrecadada ${id} não encontrada.`);

  // (g) ANULADA — DERIVADO da relação `estornos` (M04, invariante 2).
  if (r.estornos.length > 0) {
    throw new Error(
      `Receita ${r.numeroReceita} está ANULADA — não recebe vínculo de ` +
        `conciliação. Uma arrecadação anulada não trouxe dinheiro.`
    );
  }
  if (r.estornoDeId !== null || r.tipo === "ANULACAO") {
    throw new Error(
      `Receita ${r.numeroReceita} É uma ANULAÇÃO de receita. Estorno não é ` +
        `conciliável: concilie o movimento original, ou registre a diferença.`
    );
  }

  return {
    descricao: `a arrecadação ${r.numeroReceita}`,
    sentido: "ENTRADA",
    valorConciliavel: toMoney(r.valor.toFixed(2)),
    // ⚠️ `ReceitaArrecadada` NÃO TEM ContaBancaria no modelo (M04). O que dá para
    // conferir é a FONTE — a mesma regra do TR 5.23 que o M05 aplica no pagamento.
    contaBancariaId: null,
    fonteId: r.fonteId,
  };
}

async function carregarMovimentoExtra(
  tx: Tx,
  id: string
): Promise<MovimentoInterno> {
  const m = await tx.movimentoExtraorcamentario.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      valor: true,
      contaBancariaId: true,
      pagamentoId: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      tipoConsignacao: { select: { codigo: true } },
    },
  });
  if (m === null) {
    throw new Error(`Movimento extraorçamentário ${id} não encontrado.`);
  }

  // (d) ESTORNO NÃO É CONCILIÁVEL — porta fechada por design.
  if (m.tipo === "ESTORNO_INGRESSO" || m.tipo === "ESTORNO_DISPENDIO") {
    throw new Error(
      `Movimento ${id} é um ${m.tipo}: estorno não é conciliável. Concilie o ` +
        `movimento original, ou registre a diferença.`
    );
  }
  if (m.estornoDeId !== null) {
    throw new Error(
      `Movimento ${id} É um estorno: estorno não é conciliável. Concilie o ` +
        `movimento original, ou registre a diferença.`
    );
  }
  // (g) ESTORNADO — DERIVADO da relação (M07, mesma disciplina).
  if (m.estornos.length > 0) {
    throw new Error(
      `Movimento extraorçamentário ${id} (${m.tipoConsignacao.codigo}) foi ` +
        `ESTORNADO — não recebe vínculo de conciliação.`
    );
  }

  // ⚠️ A RETENÇÃO NA FONTE NÃO TEM LINHA BANCÁRIA PRÓPRIA.
  // Ela nasceu DENTRO de um pagamento (M07): o dinheiro do INSS não entrou no
  // banco — ele apenas NÃO SAIU. O extrato mostra o líquido do pagamento, e mais
  // nada. Procurar uma linha bancária para ela é procurar o que não existe; e
  // conciliá-la contra qualquer linha seria casar dinheiro duas vezes (o
  // pagamento já concilia pelo líquido, que é justamente o bruto MENOS ela).
  if (m.pagamentoId !== null) {
    throw new Error(
      `Movimento ${id} é uma RETENÇÃO NA FONTE (nasceu dentro do pagamento ` +
        `${m.pagamentoId}) — ela NÃO tem linha bancária própria: o dinheiro do ` +
        `consignatário não entrou no banco, ele apenas não saiu. O extrato mostra ` +
        `o LÍQUIDO do pagamento, e é o pagamento que se concilia. O que tem linha ` +
        `no banco é o REPASSE (o DISPENDIO), quando ele acontecer.`
    );
  }

  return {
    descricao: `o movimento extraorçamentário ${id} (${m.tipoConsignacao.codigo})`,
    // INGRESSO = dinheiro de terceiro ENTROU (caução, depósito).
    // DISPENDIO = repasse/devolução: SAIU.
    sentido: m.tipo === "INGRESSO" ? "ENTRADA" : "SAIDA",
    valorConciliavel: toMoney(m.valor.toFixed(2)),
    contaBancariaId: m.contaBancariaId,
    fonteId: null,
  };
}

async function carregarInterno(
  tx: Tx,
  tipo: TipoInternoConciliacao,
  id: string
): Promise<MovimentoInterno> {
  switch (tipo) {
    case "PAGAMENTO":
      return carregarPagamento(tx, id);
    case "ARRECADACAO":
      return carregarArrecadacao(tx, id);
    case "MOVIMENTO_EXTRA":
      return carregarMovimentoExtra(tx, id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) VINCULAR
// ═══════════════════════════════════════════════════════════════════════════

export async function vincular(
  prisma: PrismaClient,
  input: VincularInput
): Promise<{ readonly vinculoId: string }> {
  // (a) valor > 0 — Zod, Decimal (nunca number).
  const dados = zVincularInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ O ESCOPO SEGUE O FATO INTERNO, e ele é HETEROGÊNEO por natureza (ver o censo 0(a)): conciliar
    // um PAGAMENTO é ato da unidade que pagou (o pagamento chega à ficha); conciliar uma ARRECADAÇÃO ou
    // um movimento EXTRAorçamentário não pertence a unidade nenhuma — e aí só a permissão global vale.
    // Ver `ugDoInterno`.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.vincular, { interno: { tipo: dados.tipoInterno, id: dados.internoId } });

    // (b) o lançamento do extrato existe.
    const linha = await tx.lancamentoExtrato.findUnique({
      where: { id: dados.lancamentoExtratoId },
      select: {
        id: true,
        fitid: true,
        natureza: true,
        valor: true,
        contaBancariaId: true,
        contaBancaria: { select: { codigo: true, fonteId: true } },
      },
    });
    if (linha === null) {
      throw new Error(
        `Lançamento de extrato ${dados.lancamentoExtratoId} não encontrado.`
      );
    }

    // (c) (d) (g) — o movimento interno existe, não é estorno, não está estornado.
    const interno = await carregarInterno(tx, dados.tipoInterno, dados.internoId);

    // (e) naturezas compatíveis.
    exigirNaturezasCompativeis(linha.natureza, interno.sentido, interno.descricao);

    // (f) MESMA conta bancária — comparando a FK REAL dos dois lados.
    if (interno.contaBancariaId !== null) {
      if (interno.contaBancariaId !== linha.contaBancariaId) {
        throw new Error(
          `CONTAS DIFERENTES: a linha do extrato (FITID ${linha.fitid}) é da conta ` +
            `${linha.contaBancaria.codigo}, e ${interno.descricao} moveu OUTRA ` +
            `conta bancária. Conciliar entre contas faria o dinheiro de uma ` +
            `explicar o saldo da outra.`
        );
      }
    } else if (interno.fonteId !== null) {
      // O modelo do M04 não tem ContaBancaria (ver `carregarArrecadacao`). O que
      // resta conferir é a FONTE — a mesma regra do TR 5.23.
      if (interno.fonteId !== linha.contaBancaria.fonteId) {
        throw new Error(
          `FONTES DIFERENTES: a conta ${linha.contaBancaria.codigo} é da fonte ` +
            `${linha.contaBancaria.fonteId}, e ${interno.descricao} é da fonte ` +
            `${interno.fonteId}. Recurso de uma fonte não entra na conta de outra ` +
            `(TR 5.23).`
        );
      }
    }

    // (h) capacidade do lado do EXTRATO — SUM com sinais, DENTRO da transação.
    const jaNoExtrato = await vinculoLiquidoDoLancamento(tx, linha.id);
    exigirCapacidade(
      toMoney(linha.valor.toFixed(2)),
      jaNoExtrato,
      dados.valor,
      `lado do EXTRATO (FITID ${linha.fitid})`
    );

    // (i) capacidade do lado INTERNO — idem. Parciais dos DOIS lados são
    // legítimos: um depósito cobre N arrecadações, e uma arrecadação pode chegar
    // em N depósitos. O que não pode é estourar qualquer um dos dois.
    const jaNoInterno = await vinculoLiquidoDoMovimento(
      tx,
      dados.tipoInterno,
      dados.internoId
    );
    exigirCapacidade(
      interno.valorConciliavel,
      jaNoInterno,
      dados.valor,
      `lado INTERNO (${interno.descricao})`
    );

    const v = await tx.vinculoConciliacao.create({
      data: {
        lancamentoExtratoId: linha.id,
        tipoInterno: dados.tipoInterno,
        internoId: dados.internoId,
        valor: dados.valor.toFixed(2),
        tipo: "VINCULO",
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    return { vinculoId: v.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ESTORNAR VÍNCULO — simétrico, e nascido junto (a lição do M08)
// ═══════════════════════════════════════════════════════════════════════════

export async function estornarVinculo(
  prisma: PrismaClient,
  input: EstornarVinculoInput
): Promise<{ readonly vinculoId: string }> {
  const dados = zEstornarVinculoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // Mesmo escopo do vínculo que se desfaz — ele guarda `tipoInterno` e `internoId`.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarVinculo, { vinculo: dados.vinculoId });

    const original = await tx.vinculoConciliacao.findUnique({
      where: { id: dados.vinculoId },
      select: {
        id: true,
        lancamentoExtratoId: true,
        tipoInterno: true,
        internoId: true,
        valor: true,
        tipo: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Vínculo ${dados.vinculoId} não encontrado.`);
    }

    // Um estorno não se estorna.
    if (original.tipo === "ESTORNO_VINCULO" || original.estornoDeId !== null) {
      throw new Error(
        `Vínculo ${dados.vinculoId} JÁ É um estorno — um estorno não se estorna.`
      );
    }
    // "Já estornado?" é DERIVADO da back-relation. Nunca flag.
    // (A garantia DURA é o índice parcial uq_estorno_vinculo_unico; este recheck
    // existe para dar mensagem limpa antes de o banco falar.)
    if (original.estornos.length > 0) {
      throw new Error(`Vínculo ${dados.vinculoId} já foi estornado.`);
    }

    // MESMO VALOR — a perna do estorno espelha a original. Recarimbar um valor
    // aqui devolveria capacidade de conciliação diferente da que foi tomada.
    const estorno = await tx.vinculoConciliacao.create({
      data: {
        lancamentoExtratoId: original.lancamentoExtratoId,
        tipoInterno: original.tipoInterno,
        internoId: original.internoId,
        valor: original.valor,
        tipo: "ESTORNO_VINCULO",
        estornoDeId: original.id,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    return { vinculoId: estorno.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta — "conciliado" é DERIVADO
// ═══════════════════════════════════════════════════════════════════════════

export interface SituacaoConciliacao {
  readonly lancamentoExtratoId: string;
  readonly valor: Money;
  readonly vinculado: Money;
  readonly restante: Money;
  readonly conciliado: boolean;
}

export async function situacaoDoLancamento(
  prisma: PrismaClient,
  lancamentoExtratoId: string
): Promise<SituacaoConciliacao> {
  const l = await prisma.lancamentoExtrato.findUniqueOrThrow({
    where: { id: lancamentoExtratoId },
    select: { id: true, valor: true },
  });
  const valor = toMoney(l.valor.toFixed(2));
  const vinculado = await vinculoLiquidoDoLancamento(prisma, l.id);

  return {
    lancamentoExtratoId: l.id,
    valor,
    vinculado,
    restante: toMoney(valor.minus(vinculado)),
    // DERIVADO — nunca flag.
    conciliado: vinculado.greaterThan(0),
  };
}
