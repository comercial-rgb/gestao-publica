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
  type NaturezaExtratoDb,
  type TipoInternoConciliacao,
} from "./dominio.js";
// ⚠️ A FONTE ÚNICA dos fatos que moveram a conta — ver o cabeçalho de `caixa.ts`.
import { fatosDeCaixaDaConta, type ContaParaCaixa } from "./caixa.js";
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
      // ⚠️ O ID, e não só o código: o critério de inclusão da transferência no lado
      // interno compara a conta contábil da origem com a do destino (ver `caixa.ts`).
      contaContabilId: true,
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

  const internoSemVinculo = await residuaisInternos(prisma, conta, corte);

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
// O LADO INTERNO — agora uma CASCA sobre `caixa.ts`.
//
// ⚠️ A ENUMERAÇÃO SAIU DAQUI, E A SAÍDA FOI O PONTO. Ela vivia neste arquivo e era a
// única resposta para "que fatos moveram esta conta?". Quando a movimentação bancária
// (TR 5.62) precisou da mesma resposta para perguntar "há saldo?", escrever uma segunda
// consulta teria criado um segundo caminho para os mesmos fatos — e o sintoma seria o
// pior possível: o guard de saldo aprovando um saque que a conciliação, minutos depois,
// mostraria como impossível.
//
// O que sobrou aqui é o que é EXCLUSIVO da conciliação: descontar do fato o que já foi
// vinculado, e ficar só com o residual. O saldo não desconta vínculo nenhum — vínculo
// não move dinheiro, só explica.
// ═══════════════════════════════════════════════════════════════════════════

async function residuaisInternos(
  prisma: PrismaClient,
  conta: ContaParaCaixa,
  corte: Date
): Promise<readonly LinhaDiferencaInterna[]> {
  const fatos = await fatosDeCaixaDaConta(prisma, conta, corte);

  const linhas: LinhaDiferencaInterna[] = [];
  for (const f of fatos) {
    // O vínculo também respeita o corte: um vínculo feito depois não pode explicar
    // retroativamente um fato que, naquela data, estava em aberto.
    const vinculado = await vinculoLiquidoDoMovimento(
      prisma,
      f.tipoInterno,
      f.id,
      corte
    );
    const residual = sub(f.teto, vinculado);
    if (residual.greaterThan(0)) {
      linhas.push({
        tipoInterno: f.tipoInterno,
        id: f.id,
        data: f.data,
        descricao: f.descricao,
        residual: serializar(comSinalDoSentido(f.sentido, residual)),
      });
    }
  }
  return linhas;
}

/** A natureza usada no relatório — reexportada para quem consome a estrutura. */
export type { NaturezaExtratoDb };
