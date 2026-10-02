import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { contaDaReceitaVigente, declararContaDaReceita, exigirContaDaReceita } from "./conta-da-receita.js";

/**
 * V28 — A VPA DA ARRECADAÇÃO POR NATUREZA (`VPA-CONSTANTE-NA-PORTA`).
 *
 * Contas da fixture com os nomes do plano do TCE-PB 2025:
 *   4.1.1.2.1.01.00  ITR (a conta que a constante da porta creditava para TODA guia)
 *   4.1.1.2.1.02.00  IPTU
 *   4.1.1.2.1.04.00  ITBI
 *   4.1.1.2.1.00.00  sintética
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.receita.vpa@cg.pb.gov.br";
const FUNDAMENTO = "PCASP do TCE-PB 2025: a VPA do imposto é a conta do mesmo nome no grupo 4.1.1.2.";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: "4.1.1.2.1.00.00", nome: "IMPOSTOS SOBRE PATRIMÔNIO E A RENDA - CONSOLIDAÇÃO", naturezaSaldo: "CREDORA", nivel: 5, analitica: false },
      { codigo: "4.1.1.2.1.01.00", nome: "IMPOSTO S/ PROPRIEDADE TERRITORIAL RURAL", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { codigo: "4.1.1.2.1.02.00", nome: "IMPOSTO SOBRE A PROPRIEDADE PREDIAL E TERRITORIAL URBANA", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { codigo: "4.1.1.2.1.04.00", nome: "ITBI", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { codigo: "3.3.2.1.1.01.00", nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
    ],
  });
  const perfil = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_RECEITA_VPA", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_RECEITA", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

const declarar = (naturezaPrefixo: string, contaVpaCodigo: string, criadoPor = POR) =>
  declararContaDaReceita(prisma, { naturezaPrefixo, contaVpaCodigo, fundamento: FUNDAMENTO, criadoPor });

describe("V28 — a VPA da arrecadação por natureza de receita", () => {
  beforeEach(semear);

  it("t1: sem declaração a guia recusa dizendo onde declarar; o prefixo mais longo vence (N=2 naturezas)", async () => {
    await expect(exigirContaDaReceita(prisma, "11180111")).rejects.toThrow(/natureza de receita 11180111 ainda não tem[\s\S]*Contas da receita por natureza/);
    await declarar("1118", "4.1.1.2.1.04.00");
    await declarar("11180111", "4.1.1.2.1.02.00");
    // IPTU pega a declaração própria; ITBI (11180141) cai no prefixo 1118.
    expect((await exigirContaDaReceita(prisma, "11180111")).contaVpaCodigo).toBe("4.1.1.2.1.02.00");
    expect((await exigirContaDaReceita(prisma, "11180141")).contaVpaCodigo).toBe("4.1.1.2.1.04.00");
    expect(await contaDaReceitaVigente(prisma, "17180000")).toBeNull();
  });

  it("t2: uma versão nova troca a conta para as próximas guias e a anterior fica no histórico", async () => {
    const v1 = await declarar("11180111", "4.1.1.2.1.01.00");
    const v2 = await declarar("11180111", "4.1.1.2.1.02.00");
    expect([v1.versao, v2.versao, v2.anterior]).toEqual([1, 2, "4.1.1.2.1.01.00"]);
    expect((await exigirContaDaReceita(prisma, "11180111")).contaVpaCodigo).toBe("4.1.1.2.1.02.00");
    expect(await prisma.contaDaReceitaPorNatureza.count()).toBe(2);
  });

  it("t3: as recusas nomeiam o motivo e nada é gravado", async () => {
    await expect(declarar("1", "4.1.1.2.1.02.00")).rejects.toThrow(/de 2 a 8 dígitos/);
    await expect(declarar("11180111", "4.9.9.9.9.99.99")).rejects.toThrow(/não está no plano/);
    await expect(declarar("11180111", "4.1.1.2.1.00.00")).rejects.toThrow(/é sintética/);
    await expect(declarar("11180111", "3.3.2.1.1.01.00")).rejects.toThrow(/não é de variação patrimonial aumentativa/);
    expect(await prisma.contaDaReceitaPorNatureza.count()).toBe(0);
    await declarar("11180111", "4.1.1.2.1.02.00");
    await expect(declarar("11180111", "4.1.1.2.1.02.00")).rejects.toThrow(/já creditam 4\.1\.1\.2\.1\.02\.00/);
    expect(await prisma.contaDaReceitaPorNatureza.count()).toBe(1);
  });

  it("t4: quem só consulta a receita não declara — recusa nomeando a ação, e nada nasce", async () => {
    await expect(declarar("11180111", "4.1.1.2.1.02.00", LEITOR)).rejects.toThrow(/ACESSO NEGADO[\s\S]*PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/);
    expect(await prisma.contaDaReceitaPorNatureza.count()).toBe(0);
  });
});
