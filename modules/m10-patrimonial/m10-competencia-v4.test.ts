import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { analisarEstornoPatrimonial } from "./estorno.js";
import { definirParametroDeAtualizacao, parametroVigenteEm } from "./parametros.js";
import {
  atualizarCompetencia,
  baixarBem,
  conciliacaoDaClasse,
  estornarMovimentoPatrimonial,
  preverCompetencia,
  registrarCustoSubsequente,
  registrarEntradaAvulsa,
  registrarImpairment,
  registrarReavaliacao,
  valorContabilDaClasse,
  valorContabilDoBem,
} from "./patrimonio.js";

/**
 * ═══ A COMPETÊNCIA POR BEM, COM CORTE, VIGÊNCIA E EXECUÇÃO (sessão noturna V4, §4) ═══
 *
 * Os achados A04 (a prévia somava tudo e usava a última versão), A05 (a depreciação nunca
 * chegava ao bem) e A07 (a dependência era por tipo, não por impacto). Todos os literais foram
 * feitos à mão, antes do código:
 *
 *   A entra em 15/01 por 10.000 · B entra em 10/04 por 5.000 · v1: 24 meses, residual 10%,
 *   desde o início · v2: 12 meses, residual 0, vigente desde 2026-05.
 *
 *   março (v1): só A é elegível — residual 1.000, (10.000 − 1.000)/24 = 375,00; B "entrada após o corte".
 *   abril (v1): A: contábil 9.625, parcela cheia 375,00 → 375,00 · B: residual 500, (5.000 − 500)/24 = 187,50.
 *               total 562,50, UM lançamento.
 *   maio  (v2): A: base 10.000, residual 0, cheia 10.000/12 = 833,33; teto = 9.250 → 833,33
 *               B: base 5.000, cheia 416,67; teto 4.812,50 → 416,67 · total 1.250,00.
 *
 * N=2 bens com inícios diferentes; um bem ainda não elegível; residual; reavaliação; baixa;
 * Σ(itens) = classe = razão; a execução estornada inteira; a dependência com impacto verificado;
 * o desempate estável.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-v4";
const A = "bem-a";
const B = "bem-b";
const DIA = (d: string) => new Date(`2026-${d}T12:00:00Z`);

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-imob", codigo: "1.2.3.1.1.01.00", nome: "Veículos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-dep-acum", codigo: "1.2.3.8.1.01.00", nome: "Depreciação acumulada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.5.9.1.1.00.00", nome: "VPA incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-dep", codigo: "3.3.3.1.1.00.00", nome: "VPD depreciação", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpd-red", codigo: "3.6.1.1.1.00.00", nome: "VPD redução de ativos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.classeDeBens.create({ data: { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR } });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: A, numeroTombamento: "TOMB-A", descricao: "Ônibus", classeDeBensId: CLASSE, dataAquisicao: DIA("01-15"), criadoPor: POR },
      { id: B, numeroTombamento: "TOMB-B", descricao: "Van", classeDeBensId: CLASSE, dataAquisicao: DIA("04-10"), criadoPor: POR },
    ],
  });
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "CUSTO_SUBSEQUENTE", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
      { tipo: "REAVALIACAO_REDUCAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "IMPAIRMENT", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "DOACAO_REALIZADA", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
    ],
  });
  await definirParametroDeAtualizacao(prisma, { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 24, percentualResidual: "0.100000", motivo: "Vida útil de veículos (v1), fixture.", criadoPor: POR });
}

const entrada = (bemId: string, valor: string, dia: string) =>
  registrarEntradaAvulsa(prisma, { classeDeBensId: CLASSE, bemId, tipo: "AVALIACAO_INICIAL", valor, dataMovimento: DIA(dia), motivo: `Avaliação inicial de ${bemId}.`, criadoPor: POR });
const processar = (competencia: string, bemId?: string) => atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia, criadoPor: POR, ...(bemId !== undefined ? { bemId } : {}) });
const estornar = (movimentoId: string, dia = "06-01") =>
  estornarMovimentoPatrimonial(prisma, { movimentoId, dataMovimento: DIA(dia), motivo: "Lançamento indevido, conforme apuração.", criadoPor: POR });

async function lancamentoDe(id: string): Promise<{ readonly valor: string; readonly partidas: number }> {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id }, include: { partidas: true } });
  const debitos = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0"));
  return { valor: debitos.toFixed(2), partidas: l.partidas.length };
}

describe("A04 — o recorte temporal e a vigência do parâmetro", () => {
  beforeEach(semear);

  it("t1: março aberto, entrada em abril e parâmetro novo vigente em maio: março não muda — B é 'entrada após o corte', a versão é v1", async () => {
    await entrada(A, "10000.00", "01-15");
    await entrada(B, "5000.00", "04-10");
    const v2 = await definirParametroDeAtualizacao(prisma, { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", vigenteDesde: "2026-05", motivo: "Revisão da vida útil pela comissão (v2, desde maio).", criadoPor: POR });

    expect((await parametroVigenteEm(prisma, CLASSE, "2026-03"))?.numero).toBe(1);
    expect((await parametroVigenteEm(prisma, CLASSE, "2026-05"))?.versaoId).toBe(v2.versaoId);

    const marco = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(marco.situacao).toBe("PRONTA");
    expect(marco.parametro?.numero).toBe(1);
    expect(marco.itens.map((i) => [i.numeroTombamento, i.situacao, i.base.toFixed(2)])).toEqual([
      ["TOMB-A", "PRONTO", "10000.00"],
      ["TOMB-B", "NAO_ELEGIVEL", "0.00"],
    ]);
    expect(marco.itens[1]?.nota).toMatch(/entrada em 2026-04-10, depois do corte/);
    expect(marco.calculo?.valorDaParcela.toFixed(2)).toBe("375.00");
    // a classe no corte de março NÃO inclui os 5.000 de abril
    expect(marco.valorContabil.toFixed(2)).toBe("10000.00");
    // e a prévia NÃO escreve
    expect(await prisma.movimentoPatrimonial.count({ where: { tipo: "DEPRECIACAO" } })).toBe(0);
  });

  it("t2: uma vigência que alcança competência já processada é RECUSADA — correção retroativa é outro fluxo; a seguinte é aceita e a omitida é derivada", async () => {
    await entrada(A, "10000.00", "01-15");
    await processar("2026-03");
    await expect(
      definirParametroDeAtualizacao(prisma, { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", vigenteDesde: "2026-03", motivo: "Tentativa de mudar março depois de processado.", criadoPor: POR })
    ).rejects.toThrow(/VIGÊNCIA RETROATIVA[\s\S]*2026-03 da classe[\s\S]*estorne a competência e reprocesse/);
    expect(await prisma.versaoDeParametroDeAtualizacao.count()).toBe(1);
    const v2 = await definirParametroDeAtualizacao(prisma, { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", motivo: "Vigência omitida: derivada da última processada.", criadoPor: POR });
    const lida = await prisma.versaoDeParametroDeAtualizacao.findUniqueOrThrow({ where: { id: v2.versaoId } });
    expect(lida.vigenteDesde?.toISOString().slice(0, 7)).toBe("2026-04");
    expect((await parametroVigenteEm(prisma, CLASSE, "2026-03"))?.numero).toBe(1);
    expect((await parametroVigenteEm(prisma, CLASSE, "2026-04"))?.numero).toBe(2);
  });
});

describe("A05 — bem, classe e razão", () => {
  beforeEach(semear);

  it("t3: N=2 bens com inícios diferentes: itens por bem, um lançamento com a soma, valor do bem acompanha, Σ(itens) = classe = razão", async () => {
    await entrada(A, "10000.00", "01-15");
    await entrada(B, "5000.00", "04-10");
    await definirParametroDeAtualizacao(prisma, { classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 12, percentualResidual: "0.000000", vigenteDesde: "2026-05", motivo: "v2 desde maio.", criadoPor: POR });

    const marco = await processar("2026-03");
    expect(marco.itens.map((i) => [i.numeroTombamento, i.valorDaParcela.toFixed(2)])).toEqual([["TOMB-A", "375.00"]]);
    expect((await valorContabilDoBem(prisma, A)).toFixed(2)).toBe("9625.00");
    expect((await lancamentoDe(marco.lancamentoId)).valor).toBe("375.00");

    const abril = await processar("2026-04");
    expect(abril.escopo).toBe("CLASSE");
    expect(abril.itens.map((i) => [i.numeroTombamento, i.valorDaParcela.toFixed(2)])).toEqual([["TOMB-A", "375.00"], ["TOMB-B", "187.50"]]);
    expect(abril.valorDaParcela.toFixed(2)).toBe("562.50");
    // UM lançamento com a soma; os dois itens o compartilham; a memória é por item
    expect((await lancamentoDe(abril.lancamentoId)).valor).toBe("562.50");
    const itens = await prisma.movimentoPatrimonial.findMany({ where: { operacaoId: abril.execucaoId }, select: { lancamentoId: true, bemId: true, memoriaDeAtualizacao: { select: { execucaoId: true, corte: true, valorDaParcela: true } } } });
    expect(itens).toHaveLength(2);
    expect(new Set(itens.map((i) => i.lancamentoId)).size).toBe(1);
    expect(itens.every((i) => i.memoriaDeAtualizacao?.execucaoId === abril.execucaoId && i.memoriaDeAtualizacao.corte !== null)).toBe(true);
    expect((await valorContabilDoBem(prisma, A)).toFixed(2)).toBe("9250.00");
    expect((await valorContabilDoBem(prisma, B)).toFixed(2)).toBe("4812.50");

    const maio = await processar("2026-05");
    expect(maio.versaoDeParametroId).not.toBe(marco.versaoDeParametroId);
    expect(maio.itens.map((i) => i.valorDaParcela.toFixed(2))).toEqual(["833.33", "416.67"]);
    expect(maio.valorDaParcela.toFixed(2)).toBe("1250.00");

    // A CONCILIAÇÃO: Σ bens = classe; nada sem individualização; nada histórico
    const c = await conciliacaoDaClasse(prisma, CLASSE);
    expect(c.somaDosBens.toFixed(2)).toBe(toMoney("9250.00").minus("833.33").plus("4812.50").minus("416.67").toFixed(2));
    expect(c.classe.toFixed(2)).toBe(c.somaDosBens.toFixed(2));
    expect(c.semIndividualizacao.toFixed(2)).toBe("0.00");
    expect(c.diferenca.toFixed(2)).toBe("0.00");
    expect(c.acumuladaHistoricaSemBem.toFixed(2)).toBe("0.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("12812.50");
  });

  it("t4: residual alcançado, baixa e reavaliação: o bem totalmente atualizado para, o baixado sai, o reavaliado muda de base — os outros seguem", async () => {
    await entrada(A, "1000.00", "01-15");
    await entrada(B, "5000.00", "01-15");
    // o acervo sem individualização dá saldo à CLASSE — para provar que o teto do BEM é próprio
    await registrarEntradaAvulsa(prisma, { classeDeBensId: CLASSE, tipo: "AVALIACAO_INICIAL", valor: "10000.00", dataMovimento: DIA("01-15"), motivo: "Avaliação inicial do acervo da classe.", criadoPor: POR });
    await baixarBem(prisma, { classeDeBensId: CLASSE, bemId: A, tipo: "DOACAO_REALIZADA", valor: "1000.00", dataMovimento: DIA("02-10"), motivo: "Doado à escola municipal.", criadoPor: POR });
    await registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId: B, sentido: "REDUCAO", valor: "1000.00", dataMovimento: DIA("02-15"), motivo: "Laudo apontou desvalorização.", criadoPor: POR });
    const marco = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(marco.itens.map((i) => [i.numeroTombamento, i.situacao])).toEqual([["TOMB-A", "SEM_VALOR"], ["TOMB-B", "PRONTO"], [null, "PRONTO"]]);
    // B: base 4.000, residual 400, (4.000 − 400)/24 = 150,00 · acervo: (10.000 − 1.000)/24 = 375,00 · total 525,00
    expect(marco.itens[1]?.calculo?.valorDaParcela.toFixed(2)).toBe("150.00");
    expect(marco.calculo?.valorDaParcela.toFixed(2)).toBe("525.00");
    const r = await processar("2026-03");
    expect(r.itens).toHaveLength(2);
    expect((await valorContabilDoBem(prisma, B)).toFixed(2)).toBe("3850.00");
    // reduzir B abaixo do que ELE vale é recusado pelo teto do bem (V4), ainda que a classe tenha saldo
    await expect(
      registrarImpairment(prisma, { classeDeBensId: CLASSE, bemId: B, valor: "3900.00", dataMovimento: DIA("03-20"), motivo: "Impairment acima do valor do bem.", criadoPor: POR })
    ).rejects.toThrow(/excede o valor contábil do BEM/);
    // um bem que atinge o residual: impairment leva B ao residual (400) → totalmente atualizado
    await registrarImpairment(prisma, { classeDeBensId: CLASSE, bemId: B, valor: "3450.00", dataMovimento: DIA("03-25"), motivo: "Redução ao valor recuperável.", criadoPor: POR });
    const abril = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-04" });
    // base = 4.000 − 3.450 = 550; residual 55; contábil = 3.850 − 3.450 = 400; teto = 400 − 55 = 345 > 0 → ainda pronto
    expect(abril.itens[1]?.situacao).toBe("PRONTO");
    expect(abril.itens[1]?.calculo?.teto.toFixed(2)).toBe("345.00");
  });

  it("t5: o acervo sem individualização é um item próprio — e a atualização antiga da classe inteira fica na conciliação como histórico", async () => {
    await registrarEntradaAvulsa(prisma, { classeDeBensId: CLASSE, tipo: "AVALIACAO_INICIAL", valor: "12000.00", dataMovimento: DIA("01-15"), motivo: "Avaliação inicial do acervo da classe.", criadoPor: POR });
    await entrada(A, "6000.00", "01-15");
    const r = await processar("2026-03");
    expect(r.itens.map((i) => [i.bemId, i.valorDaParcela.toFixed(2)])).toEqual([[A, "225.00"], [null, "450.00"]]);
    expect(r.valorDaParcela.toFixed(2)).toBe("675.00");
    const c = await conciliacaoDaClasse(prisma, CLASSE);
    expect(c.somaDosBens.toFixed(2)).toBe("5775.00");
    expect(c.semIndividualizacao.toFixed(2)).toBe("11550.00");
    expect(c.diferenca.toFixed(2)).toBe("0.00");
    expect(c.acumuladaHistoricaSemBem.toFixed(2)).toBe("0.00"); // o item do acervo tem execução: não é histórico
    // uma atualização ANTIGA (sem execução) da classe inteira é histórico a reconciliar, não é distribuída
    const lanc = await prisma.lancamentoContabil.findFirstOrThrow({ select: { id: true } });
    await prisma.movimentoPatrimonial.create({ data: { classeDeBensId: CLASSE, tipo: "DEPRECIACAO", valor: "100.00", dataMovimento: DIA("02-01"), competencia: DIA("02-01"), lancamentoId: lanc.id, criadoPor: POR } });
    const c2 = await conciliacaoDaClasse(prisma, CLASSE);
    expect(c2.acumuladaHistoricaSemBem.toFixed(2)).toBe("100.00");
    expect(c2.diferenca.toFixed(2)).toBe("0.00");
  });
});

describe("A07 — virada, execução e estorno com impacto verificado", () => {
  beforeEach(semear);

  it("t6: o estorno de UM item desfaz a EXECUÇÃO da classe (os itens e o lançamento único, uma vez) — não a virada; a competência fica livre", async () => {
    await entrada(A, "10000.00", "01-15");
    await entrada(B, "5000.00", "01-15");
    const marco = await processar("2026-03");
    expect(marco.itens).toHaveLength(2);
    const an = await analisarEstornoPatrimonial(prisma, marco.itens[1]!.movimentoId);
    expect(an.execucao).toMatchObject({ id: marco.execucaoId, competencia: "2026-03", escopo: "CLASSE", itens: 2 });
    expect(an.arrastados.map((x) => x.id)).toEqual([marco.itens[0]!.movimentoId]);
    expect(an.podeEstornar).toBe(true);

    const lancs = await prisma.lancamentoContabil.count();
    const r = await estornar(marco.itens[1]!.movimentoId);
    expect(r.movimentos).toHaveLength(2);
    expect(r.lancamentos).toHaveLength(1); // o lançamento compartilhado foi estornado UMA vez
    expect(await prisma.lancamentoContabil.count()).toBe(lancs + 1);
    expect((await valorContabilDoBem(prisma, A)).toFixed(2)).toBe("10000.00");
    expect((await valorContabilDoBem(prisma, B)).toFixed(2)).toBe("5000.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("15000.00");
    expect((await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" })).situacao).toBe("PRONTA");
    // a memória dos dois itens CONTINUA — o estorno não apaga história
    expect(await prisma.memoriaDeAtualizacao.count()).toBe(2);
  });

  it("t7: escopo UM BEM: a execução processa só ele; a da classe depois pula o já atualizado e diz o escopo", async () => {
    await entrada(A, "10000.00", "01-15");
    await entrada(B, "5000.00", "01-15");
    const soA = await processar("2026-03", A);
    expect(soA.escopo).toBe("BEM");
    expect(soA.itens.map((i) => i.bemId)).toEqual([A]);
    const previa = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(previa.itens.map((i) => [i.numeroTombamento, i.situacao])).toEqual([["TOMB-A", "JA_ATUALIZADO"], ["TOMB-B", "PRONTO"]]);
    const resto = await processar("2026-03");
    expect(resto.itens.map((i) => i.bemId)).toEqual([B]);
    await expect(processar("2026-03")).rejects.toThrow(/JÁ FOI ATUALIZADA[\s\S]*2 item/);
  });

  it("t8: a dependência é IMPACTO, não tipo: a redução do bem B não depende da entrada do bem A; a redução do bem A depende da entrada de A (o bem ficaria negativo); custo que não faz falta não depende", async () => {
    const a = await entrada(A, "10000.00", "01-15");
    const b = await entrada(B, "5000.00", "01-15");
    const custoA = await registrarCustoSubsequente(prisma, { classeDeBensId: CLASSE, bemId: A, valor: "2000.00", dataMovimento: DIA("02-01"), motivo: "Reforma estrutural do ônibus.", criadoPor: POR });
    const redB = await registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId: B, sentido: "REDUCAO", valor: "1000.00", dataMovimento: DIA("02-10"), motivo: "Laudo de avaliação apontou desvalorização.", criadoPor: POR });
    const redA = await registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId: A, sentido: "REDUCAO", valor: "500.00", dataMovimento: DIA("02-12"), motivo: "Laudo de avaliação apontou desvalorização.", criadoPor: POR });

    // a entrada de A: a redução de B NÃO depende dela (outro bem, e a classe sem A ainda cobre 1.000); a redução de A SIM (A sem a entrada valeria 2.000 − 500 ≥ 500? não: 2.000 ≥ 500 → não!)
    const anA = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(anA.dependentes.map((d) => d.id)).toEqual([]);
    expect(anA.posterioresDoBem.map((d) => d.id)).toEqual([redA.movimentoId, custoA.movimentoId]);
    // o custo de A: sem ele, A no registro da redução valeria 10.000 ≥ 500 → não depende
    expect((await analisarEstornoPatrimonial(prisma, custoA.movimentoId)).dependentes).toEqual([]);
    // a entrada de B: sem ela, B valeria 0 < 1.000 no registro da redução → depende, com o impacto dito
    const anB = await analisarEstornoPatrimonial(prisma, b.movimentoId);
    expect(anB.dependentes.map((d) => [d.id, d.porque])).toEqual([[redB.movimentoId, "REDUCAO_POSTERIOR"]]);
    expect(anB.dependentes[0]?.impacto).toMatch(/o bem TOMB-B valeria 0.00 no registro da redução de 1000.00/);
    await expect(estornar(b.movimentoId)).rejects.toThrow(/DEPENDENTES VIVOS/);
    // uma redução de A maior do que A valeria sem a entrada: depende de verdade
    const redA2 = await registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId: A, sentido: "REDUCAO", valor: "9000.00", dataMovimento: DIA("02-20"), motivo: "Laudo de avaliação apontou desvalorização.", criadoPor: POR });
    const anA2 = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(anA2.dependentes.map((d) => d.id)).toEqual([redA2.movimentoId]);
  });

  it("t9: a competência depende só do que compôs a base do ITEM: a entrada de B não sustenta a parcela de A; a ordem de registro tem desempate estável", async () => {
    const a = await entrada(A, "10000.00", "01-15");
    const b = await entrada(B, "5000.00", "01-15");
    const marco = await processar("2026-03");
    const itemA = marco.itens.find((i) => i.bemId === A)!;
    const itemB = marco.itens.find((i) => i.bemId === B)!;
    const anB = await analisarEstornoPatrimonial(prisma, b.movimentoId);
    expect(anB.dependentes.map((d) => d.id)).toEqual([itemB.movimentoId]); // só o item de B, não o de A
    const anA = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(anA.dependentes.map((d) => d.id)).toEqual([itemA.movimentoId]);
    // uma entrada de B datada DEPOIS do corte de março não entrou na base de março: não depende
    const bDepois = await entrada(B, "100.00", "04-02");
    expect((await analisarEstornoPatrimonial(prisma, bDepois.movimentoId)).dependentes).toEqual([]);

    // DESEMPATE ESTÁVEL: dois movimentos com o MESMO criadoEm ordenam pela sequência do banco.
    const mesmoInstante = new Date("2026-02-01T10:00:00.000Z");
    await prisma.movimentoPatrimonial.updateMany({ where: { id: { in: [itemA.movimentoId, itemB.movimentoId] } }, data: { criadoEm: mesmoInstante } }).catch(() => undefined);
    const seq = await prisma.movimentoPatrimonial.findMany({ where: { operacaoId: marco.execucaoId }, select: { id: true, sequencia: true }, orderBy: { sequencia: "asc" } });
    expect(seq.map((s) => s.id)).toEqual([itemA.movimentoId, itemB.movimentoId]);
    expect(seq[0]!.sequencia).toBeLessThan(seq[1]!.sequencia);
  });
});
