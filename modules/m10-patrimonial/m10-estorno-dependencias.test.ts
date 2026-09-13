import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { analisarEstornoDeGestao, analisarEstornoPatrimonial } from "./estorno.js";
import { estornarMovimentoDeGestao, registrarMovimentoDeGestao } from "./gestao-do-bem.js";
import { definirParametroDeAtualizacao } from "./parametros.js";
import {
  atualizarCompetencia,
  estornarMovimentoPatrimonial,
  registrarEntradaAvulsa,
  registrarReavaliacao,
  valorContabilDaClasse,
} from "./patrimonio.js";

/**
 * O ESTORNO COM ANÁLISE DE DEPENDÊNCIAS (V3, pacote 2, unidade 4).
 *
 * Depende quem FICARIA INVÁLIDO: a competência calculada sobre uma base que incluía o
 * movimento; a redução conferida contra um teto que o incluía. N=2 em tudo: dois bens, duas
 * entradas, dois movimentos de gestão — para que "posterior" e "dependente" não sejam a
 * mesma coisa por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-veiculos";
const BEM_A = "bem-a";
const BEM_B = "bem-b";
let sala = "";
let galpao = "";

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
  await prisma.classeDeBens.create({
    data: { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
  });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: BEM_A, numeroTombamento: "TOMB-A", descricao: "Ônibus", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-10T12:00:00Z"), criadoPor: POR },
      { id: BEM_B, numeroTombamento: "TOMB-B", descricao: "Van", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-10T12:00:00Z"), criadoPor: POR },
    ],
  });
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
      { tipo: "REAVALIACAO_REDUCAO", contaDebitoId: "c-vpd-red", contaCreditoId: "c-imob", criadoPor: POR },
    ],
  });
  await definirParametroDeAtualizacao(prisma, {
    classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 24, percentualResidual: "0.100000",
    motivo: "Vida útil de veículos, fixture.", criadoPor: POR,
  });
  const s = await prisma.localizacaoFisica.create({ data: { codigo: "SEC-101", descricao: "Sala 101", criadoPor: POR }, select: { id: true } });
  const g = await prisma.localizacaoFisica.create({ data: { codigo: "GAR-01", descricao: "Garagem", criadoPor: POR }, select: { id: true } });
  sala = s.id;
  galpao = g.id;
}

const DIA = (d: string) => new Date(`2026-${d}T12:00:00Z`);
const entrada = (bemId: string, valor: string) =>
  registrarEntradaAvulsa(prisma, { classeDeBensId: CLASSE, bemId, tipo: "AVALIACAO_INICIAL", valor, dataMovimento: DIA("01-15"), motivo: `Avaliação inicial de ${bemId}.`, criadoPor: POR });
const reduzir = (bemId: string, valor: string) =>
  registrarReavaliacao(prisma, { classeDeBensId: CLASSE, bemId, sentido: "REDUCAO", valor, dataMovimento: DIA("02-10"), motivo: "Laudo apontou desvalorização.", criadoPor: POR });
const estornar = (movimentoId: string) =>
  estornarMovimentoPatrimonial(prisma, { movimentoId, dataMovimento: DIA("06-01"), motivo: "Lançamento indevido, conforme apuração.", criadoPor: POR });

describe("a análise de dependências do estorno — eixo de valor", () => {
  beforeEach(semear);

  it("t1: a competência calculada sobre a base que incluía a entrada DEPENDE dela — o estorno recusa nomeando; em ordem inversa, passa", async () => {
    const a = await entrada(BEM_A, "12000.00");
    const marco = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR });

    const analise = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(analise.podeEstornar).toBe(false);
    expect(analise.dependentes.map((d) => [d.id, d.porque])).toEqual([[marco.movimentoId, "COMPETENCIA_POSTERIOR"]]);
    expect(analise.bloqueios.join("\n")).toMatch(/DEPENDENTES VIVOS[\s\S]*DEPRECIACAO de 450.00/);

    const movs = await prisma.movimentoPatrimonial.count();
    const lancs = await prisma.lancamentoContabil.count();
    await expect(estornar(a.movimentoId)).rejects.toThrow(new RegExp(`DEPENDENTES VIVOS[\\s\\S]*${marco.movimentoId}`));
    expect(await prisma.movimentoPatrimonial.count()).toBe(movs);
    expect(await prisma.lancamentoContabil.count()).toBe(lancs);

    // A competência não tem dependente: estorna. Depois, a entrada fica livre — e o valor volta a zero.
    const daCompetencia = await analisarEstornoPatrimonial(prisma, marco.movimentoId);
    expect(daCompetencia.podeEstornar).toBe(true);
    expect(daCompetencia.movimento.temMemoria).toBe(true);
    await estornar(marco.movimentoId);
    expect((await analisarEstornoPatrimonial(prisma, a.movimentoId)).podeEstornar).toBe(true);
    await estornar(a.movimentoId);
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("0.00");
    // a memória de cálculo da competência estornada CONTINUA — o estorno não apaga história
    expect(await prisma.memoriaDeAtualizacao.count()).toBe(1);
  });

  it("t2: a redução posterior depende do aumento que a SUSTENTAVA (impacto verificado), não de todo aumento anterior; um aumento não depende de outro (N=2 bens)", async () => {
    const a = await entrada(BEM_A, "12000.00");
    const b = await entrada(BEM_B, "6000.00");
    // A entrada B veio DEPOIS de A e não depende dela: analisar A não acusa nada.
    const soA = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(soA.podeEstornar).toBe(true);
    expect(soA.dependentes).toEqual([]);
    expect(soA.posterioresDoBem).toEqual([]);

    const red = await reduzir(BEM_A, "1000.00");
    // V4 (A07): a redução de A depende da entrada de A (sem ela o bem A valeria 0 < 1.000) —
    // e NÃO da entrada de B: outro bem, e a classe sem B ainda cobre a redução. Impacto, não tipo.
    const anA = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(anA.podeEstornar).toBe(false);
    expect(anA.dependentes.map((d) => [d.id, d.porque])).toEqual([[red.movimentoId, "REDUCAO_POSTERIOR"]]);
    expect(anA.dependentes[0]?.impacto).toMatch(/o bem TOMB-A valeria 0.00/);
    const anB = await analisarEstornoPatrimonial(prisma, b.movimentoId);
    expect(anB.podeEstornar).toBe(true);
    expect(anB.dependentes).toEqual([]);
    // ...e a própria redução não tem dependente: é a última.
    const daRed = await analisarEstornoPatrimonial(prisma, red.movimentoId);
    expect(daRed.podeEstornar).toBe(true);
    expect(daRed.arrastados).toEqual([]);
    await estornar(red.movimentoId);
    expect((await analisarEstornoPatrimonial(prisma, b.movimentoId)).podeEstornar).toBe(true);
  });

  it("t3: os bloqueios são nomeados — estorno de estorno, duplo estorno, movimento inexistente", async () => {
    const a = await entrada(BEM_A, "12000.00");
    const est = await estornar(a.movimentoId);
    const doEstorno = await analisarEstornoPatrimonial(prisma, est.movimentoId);
    expect(doEstorno.podeEstornar).toBe(false);
    expect(doEstorno.movimento.ehEstorno).toBe(true);
    expect(doEstorno.bloqueios.join("\n")).toMatch(/JÁ É um estorno/);
    const doOriginal = await analisarEstornoPatrimonial(prisma, a.movimentoId);
    expect(doOriginal.movimento.jaEstornado).toBe(true);
    expect(doOriginal.bloqueios.join("\n")).toMatch(/já foi estornado/);
    await expect(analisarEstornoPatrimonial(prisma, "nao-existe")).rejects.toThrow(/não encontrado/);
  });
});

describe("a análise de dependências do estorno — eixo de gestão", () => {
  beforeEach(semear);

  it("t4: o posterior do mesmo eixo é INFORMAÇÃO, não bloqueio; a transferência/estorno segue as regras do domínio", async () => {
    const antiga = await registrarMovimentoDeGestao(prisma, { bemId: BEM_A, tipo: "LOCALIZACAO", localizacaoId: sala, dataMovimento: DIA("02-01"), motivo: "alocação inicial", criadoPor: POR });
    const nova = await registrarMovimentoDeGestao(prisma, { bemId: BEM_A, tipo: "LOCALIZACAO", localizacaoId: galpao, dataMovimento: DIA("03-01"), motivo: "mudou para a garagem", criadoPor: POR });
    // um movimento de OUTRO eixo do mesmo bem não entra na lista
    await registrarMovimentoDeGestao(prisma, { bemId: BEM_A, tipo: "SITUACAO", situacao: "EM_USO", dataMovimento: DIA("03-02"), motivo: "em uso", criadoPor: POR });

    const daAntiga = await analisarEstornoDeGestao(prisma, antiga.movimentoId);
    expect(daAntiga.podeEstornar).toBe(true);
    expect(daAntiga.posterioresDoEixo.map((p) => p.id)).toEqual([nova.movimentoId]);
    expect(daAntiga.arrastados).toEqual([]);
    expect(daAntiga.movimento.numeroTombamento).toBe("TOMB-A");

    const e = await estornarMovimentoDeGestao(prisma, { movimentoId: nova.movimentoId, dataMovimento: DIA("03-05"), motivo: "lançado no bem errado", criadoPor: POR });
    const doEstorno = await analisarEstornoDeGestao(prisma, e.movimentosId[0]!);
    expect(doEstorno.podeEstornar).toBe(false);
    expect(doEstorno.bloqueios.join("\n")).toMatch(/JÁ É um estorno/);
    const daNova = await analisarEstornoDeGestao(prisma, nova.movimentoId);
    expect(daNova.bloqueios.join("\n")).toMatch(/já foi estornado/);
    // e a antiga passou a não ter posterior vivo
    expect((await analisarEstornoDeGestao(prisma, antiga.movimentoId)).posterioresDoEixo).toEqual([]);
    await expect(analisarEstornoDeGestao(prisma, "nao-existe")).rejects.toThrow(/não encontrado/);
  });
});
