import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  saldoDosFatosDeCaixa,
  SENTIDO_MOVIMENTO_BANCARIO,
  tetoConciliavelDoPagamento,
  type SentidoInterno,
  type TipoInternoConciliacao,
} from "./dominio.js";

/**
 * OS FATOS QUE MOVERAM UMA CONTA BANCÁRIA — **fonte única**.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE, E NÃO UMA SEGUNDA CONSULTA ═══
 * Esta enumeração vivia dentro de `conciliacao.ts`, como `diferencasInternas`. Quando a
 * movimentação bancária (TR 5.62) precisou perguntar "há saldo nesta conta AGORA?", havia
 * duas saídas: escrever uma segunda consulta que somasse os mesmos fatos, ou extrair a que
 * já existia.
 *
 * A segunda consulta seria **um segundo caminho para os mesmos fatos** — e as duas
 * divergiriam no primeiro fato novo que alguém lembrasse de somar num lugar e esquecesse
 * no outro. O sintoma seria o pior possível: o guard de saldo aprovaria um saque que a
 * conciliação, minutos depois, mostraria como impossível. Aqui a enumeração é UMA, e os
 * dois consumidores derivam dela.
 *
 * ═══ ⚠️ O CRITÉRIO DE INCLUSÃO — E ELE NÃO É "TUDO QUE TOCA A CONTA" ═══
 * A conciliação vale por uma identidade:
 *
 *     saldoExtrato − saldoContabil == Σresidual(extrato) − Σresidual(interno)
 *
 * Ela só fecha se o lado interno espelhar **exatamente o que o razão registrou na conta
 * contábil DESTA conta bancária**. Um fato que move a conta no banco mas NÃO move a conta
 * contábil dela não pode entrar no lado interno — se entrar, a identidade quebra.
 *
 * O caso que obriga a dizer isso é a TRANSFERÊNCIA entre contas próprias:
 *
 * | Contas | Razão na contábil da origem | Entra no lado interno? |
 * |---|---|---|
 * | mesma conta contábil | D e C na mesma conta → **líquido zero** | **não** |
 * | contas contábeis diferentes | C de X → move | **sim** |
 *
 * ⚠️ **E ISTO CORRIGE UM DEFEITO QUE JÁ EXISTIA.** Antes, a transferência não entrava
 * NUNCA. No caso de contas contábeis diferentes, a identidade não fechava e
 * `conciliacaoBancaria` **lançava** — a conciliação de qualquer conta que tivesse feito
 * uma transferência para conta de outra natureza contábil simplesmente não saía.
 *
 * No caso de mesma conta contábil, ela fechava e continua fechando — a linha do extrato
 * fica como diferença, e isso é **verdade**: o razão de fato não distingue esse
 * movimento, porque as duas pernas caíram na mesma conta.
 */

/** Um fato do sistema que moveu esta conta bancária. */
export interface FatoDeCaixaDaConta {
  readonly tipoInterno: TipoInternoConciliacao;
  readonly id: string;
  readonly data: Date;
  readonly descricao: string;
  /**
   * O quanto deste fato é conciliável — e para o saldo, o quanto ele moveu.
   * SEMPRE positivo; quem dá o sinal é `sentido`.
   *
   * ⚠️ NO PAGAMENTO ELE É O LÍQUIDO, não o bruto: um pagamento de 6.000 com 500 retidos
   * tira 5.500 do banco. É `tetoConciliavelDoPagamento`, a mesma função que o
   * `vincular()` usa — se as duas divergissem, um pagamento poderia ser conciliável pelo
   * serviço e aparecer como diferença no relatório ao mesmo tempo.
   */
  readonly teto: Money;
  readonly sentido: SentidoInterno;
}

export interface ContaParaCaixa {
  readonly id: string;
  readonly codigo: string;
  readonly fonteId: string;
  readonly contaContabilId: string | null;
}

/**
 * Enumera os fatos internos que moveram a conta contábil DESTA conta bancária, até o
 * corte. Ordenados por data.
 *
 * ⚠️ OS ANULADOS FICAM DE FORA DOS DOIS LADOS, e isso é consistente: no razão, a anulação
 * inverte as pernas do original, e o par soma ZERO no caixa. Excluir os dois mantém a
 * identidade exata.
 */
export async function fatosDeCaixaDaConta(
  prisma: PrismaClient,
  conta: ContaParaCaixa,
  corte: Date
): Promise<readonly FatoDeCaixaDaConta[]> {
  const fatos: FatoDeCaixaDaConta[] = [];

  // ── PAGAMENTOS (SAÍDA) — pelo LÍQUIDO ──────────────────────────────────────
  const pagamentos = await prisma.pagamento.findMany({
    where: {
      contaBancaria: conta.codigo, // o M05 guarda o CÓDIGO da conta
      data: { lte: corte },
      estornoDeId: null,
      estornos: { none: {} },
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
    fatos.push({
      tipoInterno: "PAGAMENTO",
      id: p.id,
      data: p.data,
      descricao: `Pagamento ${p.numero}`,
      teto: tetoConciliavelDoPagamento(
        toMoney(p.valor.toFixed(2)),
        p.retencoes.map((r) => ({ tipo: r.tipo, valor: toMoney(r.valor.toFixed(2)) }))
      ),
      sentido: "SAIDA",
    });
  }

  // ── ARRECADAÇÕES (ENTRADA) ─────────────────────────────────────────────────
  // ⚠️ `ReceitaArrecadada` NÃO TEM ContaBancaria no modelo (M04) — o vínculo possível é a
  // FONTE. Se duas contas bancárias dividirem a mesma fonte, a arrecadação aparece nas
  // duas: é a pendência registrada no MODULO.md, e o dia em que o M04 ganhar a conta ela
  // some. Enquanto isso, o SALDO de uma dessas contas é otimista — e este comentário é o
  // aviso de que ele é.
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
    fatos.push({
      tipoInterno: "ARRECADACAO",
      id: a.id,
      data: a.dataArrecadacao,
      descricao: `Arrecadação ${a.numeroReceita}`,
      teto: toMoney(a.valor.toFixed(2)),
      sentido: "ENTRADA",
    });
  }

  // ── MOVIMENTOS EXTRAORÇAMENTÁRIOS ──────────────────────────────────────────
  const extras = await prisma.movimentoExtraorcamentario.findMany({
    where: {
      contaBancariaId: conta.id,
      tipo: { in: ["INGRESSO", "DISPENDIO"] },
      data: { lte: corte },
      // A RETENÇÃO NA FONTE não tem linha bancária própria (nasceu dentro do pagamento,
      // e o extrato já mostra o líquido dele).
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
    fatos.push({
      tipoInterno: "MOVIMENTO_EXTRA",
      id: m.id,
      data: m.data,
      descricao: `${m.tipo} ${m.tipoConsignacao.codigo} — ${m.credorConsignatario}`,
      teto: toMoney(m.valor.toFixed(2)),
      sentido: m.tipo === "INGRESSO" ? "ENTRADA" : "SAIDA",
    });
  }

  // ── MOVIMENTAÇÃO BANCÁRIA (TR 5.62) ────────────────────────────────────────
  // Sempre entra: o lançamento dela tem uma perna na conta contábil DESTA conta (a outra
  // é a contrapartida, que o caso de uso proíbe de ser a mesma).
  const movimentos = await prisma.movimentoBancario.findMany({
    where: {
      contaBancariaId: conta.id,
      data: { lte: corte },
      estornoDeId: null,
      estornos: { none: {} },
    },
    select: { id: true, tipo: true, valor: true, data: true, historico: true },
  });
  for (const m of movimentos) {
    fatos.push({
      tipoInterno: "MOVIMENTO_BANCARIO",
      id: m.id,
      data: m.data,
      descricao: `${m.tipo} — ${m.historico}`,
      teto: toMoney(m.valor.toFixed(2)),
      sentido: SENTIDO_MOVIMENTO_BANCARIO[m.tipo],
    });
  }

  // ── TRANSFERÊNCIAS ENTRE CONTAS — só quando movem a conta contábil ─────────
  // Ver o critério de inclusão no cabeçalho: o filtro NÃO é um detalhe de desempenho, é
  // o que mantém a identidade da conciliação de pé.
  const transferencias = await prisma.transferenciaEntreContas.findMany({
    where: {
      data: { lte: corte },
      OR: [{ contaOrigemId: conta.id }, { contaDestinoId: conta.id }],
    },
    select: {
      id: true,
      valor: true,
      data: true,
      codigo: true,
      contaOrigemId: true,
      contaOrigem: { select: { codigo: true, contaContabilId: true } },
      contaDestino: { select: { codigo: true, contaContabilId: true } },
    },
  });
  for (const t of transferencias) {
    // As duas pernas caíram na MESMA conta contábil: o razão desta conta não se moveu, e
    // o fato não pertence ao lado interno.
    if (t.contaOrigem.contaContabilId === t.contaDestino.contaContabilId) continue;

    const saiuDaqui = t.contaOrigemId === conta.id;
    fatos.push({
      tipoInterno: "TRANSFERENCIA",
      id: t.id,
      data: t.data,
      descricao:
        `Transferência ${t.codigo} — ` +
        `${t.contaOrigem.codigo} para ${t.contaDestino.codigo}`,
      teto: toMoney(t.valor.toFixed(2)),
      sentido: saiuDaqui ? "SAIDA" : "ENTRADA",
    });
  }

  return fatos.sort((a, b) => a.data.getTime() - b.data.getTime());
}

/**
 * O SALDO INTERNO DA CONTA BANCÁRIA até o corte — Σ dos fatos, com sinal.
 *
 * ⚠️ ELE NÃO DESCONTA VÍNCULOS DE CONCILIAÇÃO, e não deveria. Um vínculo não move
 * dinheiro: ele apenas diz que uma linha do extrato e um fato do sistema são a mesma
 * coisa. Descontá-lo aqui faria o saldo cair quando alguém conciliasse.
 *
 * ⚠️ E ELE É O SALDO **DESTA CONTA**, QUE É O SALDO **DESTA FONTE** NELA. Toda conta
 * bancária tem exatamente uma `fonteId` — o controle "por fonte" que o TR 5.62 pede é,
 * neste modelo, o controle por conta. Se um dia uma conta puder ter várias fontes, este
 * é o ponto que muda, e o `fonteId` no retorno é o que torna a mudança visível.
 */
export interface SaldoDaConta {
  readonly contaBancariaId: string;
  readonly codigo: string;
  readonly fonteId: string;
  readonly corte: Date;
  readonly saldo: Money;
  readonly fatos: readonly FatoDeCaixaDaConta[];
}

export async function saldoDaContaBancaria(
  prisma: PrismaClient,
  contaBancariaId: string,
  corte: Date
): Promise<SaldoDaConta> {
  const conta = await prisma.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { id: true, codigo: true, fonteId: true, contaContabilId: true },
  });
  if (conta === null) {
    throw new Error(`Conta bancária ${contaBancariaId} não cadastrada.`);
  }

  const fatos = await fatosDeCaixaDaConta(prisma, conta, corte);
  return {
    contaBancariaId: conta.id,
    codigo: conta.codigo,
    fonteId: conta.fonteId,
    corte,
    // `teto` é o quanto o fato moveu; `saldoDosFatosDeCaixa` aplica o sinal do sentido.
    saldo: saldoDosFatosDeCaixa(
      fatos.map((f) => ({ sentido: f.sentido, valor: f.teto }))
    ),
    fatos,
  };
}
