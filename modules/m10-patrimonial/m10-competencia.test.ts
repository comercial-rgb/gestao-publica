import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  atualizarCompetencia,
  baixarBem,
  estornarMovimentoPatrimonial,
  registrarCustoSubsequente,
  registrarEntradaAvulsa,
  registrarImpairment,
  registrarReavaliacao,
  valorBrutoDaClasse,
  valorContabilDaClasse,
} from "./patrimonio.js";

/**
 * M10 bloco 2 — atualizações por competência.
 *
 * ⚠️ TODOS OS LITERAIS FORAM FEITOS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ A BASE É O VALOR BRUTO (NBC TSP 07) ═══
 *   valorBruto = TUDO menos a atualização acumulada (depreciação/amortização/
 *                exaustão e os estornos delas)
 *   base       = valorBruto  ·  residual = base × %  ·  parcela = (base − residual)/vida
 *   teto       = valorContábil − residual  ·  valor = min(parcela, teto)
 *
 * AS CONTAS, UMA A UMA:
 *
 *  t1  base 12.000 · residual 1.200 · (12.000−1.200)/24 =   450,00 · contábil 11.550,00
 *  t4  base  1.000 · residual     0 · 1.000/3          =   333,33 · resto 0,01 na 4ª
 *  t5  base 14.400 · residual 1.440 · (14.400−1.440)/24 =  540,00
 *  t7  base 12.000 · residual     0 · 12.000/12        = 1.000,00 (AMORTIZACAO)
 *  t9  base = 12.000 + 5.000 − 2.000 = 15.000 · residual 1.500
 *      parcela = (15.000 − 1.500)/24 = 13.500/24 =        562,50
 *      (o comportamento ANTIGO, só entradas, daria base 17.000 → 637,50 — é
 *       exatamente essa diferença que o fix corrige)
 *  tN1 base = 12.000 − 4.000 (baixa) = 8.000 · residual 800
 *      parcela = (8.000 − 800)/24 = 7.200/24 =             300,00
 *  tN2 base = 10.000 − 1.000 (impairment) = 9.000 · residual 900
 *      parcela = (9.000 − 900)/24 = 8.100/24 =             337,50
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-veiculos"; // método DEPRECIACAO, 24 meses, residual 10%
const CLASSE_SW = "cl-software"; // método AMORTIZACAO, 12 meses, residual 0%
const CLASSE_SEM_PARAM = "cl-sem-param";
const CLASSE_RESTO = "cl-resto"; // 3 meses, residual 0% — para o resto de 0,01

// Fixtures do PCASP (não existe seed oficial — ver bloco 1).
const IMOBILIZADO = "1.2.3.1.1.01.00";
const INTANGIVEL = "1.2.4.1.1.01.00";
const DEPRECIACAO_ACUM = "1.2.3.8.1.01.00";
const AMORTIZACAO_ACUM = "1.2.4.8.1.01.00";
const VPA_INCORP = "4.5.9.1.1.00.00";
const VPD_DEPREC = "3.3.3.1.1.00.00";
const VPD_AMORT = "3.3.3.1.2.00.00";
const VPD_REDUCAO = "3.6.1.1.1.00.00";

const CONTAS = [
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-intang", codigo: INTANGIVEL, nome: "Software", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-dep-acum", codigo: DEPRECIACAO_ACUM, nome: "Depreciação acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-amort-acum", codigo: AMORTIZACAO_ACUM, nome: "Amortização acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-dep", codigo: VPD_DEPREC, nome: "VPD depreciação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-amort", codigo: VPD_AMORT, nome: "VPD amortização", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-red", codigo: VPD_REDUCAO, nome: "VPD redução de ativos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

const DATA = new Date("2026-01-15T12:00:00Z");

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });

  await prisma.classeDeBens.createMany({
    data: [
      { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: CLASSE_SW, codigo: "1.2.4.1.1.01", descricao: "Software", especie: "MOVEL", contaContabilAtivoId: "c-intang", criadoPor: POR },
      { id: CLASSE_SEM_PARAM, codigo: "1.2.3.1.1.09", descricao: "Sem parâmetro", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: CLASSE_RESTO, codigo: "1.2.3.1.1.08", descricao: "Resto exato", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
    ],
  });

  // O MÉTODO mora no PARÂMETRO — nada de deduzir de MOVEL/IMOVEL.
  await prisma.parametroAtualizacaoClasse.createMany({
    data: [
      { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 24, percentualResidual: "0.100000", criadoPor: POR },
      { classeDeBensId: CLASSE_SW, metodo: "AMORTIZACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", criadoPor: POR },
      { classeDeBensId: CLASSE_RESTO, metodo: "DEPRECIACAO", vidaUtilMeses: 3, percentualResidual: "0.000000", criadoPor: POR },
    ],
  });

  // ROTEIRO por tabela. Cada tipo, a sua conta — nada inventado no código.
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DOACAO_RECEBIDA", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "CUSTO_SUBSEQUENTE", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "REAVALIACAO_AUMENTO", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "REAVALIACAO_REDUCAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "IMPAIRMENT", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      // D VPD depreciação / C depreciação ACUMULADA (retificadora do ativo)
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
      // A amortização tem roteiro PRÓPRIO — contas de intangível.
      { tipo: "AMORTIZACAO", contaDebitoId: "c-vpd-amort", contaCreditoId: "c-amort-acum", criadoPor: POR },
    ],
  });
}

/** Uma entrada na classe (AVALIACAO_INICIAL). */
async function entrada(classeId: string, valor: string): Promise<string> {
  const r = await registrarEntradaAvulsa(prisma, {
    tipo: "AVALIACAO_INICIAL", classeDeBensId: classeId, valor,
    dataMovimento: DATA, motivo: "Avaliação inicial do acervo da classe.",
    criadoPor: POR,
  });
  return r.movimentoId;
}

async function conferirBalanceamento(lancamentoId: string): Promise<void> {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    include: { partidas: { include: { conta: true } } },
  });
  expect(l.partidas.every((p) => p.subsistema === "PATRIMONIAL")).toBe(true);
  const soma = (t: string) =>
    l.partidas
      .filter((p) => p.tipo === t)
      .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
  expect(soma("DEBITO").toFixed(2)).toBe(soma("CREDITO").toFixed(2));
}

describe("M10 — atualizações por competência", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: base 12.000, residual 10%, vida 24 → parcela 450,00; contábil 11.550,00", async () => {
    await entrada(CLASSE, "12000.00");

    const r = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });

    // A CONTA, FEITA À MÃO: 12.000 − 1.200 = 10.800; 10.800 / 24 = 450,00
    expect(r.tipo).toBe("DEPRECIACAO");
    expect(r.base.toFixed(2)).toBe("12000.00");
    expect(r.valorResidual.toFixed(2)).toBe("1200.00");
    expect(r.parcelaCheia.toFixed(2)).toBe("450.00");
    expect(r.valorDaParcela.toFixed(2)).toBe("450.00");

    // 12.000 − 450 = 11.550,00
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("11550.00");

    const mov = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: r.movimentoId },
    });
    expect(mov.tipo).toBe("DEPRECIACAO");
    expect(mov.valor.toFixed(2)).toBe("450.00");
    expect(mov.competencia?.toISOString().slice(0, 10)).toBe("2026-01-01");
    await conferirBalanceamento(r.lancamentoId);
  });

  // t2
  it("t2: a MESMA competência duas vezes é rejeitada; SELECT prova 1 movimento", async () => {
    await entrada(CLASSE, "12000.00");
    await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });

    await expect(
      atualizarCompetencia(prisma, {
        classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI ATUALIZADA/);

    expect(
      await prisma.movimentoPatrimonial.count({ where: { tipo: "DEPRECIACAO" } })
    ).toBe(1);
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("11550.00");
  });

  // t3
  it("t3: ESTORNADA a competência, ela pode ser refeita — o SALDO governa, não uma trava", async () => {
    await entrada(CLASSE, "12000.00");
    const dep = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });

    await estornarMovimentoPatrimonial(prisma, {
      movimentoId: dep.movimentoId, dataMovimento: new Date("2026-02-01T12:00:00Z"),
      motivo: "Parcela calculada com vida útil errada — refazer a competência.",
      criadoPor: POR,
    });

    // o valor VOLTOU: 11.550 + 450 = 12.000
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("12000.00");

    // o ESTORNO HERDOU a competência — sem isso, o guard nunca liberaria
    const estorno = await prisma.movimentoPatrimonial.findFirstOrThrow({
      where: { tipo: "ESTORNO_DEPRECIACAO" },
    });
    expect(estorno.competencia?.toISOString().slice(0, 10)).toBe("2026-01-01");

    // e a MESMA competência passa de novo (líquido da competência = 450 − 450 = 0)
    const denovo = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(denovo.valorDaParcela.toFixed(2)).toBe("450.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("11550.00");

    // APPEND-ONLY: 1 depreciação + 1 estorno + 1 depreciação = 3 linhas
    expect(
      await prisma.movimentoPatrimonial.count({
        where: { tipo: { in: ["DEPRECIACAO", "ESTORNO_DEPRECIACAO"] } },
      })
    ).toBe(3);
  });

  // t4
  it("t4: para no residual — a última parcela é o RESTO exato, e a seguinte é erro", async () => {
    // base 1.000, residual 0%, vida 3 meses:
    //   parcela cheia = 1.000 / 3 = 333,33 (2 casas)
    //   3 parcelas    = 999,99  -> sobra 0,01
    //   4ª parcela    = min(333,33; teto 0,01) = 0,01  <- o RESTO
    //   5ª            -> teto 0 -> erro
    await entrada(CLASSE_RESTO, "1000.00");

    const c1 = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_RESTO, competencia: "2026-01", criadoPor: POR });
    const c2 = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_RESTO, competencia: "2026-02", criadoPor: POR });
    const c3 = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_RESTO, competencia: "2026-03", criadoPor: POR });

    expect(c1.valorDaParcela.toFixed(2)).toBe("333.33");
    expect(c2.valorDaParcela.toFixed(2)).toBe("333.33");
    expect(c3.valorDaParcela.toFixed(2)).toBe("333.33");
    // 1.000 − 999,99 = 0,01
    expect((await valorContabilDaClasse(prisma, CLASSE_RESTO)).toFixed(2)).toBe("0.01");

    // a 4ª parcela é o RESTO, e não a parcela cheia
    const c4 = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_RESTO, competencia: "2026-04", criadoPor: POR });
    expect(c4.parcelaCheia.toFixed(2)).toBe("333.33"); // a cheia continua sendo 333,33
    expect(c4.valorDaParcela.toFixed(2)).toBe("0.01"); // mas o TETO manda
    expect((await valorContabilDaClasse(prisma, CLASSE_RESTO)).toFixed(2)).toBe("0.00");

    const movsAntes = await prisma.movimentoPatrimonial.count();
    await expect(
      atualizarCompetencia(prisma, { classeDeBensId: CLASSE_RESTO, competencia: "2026-05", criadoPor: POR })
    ).rejects.toThrow(/TOTALMENTE ATUALIZADA/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(movsAntes);
  });

  // t5
  it("t5: o CUSTO SUBSEQUENTE aumenta a BASE — e a parcela seguinte cresce", async () => {
    await entrada(CLASSE, "12000.00");

    const antes = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(antes.valorDaParcela.toFixed(2)).toBe("450.00");

    // + 2.400 de custo subsequente -> base 14.400
    await registrarCustoSubsequente(prisma, {
      classeDeBensId: CLASSE, valor: "2400.00", dataMovimento: DATA,
      motivo: "Blindagem instalada no veículo — aumenta a vida útil.",
      criadoPor: POR,
    });

    // A CONTA, À MÃO: 14.400 − 1.440 = 12.960; 12.960 / 24 = 540,00
    const depois = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-02", criadoPor: POR,
    });
    expect(depois.base.toFixed(2)).toBe("14400.00");
    expect(depois.valorResidual.toFixed(2)).toBe("1440.00");
    expect(depois.valorDaParcela.toFixed(2)).toBe("540.00");

    // 12.000 − 450 + 2.400 − 540 = 13.410,00
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("13410.00");
  });

  // t6
  it("t6: impairment > contábil rejeita; == passa; +0,01 depois rejeita", async () => {
    await entrada(CLASSE, "12000.00");

    await expect(
      registrarImpairment(prisma, {
        classeDeBensId: CLASSE, valor: "12000.01", dataMovimento: DATA,
        motivo: "Tentativa de reduzir mais do que o ativo vale.", criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil da classe/);
    expect(await prisma.movimentoPatrimonial.count({ where: { tipo: "IMPAIRMENT" } })).toBe(0);

    // exatamente o saldo: PASSA
    const r = await registrarImpairment(prisma, {
      classeDeBensId: CLASSE, valor: "12000.00", dataMovimento: DATA,
      motivo: "Frota inteira condenada por laudo técnico.", criadoPor: POR,
    });
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("0.00");
    await conferirBalanceamento(r.lancamentoId);

    // e 0,01 já não cabe
    await expect(
      registrarImpairment(prisma, {
        classeDeBensId: CLASSE, valor: "0.01", dataMovimento: DATA,
        motivo: "Tentando reduzir o que já não existe.", criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil da classe/);
  });

  // t7
  it("t7: classe com método AMORTIZACAO gera AMORTIZACAO (não DEPRECIACAO), com roteiro próprio", async () => {
    await entrada(CLASSE_SW, "12000.00");

    // 12.000, residual 0%, 12 meses -> 1.000,00
    const r = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE_SW, competencia: "2026-01", criadoPor: POR,
    });
    expect(r.tipo).toBe("AMORTIZACAO");
    expect(r.valorDaParcela.toFixed(2)).toBe("1000.00");
    expect((await valorContabilDaClasse(prisma, CLASSE_SW)).toFixed(2)).toBe("11000.00");

    // NENHUMA depreciação foi criada — o método vem do PARÂMETRO da classe
    expect(await prisma.movimentoPatrimonial.count({ where: { tipo: "DEPRECIACAO" } })).toBe(0);

    // e o roteiro é o do INTANGÍVEL: D VPD amortização / C amortização acumulada
    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    const papel = new Map(lanc.partidas.map((p) => [p.conta.codigo, p.tipo]));
    expect(papel.get(VPD_AMORT)).toBe("DEBITO");
    expect(papel.get(AMORTIZACAO_ACUM)).toBe("CREDITO");
    await conferirBalanceamento(r.lancamentoId);
  });

  // t8
  it("t8: classe SEM parâmetro: erro nomeado, e zero escrita (movimento E lançamento)", async () => {
    await entrada(CLASSE_SEM_PARAM, "5000.00");
    const movsAntes = await prisma.movimentoPatrimonial.count();
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      atualizarCompetencia(prisma, {
        classeDeBensId: CLASSE_SEM_PARAM, competencia: "2026-01", criadoPor: POR,
      })
    ).rejects.toThrow(/NÃO TEM PARÂMETRO de atualização/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(movsAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
  });

  // t9 (ajustado pelo fix)
  it("t9: a REAVALIAÇÃO mexe na base NOS DOIS SENTIDOS (NBC TSP 07)", async () => {
    await entrada(CLASSE, "12000.00");

    await registrarReavaliacao(prisma, {
      classeDeBensId: CLASSE, sentido: "AUMENTO", valor: "5000.00",
      dataMovimento: DATA, motivo: "Reavaliação por laudo de mercado (alta).",
      criadoPor: POR,
    });
    await registrarReavaliacao(prisma, {
      classeDeBensId: CLASSE, sentido: "REDUCAO", valor: "2000.00",
      dataMovimento: DATA, motivo: "Reavaliação por laudo de mercado (baixa).",
      criadoPor: POR,
    });

    // 12.000 + 5.000 − 2.000 = 15.000 (contábil E bruto: ainda não houve depreciação)
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("15000.00");
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("15000.00");

    // A CONTA, À MÃO: base 15.000; residual 1.500; (15.000 − 1.500)/24 = 562,50
    // ⚠️ O comportamento ANTIGO (só entradas) daria base 17.000 e parcela 637,50 —
    // ele ignorava a redução, e a classe depreciaria sobre um valor que já não tem.
    const dep = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(dep.base.toFixed(2)).toBe("15000.00");
    expect(dep.valorResidual.toFixed(2)).toBe("1500.00");
    expect(dep.valorDaParcela.toFixed(2)).toBe("562.50");
    expect(dep.valorDaParcela.toFixed(2)).not.toBe("637.50"); // o bug antigo

    // 15.000 − 562,50 = 14.437,50
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("14437.50");
    // o BRUTO não muda com a depreciação — ela é retificadora
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("15000.00");
  });

  it("t9b: a redução que estoura o valor contábil continua rejeitada", async () => {
    await entrada(CLASSE, "12000.00");

    await expect(
      registrarReavaliacao(prisma, {
        classeDeBensId: CLASSE, sentido: "REDUCAO", valor: "12000.01",
        dataMovimento: DATA, motivo: "Redução acima do valor contábil da classe.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil da classe/);

    expect(
      await prisma.movimentoPatrimonial.count({ where: { tipo: "REAVALIACAO_REDUCAO" } })
    ).toBe(0);
  });

  // tNovo1
  it("tN1: a BAIXA reduz a base — não se deprecia o que já não existe", async () => {
    await entrada(CLASSE, "12000.00");
    await baixarBem(prisma, {
      tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "4000.00",
      dataMovimento: DATA, motivo: "Um dos veículos foi alienado em leilão.",
      criadoPor: POR,
    });

    // A CONTA, À MÃO: base 12.000 − 4.000 = 8.000; residual 800;
    //                 (8.000 − 800)/24 = 300,00
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("8000.00");

    const dep = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(dep.base.toFixed(2)).toBe("8000.00");
    expect(dep.valorResidual.toFixed(2)).toBe("800.00");
    expect(dep.valorDaParcela.toFixed(2)).toBe("300.00");
    // o antigo daria base 12.000 -> parcela 450,00: depreciaria bens vendidos
    expect(dep.valorDaParcela.toFixed(2)).not.toBe("450.00");

    // 8.000 − 300 = 7.700,00
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("7700.00");
  });

  // tNovo2
  it("tN2: o IMPAIRMENT reduz a base", async () => {
    await entrada(CLASSE, "10000.00");
    await registrarImpairment(prisma, {
      classeDeBensId: CLASSE, valor: "1000.00", dataMovimento: DATA,
      motivo: "Perda por avaria irreversível em parte da frota.", criadoPor: POR,
    });

    // A CONTA, À MÃO: base 10.000 − 1.000 = 9.000; residual 900;
    //                 (9.000 − 900)/24 = 337,50
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("9000.00");

    const dep = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(dep.base.toFixed(2)).toBe("9000.00");
    expect(dep.valorResidual.toFixed(2)).toBe("900.00");
    expect(dep.valorDaParcela.toFixed(2)).toBe("337.50");

    // 9.000 − 337,50 = 8.662,50
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("8662.50");
  });

  // tNovo3
  it("tN3: REGRESSÃO — sem redução, a base é a mesma de antes (nada mudou de número)", async () => {
    // Cenário só de ENTRADAS: o valor bruto tem de dar o MESMO que a antiga soma
    // de entradas. Os literais do t1 e do t5 continuam valendo.
    await entrada(CLASSE, "12000.00");
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("12000.00");

    const c1 = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-01", criadoPor: POR,
    });
    expect(c1.base.toFixed(2)).toBe("12000.00");
    expect(c1.valorDaParcela.toFixed(2)).toBe("450.00"); // literal do t1, intacto

    await registrarCustoSubsequente(prisma, {
      classeDeBensId: CLASSE, valor: "2400.00", dataMovimento: DATA,
      motivo: "Blindagem instalada no veículo — aumenta a vida útil.",
      criadoPor: POR,
    });

    const c2 = await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-02", criadoPor: POR,
    });
    expect(c2.base.toFixed(2)).toBe("14400.00");
    expect(c2.valorDaParcela.toFixed(2)).toBe("540.00"); // literal do t5, intacto

    // E a DEPRECIAÇÃO não mexe no bruto: 12.000 + 2.400 = 14.400, sempre.
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("14400.00");
    // contábil: 14.400 − 450 − 540 = 13.410,00
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("13410.00");
  });

  it("competência em formato inválido: Zod rejeita", async () => {
    await expect(
      atualizarCompetencia(prisma, {
        classeDeBensId: CLASSE, competencia: "2026-13", criadoPor: POR,
      })
    ).rejects.toThrow(/YYYY-MM/);
  });
});
