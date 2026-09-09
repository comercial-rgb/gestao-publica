import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  cadastrarDivida,
  estornarMovimentoDivida,
  registrarAtualizacaoMonetaria,
  saldoDaDividaEm,
} from "./divida.js";
import { arrecadarIngressoOperacaoCredito } from "./adapter-m04.js";

/**
 * M10 — DÍVIDA CONSOLIDADA / FUNDADA (TR 5.82, 4.64, 5.8, 4.48).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CICLO DO t1 ═══
 *   INGRESSO (operação de crédito) ..... + 50.000,00
 *     arrecadação de 50.000 (natureza 21110000 — receita de CAPITAL, fonte 500)
 *     ⚠️ o roteiro da arrecadação credita a CONTA DA DÍVIDA (2.2.1), não uma VPA:
 *        o ente não ficou mais rico, ficou mais endividado (fato PERMUTATIVO).
 *   ATUALIZAÇÃO MONETÁRIA (2026-07) ....  + 1.200,00
 *     D VPD variação monetária / C conta da dívida  (o ÚNICO com roteiro próprio)
 *   AMORTIZAÇÃO (empenho grupo 6, pago) . − 10.000,00
 *     a liquidação do grupo 6 debita a CONTA DA DÍVIDA (não uma VPD: pagar
 *     principal é permutativo), e o pagamento credita o caixa.
 *
 *   SALDO = 50.000 + 1.200 − 10.000 = 41.200,00
 *
 *   ⚠️ A AMARRAÇÃO: esse saldo (Σ dos movimentos) TEM de bater com o saldo da CONTA
 *   CONTÁBIL da dívida no razão — duas leituras independentes do mesmo passivo:
 *     conta 2.2.1 (CREDORA): ΣC 50.000 + 1.200 = 51.200; ΣD 10.000
 *     ⟹ saldo credor = 41.200,00 ✓
 *
 * ═══ t3 — ATOMICIDADE ═══
 *   dívida de 5.000, empenho de 6.000 pago ⟹ a transação INTEIRA aborta:
 *   nem Pagamento, nem MovimentoDivida. Não existe "pagou mas não amortizou".
 *
 * ═══ t7 — CONCORRÊNCIA ═══
 *   dívida 50.000; dois pagamentos de 30.000 (empenhos distintos) ⟹ 30.000 + 30.000
 *   = 60.000 > 50.000: EXATAMENTE UM grava (lock da dívida).
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_AMORT = "ficha-amort"; // grupo 6
const FICHA_CUSTEIO = "ficha-custeio"; // grupo 3
/** 2 = capital; 2.1 = OPERAÇÕES DE CRÉDITO — a única origem que faz nascer dívida. */
const NAT_OPERACAO_CREDITO = "21110000";
/** Natureza CORRENTE (IPTU) — 1.1, imposto. Prova o guard do t6. */
const NAT_IPTU = "11130111";
/**
 * 2.4 = TRANSFERÊNCIA DE CAPITAL (convênio). É receita de CAPITAL — e por isso
 * PASSAVA pelo guard degradado. Prova o aperto no t6b.
 */
const NAT_TRANSF_CAPITAL = "24100000";

const CAIXA = "1.1.1.1.2.00.00";
const DIVIDA = "2.2.1.1.1.00.00"; // passivo — dívida fundada
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD_MONETARIA = "3.4.1.1.1.00.00"; // variações monetárias e cambiais
const VPA_TRIBUTARIA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

/**
 * ⚠️ O ROTEIRO DA ARRECADAÇÃO DA OPERAÇÃO DE CRÉDITO CREDITA A DÍVIDA, NÃO UMA VPA.
 * Ele vem por PARÂMETRO — é assim que o MCASP é respeitado sem inventar conta.
 */
const R_ARRECADACAO_OPERACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: DIVIDA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_ARRECADACAO_IPTU = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA_TRIBUTARIA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});
/**
 * ⚠️ A LIQUIDAÇÃO DO GRUPO 6 DEBITA A DÍVIDA, NÃO UMA VPD: pagar principal é
 * PERMUTATIVO (passivo desce, caixa desce). Roteiro por parâmetro, de novo.
 */
const R_LIQUIDACAO_AMORT = roteiroLiquidacao({
  variacaoDiminutiva: DIVIDA, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-divida", codigo: DIVIDA, nome: "Empréstimos a longo prazo", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd-mon", codigo: VPD_MONETARIA, nome: "Variações monetárias", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA_TRIBUTARIA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Encargos", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-28", codigo: "28", nome: "Encargos especiais" } });
  await prisma.subfuncao.create({ data: { id: "sub-843", codigo: "843", nome: "Serviço da dívida" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0028", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "0001", descricao: "A", tipo: "OPERACAO_ESPECIAL" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      // grupo 6 = AMORTIZAÇÃO DA DÍVIDA → exige dividaId (TR 4.48)
      { id: "nd-amort", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida" },
      { id: "nd-custeio", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-op", codigo: NAT_OPERACAO_CREDITO, descricao: "Operações de crédito internas" },
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU" },
      { id: "nr-conv", codigo: NAT_TRANSF_CAPITAL, descricao: "Transferências de capital" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-28", subfuncaoId: "sub-843", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_AMORT, numero: 1, naturezaDespesaId: "nd-amort" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_CUSTEIO, numero: 2, naturezaDespesaId: "nd-custeio" });

  // O ROTEIRO da atualização — por TABELA. Sem ele, o serviço LANÇA sem gravar.
  await prisma.roteiroDivida.create({
    data: {
      tipo: "ATUALIZACAO_MONETARIA",
      contaDebitoId: "c-vpd-mon", // a correção é DESPESA (o patrimônio diminui)
      contaCreditoId: "c-divida",
      criadoPor: POR,
    },
  });
}

async function dividaDeTeste(): Promise<string> {
  const { dividaId } = await cadastrarDivida(prisma, {
    identificador: "CEF-2026-001",
    credorNome: "Caixa Econômica Federal",
    credorDocumento: "00360305000104",
    tipo: "CONTRATUAL",
    leiAutorizativa: "Lei Municipal 7.890/2025",
    objeto: "Financiamento de infraestrutura urbana (Finisa)",
    contaContabilId: "c-divida",
    criadoPor: POR,
  });
  return dividaId;
}

/** Arrecada e devolve o id da ReceitaArrecadada (arrecadação AVULSA — sem dívida). */
async function arrecadar(
  valor: string,
  natureza: string,
  guia: string,
  roteiro = R_ARRECADACAO_OPERACAO
): Promise<string> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: natureza, fonte: "500", valor,
      dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
      numeroReceita: guia, criadoPor: POR,
    },
    roteiro,
    criarM04Deps(prisma)
  );
  const r = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { numeroReceita: guia, estornoDeId: null },
    select: { id: true },
  });
  return r.id;
}

/**
 * ⚠️ A OPERAÇÃO COMPOSTA — arrecadação e ingresso na MESMA transação.
 *
 * Os literais de saldo NÃO mudaram: o que mudou foi a CHAMADA (duas operações viraram
 * uma), não a aritmética.
 */
async function ingressar(
  dividaId: string,
  valor: string,
  guia = "GUIA-OC",
  motivo = "ingresso do financiamento Finisa, 1ª liberação"
): Promise<string> {
  const r = await arrecadarIngressoOperacaoCredito(prisma, {
    arrecadacao: {
      exercicio: 2026, naturezaReceita: NAT_OPERACAO_CREDITO, fonte: "500", valor,
      dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
      numeroReceita: guia, criadoPor: POR,
    },
    roteiro: R_ARRECADACAO_OPERACAO,
    dividaId,
    motivo,
  });
  return r.receitaId;
}

/** Empenha (grupo 6), liquida e paga — devolve os ids. */
async function amortizar(
  dividaId: string,
  valor: string,
  n: string
): Promise<{ empenhoId: string; pagamentoId: string }> {
  const e = await empenhar(
    {
      fichaId: FICHA_AMORT, dividaId, numero: `NE-${n}`, tipo: "ORDINARIO",
      valor, data: new Date("2026-08-01T12:00:00Z"),
      credorCpfCnpj: "00360305000104", historico: "amortização",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor,
      data: new Date("2026-08-10T12:00:00Z"), responsavelAtesto: "Tesoureiro",
      historico: "liquidação da parcela", criadoPor: POR,
    },
    R_LIQUIDACAO_AMORT,
    deps
  );
  const p = await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: `NP-${n}`, valor,
      data: new Date("2026-08-20T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pagamento da parcela", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
  return { empenhoId: e.empenhoId, pagamentoId: p.pagamentoId };
}

/** O saldo CREDOR da conta contábil da dívida, direto do razão. */
async function saldoNoRazao(): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo: DIVIDA } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce(
    (acc, p) => (p.tipo === "CREDITO" ? acc + Number(p.valor) : acc - Number(p.valor)),
    0
  );
}

describe("M10 — dívida consolidada", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: o ciclo completo — 50.000 + 1.200 − 10.000 = 41.200, e o razão concorda", async () => {
    const dividaId = await dividaDeTeste();

    // ── INGRESSO: a operação de crédito é RECEITA (o M04 contabiliza) ──────
    await ingressar(dividaId, "50000.00");
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("50000.00");

    // ── ATUALIZAÇÃO: o ÚNICO com lançamento próprio ───────────────────────
    await registrarAtualizacaoMonetaria(prisma, {
      dividaId, valor: "1200.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "correção monetária do saldo devedor de julho", criadoPor: POR,
    });
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("51200.00");

    // ── AMORTIZAÇÃO: nasce DENTRO do pagamento ────────────────────────────
    const { pagamentoId } = await amortizar(dividaId, "10000.00", "1");

    const mov = await prisma.movimentoDivida.findFirstOrThrow({
      where: { pagamentoId, tipo: "AMORTIZACAO" },
      select: { valor: true },
    });
    expect(Number(mov.valor)).toBe(10000);

    // 50.000 + 1.200 − 10.000
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("41200.00");

    // ⚠️ A AMARRAÇÃO: o Σ dos movimentos == o saldo da CONTA no razão.
    // ΣC 50.000 + 1.200 = 51.200; ΣD 10.000 ⟹ 41.200
    expect(await saldoNoRazao()).toBe(41200);

    // e o ledger fecha (ΣD == ΣC no total)
    const todas = await prisma.partidaContabil.findMany({
      select: { tipo: true, valor: true },
    });
    const d = todas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
    const c = todas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
    expect(d).toBe(c);
  });

  // t2
  it("t2: TR 4.48 — grupo 6 exige dívida; dívida fora do grupo 6 é vínculo sem sentido", async () => {
    const dividaId = await dividaDeTeste();

    // (1) grupo 6 SEM dívida
    let erro: unknown;
    try {
      await empenhar(
        {
          fichaId: FICHA_AMORT, numero: "NE-1", tipo: "ORDINARIO", valor: "1000.00",
          data: new Date("2026-08-01T12:00:00Z"), credorCpfCnpj: "00360305000104",
          historico: "amortização sem dívida",
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
        },
        R_EMPENHO,
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> TR 4.48 SEM DÍVIDA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/EMPENHO DE AMORTIZAÇÃO SEM DÍVIDA \(TR 4\.48\)/);
    expect(msg).toMatch(/grupo 6/);

    // (2) dívida num empenho de CUSTEIO (grupo 3)
    await expect(
      empenhar(
        {
          fichaId: FICHA_CUSTEIO, dividaId, numero: "NE-2", tipo: "ORDINARIO",
          valor: "1000.00", data: new Date("2026-08-01T12:00:00Z"),
          credorCpfCnpj: "00360305000104", historico: "custeio com dívida",
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/VÍNCULO DE DÍVIDA SEM SENTIDO/);

    expect(await prisma.empenho.count()).toBe(0);
  });

  // t3
  it("t3: amortização MAIOR que o saldo aborta a transação INTEIRA (nem pagamento, nem movimento)", async () => {
    const dividaId = await dividaDeTeste();
    await ingressar(dividaId, "5000.00");

    let erro: unknown;
    try {
      await amortizar(dividaId, "6000.00", "1"); // 6.000 > 5.000
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> AMORTIZAÇÃO > SALDO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/AMORTIZAÇÃO MAIOR QUE O SALDO DA DÍVIDA/);
    expect(msg).toMatch(/6000\.00/);
    expect(msg).toMatch(/5000\.00/);
    expect(msg).toMatch(/pagamento inteiro/);

    // ⚠️ ATOMICIDADE: nem o Pagamento, nem o MovimentoDivida existem.
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoDivida.count({ where: { tipo: "AMORTIZACAO" } })).toBe(0);
    // o saldo não se mexeu
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("5000.00");
  });

  // t4
  it("t4: a competência da atualização é IDEMPOTENTE — e o estorno a libera", async () => {
    const dividaId = await dividaDeTeste();
    await ingressar(dividaId, "50000.00");

    const primeira = await registrarAtualizacaoMonetaria(prisma, {
      dividaId, valor: "1200.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "correção monetária de julho", criadoPor: POR,
    });

    // MESMA competência: erro.
    await expect(
      registrarAtualizacaoMonetaria(prisma, {
        dividaId, valor: "999.00", competencia: "2026-07",
        dataMovimento: new Date("2026-07-31T12:00:00Z"),
        motivo: "corrigindo julho de novo, por engano", criadoPor: POR,
      })
    ).rejects.toThrow(/COMPETÊNCIA 2026-07 JÁ ATUALIZADA/);
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("51200.00");

    // ESTORNA e a competência se ABRE de novo (o SALDO governa, não um índice).
    await estornarMovimentoDivida(prisma, {
      movimentoId: primeira.movimentoId,
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "índice aplicado estava errado; refazer julho", criadoPor: POR,
    });
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("50000.00");

    await registrarAtualizacaoMonetaria(prisma, {
      dividaId, valor: "1500.00", competencia: "2026-07",
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "correção monetária de julho, com o índice certo", criadoPor: POR,
    });
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("51500.00");
  });

  // t5
  it("t5: anular o pagamento estorna a amortização JUNTO; o estorno avulso é porta fechada", async () => {
    const dividaId = await dividaDeTeste();
    await ingressar(dividaId, "50000.00");

    const { pagamentoId } = await amortizar(dividaId, "10000.00", "1");
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("40000.00");

    // ── A PORTA FECHADA: estorno avulso da AMORTIZACAO ────────────────────
    const amortizacao = await prisma.movimentoDivida.findFirstOrThrow({
      where: { pagamentoId, tipo: "AMORTIZACAO" }, select: { id: true },
    });
    let erro: unknown;
    try {
      await estornarMovimentoDivida(prisma, {
        movimentoId: amortizacao.id,
        dataMovimento: new Date("2026-09-01T12:00:00Z"),
        motivo: "tentando estornar a amortização por fora do pagamento",
        criadoPor: POR,
      });
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> PORTA FECHADA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/PORTA FECHADA/);
    expect(msg).toMatch(/ANULE O PAGAMENTO/);

    // ── ANULAR O PAGAMENTO: o estorno vem junto ───────────────────────────
    await anularPagamento(
      {
        pagamentoId, numero: "NP-1-ANUL",
        data: new Date("2026-09-01T12:00:00Z"),
        historico: "anulação do pagamento da parcela", criadoPor: POR,
      },
      deps
    );

    // o saldo VOLTA — 50.000 (a amortização foi desfeita)
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("50000.00");
    expect(
      await prisma.movimentoDivida.count({ where: { tipo: "ESTORNO_AMORTIZACAO" } })
    ).toBe(1);
  });

  // t6
  it("t6: o guard de ORIGEM segue de pé DENTRO da composta — e derruba a transação INTEIRA", async () => {
    const dividaId = await dividaDeTeste();

    // Receita CORRENTE (IPTU) vinculada a uma dívida: o guard do M10 lança DENTRO da
    // transação da composta — logo NEM a arrecadação sobrevive. Antes (duas operações
    // separadas), a receita já estaria gravada quando o guard falasse.
    await expect(
      arrecadarIngressoOperacaoCredito(prisma, {
        arrecadacao: {
          exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500",
          valor: "50000.00", dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
          numeroReceita: "GUIA-IPTU", criadoPor: POR,
        },
        roteiro: R_ARRECADACAO_OPERACAO,
        dividaId,
        motivo: "vinculando a dívida ao IPTU, por engano",
      })
    ).rejects.toThrow(/NÃO OPERACOES_DE_CREDITO/);

    // ⚠️ ATOMICIDADE: nem receita, nem movimento, nem lançamento.
    expect(await prisma.movimentoDivida.count()).toBe(0);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.partidaContabil.count({
        where: { lancamento: { origemTipo: { not: "LOA" } } },
      })
    ).toBe(0);
  });

  // t6b — O APERTO DO GUARD (classificadores de natureza, 2º dígito)
  it("t6b: TRANSFERÊNCIA DE CAPITAL (2.4) agora REJEITA — o guard degradado a deixava passar", async () => {
    const dividaId = await dividaDeTeste();

    // ⚠️ ESTE É O TESTE QUE NOMEIA O APERTO. Até 50783ae o guard era
    // `ehReceitaDeCapital` — e a 2.4 (convênio, transferência de capital) É receita
    // de capital: PASSAVA. O ente registrava uma DÍVIDA de 50.000 em cima de um
    // convênio que ninguém tem de devolver — passivo fabricado, endividamento
    // inventado, e o Anexo 14 mostrando um déficit que não existe.
    //
    // Agora o guard exige a ORIGEM: só a 2.1 (operações de crédito) faz nascer
    // dívida. A 2.2 (alienação), a 2.3 (amortização de empréstimos concedidos) e a
    // 2.4 caem pelo mesmo motivo — nenhuma delas é dinheiro emprestado AO ente.
    await expect(
      arrecadarIngressoOperacaoCredito(prisma, {
        arrecadacao: {
          exercicio: 2026, naturezaReceita: NAT_TRANSF_CAPITAL, fonte: "500",
          valor: "50000.00", dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
          numeroReceita: "GUIA-CONVENIO", criadoPor: POR,
        },
        roteiro: R_ARRECADACAO_OPERACAO,
        dividaId,
        motivo: "convênio registrado como empréstimo, por engano",
      })
    ).rejects.toThrow(/ORIGEM é TRANSFERENCIAS_DE_CAPITAL/);

    expect(await prisma.movimentoDivida.count()).toBe(0);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.partidaContabil.count({
        where: { lancamento: { origemTipo: { not: "LOA" } } },
      })
    ).toBe(0);
  });

  // t7
  it("t7: dois pagamentos concorrentes de 30.000 contra dívida de 50.000 — UM só grava", async () => {
    const RODADAS = 5;

    for (let i = 0; i < RODADAS; i++) {
      await semear();
      const dividaId = await dividaDeTeste();
      await ingressar(dividaId, "50000.00");

      // Dois empenhos/liquidações DISTINTOS, e em FILAS DIFERENTES do art. 141
      // (categorias distintas): senão o M06 reprovaria o segundo pagamento por
      // quebra da ordem cronológica, e o gargalo do teste deixaria de ser a DÍVIDA.
      const categorias = {
        A: "PRESTACAO_SERVICOS",
        B: "FORNECIMENTO_BENS",
      } as const;
      const liqs = await Promise.all(
        (["A", "B"] as const).map(async (n) => {
          const e = await empenhar(
            {
              fichaId: FICHA_AMORT, dividaId, numero: `NE-${n}`, tipo: "ORDINARIO",
              valor: "30000.00", data: new Date("2026-08-01T12:00:00Z"),
              credorCpfCnpj: "00360305000104", historico: "amortização",
              categoriaOrdemCronologica: categorias[n], criadoPor: POR,
            },
            R_EMPENHO,
            deps
          );
          const l = await liquidar(
            {
              empenhoId: e.empenhoId, numero: `NL-${n}`, valor: "30000.00",
              data: new Date("2026-08-10T12:00:00Z"), responsavelAtesto: "T",
              historico: "liquidação", criadoPor: POR,
            },
            R_LIQUIDACAO_AMORT,
            deps
          );
          return { n, liquidacaoId: l.liquidacaoId };
        })
      );

      const r = await Promise.allSettled(
        liqs.map((l) =>
          pagar(
            {
              liquidacaoId: l.liquidacaoId, numero: `NP-${l.n}`, valor: "30000.00",
              data: new Date("2026-08-20T12:00:00Z"), contaBancaria: "CC-001",
              fonteId: FONTE, historico: "pagamento", criadoPor: POR,
            },
            R_PAGAMENTO,
            deps
          )
        )
      );

      const ok = r.filter((x) => x.status === "fulfilled");
      const falhou = r.filter((x) => x.status === "rejected");

      // 30.000 + 30.000 = 60.000 > 50.000 → EXATAMENTE UM.
      expect(ok).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /AMORTIZAÇÃO MAIOR QUE O SALDO DA DÍVIDA/
      );
      expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("20000.00");
      expect(await prisma.pagamento.count()).toBe(1);
    }
  }, 90_000);

  // t8 — a anulação do EMPENHO não mexe na dívida (só o pagamento amortiza)
  it("t8: anular o EMPENHO (sem pagar) não mexe no saldo da dívida", async () => {
    const dividaId = await dividaDeTeste();
    await ingressar(dividaId, "50000.00");

    const e = await empenhar(
      {
        fichaId: FICHA_AMORT, dividaId, numero: "NE-1", tipo: "ORDINARIO",
        valor: "10000.00", data: new Date("2026-08-01T12:00:00Z"),
        credorCpfCnpj: "00360305000104", historico: "amortização",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    // empenhar NÃO amortiza — só o pagamento tira dinheiro do caixa
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("50000.00");

    await anularEmpenho(
      {
        empenhoId: e.empenhoId, numero: "NE-1-ANUL",
        data: new Date("2026-09-01T12:00:00Z"),
        historico: "anulação do empenho", criadoPor: POR,
      },
      deps
    );
    expect((await saldoDaDividaEm(prisma, dividaId)).toFixed(2)).toBe("50000.00");
    expect(await prisma.movimentoDivida.count({ where: { tipo: "AMORTIZACAO" } })).toBe(0);
  });
});
