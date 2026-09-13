import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { registrarEntradaAvulsa } from "./patrimonio.js";
import {
  parametrizarRoteiroPatrimonial,
  proporVersaoDeRoteiro,
  publicarVersaoDeRoteiro,
  versaoVigente,
  versoesDoRoteiro,
} from "./roteiros.js";

/**
 * ═══ AS VERSÕES DO ROTEIRO (orquestração V3, 4.5) ═══
 *
 * O que o pedido manda preservar e provar: versão anterior, autor, momento, motivo,
 * vigência, vínculo com os fatos; concorrência entre duas alterações e repetição do mesmo
 * comando sem sobrescrita silenciosa; nenhum lançamento anterior reescrito; validação
 * estrutural (motor) separada da publicação (aprovação) e do uso em fatos.
 *
 * ⚠️ FIXTURE N=2 em contas, em versões e em movimentos: com uma versão só, "o movimento
 * aponta para a versão certa" é verdade por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br"; // fixture ADMIN — tem PARAMETRIZAR e PUBLICAR
const SO_PROPOE = "v3.so.propoe";
const SO_PUBLICA = "v3.so.publica";
const CLASSE = "cl-v3";

async function usuarioCom(identificador: string, acoes: readonly ("PARAMETRIZAR_ROTEIRO_PATRIMONIAL" | "PUBLICAR_ROTEIRO_PATRIMONIAL" | "REGISTRAR_ENTRADA_AVULSA")[]): Promise<void> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: POR }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: POR, permissoes: { create: acoes.map((acao) => ({ acao, criadoPor: POR })) } },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: POR } });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-ativo", codigo: "1.2.3.1.1.01.00", nome: "Bens moveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-ativo2", codigo: "1.2.3.2.1.01.00", nome: "Bens imoveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpa", codigo: "4.6.3.9.1.00.00", nome: "Ganhos com incorporacao", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpa2", codigo: "4.6.3.1.1.00.00", nome: "Outras VPA", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
    ],
  });
  await prisma.classeDeBens.create({
    data: { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-ativo", criadoPor: POR },
  });
  await usuarioCom(SO_PROPOE, ["PARAMETRIZAR_ROTEIRO_PATRIMONIAL"]);
  await usuarioCom(SO_PUBLICA, ["PUBLICAR_ROTEIRO_PATRIMONIAL"]);
}

const PROPOSTA_1 = {
  familia: "PATRIMONIAL" as const,
  chave: "AVALIACAO_INICIAL",
  contaDebitoId: "c-ativo",
  contaCreditoId: "c-vpa",
  motivo: "Primeira parametrização do evento, conforme o plano de contas.",
  criadoPor: POR,
};
const PROPOSTA_2 = { ...PROPOSTA_1, contaCreditoId: "c-vpa2", motivo: "A contrapartida muda para a VPA específica, por orientação do contador." };

async function avaliar(valor: string, quem = POR): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const r = await registrarEntradaAvulsa(prisma, {
    tipo: "AVALIACAO_INICIAL",
    classeDeBensId: CLASSE,
    valor,
    dataMovimento: new Date("2026-03-01T12:00:00Z"),
    motivo: "avaliação de teste",
    criadoPor: quem,
  });
  return { movimentoId: r.movimentoId, lancamentoId: r.lancamentoId };
}

describe("propor e publicar — validação pelo motor, depois a aprovação, só então o uso", () => {
  beforeEach(semear);

  it("a PROPOSTA não vigora: o evento continua sem roteiro até a publicação", async () => {
    const { versaoId, numero } = await proporVersaoDeRoteiro(prisma, PROPOSTA_1);
    expect(numero).toBe(1);
    expect(await versaoVigente(prisma, "PATRIMONIAL", "AVALIACAO_INICIAL")).toBeNull();
    await expect(avaliar("100.00")).rejects.toThrow(/NÃO PARAMETRIZADO/);

    const r = await publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: POR });
    expect(r).toEqual({ versaoId, numero: 1, substituiuNumero: null });
    expect(await versaoVigente(prisma, "PATRIMONIAL", "AVALIACAO_INICIAL")).toMatchObject({ id: versaoId, numero: 1, contaDebito: "1.2.3.1.1.01.00" });
  });

  it("o motor recusa na PROPOSTA (mesma conta nas duas pernas), e o motivo é obrigatório", async () => {
    await expect(proporVersaoDeRoteiro(prisma, { ...PROPOSTA_1, contaCreditoId: "c-ativo" })).rejects.toThrow(/MESMA conta/);
    await expect(proporVersaoDeRoteiro(prisma, { ...PROPOSTA_1, motivo: "ajuste" })).rejects.toThrow(/motivo/i);
    expect(await prisma.versaoDeRoteiro.count()).toBe(0);
  });

  it("segregação: quem só PROPÕE não publica; quem só PUBLICA não propõe; o ato composto exige os dois", async () => {
    const { versaoId } = await proporVersaoDeRoteiro(prisma, { ...PROPOSTA_1, criadoPor: SO_PROPOE });
    await expect(publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: SO_PROPOE })).rejects.toThrow(/ACESSO NEGADO[\s\S]*PUBLICAR_ROTEIRO_PATRIMONIAL/);
    await expect(proporVersaoDeRoteiro(prisma, { ...PROPOSTA_2, criadoPor: SO_PUBLICA })).rejects.toThrow(/ACESSO NEGADO[\s\S]*PARAMETRIZAR_ROTEIRO_PATRIMONIAL/);
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa", criadoPor: SO_PROPOE })
    ).rejects.toThrow(/PUBLICAR_ROTEIRO_PATRIMONIAL/);
    // ...e quem publica, publica a proposta de outro — o par de crachás que a segregação pede.
    await publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: SO_PUBLICA });
    const v = await prisma.versaoDeRoteiro.findUniqueOrThrow({ where: { id: versaoId }, select: { criadoPor: true, publicadaPor: true } });
    expect(v).toEqual({ criadoPor: SO_PROPOE, publicadaPor: SO_PUBLICA });
  });
});

describe("a versão anterior FICA, e o fato sabe qual versão usou", () => {
  beforeEach(semear);

  it("N=2: dois movimentos, duas versões — cada um aponta para a sua, e o lançamento antigo não muda", async () => {
    const v1 = await proporVersaoDeRoteiro(prisma, PROPOSTA_1);
    await publicarVersaoDeRoteiro(prisma, { versaoId: v1.versaoId, criadoPor: POR });
    const m1 = await avaliar("100.00");

    const v2 = await proporVersaoDeRoteiro(prisma, PROPOSTA_2);
    const pub2 = await publicarVersaoDeRoteiro(prisma, { versaoId: v2.versaoId, criadoPor: POR });
    expect(pub2.substituiuNumero).toBe(1);
    const m2 = await avaliar("200.00");

    const mov = await prisma.movimentoPatrimonial.findMany({
      where: { id: { in: [m1.movimentoId, m2.movimentoId] } },
      select: { id: true, versaoDeRoteiroId: true, lancamento: { select: { partidas: { select: { conta: { select: { codigo: true } }, tipo: true } } } } },
    });
    const porId = new Map(mov.map((m) => [m.id, m]));
    expect(porId.get(m1.movimentoId)?.versaoDeRoteiroId).toBe(v1.versaoId);
    expect(porId.get(m2.movimentoId)?.versaoDeRoteiroId).toBe(v2.versaoId);
    // O lançamento do primeiro movimento continua com o par da versão 1 — nada reescrito.
    const creditoDoM1 = porId.get(m1.movimentoId)?.lancamento.partidas.find((p) => p.tipo === "CREDITO")?.conta.codigo;
    const creditoDoM2 = porId.get(m2.movimentoId)?.lancamento.partidas.find((p) => p.tipo === "CREDITO")?.conta.codigo;
    expect(creditoDoM1).toBe("4.6.3.9.1.00.00");
    expect(creditoDoM2).toBe("4.6.3.1.1.00.00");

    // O histórico: autor, momento, motivo, vigência DERIVADA e o vínculo com os fatos.
    const versoes = await versoesDoRoteiro(prisma, "PATRIMONIAL", "AVALIACAO_INICIAL");
    expect(versoes.map((v) => [v.numero, v.situacao, v.vigente, v.movimentos])).toEqual([
      [1, "PUBLICADA", false, 1],
      [2, "PUBLICADA", true, 1],
    ]);
    expect(versoes[0]?.vigenciaFim).toEqual(versoes[1]?.publicadaEm);
    expect(versoes[1]?.vigenciaFim).toBeNull();
    expect(versoes[0]?.motivo).toContain("Primeira parametrização");
    expect(versoes[1]?.publicadaPor).toBe(POR);
  });

  it("a linha LEGADA responde enquanto não há versão — e é ignorada assim que uma é publicada", async () => {
    await prisma.roteiroPatrimonial.create({ data: { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa", criadoPor: POR } });
    const m0 = await avaliar("10.00");
    expect((await prisma.movimentoPatrimonial.findUniqueOrThrow({ where: { id: m0.movimentoId } })).versaoDeRoteiroId).toBeNull();

    // Propor o MESMO par que a linha legada é "nada a versionar" — a legada conta como vigente.
    await expect(proporVersaoDeRoteiro(prisma, PROPOSTA_1)).rejects.toThrow(/Não há o que versionar/);

    const v = await proporVersaoDeRoteiro(prisma, PROPOSTA_2);
    await publicarVersaoDeRoteiro(prisma, { versaoId: v.versaoId, criadoPor: POR });
    const m1 = await avaliar("20.00");
    expect((await prisma.movimentoPatrimonial.findUniqueOrThrow({ where: { id: m1.movimentoId } })).versaoDeRoteiroId).toBe(v.versaoId);
    // A linha legada não foi tocada: continua lá, como origem.
    expect(await prisma.roteiroPatrimonial.count({ where: { tipo: "AVALIACAO_INICIAL" } })).toBe(1);
  });
});

describe("concorrência e repetição — sem sobrescrita silenciosa", () => {
  beforeEach(semear);

  it("duas propostas ao MESMO tempo: nenhuma sobrescreve a outra — números distintos, ou a segunda recusada nomeando", async () => {
    const resultados = await Promise.allSettled([
      proporVersaoDeRoteiro(prisma, PROPOSTA_1),
      proporVersaoDeRoteiro(prisma, { ...PROPOSTA_2, motivo: "Proposta concorrente, com outro par." }),
    ]);
    const ok = resultados.filter((r): r is PromiseFulfilledResult<{ versaoId: string; numero: number }> => r.status === "fulfilled");
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const f of falhas) expect(String(f.reason)).toMatch(/CONCORRÊNCIA|pendente/);
    const versoes = await prisma.versaoDeRoteiro.findMany({ where: { chave: "AVALIACAO_INICIAL" }, select: { numero: true } });
    expect(versoes.length).toBe(ok.length);
    expect(new Set(versoes.map((v) => v.numero)).size).toBe(versoes.length);
  });

  it("repetir o MESMO comando: a proposta idêntica pendente é recusada; publicar duas vezes também", async () => {
    const { versaoId } = await proporVersaoDeRoteiro(prisma, PROPOSTA_1);
    await expect(proporVersaoDeRoteiro(prisma, PROPOSTA_1)).rejects.toThrow(/proposta idêntica pendente.*versão 1/);
    await publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: POR });
    await expect(publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: POR })).rejects.toThrow(/não está mais PROPOSTA/);
    // ...e propor de novo o par já vigente não cria versão.
    await expect(proporVersaoDeRoteiro(prisma, PROPOSTA_1)).rejects.toThrow(/Não há o que versionar/);
    expect(await prisma.versaoDeRoteiro.count()).toBe(1);
  });

  it("o ato composto (parametrizar com substituir) também versiona: duas linhas, a segunda em vigor", async () => {
    await parametrizarRoteiroPatrimonial(prisma, { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa", criadoPor: POR });
    await parametrizarRoteiroPatrimonial(prisma, { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa2", substituir: true, criadoPor: POR });
    const versoes = await versoesDoRoteiro(prisma, "PATRIMONIAL", "AVALIACAO_INICIAL");
    expect(versoes.map((v) => [v.numero, v.contaCredito.codigo, v.vigente])).toEqual([
      [1, "4.6.3.9.1.00.00", false],
      [2, "4.6.3.1.1.00.00", true],
    ]);
    expect(versoes[0]?.motivo).toMatch(/Parametrização direta/);
  });
});
