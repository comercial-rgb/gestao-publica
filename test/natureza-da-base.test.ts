import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { baseAdmiteEnsaio, declararNaturezaDaBase, naturezaDaBase, naturezaLida } from "../modules/m16-travamento/natureza-da-base.js";
import { destinoDoPercurso, naturezaAdmitePercurso } from "../scripts/destino-do-percurso.js";

/**
 * V39-001/002 — A NATUREZA DA BASE E O DESTINO DO PERCURSO. A marca "(base fictícia)" na tela deixou de ser a
 * garantia: o banco declara, o servidor responde, o percurso recusa o que não for demonstração ou ensaio. Toda
 * negação afirma o motivo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

beforeEach(async () => {
  await limparBanco(prisma);
}, 60_000);

describe("V39 — a natureza da base (banco)", () => {
  it("sem declaração, a base é NAO_DECLARADA e não admite ensaio", async () => {
    const n = await naturezaDaBase(prisma);
    expect(n.natureza).toBe("NAO_DECLARADA");
    expect(baseAdmiteEnsaio(n.natureza)).toBe(false);
  });

  it("vale a declaração de MAIOR número (N=2): ENSAIO depois de DEMONSTRACAO", async () => {
    await declararNaturezaDaBase(prisma, { natureza: "DEMONSTRACAO", motivo: "semente", declaradoPor: "op" });
    const r = await declararNaturezaDaBase(prisma, { natureza: "ENSAIO", motivo: "ente de ensaio", declaradoPor: "op" });
    expect(r).toEqual({ numero: 2, natureza: "ENSAIO" });
    expect((await naturezaDaBase(prisma)).natureza).toBe("ENSAIO");
    expect(await prisma.declaracaoDaNaturezaDaBase.count()).toBe(2);
  });

  it("base OFICIAL não se rebaixa sem confirmação; com confirmação, sim, e a oficial fica no histórico", async () => {
    await declararNaturezaDaBase(prisma, { natureza: "OFICIAL", motivo: "implantação", declaradoPor: "op" });
    await expect(declararNaturezaDaBase(prisma, { natureza: "DEMONSTRACAO", motivo: "engano", declaradoPor: "op" })).rejects.toThrow(/declarada OFICIAL.*confirmação explícita/);
    expect((await naturezaDaBase(prisma)).natureza).toBe("OFICIAL");
    await declararNaturezaDaBase(prisma, { natureza: "DEMONSTRACAO", motivo: "cópia para treino", declaradoPor: "op", confirmarRebaixamento: true });
    expect((await naturezaDaBase(prisma)).natureza).toBe("DEMONSTRACAO");
    expect((await prisma.declaracaoDaNaturezaDaBase.findMany({ orderBy: { numero: "asc" }, select: { natureza: true } })).map((d) => d.natureza)).toEqual(["OFICIAL", "DEMONSTRACAO"]);
  });

  it("natureza fora do conjunto, sem motivo ou sem autor: recusada com o motivo; o banco também barra o INSERT direto", async () => {
    await expect(declararNaturezaDaBase(prisma, { natureza: "TESTE", motivo: "x", declaradoPor: "op" })).rejects.toThrow(/"TESTE" não existe/);
    await expect(declararNaturezaDaBase(prisma, { natureza: "ENSAIO", motivo: "  ", declaradoPor: "op" })).rejects.toThrow(/exige o motivo/);
    await expect(declararNaturezaDaBase(prisma, { natureza: "ENSAIO", motivo: "x", declaradoPor: "" })).rejects.toThrow(/exige quem declara/);
    await expect(prisma.declaracaoDaNaturezaDaBase.create({ data: { numero: 1, natureza: "PRODUCAO", motivo: "x", declaradoPor: "op" } })).rejects.toThrow(/ck_natureza_da_base_conjunto/);
    expect(await prisma.declaracaoDaNaturezaDaBase.count()).toBe(0);
  });

  it("valor estranho lido do banco vale NAO_DECLARADA (fail-closed)", () => {
    expect([naturezaLida("ENSAIO"), naturezaLida("ensaio"), naturezaLida(null), naturezaLida("")]).toEqual(["ENSAIO", "NAO_DECLARADA", "NAO_DECLARADA", "NAO_DECLARADA"]);
  });
});

describe("V39 — o destino do percurso (puro)", () => {
  it("máquina local passa sem declaração", () => {
    expect(destinoDoPercurso("http://localhost:3011", undefined).autorizado).toBe(true);
    expect(destinoDoPercurso("http://127.0.0.1:3011", undefined).autorizado).toBe(true);
  });

  it("destino remoto sem PERCURSO_DESTINO_AUTORIZADO, ou com outra origem, é recusado com o motivo", () => {
    const sem = destinoDoPercurso("https://exemplo.gov.br", undefined);
    expect(sem).toEqual({ autorizado: false, motivo: expect.stringMatching(/sem PERCURSO_DESTINO_AUTORIZADO/) as unknown as string });
    const outro = destinoDoPercurso("https://exemplo.gov.br", "https://outro.gov.br");
    expect(outro.autorizado).toBe(false);
    expect(outro.motivo).toMatch(/não é o destino https:\/\/exemplo\.gov\.br/);
    // porta diferente é outra origem
    expect(destinoDoPercurso("https://exemplo.gov.br:8443", "https://exemplo.gov.br").autorizado).toBe(false);
    expect(destinoDoPercurso("ftp://localhost", undefined).motivo).toMatch(/não é http nem https/);
  });

  it("destino remoto com a mesma origem declarada passa", () => {
    expect(destinoDoPercurso("https://exemplo.gov.br/", "https://exemplo.gov.br").autorizado).toBe(true);
  });

  it("só DEMONSTRACAO e ENSAIO, com HTTP 200, admitem o percurso; o resto recusa dizendo o que o servidor declarou", () => {
    expect(naturezaAdmitePercurso(200, { natureza: "DEMONSTRACAO" }).autorizado).toBe(true);
    expect(naturezaAdmitePercurso(200, { natureza: "ENSAIO" }).autorizado).toBe(true);
    expect(naturezaAdmitePercurso(200, { natureza: "OFICIAL" }).motivo).toMatch(/declarada "OFICIAL"/);
    expect(naturezaAdmitePercurso(200, { natureza: "NAO_DECLARADA" }).motivo).toMatch(/declarada "NAO_DECLARADA"/);
    expect(naturezaAdmitePercurso(503, { natureza: "DEMONSTRACAO" }).motivo).toMatch(/HTTP 503/);
    expect(naturezaAdmitePercurso(404, null).autorizado).toBe(false);
    expect(naturezaAdmitePercurso(200, "<html>(base fictícia)</html>").autorizado).toBe(false);
  });
});
