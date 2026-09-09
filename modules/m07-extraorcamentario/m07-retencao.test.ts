import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import {
  anularPagamentoRestosAPagar,
  pagarRestosAPagar,
  saldoDosRestos,
} from "../m08-restos-a-pagar/restos.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { roteiroDispendioExtra } from "./dominio.js";
import {
  estornarMovimentoExtra,
  registrarDispendioExtra,
  saldoExtraorcamentario,
} from "./extraorcamentario.js";

/**
 * M07 bloco 3 — RETENÇÃO NA FONTE dentro do `pagar()`.
 *
 * As três asserções que atravessam tudo:
 *   1. o `Pagamento` é gravado pelo BRUTO (a fila do art. 141 e o RP não sabem
 *      que houve retenção);
 *   2. o lançamento é UM só, COMPOSTO — e fecha por subsistema;
 *   3. anular o pagamento desfaz a retenção JUNTO. E se o dinheiro do
 *      consignatário já foi repassado, a anulação é REJEITADA.
 *
 * E, como em todo o M07: NENHUM `MovimentoDotacao`.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m07@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FICHA = "ficha-500";

// Contas por PARÂMETRO — nada mágico, como em todo o projeto.
const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const P_INSS = "2.1.8.8.1.01.00";
const P_ISS = "2.1.8.8.1.02.00";
const P_PENSAO = "2.1.8.8.1.03.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: P_INSS, nome: "Consignações INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-iss", codigo: P_ISS, nome: "Consignações ISS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pensao", codigo: P_PENSAO, nome: "Consignações pensão", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});
const R_REPASSE_INSS = roteiroDispendioExtra({
  consignacaoAPagar: P_INSS,
  disponibilidade: CAIXA,
});

let T_INSS: string;
let T_ISS: string;
let T_PENSAO: string;
let T_INATIVO: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({
    data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE_500 },
  });
  await criarFichasDeTeste(prisma, [
    {
      id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
      funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: "nd", fonteId: FONTE_500, valorDotado: "100000.00",
    },
  ]);

  const tipos = await Promise.all([
    prisma.tipoConsignacao.create({ data: { codigo: "INSS", descricao: "INSS", criadoPor: "TESTE" } }),
    prisma.tipoConsignacao.create({ data: { codigo: "ISS", descricao: "ISS retido", criadoPor: "TESTE" } }),
    prisma.tipoConsignacao.create({ data: { codigo: "PENSAO", descricao: "Pensão alimentícia", criadoPor: "TESTE" } }),
    prisma.tipoConsignacao.create({ data: { codigo: "ANTIGO", descricao: "Desativado", ativo: false, criadoPor: "TESTE" } }),
  ]);
  [T_INSS, T_ISS, T_PENSAO, T_INATIVO] = tipos.map((t) => t.id) as [string, string, string, string];
}

/** Empenha + liquida 1.000. Devolve o id da liquidação. */
async function empenharELiquidar(deps: M05Deps, valor = "1000.00"): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor,
      data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor,
      data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

function pgto(liquidacaoId: string, valor: string, numero = "NP-1") {
  return {
    liquidacaoId,
    numero,
    valor,
    data: new Date("2026-03-01T12:00:00Z"),
    contaBancaria: "CC-001",
    fonteId: FONTE_500,
    historico: `Pagamento ${numero}`,
    criadoPor: POR,
  };
}

function retencao(tipoId: string, credor: string, valor: string, conta: string) {
  return {
    tipoConsignacaoId: tipoId,
    credorConsignatario: credor,
    valor,
    contaConsignacaoAPagar: conta,
  };
}

/** As pernas do lançamento, por código de conta. */
async function partidasDe(lancamentoId: string) {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    include: { partidas: { include: { conta: true } } },
  });
  return l.partidas.map((p) => ({
    conta: p.conta.codigo,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor.toFixed(2),
    fichaId: p.fichaId,
  }));
}

/** ΣD == ΣC dentro de CADA subsistema, em TODO lançamento do banco. */
async function conferirBalanceamento(): Promise<void> {
  const lancs = await prisma.lancamentoContabil.findMany({
    select: { numeroControle: true, partidas: true },
  });
  expect(lancs.length).toBeGreaterThan(0);
  for (const l of lancs) {
    for (const s of new Set(l.partidas.map((p) => p.subsistema))) {
      const doSub = l.partidas.filter((p) => p.subsistema === s);
      const soma = (t: string) =>
        doSub
          .filter((p) => p.tipo === t)
          .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
      expect(
        soma("DEBITO").toFixed(2),
        `lançamento ${l.numeroControle}, subsistema ${s}`
      ).toBe(soma("CREDITO").toFixed(2));
    }
  }
}

async function movimentosDotacao() {
  return prisma.movimentoDotacao.findMany({
    orderBy: { criadoEm: "asc" },
    select: { tipo: true, valor: true },
  });
}

describe("M07 — pagar() com RETENÇÃO", () => {
  let deps: M05Deps;
  let liq: string;
  const ordem = criarOrdemCronologicaPrisma(prisma);

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    liq = await empenharELiquidar(deps);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1.000 com 100 de INSS e 10 de ISS: caixa paga 890, o resto é BRUTO", async () => {
    const movsDotAntes = await movimentosDotacao();

    const r = await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [
        retencao(T_INSS, "INSS", "100.00", P_INSS),
        retencao(T_ISS, "Município de Campina Grande", "10.00", P_ISS),
      ],
    });

    // UM lançamento só, COMPOSTO: 4 pernas do pagamento + 2 de passivo.
    const partidas = await partidasDe(r.lancamentoId);
    expect(partidas).toHaveLength(6);

    const por = new Map(partidas.map((p) => [p.conta, p]));
    // só o CAIXA fica com o líquido
    expect(por.get(CAIXA)).toMatchObject({ tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "890.00" });
    // a obrigação com o fornecedor morre INTEIRA — nunca deduzida
    expect(por.get(FORNECEDOR)).toMatchObject({ tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" });
    // o orçamentário executa o BRUTO: retenção não é desconto de despesa
    expect(por.get(C_LIQUIDADO)).toMatchObject({ tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1000.00" });
    expect(por.get(C_PAGO)).toMatchObject({ tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1000.00" });
    // uma perna de passivo POR consignação, PATRIMONIAL e SEM ficha
    expect(por.get(P_INSS)).toMatchObject({ tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00", fichaId: null });
    expect(por.get(P_ISS)).toMatchObject({ tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "10.00", fichaId: null });
    // as pernas do PAGAMENTO, essas sim, têm dimensão orçamentária
    expect(por.get(CAIXA)?.fichaId).toBe(FICHA);
    expect(por.get(FORNECEDOR)?.fichaId).toBe(FICHA);

    // o PAGAMENTO é registrado pelo BRUTO
    const pag = await prisma.pagamento.findUniqueOrThrow({ where: { id: r.pagamentoId } });
    expect(pag.valor.toFixed(2)).toBe("1000.00");

    // o razão do M07: um INGRESSO por consignação, preso ao pagamento e ao
    // MESMO lançamento composto
    const movs = await prisma.movimentoExtraorcamentario.findMany({
      orderBy: { criadoEm: "asc" },
    });
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.tipo === "INGRESSO")).toBe(true);
    expect(movs.every((m) => m.pagamentoId === r.pagamentoId)).toBe(true);
    expect(movs.every((m) => m.lancamentoId === r.lancamentoId)).toBe(true);

    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("100.00");
    expect(
      (await saldoExtraorcamentario(prisma, T_ISS, "Município de Campina Grande")).saldo.toFixed(2)
    ).toBe("10.00");

    // dinheiro de terceiro NÃO passa pelo orçamento
    expect(await movimentosDotacao()).toEqual(movsDotAntes);
    await conferirBalanceamento();
  });

  it("a fila do art. 141 vê o BRUTO: a liquidação fica QUITADA e sai da fila", async () => {
    expect(await ordem.posicaoNaFila(liq)).toBe(1);

    await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [retencao(T_INSS, "INSS", "100.00", P_INSS)],
    });

    // Se o pagamento tivesse sido gravado pelo LÍQUIDO (890), a liquidação
    // ficaria devendo 110 para sempre e a fila NUNCA andaria.
    expect(await ordem.posicaoNaFila(liq)).toBeNull();
  });

  it("dois credores do MESMO tipo: duas pernas na mesma conta — nunca somadas", async () => {
    const r = await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [
        retencao(T_PENSAO, "Maria da Silva", "300.00", P_PENSAO),
        retencao(T_PENSAO, "Joana Souza", "200.00", P_PENSAO),
      ],
    });

    const partidas = await partidasDe(r.lancamentoId);
    const pensao = partidas.filter((p) => p.conta === P_PENSAO);
    // DUAS pernas de 300 e 200 — e não uma de 500: o razão é por credor, e o
    // lançamento espelha o razão.
    expect(pensao.map((p) => p.valor).sort()).toEqual(["200.00", "300.00"]);
    expect(partidas.find((p) => p.conta === CAIXA)?.valor).toBe("500.00");

    // e o saldo de uma pensionista não paga o da outra
    expect((await saldoExtraorcamentario(prisma, T_PENSAO, "Maria da Silva")).saldo.toFixed(2)).toBe("300.00");
    expect((await saldoExtraorcamentario(prisma, T_PENSAO, "Joana Souza")).saldo.toFixed(2)).toBe("200.00");
    await conferirBalanceamento();
  });

  it("o saldo do consignatário ACUMULA entre pagamentos e o repasse zera", async () => {
    await pagar(pgto(liq, "600.00", "NP-1"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [retencao(T_INSS, "INSS", "60.00", P_INSS)],
    });
    await pagar(pgto(liq, "400.00", "NP-2"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [retencao(T_INSS, "INSS", "40.00", P_INSS)],
    });

    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("100.00");

    // o repasse ao INSS (dispêndio avulso) zera o que o ente devia
    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: T_INSS, credorConsignatario: "INSS", contaBancaria: "CC-001",
        fonteId: FONTE_500, valor: "100.00", data: new Date("2026-04-20T12:00:00Z"),
        historico: "GPS competência 03/2026", criadoPor: POR,
      },
      R_REPASSE_INSS
    );

    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("0.00");
    // e não se repassa o que não se reteve
    await expect(
      registrarDispendioExtra(
        prisma,
        {
          tipoConsignacaoId: T_INSS, credorConsignatario: "INSS", contaBancaria: "CC-001",
          fonteId: FONTE_500, valor: "0.01", data: new Date("2026-04-21T12:00:00Z"),
          historico: "repasse a mais", criadoPor: POR,
        },
        R_REPASSE_INSS
      )
    ).rejects.toThrow(/excede o saldo extraorçamentário/);

    await conferirBalanceamento();
  });

  it("SEM retenção: caminho IDÊNTICO ao de sempre (4 pernas, nenhum movimento)", async () => {
    const r = await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps);

    const partidas = await partidasDe(r.lancamentoId);
    expect(partidas).toHaveLength(4);
    expect(partidas.find((p) => p.conta === CAIXA)?.valor).toBe("1000.00");
    expect(partidas.every((p) => p.fichaId === FICHA)).toBe(true);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
  });

  it("tipo de consignação INATIVO: o PAGAMENTO INTEIRO é rejeitado, nada grava", async () => {
    await expect(
      pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
        contaDisponibilidade: CAIXA,
        retencoes: [retencao(T_INATIVO, "Sindicato", "50.00", P_ISS)],
      })
    ).rejects.toThrow(/está INATIVO/);

    // a transação inteira abortou: nem pagamento, nem lançamento, nem movimento
    expect(await prisma.pagamento.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO" } })
    ).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
  });

  it("retenção que consome o pagamento inteiro: REJEITA (não sobra nada ao credor)", async () => {
    await expect(
      pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
        contaDisponibilidade: CAIXA,
        retencoes: [retencao(T_INSS, "INSS", "1000.00", P_INSS)],
      })
    ).rejects.toThrow(/consomem o pagamento inteiro/);

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
  });

  it("REJEITA estornar a retenção SOZINHA — ela é parte do pagamento", async () => {
    const r = await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [retencao(T_INSS, "INSS", "100.00", P_INSS)],
    });
    const mov = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { pagamentoId: r.pagamentoId },
    });

    // Estornar a retenção por aqui geraria um estorno do LANÇAMENTO COMPOSTO —
    // ou seja, inverteria o pagamento inteiro (caixa, fornecedor, orçamentário).
    await expect(
      estornarMovimentoExtra(prisma, {
        movimentoId: mov.id,
        data: new Date("2026-03-10T12:00:00Z"),
        motivo: "Retenção lançada a maior por erro de alíquota.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/RETENÇÃO NA FONTE.*não se estorna sozinho/s);

    // o lançamento do pagamento continua VIVO (não foi estornado)
    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId },
      include: { estornos: true },
    });
    expect(lanc.estornos).toHaveLength(0);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(1);
  });
});

describe("M07 — anular o pagamento DESFAZ a retenção", () => {
  let deps: M05Deps;
  let liq: string;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    liq = await empenharELiquidar(deps);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const anulacao = {
    numero: "NP-1-ANUL",
    data: new Date("2026-03-15T12:00:00Z"),
    historico: "Anulação do pagamento",
    criadoPor: POR,
  };

  async function pagarComINSS(valor = "1000.00", retido = "100.00") {
    return pagar(pgto(liq, valor), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [retencao(T_INSS, "INSS", retido, P_INSS)],
    });
  }

  it("a anulação estorna a retenção JUNTO: o saldo do consignatário volta a ZERO", async () => {
    const r = await pagarComINSS();
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("100.00");

    const movOriginal = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { pagamentoId: r.pagamentoId },
    });

    const a = await anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps);

    // O razão do M07 acompanhou: ESTORNO_INGRESSO devolvendo o saldo.
    const s = await saldoExtraorcamentario(prisma, T_INSS, "INSS");
    expect(s.ingresso.toFixed(2)).toBe("100.00"); // bruto, intacto
    expect(s.estornoIngresso.toFixed(2)).toBe("100.00");
    expect(s.saldo.toFixed(2)).toBe("0.00"); // o ente não deve mais nada ao INSS

    const estorno = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { tipo: "ESTORNO_INGRESSO" },
    });
    expect(estorno.estornoDeId).toBe(movOriginal.id);
    // o estorno mora no LANÇAMENTO DE ESTORNO do pagamento
    expect(estorno.lancamentoId).toBe(a.lancamentoId);
    // e segue apontando para o pagamento de onde a retenção veio
    expect(estorno.pagamentoId).toBe(r.pagamentoId);

    // APPEND-ONLY: o movimento original não foi tocado
    const depois = await prisma.movimentoExtraorcamentario.findUniqueOrThrow({
      where: { id: movOriginal.id },
    });
    expect(depois).toEqual(movOriginal);
  });

  it("o lançamento de estorno inverte TODAS as pernas — inclusive as de passivo", async () => {
    const r = await pagarComINSS();
    const a = await anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps);

    // 4 pernas do pagamento + 1 de passivo (uma retenção só)
    const partidas = await partidasDe(a.lancamentoId);
    expect(partidas).toHaveLength(5);

    const por = new Map(partidas.map((p) => [p.conta, p]));
    // no pagamento era C caixa 900 / D fornecedor 1000 / C passivo 100
    expect(por.get(CAIXA)).toMatchObject({ tipo: "DEBITO", valor: "900.00", fichaId: FICHA });
    expect(por.get(FORNECEDOR)).toMatchObject({ tipo: "CREDITO", valor: "1000.00" });
    expect(por.get(C_PAGO)).toMatchObject({ tipo: "DEBITO", valor: "1000.00" });
    // a perna do consignatário volta, e SEM ficha — como no original
    expect(por.get(P_INSS)).toMatchObject({ tipo: "DEBITO", valor: "100.00", fichaId: null });

    await conferirBalanceamento();
  });

  it("REPASSE JÁ FEITO BLOQUEIA A ANULAÇÃO — e nada é gravado", async () => {
    const r = await pagarComINSS();

    // o ente repassou o dinheiro ao INSS: ele SAIU do caixa
    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: T_INSS, credorConsignatario: "INSS", contaBancaria: "CC-001",
        fonteId: FONTE_500, valor: "100.00", data: new Date("2026-04-20T12:00:00Z"),
        historico: "GPS competência 03/2026", criadoPor: POR,
      },
      R_REPASSE_INSS
    );
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("0.00");

    // Anular agora deixaria o saldo do INSS NEGATIVO: o ente teria repassado
    // dinheiro que, no sistema, nunca reteve.
    await expect(
      anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps)
    ).rejects.toThrow(/JÁ FOI REPASSADA.*Estorne o DISPÊNDIO do repasse primeiro/s);

    // NADA: nem pagamento de estorno, nem lançamento, nem movimento
    expect(await prisma.pagamento.count({ where: { estornoDeId: { not: null } } })).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } })).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO_ANULADO" } })
    ).toBe(0);
    // o pagamento original segue vivo
    const pag = await prisma.pagamento.findUniqueOrThrow({
      where: { id: r.pagamentoId },
      include: { estornos: true },
    });
    expect(pag.estornos).toHaveLength(0);
  });

  it("estornado o repasse, a anulação PASSA (a ordem certa: repasse → pagamento)", async () => {
    const r = await pagarComINSS();

    const repasse = await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: T_INSS, credorConsignatario: "INSS", contaBancaria: "CC-001",
        fonteId: FONTE_500, valor: "100.00", data: new Date("2026-04-20T12:00:00Z"),
        historico: "GPS competência 03/2026", criadoPor: POR,
      },
      R_REPASSE_INSS
    );

    // desfaz o repasse: o ente VOLTA a dever ao INSS
    await estornarMovimentoExtra(prisma, {
      movimentoId: repasse.movimentoId,
      data: new Date("2026-04-25T12:00:00Z"),
      motivo: "Repasse feito em duplicidade — GPS já recolhida.",
      criadoPor: POR,
    });
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("100.00");

    // agora sim: a anulação passa e o saldo fecha em zero
    await anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps);
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("0.00");

    await conferirBalanceamento();
  });

  it("pagamento SEM retenção: a anulação segue idêntica à de sempre", async () => {
    const r = await pagar(pgto(liq, "1000.00"), R_PAGAMENTO, deps);
    const a = await anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps);

    const partidas = await partidasDe(a.lancamentoId);
    expect(partidas).toHaveLength(4);
    expect(partidas.every((p) => p.fichaId === FICHA)).toBe(true);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
  });

  it("a anulação NÃO cria MovimentoDotacao", async () => {
    const r = await pagarComINSS();
    const antes = await movimentosDotacao();

    await anularPagamento({ pagamentoId: r.pagamentoId, ...anulacao }, deps);

    expect(await movimentosDotacao()).toEqual(antes);
  });
});

// ── RESTOS A PAGAR ──────────────────────────────────────────────────────────
//
// A GPS do INSS sobre um serviço prestado em dezembro não some porque o ano
// virou: o resto a pagar retém igual. Mesma anatomia, mesmos guards, mesma
// anulação simétrica — e a inscrição baixa pelo BRUTO.

describe("M07 — retenção no pagamento de RESTOS A PAGAR", () => {
  let deps: M05Deps;
  let liq: string;
  let inscricaoId: string;

  /** D restos a pagar processados / C caixa. Sem perna orçamentária. */
  const R_PAG_RP = roteiroPagamentoRestos({
    restosAPagarProcessados: FORNECEDOR,
    disponibilidade: CAIXA,
  });

  const pgtoRP = (valor: string, numero = "NP-RP-1") => ({
    liquidacaoId: liq,
    numero,
    valor,
    data: new Date("2027-02-10T12:00:00Z"),
    contaBancaria: "CC-001",
    fonteId: FONTE_500,
    historico: `Pagamento de RP ${numero}`,
    criadoPor: POR,
  });

  const comINSS = (retido: string) => ({
    contaDisponibilidade: CAIXA,
    retencoes: [retencao(T_INSS, "INSS", retido, P_INSS)],
  });

  const anulacaoRP = {
    numero: "NP-RP-1-ANUL",
    data: new Date("2027-03-01T12:00:00Z"),
    motivo: "Pagamento de RP feito para o credor errado.",
    criadoPor: POR,
  };

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    // empenha e liquida em 2026, NÃO paga: na virada vira RP PROCESSADO.
    liq = await empenharELiquidar(deps);
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026,
      encerradoPor: POR,
    });
    expect(enc.inscricoes).toHaveLength(1);
    expect(enc.inscricoes[0]!.tipo).toBe("PROCESSADO");
    inscricaoId = enc.inscricoes[0]!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("paga o RP retendo INSS: caixa 900, e a INSCRIÇÃO baixa pelo BRUTO", async () => {
    const movsDotAntes = await movimentosDotacao();

    const r = await pagarRestosAPagar(prisma, pgtoRP("1000.00"), R_PAG_RP, comINSS("100.00"));

    const partidas = await partidasDe(r.lancamentoId);
    // ⚠️ 3 → 5: o pagamento de RP passou a mover a DDR (D 8.2.1.1.3.01 / C 8.2.1.1.4.01).
    // A comprometida veio da liquidação do exercício ANTERIOR e ATRAVESSOU A VIRADA: o
    // encerramento do M08 varre só as classes 5 e 6, porque o dinheiro de um resto a
    // pagar não caduca junto com o crédito dele. Pernas: 3 patrimoniais (fornecedor pelo
    // BRUTO, caixa pelo LÍQUIDO, INSS) + 2 de controle.
    //
    // ⚠️ E AS DE CONTROLE VÃO PELO BRUTO (1.000, não 900) — pendência
    // DDR-RETENCAO-CONSIGNACOES: `comporPagamentoComRetencoes` dá o líquido a UMA perna
    // só (a do caixa), e refinar isso é motor do M07.
    expect(partidas).toHaveLength(5);
    const por = new Map(partidas.map((p) => [p.conta, p]));
    expect(por.get(FORNECEDOR)).toMatchObject({ tipo: "DEBITO", valor: "1000.00" });
    expect(por.get(CAIXA)).toMatchObject({ tipo: "CREDITO", valor: "900.00" });
    expect(por.get(P_INSS)).toMatchObject({ tipo: "CREDITO", valor: "100.00" });
    expect(por.get("8.2.1.1.4.01.00")).toMatchObject({ tipo: "CREDITO", valor: "1000.00" });
    // partida de RP não tem dimensão orçamentária — nenhuma delas
    expect(partidas.every((p) => p.fichaId === null)).toBe(true);

    // A INSCRIÇÃO É BAIXADA PELO BRUTO: a obrigação com o credor foi extinta
    // INTEIRA (parte em dinheiro, parte em retenção). Baixá-la pelo líquido
    // deixaria o resto a pagar eternamente aberto nos 100 retidos.
    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pagoLiquido.toFixed(2)).toBe("1000.00");
    expect(s.saldo.toFixed(2)).toBe("0.00");

    // e o consignatário tem seu saldo
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("100.00");

    // RP não consome dotação — nem retendo
    expect(await movimentosDotacao()).toEqual(movsDotAntes);
    await conferirBalanceamento();
  });

  it("anular o pagamento de RP desfaz a retenção E devolve o saldo da inscrição", async () => {
    const r = await pagarRestosAPagar(prisma, pgtoRP("1000.00"), R_PAG_RP, comINSS("100.00"));

    const a = await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: r.pagamentoId,
      ...anulacaoRP,
    });

    // o resto a pagar VOLTA a existir (ESTORNO_PAGAMENTO devolve o saldo)
    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pagoLiquido.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("1000.00");

    // e o razão do consignatário acompanhou
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("0.00");
    expect(
      await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } })
    ).toBe(1);

    // CADA PERNA COM O SEU VALOR: o estorno devolve ao caixa os 900 que saíram —
    // não os 1000 do bruto.
    const por = new Map((await partidasDe(a.lancamentoId)).map((p) => [p.conta, p]));
    expect(por.get(CAIXA)).toMatchObject({ tipo: "DEBITO", valor: "900.00" });
    expect(por.get(FORNECEDOR)).toMatchObject({ tipo: "CREDITO", valor: "1000.00" });
    expect(por.get(P_INSS)).toMatchObject({ tipo: "DEBITO", valor: "100.00" });

    await conferirBalanceamento();
  });

  it("REPASSE JÁ FEITO BLOQUEIA a anulação do pagamento de RP", async () => {
    const r = await pagarRestosAPagar(prisma, pgtoRP("1000.00"), R_PAG_RP, comINSS("100.00"));

    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: T_INSS, credorConsignatario: "INSS", contaBancaria: "CC-001",
        fonteId: FONTE_500, valor: "100.00", data: new Date("2027-02-20T12:00:00Z"),
        historico: "GPS competência 02/2027", criadoPor: POR,
      },
      R_REPASSE_INSS
    );

    await expect(
      anularPagamentoRestosAPagar(prisma, { pagamentoId: r.pagamentoId, ...anulacaoRP })
    ).rejects.toThrow(/JÁ FOI REPASSADA.*Estorne o DISPÊNDIO do repasse primeiro/s);

    // NADA: a inscrição segue baixada e o pagamento, vivo
    expect((await saldoDosRestos(prisma, inscricaoId)).saldo.toFixed(2)).toBe("0.00");
    expect(
      await prisma.movimentoRestosAPagar.count({ where: { tipo: "ESTORNO_PAGAMENTO" } })
    ).toBe(0);
    expect(
      await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } })
    ).toBe(0);
  });

  it("RP SEM retenção: caminho idêntico ao de sempre (2 pernas, nenhum movimento)", async () => {
    const r = await pagarRestosAPagar(prisma, pgtoRP("1000.00"), R_PAG_RP);

    const partidas = await partidasDe(r.lancamentoId);
    // ⚠️ 2 → 4: as 2 patrimoniais de sempre + as 2 de DDR (comprometida por liquidação →
    // utilizada). "Nenhum movimento" segue valendo para o M07: retenção é que não houve.
    expect(partidas).toHaveLength(4);
    expect(partidas.find((p) => p.conta === CAIXA)?.valor).toBe("1000.00");
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
    expect((await saldoDosRestos(prisma, inscricaoId)).saldo.toFixed(2)).toBe("0.00");
  });
});
