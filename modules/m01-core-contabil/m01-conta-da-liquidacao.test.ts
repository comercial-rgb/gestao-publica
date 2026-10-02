import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  contaDaLiquidacaoVigente,
  declararContaDaLiquidacao,
  exigirContaDaLiquidacao,
  listarContasDaLiquidacao,
} from "./conta-da-liquidacao.js";
import { roteiroLiquidacao } from "./roteiros.js";

/**
 * V28 — A CONTA DA LIQUIDAÇÃO POR ELEMENTO, DECLARADA PELO ENTE.
 *
 * Contas da fixture (não são do plano oficial; o teste só exige a forma e a classe):
 *   1.2.3.1.1.01.01  imobilizado — equipamentos   (analítica)
 *   1.2.3.2.1.01.01  imobilizado — obras em andamento (analítica)
 *   1.2.3.0.0.00.00  imobilizado (SINTÉTICA)
 *   3.3.2.1.1.01.00  VPD de serviços (analítica)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.contabil@cg.pb.gov.br";
const EQUIP = "1.2.3.1.1.01.01";
const OBRAS = "1.2.3.2.1.01.01";
const SINTETICA = "1.2.3.0.0.00.00";
const VPD = "3.3.2.1.1.01.00";
const FUNDAMENTO = "MCASP, Parte II: aquisição de bem permanente é incorporada ao ativo imobilizado.";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: SINTETICA, nome: "Imobilizado", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false },
      { codigo: EQUIP, nome: "Máquinas e equipamentos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { codigo: OBRAS, nome: "Obras em andamento", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { codigo: VPD, nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
    ],
  });
  const leitor = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_CONTABIL", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

const declarar = (elemento: string, efeito: "VPD" | "IMOBILIZADO" | "INTANGIVEL" | "BAIXA_DE_PASSIVO", contaCodigo: string, criadoPor = POR) =>
  declararContaDaLiquidacao(prisma, { elemento, efeito, contaCodigo, fundamento: FUNDAMENTO, criadoPor });

const debitoDoRoteiro = async (elemento: string): Promise<string> => {
  const c = await exigirContaDaLiquidacao(prisma, elemento);
  return roteiroLiquidacao({ codElemento: elemento, obrigacaoAPagar: "2.1.3.1.1.01.01", contaDebitada: c.contaCodigo })[0]!.conta;
};

describe("V28 — a conta da liquidação por elemento", () => {
  beforeEach(semear);

  it("t1: sem declaração o 52 recusa dizendo onde declarar; declarado, a liquidação debita a conta dele; v2 troca e a v1 fica", async () => {
    await expect(exigirContaDaLiquidacao(prisma, "52")).rejects.toThrow(/elemento de despesa 52 ainda não tem conta[\s\S]*Contas da liquidação por elemento/);
    const v1 = await declarar("52", "IMOBILIZADO", EQUIP);
    expect(v1).toMatchObject({ versao: 1, anterior: null });
    expect(await debitoDoRoteiro("52")).toBe(EQUIP);

    const v2 = await declarar("52", "IMOBILIZADO", OBRAS);
    expect(v2).toMatchObject({ versao: 2, anterior: { contaCodigo: EQUIP, versao: 1 } });
    expect(await debitoDoRoteiro("52")).toBe(OBRAS);
    expect(await prisma.contaDaLiquidacaoPorElemento.count({ where: { elemento: "52" } })).toBe(2);
  });

  it("t2: N=2 elementos com efeitos diferentes não se misturam; o rol fixo segue valendo e aparece como FIXA", async () => {
    await declarar("52", "IMOBILIZADO", EQUIP);
    await declarar("36", "VPD", VPD);
    expect(await debitoDoRoteiro("52")).toBe(EQUIP);
    expect(await debitoDoRoteiro("36")).toBe(VPD);
    expect((await contaDaLiquidacaoVigente(prisma, "39"))?.origem).toBe("FIXA");
    const lista = await listarContasDaLiquidacao(prisma);
    expect(lista.map((l) => `${l.elemento}:${l.contaCodigo}`)).toEqual([`36:${VPD}`, `52:${EQUIP}`]);
  });

  it("t3: as recusas nomeiam o motivo e nada é gravado", async () => {
    await expect(declarar("39", "VPD", VPD)).rejects.toThrow(/elemento 39 tem regra fixa/);
    await expect(declarar("52", "IMOBILIZADO", "1.2.3.9.9.99.99")).rejects.toThrow(/não está no plano de contas/);
    await expect(declarar("52", "IMOBILIZADO", SINTETICA)).rejects.toThrow(/é sintética/);
    await expect(declarar("52", "VPD", EQUIP)).rejects.toThrow(/não é de despesa do período/);
    await expect(declarar("52", "INTANGIVEL", EQUIP)).rejects.toThrow(/não é de ativo intangível/);
    await expect(declararContaDaLiquidacao(prisma, { elemento: "52", efeito: "IMOBILIZADO", contaCodigo: EQUIP, fundamento: "porque sim", criadoPor: POR })).rejects.toThrow(/Diga POR QUE/);
    expect(await prisma.contaDaLiquidacaoPorElemento.count()).toBe(0);
    await declarar("52", "IMOBILIZADO", EQUIP);
    await expect(declarar("52", "IMOBILIZADO", EQUIP)).rejects.toThrow(/não é um fato novo/);
    expect(await prisma.contaDaLiquidacaoPorElemento.count()).toBe(1);
  });

  it("t4: quem só consulta a contabilidade não declara — recusa nomeando a ação, e nada nasce", async () => {
    await expect(declarar("52", "IMOBILIZADO", EQUIP, LEITOR)).rejects.toThrow(/ACESSO NEGADO[\s\S]*PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/);
    expect(await prisma.contaDaLiquidacaoPorElemento.count()).toBe(0);
  });
});
