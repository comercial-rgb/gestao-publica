import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A APURAÇÃO DE CAIXA É DO M01 — a MESMA função do Anexo 13 (M12), com outro
// recorte. Uma aritmética, muitos recortes.
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import {
  comSinalDaNatureza,
  comSinalDoSentido,
  saldoDoExtrato,
  tetoConciliavelDoPagamento,
  type NaturezaExtratoDb,
  type SentidoInterno,
  type TipoInternoConciliacao,
} from "./dominio.js";
import {
  vinculoLiquidoDoLancamento,
  vinculoLiquidoDoMovimento,
} from "./vinculo.js";

/**
 * CONCILIAÇÃO BANCÁRIA (M09, bloco 3) — LEITURA PURA.
 *
 * Zero escrita, zero tabela nova, NENHUMA coluna cache. Todo número sai de SUM
 * com os Records de sinal (`SINAL_NATUREZA_EXTRATO`, `SINAL_VINCULO`,
 * `SINAL_MOVIMENTO_EXTRA`) — as mesmas regras do M12.
 *
 * ═══ A PERGUNTA QUE ELE RESPONDE ═══
 * "O banco e o razão contam a mesma história? Se não, ONDE exatamente eles
 * divergem?" — e a resposta não pode ser um número solto: tem de vir com as
 * LINHAS que compõem cada diferença.
 *
 * ═══ O CORTE É O MESMO NOS DOIS LADOS, E É A DATA DO FATO ═══
 * Extrato: `dataPostagem`. Contábil: `dataTransacao` do lançamento. Interno: a
 * data do próprio fato (pagamento, arrecadação, movimento extra).
 *
 * Não é `criadoEm`: comparar um lado pela data do FATO e o outro pela data da
 * DIGITAÇÃO faria os dois nunca fecharem — um pagamento de janeiro digitado em
 * março sumiria do razão de janeiro, mas não do extrato.
 *
 * ═══ A AMARRAÇÃO ═══
 *   saldoExtrato − saldoContabil == Σresidual(extrato) − Σresidual(interno)
 *
 * Ela é uma IDENTIDADE, e é por isso que vale: cada vínculo aparece dos DOIS
 * lados com o MESMO valor e o MESMO sinal (o guard de natureza garante que
 * CREDITO só casa com ENTRADA e DEBITO com SAÍDA), então os vínculos se cancelam
 * e sobra exatamente a diferença de saldos. Se ela não fechar, ou falta um fato
 * no relatório, ou há vínculo cruzando o corte — e o relatório NÃO SAI.
 */

export interface LinhaDiferenca {
  readonly id: string;
  readonly data: Date;
  readonly descricao: string;
  /** RESIDUAL COM SINAL: positivo = entrou, negativo = saiu. */
  readonly residual: Dinheiro;
}

export interface LinhaDiferencaInterna extends LinhaDiferenca {
  readonly tipoInterno: TipoInternoConciliacao;
}

export interface ConciliacaoBancaria {
  readonly relatorio: "CONCILIAÇÃO BANCÁRIA";
  readonly contaBancaria: {
    readonly id: string;
    readonly codigo: string;
    readonly contaContabil: string;
  };
  readonly corte: Date;
  /** Σ (valor × sinal da natureza) das linhas do extrato até o corte. */
  readonly saldoExtrato: Dinheiro;
  /** ΣD − ΣC das partidas na conta contábil até o corte. */
  readonly saldoContabil: Dinheiro;
  /** saldoExtrato − saldoContabil. Zero = os dois contam a mesma história. */
  readonly diferenca: Dinheiro;
  /** No BANCO e não no razão (tarifa não contabilizada, crédito não registrado). */
  readonly noExtratoSemVinculo: readonly LinhaDiferenca[];
  /** No RAZÃO e não no banco (cheque não compensado, depósito não creditado). */
  readonly internoSemVinculo: readonly LinhaDiferencaInterna[];
}

export class MapeamentoContabilAusenteError extends Error {
  constructor(readonly contaBancariaId: string, codigo: string) {
    super(
      `A conta bancária "${codigo}" não tem CONTA CONTÁBIL mapeada ` +
        `(contaContabilId). Sem esse mapeamento é impossível dizer contra qual ` +
        `conta do razão o extrato deve fechar — e conciliar contra a conta errada ` +
        `é pior do que não conciliar. Parametrize o mapeamento antes de emitir a ` +
        `conciliação.`
    );
    this.name = "MapeamentoContabilAusenteError";
  }
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

export async function conciliacaoBancaria(
  prisma: PrismaClient,
  contaBancariaId: string,
  corte: Date
): Promise<ConciliacaoBancaria> {
  const conta = await prisma.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: {
      id: true,
      codigo: true,
      fonteId: true,
      contaContabil: { select: { codigo: true } },
    },
  });
  if (conta === null) {
    throw new Error(`Conta bancária ${contaBancariaId} não cadastrada.`);
  }
  // FAIL-CLOSED: sem mapeamento não há contra o que fechar.
  if (conta.contaContabil === null) {
    throw new MapeamentoContabilAusenteError(contaBancariaId, conta.codigo);
  }
  const contaContabil = conta.contaContabil.codigo;

  // ── (a) SALDO DO EXTRATO — SUM via SINAL_NATUREZA_EXTRATO ────────────────
  const linhasExtrato = await prisma.lancamentoExtrato.findMany({
    where: { contaBancariaId: conta.id, dataPostagem: { lte: corte } },
    select: {
      id: true,
      fitid: true,
      memo: true,
      dataPostagem: true,
      natureza: true,
      valor: true,
    },
    orderBy: { dataPostagem: "asc" },
  });

  const saldoExtrato = saldoDoExtrato(
    linhasExtrato.map((l) => ({
      natureza: l.natureza,
      valor: toMoney(l.valor.toFixed(2)),
    }))
  );

  // ── (b) SALDO CONTÁBIL — a MESMA apuração do Anexo 13, outro recorte ─────
  const saldoContabil = await saldoDasContas(
    prisma,
    [contaContabil],
    corte,
    // A data do FATO — ver a nota do corte, no topo.
    "dataTransacao"
  );

  // ── (c) DIFERENÇAS NOMEADAS ──────────────────────────────────────────────
  const noExtratoSemVinculo: LinhaDiferenca[] = [];
  for (const l of linhasExtrato) {
    const valor = toMoney(l.valor.toFixed(2));
    // O vínculo também respeita o corte: um vínculo feito depois não pode
    // explicar retroativamente uma linha que, naquela data, estava em aberto.
    const vinculado = await vinculoLiquidoDoLancamento(prisma, l.id, corte);
    const residual = sub(valor, vinculado);
    if (residual.greaterThan(0)) {
      noExtratoSemVinculo.push({
        id: l.id,
        data: l.dataPostagem,
        descricao: `[${l.natureza}] ${l.memo} (FITID ${l.fitid})`,
        residual: serializar(comSinalDaNatureza(l.natureza, residual)),
      });
    }
  }

  const internoSemVinculo = await diferencasInternas(prisma, conta, corte);

  // ── (d) A AMARRAÇÃO — auto-executável ────────────────────────────────────
  const diferenca = sub(saldoExtrato, saldoContabil);

  const somaResiduais = (linhas: readonly LinhaDiferenca[]): Money =>
    linhas.reduce((acc, l) => soma(acc, toMoney(l.residual)), zero());

  const explicado = sub(
    somaResiduais(noExtratoSemVinculo),
    somaResiduais(internoSemVinculo)
  );

  if (!diferenca.equals(explicado)) {
    throw new Error(
      `CONCILIAÇÃO NÃO FECHA (conta ${conta.codigo}): a diferença entre os ` +
        `saldos é ${serializar(diferenca)} (extrato ${serializar(saldoExtrato)} ` +
        `− contábil ${serializar(saldoContabil)}), mas as linhas sem vínculo ` +
        `explicam ${serializar(explicado)} — sobram ` +
        `${serializar(sub(diferenca, explicado))} SEM EXPLICAÇÃO. Ou falta um ` +
        `fato no relatório, ou há vínculo cruzando a data de corte. A ` +
        `conciliação não sai enquanto a diferença não estiver toda nomeada.`
    );
  }

  return {
    relatorio: "CONCILIAÇÃO BANCÁRIA",
    contaBancaria: { id: conta.id, codigo: conta.codigo, contaContabil },
    corte,
    saldoExtrato: serializar(saldoExtrato),
    saldoContabil: serializar(saldoContabil),
    diferenca: serializar(diferenca),
    noExtratoSemVinculo,
    internoSemVinculo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O LADO INTERNO — os fatos do sistema que MOVERAM ESTA conta bancária.
//
// São exatamente os CONCILIÁVEIS do bloco 2 (mesmos predicados): vivos, não
// estornos, e — no caso do M07 — sem `pagamentoId` (a retenção na fonte não tem
// linha bancária própria).
//
// E os anulados? Ficam de fora dos DOIS lados, e isso é consistente: no razão, a
// anulação inverte as pernas do original, e o par soma ZERO no caixa. Excluir os
// dois do relatório mantém a amarração exata.
// ═══════════════════════════════════════════════════════════════════════════

async function diferencasInternas(
  prisma: PrismaClient,
  conta: { id: string; codigo: string; fonteId: string },
  corte: Date
): Promise<readonly LinhaDiferencaInterna[]> {
  const linhas: LinhaDiferencaInterna[] = [];

  const acrescentar = async (
    tipoInterno: TipoInternoConciliacao,
    id: string,
    data: Date,
    descricao: string,
    teto: Money,
    sentido: SentidoInterno
  ): Promise<void> => {
    const vinculado = await vinculoLiquidoDoMovimento(
      prisma,
      tipoInterno,
      id,
      corte
    );
    const residual = sub(teto, vinculado);
    if (residual.greaterThan(0)) {
      linhas.push({
        tipoInterno,
        id,
        data,
        descricao,
        residual: serializar(comSinalDoSentido(sentido, residual)),
      });
    }
  };

  // ── PAGAMENTOS (SAÍDA) — pelo LÍQUIDO ────────────────────────────────────
  const pagamentos = await prisma.pagamento.findMany({
    where: {
      contaBancaria: conta.codigo, // o M05 guarda o CÓDIGO da conta
      data: { lte: corte },
      estornoDeId: null, // não é uma anulação
      estornos: { none: {} }, // e não foi anulado
    },
    select: {
      id: true,
      numero: true,
      valor: true,
      data: true,
      retencoes: { select: { tipo: true, valor: true } },
    },
  });
  for (const p of pagamentos) {
    // O MESMO teto que o `vincular()` usa. Fonte única.
    const teto = tetoConciliavelDoPagamento(
      toMoney(p.valor.toFixed(2)),
      p.retencoes.map((r) => ({ tipo: r.tipo, valor: toMoney(r.valor.toFixed(2)) }))
    );
    await acrescentar(
      "PAGAMENTO",
      p.id,
      p.data,
      `Pagamento ${p.numero}`,
      teto,
      "SAIDA"
    );
  }

  // ── ARRECADAÇÕES (ENTRADA) ───────────────────────────────────────────────
  // ⚠️ `ReceitaArrecadada` NÃO TEM ContaBancaria no modelo (M04) — o vínculo
  // possível é a FONTE (mesma limitação do bloco 2). Se duas contas bancárias
  // dividirem a mesma fonte, a arrecadação apareceria nas duas: é a pendência
  // registrada no MODULO.md, e o dia em que o M04 ganhar a conta ela some.
  const arrecadacoes = await prisma.receitaArrecadada.findMany({
    where: {
      fonteId: conta.fonteId,
      tipo: "ARRECADACAO",
      dataArrecadacao: { lte: corte },
      estornoDeId: null,
      estornos: { none: {} },
    },
    select: { id: true, numeroReceita: true, valor: true, dataArrecadacao: true },
  });
  for (const a of arrecadacoes) {
    await acrescentar(
      "ARRECADACAO",
      a.id,
      a.dataArrecadacao,
      `Arrecadação ${a.numeroReceita}`,
      toMoney(a.valor.toFixed(2)),
      "ENTRADA"
    );
  }

  // ── MOVIMENTOS EXTRAORÇAMENTÁRIOS (ingresso = ENTRADA; dispêndio = SAÍDA) ─
  const extras = await prisma.movimentoExtraorcamentario.findMany({
    where: {
      contaBancariaId: conta.id,
      tipo: { in: ["INGRESSO", "DISPENDIO"] },
      data: { lte: corte },
      // A RETENÇÃO NA FONTE não tem linha bancária própria (nasceu dentro do
      // pagamento, e o extrato já mostra o líquido dele).
      pagamentoId: null,
      estornoDeId: null,
      estornos: { none: {} },
    },
    select: {
      id: true,
      tipo: true,
      valor: true,
      data: true,
      credorConsignatario: true,
      tipoConsignacao: { select: { codigo: true } },
    },
  });
  for (const m of extras) {
    await acrescentar(
      "MOVIMENTO_EXTRA",
      m.id,
      m.data,
      `${m.tipo} ${m.tipoConsignacao.codigo} — ${m.credorConsignatario}`,
      toMoney(m.valor.toFixed(2)),
      m.tipo === "INGRESSO" ? "ENTRADA" : "SAIDA"
    );
  }

  return linhas.sort((a, b) => a.data.getTime() - b.data.getTime());
}

/** A natureza usada no relatório — reexportada para quem consome a estrutura. */
export type { NaturezaExtratoDb };
