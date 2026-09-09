import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  alienarBem,
  atualizacaoAcumuladaDaClasse,
  atualizarCompetencia,
  estornarMovimentoPatrimonial,
  registrarCustoSubsequente,
  registrarEntradaAvulsa,
  registrarReavaliacao,
  valorBrutoDaClasse,
  valorContabilDaClasse,
} from "./patrimonio.js";
import { demonstrativoPatrimonialPorClasse } from "./demonstrativo.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";

/**
 * M10 bloco 3 — alienação (TR 4.65) e demonstrativo por classe (TR 5.86).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ ALIENAÇÃO (t1) ═══
 *   classe: bruto 12.000 · acumulada 4.500 · contábil 7.500
 *   aliena: bruto 6.000 · acumulada 2.250  -> líquido contábil 3.750
 *   venda 4.000  ->  ganho = 4.000 − 3.750 =   250,00
 *   depois: bruto 6.000 · acumulada 2.250 · contábil 3.750  (caiu 3.750)
 *
 * ═══ DEMONSTRATIVO (t6) — CLASSE (vida 8 meses, residual 0) ═══
 *   ANTES do período (2025-12-15): avaliação inicial      8.000  -> saldoAnterior
 *   2026-02-10  doação recebida                          +2.000
 *   2026-03     depreciação  (base 10.000 / 8)           −1.250
 *   2026-04     depreciação                              −1.250
 *   2026-05-10  custo subsequente                        +1.000
 *   2026-06-10  reavaliação redução                      −  500
 *   2026-06-20  ESTORNO da depreciação de abril          +1.250
 *   2026-07-10  alienação: baixa bruto                   −3.000
 *               alienação: baixa acumulada               +1.000
 *   DEPOIS do fim (2027-01-15): doação 999  -> NÃO entra
 *
 *   ingressos    = 2.000 + 1.000                       =  3.000,00
 *   atualizações = −1.250 −1.250 +1.250 −500 −3.000 +1.000 = −3.750,00
 *   saldoFinal   = 8.000 + 3.000 − 3.750               =  7.250,00
 *   identidade   = bruto 7.500 − acumulada 250         =  7.250,00 ✓
 *
 * ═══ CLASSE_SW (AMORTIZACAO, 12 meses, residual 0) ═══
 *   2026-02-10 avaliação inicial 6.000 · 2026-03 amortização 6.000/12 = 500
 *   saldoAnterior 0 · ingressos 6.000 · atualizações −500 · saldoFinal 5.500
 *
 *   TOTAL: anterior 8.000 · ingressos 9.000 · atualizações −4.250 · final 12.750
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-veiculos";
const CLASSE_SW = "cl-software";
const BEM_1 = "bem-1";
const BEM_2 = "bem-2";

// Fixtures do PCASP (não existe seed oficial — ver bloco 1).
const IMOBILIZADO = "1.2.3.1.1.01.00";
const INTANGIVEL = "1.2.4.1.1.01.00";
const DEPRECIACAO_ACUM = "1.2.3.8.1.01.00";
const AMORTIZACAO_ACUM = "1.2.4.8.1.01.00";
const CREDITOS_ALIENACAO = "1.1.3.1.1.00.00";
const VPA_INCORP = "4.5.9.1.1.00.00";
const VPA_GANHO = "4.6.1.1.1.00.00";
const VPD_DEPREC = "3.3.3.1.1.00.00";
const VPD_AMORT = "3.3.3.1.2.00.00";
const VPD_REDUCAO = "3.6.1.1.1.00.00";
const VPD_PERDA = "3.6.2.1.1.00.00";

/** Contas do fluxo da RECEITA da alienação (t7) — o dinheiro que entra pela venda. */
const CAIXA = "1.1.1.1.2.00.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";

/**
 * 2.2 = ALIENAÇÃO DE BENS (categoria de capital, origem 2). É a ÚNICA origem que
 * sustenta a baixa de um bem por venda.
 */
const NAT_ALIENACAO = "22110001";
/** 2.9 = OUTRAS RECEITAS DE CAPITAL. Também é capital — e o guard degradado nem
 *  olhava. Prova o aperto. */
const NAT_OUTRAS_CAPITAL = "29110001";

const FONTE = "fnt-500";

/**
 * ⚠️ A PERNA CREDORA DA ARRECADAÇÃO APONTA PARA O *CRÉDITO POR ALIENAÇÃO* — a mesma
 * conta que o roteiro do GANHO debita. Receber o dinheiro da venda é PERMUTATIVO: o
 * caixa entra, o crédito contra o comprador baixa. Uma VPA aqui contaria o ganho
 * duas vezes. Roteiro por parâmetro, como sempre.
 */
const R_ARRECADACAO_ALIENACAO = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: CREDITOS_ALIENACAO,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-intang", codigo: INTANGIVEL, nome: "Software", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-dep-acum", codigo: DEPRECIACAO_ACUM, nome: "Depreciação acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-amort-acum", codigo: AMORTIZACAO_ACUM, nome: "Amortização acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-cred-alien", codigo: CREDITOS_ALIENACAO, nome: "Créditos por alienação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-ganho", codigo: VPA_GANHO, nome: "VPA ganho com alienação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-dep", codigo: VPD_DEPREC, nome: "VPD depreciação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-amort", codigo: VPD_AMORT, nome: "VPD amortização", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-red", codigo: VPD_REDUCAO, nome: "VPD redução de ativos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-perda", codigo: VPD_PERDA, nome: "VPD perda com alienação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });

  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-alien", codigo: NAT_ALIENACAO, descricao: "Alienação de bens móveis" },
      { id: "nr-outras", codigo: NAT_OUTRAS_CAPITAL, descricao: "Outras receitas de capital" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  await prisma.classeDeBens.createMany({
    data: [
      { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: CLASSE_SW, codigo: "1.2.4.1.1.01", descricao: "Software", especie: "MOVEL", contaContabilAtivoId: "c-intang", criadoPor: POR },
    ],
  });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: BEM_1, numeroTombamento: "TOMB-0001", descricao: "Ônibus", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-02T12:00:00Z"), criadoPor: POR },
      { id: BEM_2, numeroTombamento: "TOMB-0002", descricao: "Van", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-02T12:00:00Z"), criadoPor: POR },
    ],
  });

  await prisma.parametroAtualizacaoClasse.createMany({
    data: [
      { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 8, percentualResidual: "0.000000", criadoPor: POR },
      { classeDeBensId: CLASSE_SW, metodo: "AMORTIZACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", criadoPor: POR },
    ],
  });

  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DOACAO_RECEBIDA", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "CUSTO_SUBSEQUENTE", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "REAVALIACAO_REDUCAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
      { tipo: "AMORTIZACAO", contaDebitoId: "c-vpd-amort", contaCreditoId: "c-amort-acum", criadoPor: POR },
      // A alienação: o bem sai pelo BRUTO...
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      // ...e leva junto a depreciação acumulada (D acumulada / C VPD — reduz a
      // despesa da baixa: o que virou VPD é só o LÍQUIDO).
      { tipo: "BAIXA_DE_ATUALIZACAO_ACUMULADA", contaDebitoId: "c-dep-acum", contaCreditoId: "c-vpd-red", criadoPor: POR },
    ],
  });

  // O roteiro do RESULTADO (model irmão — chave de outro enum).
  await prisma.roteiroResultadoAlienacao.createMany({
    data: [
      { chave: "GANHO_ALIENACAO", contaDebitoId: "c-cred-alien", contaCreditoId: "c-vpa-ganho", criadoPor: POR },
      { chave: "PERDA_ALIENACAO", contaDebitoId: "c-vpd-perda", contaCreditoId: "c-cred-alien", criadoPor: POR },
    ],
  });
}

/** Monta a classe com bruto 12.000 (6.000 por bem) e acumulada 4.500. */
async function classeComAcumulada(): Promise<void> {
  await registrarEntradaAvulsa(prisma, {
    tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "6000.00", bemId: BEM_1,
    dataMovimento: new Date("2026-01-05T12:00:00Z"),
    motivo: "Avaliação inicial do ônibus escolar.", criadoPor: POR,
  });
  await registrarEntradaAvulsa(prisma, {
    tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "6000.00", bemId: BEM_2,
    dataMovimento: new Date("2026-01-05T12:00:00Z"),
    motivo: "Avaliação inicial da van escolar.", criadoPor: POR,
  });
  // base 12.000 / 8 meses = 1.500 por competência; 3 competências = 4.500
  for (const c of ["2026-01", "2026-02", "2026-03"]) {
    await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: c, criadoPor: POR,
    });
  }
}

/** Arrecada a receita da venda e devolve o id — o dinheiro que sustenta a baixa. */
async function arrecadar(
  valor: string,
  guia: string,
  natureza: string
): Promise<string> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: natureza, fonte: "500", valor,
      dataArrecadacao: new Date("2026-04-10T12:00:00Z"),
      numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO_ALIENACAO,
    criarM04Deps(prisma)
  );
  const r = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { numeroReceita: guia, estornoDeId: null },
    select: { id: true },
  });
  return r.id;
}

async function conferirBalanceamento(lancamentoId: string): Promise<void> {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    include: { partidas: true },
  });
  expect(l.partidas.every((p) => p.subsistema === "PATRIMONIAL")).toBe(true);
  const soma = (t: string) =>
    l.partidas
      .filter((p) => p.tipo === t)
      .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
  expect(soma("DEBITO").toFixed(2)).toBe(soma("CREDITO").toFixed(2));
}

const ALIENACAO = {
  classeDeBensId: CLASSE,
  bemId: BEM_1,
  valorBrutoBaixado: "6000.00",
  acumuladaBaixada: "2250.00",
  dataMovimento: new Date("2026-04-10T12:00:00Z"),
  motivo: "Veículo alienado em leilão público, conforme edital 3/2026.",
  criadoPor: POR,
};

describe("M10 — alienação (TR 4.65)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: alienação com GANHO de 250,00; o contábil da classe cai 3.750,00", async () => {
    await classeComAcumulada();

    // 12.000 − 4.500 = 7.500
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("7500.00");
    expect((await atualizacaoAcumuladaDaClasse(prisma, CLASSE)).toFixed(2)).toBe("4500.00");

    const r = await alienarBem(prisma, { ...ALIENACAO, valorVenda: "4000.00" });

    // 6.000 − 2.250 = 3.750 (líquido contábil); 4.000 − 3.750 = 250,00
    expect(r.valorLiquidoContabil.toFixed(2)).toBe("3750.00");
    expect(r.ganhoPerda.toFixed(2)).toBe("250.00");
    expect(r.chave).toBe("GANHO_ALIENACAO");

    // DOIS movimentos, uma operação
    const movs = await prisma.movimentoPatrimonial.findMany({
      where: { operacaoId: r.operacaoId },
      orderBy: { criadoEm: "asc" },
    });
    expect(movs).toHaveLength(2);
    expect(movs[0]!.tipo).toBe("BAIXA_ALIENACAO");
    expect(movs[0]!.valor.toFixed(2)).toBe("6000.00");
    expect(movs[1]!.tipo).toBe("BAIXA_DE_ATUALIZACAO_ACUMULADA");
    expect(movs[1]!.valor.toFixed(2)).toBe("2250.00");

    // o lançamento de GANHO, balanceado
    expect(r.lancamentoResultadoId).not.toBeNull();
    await conferirBalanceamento(r.lancamentoResultadoId!);
    const ganho = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoResultadoId! },
      include: { partidas: { include: { conta: true } } },
    });
    const papel = new Map(ganho.partidas.map((p) => [p.conta.codigo, p.tipo]));
    expect(papel.get(CREDITOS_ALIENACAO)).toBe("DEBITO");
    expect(papel.get(VPA_GANHO)).toBe("CREDITO");
    expect(ganho.partidas[0]!.valor.toFixed(2)).toBe("250.00");

    // bruto 12.000 − 6.000 = 6.000; acumulada 4.500 − 2.250 = 2.250
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("6000.00");
    expect((await atualizacaoAcumuladaDaClasse(prisma, CLASSE)).toFixed(2)).toBe("2250.00");
    // contábil: 7.500 − 3.750 = 3.750
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("3750.00");
  });

  // t2
  it("t2: alienação com PERDA de 750,00", async () => {
    await classeComAcumulada();

    // venda 3.000 − líquido 3.750 = −750
    const r = await alienarBem(prisma, { ...ALIENACAO, valorVenda: "3000.00" });
    expect(r.ganhoPerda.toFixed(2)).toBe("-750.00");
    expect(r.chave).toBe("PERDA_ALIENACAO");

    const perda = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoResultadoId! },
      include: { partidas: { include: { conta: true } } },
    });
    const papel = new Map(perda.partidas.map((p) => [p.conta.codigo, p.tipo]));
    expect(papel.get(VPD_PERDA)).toBe("DEBITO");
    // o valor lançado é o ABSOLUTO
    expect(perda.partidas[0]!.valor.toFixed(2)).toBe("750.00");
    await conferirBalanceamento(r.lancamentoResultadoId!);
  });

  // t3
  it("t3: acumulada baixada > acumulada da classe rejeita; == bruto baixado rejeita", async () => {
    await classeComAcumulada();

    // 5.000 > 4.500 (a acumulada da classe)
    await expect(
      alienarBem(prisma, { ...ALIENACAO, acumuladaBaixada: "5000.00", valorVenda: "4000.00" })
    ).rejects.toThrow(/excede a atualização acumulada da classe/);

    // acumulada == bruto: nem um bem 100% depreciado zera o bruto (sobra o residual)
    await expect(
      alienarBem(prisma, { ...ALIENACAO, acumuladaBaixada: "6000.00", valorVenda: "4000.00" })
    ).rejects.toThrow(/não pode alcançar o valor bruto/);

    // NADA gravado
    expect(
      await prisma.movimentoPatrimonial.count({ where: { tipo: "BAIXA_ALIENACAO" } })
    ).toBe(0);
  });

  // t4
  it("t4: o ESTORNO desfaz a OPERAÇÃO inteira — bruto, acumulada e resultado", async () => {
    await classeComAcumulada();
    const r = await alienarBem(prisma, { ...ALIENACAO, valorVenda: "4000.00" });

    // estorna pedindo APENAS o movimento da baixa do bruto...
    const est = await estornarMovimentoPatrimonial(prisma, {
      movimentoId: r.movimentoBaixaBruto,
      dataMovimento: new Date("2026-05-01T12:00:00Z"),
      motivo: "Leilão anulado por decisão judicial — a venda não aconteceu.",
      criadoPor: POR,
    });

    // ...e os DOIS movimentos voltam
    expect(est.movimentos).toHaveLength(2);
    // 2 estornos de movimento + 1 estorno do lançamento de ganho = 3 lançamentos
    expect(est.lancamentos).toHaveLength(3);

    const estornos = await prisma.movimentoPatrimonial.findMany({
      where: { operacaoId: r.operacaoId, estornoDeId: { not: null } },
    });
    expect(estornos.map((m) => m.tipo).sort()).toEqual([
      "ESTORNO_BAIXA_ALIENACAO",
      "ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA",
    ]);
    // VALORES PRESERVADOS, perna por perna
    const porTipo = new Map(estornos.map((m) => [m.tipo, m.valor.toFixed(2)]));
    expect(porTipo.get("ESTORNO_BAIXA_ALIENACAO")).toBe("6000.00");
    expect(porTipo.get("ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA")).toBe("2250.00");

    // o estado VOLTA ao de antes da alienação
    expect((await valorBrutoDaClasse(prisma, CLASSE)).toFixed(2)).toBe("12000.00");
    expect((await atualizacaoAcumuladaDaClasse(prisma, CLASSE)).toFixed(2)).toBe("4500.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("7500.00");

    // e o GANHO foi estornado (o lançamento original tem um estorno apontando)
    const ganho = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoResultadoId! },
      include: { estornos: { include: { partidas: true } } },
    });
    expect(ganho.estornos).toHaveLength(1);
    expect(ganho.estornos[0]!.partidas[0]!.valor.toFixed(2)).toBe("250.00");
    await conferirBalanceamento(ganho.estornos[0]!.id);
  });

  // t5
  it("t5: roteiro de GANHO ausente derruba a alienação INTEIRA (zero movimento)", async () => {
    await classeComAcumulada();
    await prisma.roteiroResultadoAlienacao.deleteMany({ where: { chave: "GANHO_ALIENACAO" } });

    const movsAntes = await prisma.movimentoPatrimonial.count();
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      alienarBem(prisma, { ...ALIENACAO, valorVenda: "4000.00" })
    ).rejects.toThrow(/ROTEIRO CONTÁBIL NÃO PARAMETRIZADO para GANHO_ALIENACAO/);

    // NEM os dois movimentos da baixa: a operação é UMA transação.
    expect(await prisma.movimentoPatrimonial.count()).toBe(movsAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
  });

  // t7 — O GUARD DA RECEITA (TR 4.65). O caminho `receitaArrecadadaId` NUNCA tinha
  // sido exercitado por teste nenhum: o guard degradado só conferia que a receita
  // existia e estava viva. Agora exige a ORIGEM.
  it("t7: a venda só se sustenta em receita de ALIENAÇÃO (2.2); outra receita de capital REJEITA", async () => {
    await classeComAcumulada();

    // (a) receita de ALIENAÇÃO de bens — 4.000, a mesma venda do t1.
    const receitaOk = await arrecadar("4000.00", "GUIA-LEILAO", NAT_ALIENACAO);
    const r = await alienarBem(prisma, {
      ...ALIENACAO,
      valorVenda: "4000.00",
      receitaArrecadadaId: receitaOk,
    });

    // os literais do t1, intactos: ganho 250,00 e o contábil da classe cai 3.750
    expect(r.ganhoPerda.toFixed(2)).toBe("250.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("3750.00");

    // (b) OUTRAS RECEITAS DE CAPITAL (2.9) sustentando a venda da van. É receita de
    // capital — logo, uma checagem por CATEGORIA a aprovaria. Mas ninguém vendeu bem
    // nenhum por ela: o bem sairia do ativo, o ganho seria calculado contra dinheiro
    // que entrou por outro motivo, e o Anexo 14 mostraria um patrimônio a menos sem
    // contrapartida. A ORIGEM é quem barra.
    const receitaErrada = await arrecadar("4000.00", "GUIA-OUTRAS", NAT_OUTRAS_CAPITAL);

    // ⚠️ O CORTE É DEPOIS DA ARRECADAÇÃO, e é de propósito: ela é um FATO PRÓPRIO e
    // legítimo (entrou dinheiro de verdade, com o seu lançamento). A alienação não a
    // desfaz — ela se RECUSA A SE APOIAR nela. Contar antes seria exigir que o guard
    // estornasse uma receita que nada tem de errado.
    const movsAntes = await prisma.movimentoPatrimonial.count();
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      alienarBem(prisma, {
        ...ALIENACAO,
        bemId: BEM_2,
        valorVenda: "4000.00",
        receitaArrecadadaId: receitaErrada,
      })
    ).rejects.toThrow(/ORIGEM é OUTRAS_RECEITAS_DE_CAPITAL/);

    // a transação INTEIRA caiu: nenhum movimento, nenhum lançamento novo.
    expect(await prisma.movimentoPatrimonial.count()).toBe(movsAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("3750.00");
  });
});

describe("M10 — demonstrativo por classe (TR 5.86)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t6 — TESTE DE OURO
  it("t6: cada célula por literal; os cortes exclusivo/inclusivo provados", async () => {
    // ── ANTES do período ────────────────────────────────────────────────
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "8000.00",
      dataMovimento: new Date("2025-12-15T12:00:00Z"),
      motivo: "Acervo avaliado antes do exercício de 2026.", criadoPor: POR,
    });

    // ── PERÍODO (2026) ──────────────────────────────────────────────────
    await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "2000.00",
      dataMovimento: new Date("2026-02-10T12:00:00Z"),
      motivo: "Veículo doado pelo governo do estado.", criadoPor: POR,
    });
    // base 10.000 / 8 = 1.250 por competência
    await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR });
    const abril = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR });
    expect(abril.valorDaParcela.toFixed(2)).toBe("1250.00");

    await registrarCustoSubsequente(prisma, {
      classeDeBensId: CLASSE, valor: "1000.00",
      dataMovimento: new Date("2026-05-10T12:00:00Z"),
      motivo: "Reforma estrutural que estende a vida útil.", criadoPor: POR,
    });
    await registrarReavaliacao(prisma, {
      classeDeBensId: CLASSE, sentido: "REDUCAO", valor: "500.00",
      dataMovimento: new Date("2026-06-10T12:00:00Z"),
      motivo: "Reavaliação de mercado apontou desvalorização.", criadoPor: POR,
    });
    // O ESTORNO com VALOR REAL — nunca zero estrutural.
    await estornarMovimentoPatrimonial(prisma, {
      movimentoId: abril.movimentoId,
      dataMovimento: new Date("2026-06-20T12:00:00Z"),
      motivo: "Depreciação de abril lançada em duplicidade.", criadoPor: POR,
    });
    // alienação: bruto 3.000, acumulada 1.000, venda 2.500 -> ganho 500
    const alien = await alienarBem(prisma, {
      classeDeBensId: CLASSE, valorBrutoBaixado: "3000.00", acumuladaBaixada: "1000.00",
      valorVenda: "2500.00", dataMovimento: new Date("2026-07-10T12:00:00Z"),
      motivo: "Alienação de veículo por leilão público.", criadoPor: POR,
    });
    expect(alien.ganhoPerda.toFixed(2)).toBe("500.00");

    // a outra classe (AMORTIZACAO)
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE_SW, valor: "6000.00",
      dataMovimento: new Date("2026-02-10T12:00:00Z"),
      motivo: "Licenças de software avaliadas na entrada.", criadoPor: POR,
    });
    await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_SW, competencia: "2026-03", criadoPor: POR });

    // ── DEPOIS do fim ───────────────────────────────────────────────────
    await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "999.00",
      dataMovimento: new Date("2027-01-15T12:00:00Z"),
      motivo: "Doação recebida já no exercício seguinte.", criadoPor: POR,
    });

    const d = await demonstrativoPatrimonialPorClasse(prisma, 2026);

    // ── A CLASSE DOS VEÍCULOS ───────────────────────────────────────────
    const veiculos = d.classes.find((c) => c.classeDeBensId === CLASSE)!;
    expect(veiculos.classificacaoContabil).toBe(IMOBILIZADO);
    // corte EXCLUSIVO no início: só a avaliação de 2025
    expect(veiculos.saldoAnterior).toBe("8000.00");
    // 2.000 (doação) + 1.000 (custo subsequente)
    expect(veiculos.ingressos).toBe("3000.00");
    // −1.250 −1.250 +1.250 −500 −3.000 +1.000
    expect(veiculos.atualizacoes).toBe("-3750.00");
    // 8.000 + 3.000 − 3.750  (a doação de 2027 NÃO entrou)
    expect(veiculos.saldoFinal).toBe("7250.00");
    // a identidade, por funções independentes
    expect(veiculos.valorBruto).toBe("7500.00");
    expect(veiculos.atualizacaoAcumulada).toBe("250.00");

    // o período ABERTO POR TIPO — o estorno aparece com VALOR REAL
    const porTipo = new Map(veiculos.porTipo.map((l) => [l.tipo, l.valor]));
    expect(porTipo.get("DOACAO_RECEBIDA")).toBe("2000.00");
    expect(porTipo.get("CUSTO_SUBSEQUENTE")).toBe("1000.00");
    expect(porTipo.get("DEPRECIACAO")).toBe("-2500.00");
    expect(porTipo.get("ESTORNO_DEPRECIACAO")).toBe("1250.00");
    expect(porTipo.get("REAVALIACAO_REDUCAO")).toBe("-500.00");
    expect(porTipo.get("BAIXA_ALIENACAO")).toBe("-3000.00");
    expect(porTipo.get("BAIXA_DE_ATUALIZACAO_ACUMULADA")).toBe("1000.00");

    // ── A CLASSE DE SOFTWARE ────────────────────────────────────────────
    const software = d.classes.find((c) => c.classeDeBensId === CLASSE_SW)!;
    expect(software.saldoAnterior).toBe("0.00");
    expect(software.ingressos).toBe("6000.00");
    expect(software.atualizacoes).toBe("-500.00"); // amortização 6.000/12
    expect(software.saldoFinal).toBe("5500.00");
    expect(software.valorBruto).toBe("6000.00");
    expect(software.atualizacaoAcumulada).toBe("500.00");

    // ── O TOTAL ─────────────────────────────────────────────────────────
    expect(d.total.saldoAnterior).toBe("8000.00");
    expect(d.total.ingressos).toBe("9000.00"); // 3.000 + 6.000
    expect(d.total.atualizacoes).toBe("-4250.00"); // −3.750 − 500
    expect(d.total.saldoFinal).toBe("12750.00"); // 7.250 + 5.500

    // dinheiro é STRING com 2 casas — nunca number
    for (const c of d.classes) {
      for (const v of [c.saldoAnterior, c.ingressos, c.atualizacoes, c.saldoFinal]) {
        expect(typeof v).toBe("string");
        expect(v).toMatch(/^-?\d+\.\d{2}$/);
      }
    }
  });

  it("t6b: o corte pega o movimento no PRÓPRIO dia do início (inclusivo) e exclui o de véspera", async () => {
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "100.00",
      dataMovimento: new Date("2025-12-31T23:59:59Z"),
      motivo: "Movimento na véspera do período.", criadoPor: POR,
    });
    await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "50.00",
      dataMovimento: new Date("2026-01-01T00:00:00Z"),
      motivo: "Movimento no primeiro instante do período.", criadoPor: POR,
    });

    const d = await demonstrativoPatrimonialPorClasse(prisma, 2026);
    const veiculos = d.classes.find((c) => c.classeDeBensId === CLASSE)!;

    expect(veiculos.saldoAnterior).toBe("100.00"); // a véspera
    expect(veiculos.ingressos).toBe("50.00"); // o primeiro instante
    expect(veiculos.saldoFinal).toBe("150.00");
  });

  it("período invertido: fail-closed", async () => {
    await expect(
      demonstrativoPatrimonialPorClasse(prisma, {
        inicio: new Date("2026-12-31T00:00:00Z"),
        fim: new Date("2026-01-01T00:00:00Z"),
      })
    ).rejects.toThrow(/Período invertido/);
  });
});
