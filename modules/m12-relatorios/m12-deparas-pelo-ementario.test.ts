import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { lerEmentarioDaReceita } from "../m04-receita/ementario-oficial.js";
import { classeAspsDaFonte, classeEducacaoDaFonte, gerarDeParasDaLrf, regraDaNatureza, REGRAS_FUNDEB, REGRAS_IMPOSTOS_E_TRANSFERENCIAS } from "./deparas-pelo-ementario.js";

/**
 * ═══ OS DE-PARAS DA LRF PELO EMENTÁRIO DE 2026 (V35, onda B8) ═══
 *
 * ⚠️ A CONFERÊNCIA É CONTRA O ARQUIVO DA STN, não contra a regra: todo prefixo tem de ser o começo de um agregador que
 * EXISTE no ementário de 2026. E as naturezas reais da LOA de Esperança (Lei 613/2025) caem na linha certa — os
 * valores esperados abaixo foram escritos à mão a partir do nome de cada natureza na lei.
 */

const RAIZ = resolve(import.meta.dirname, "../..");
const EMENTARIO = lerEmentarioDaReceita(readFileSync(resolve(RAIZ, "docs/oficial/stn-sof/ementario-2026/ementario-receita-tabela-de-codigos-2026.xlsx")));
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "m12@cg.pb.gov.br";

describe("m12 — de-paras da LRF pelo ementário 2026", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: todo prefixo começa um agregador que existe no ementário da STN de 2026", () => {
    const agregadores = [...EMENTARIO.keys()];
    for (const r of [...REGRAS_IMPOSTOS_E_TRANSFERENCIAS, ...REGRAS_FUNDEB]) {
      expect(agregadores.some((k) => k.startsWith(r.prefixo)), `prefixo ${r.prefixo}`).toBe(true);
    }
  });

  it("t2: as naturezas da LOA de Esperança caem na linha que o nome delas diz", () => {
    const esperado: Record<string, string | null> = {
      "11125001": "IPTU", "11125301": "ITBI", "11130101": "IRRF", "11145111": "ISS",
      "17115111": "FPM", "17115121": "FPM_COMPLEMENTACAO", "17115131": "FPM_COMPLEMENTACAO", "17115201": "ITR",
      "17215001": "ICMS", "17215101": "IPVA", "17215201": "IPI_EXPORTACAO",
      "17215301": null, // CIDE — fora da base de impostos e transferências constitucionais
      "17135011": null, // SUS — transferência vinculada, não é imposto
    };
    for (const [codigo, chave] of Object.entries(esperado)) expect(regraDaNatureza(codigo)?.chave ?? null, codigo).toBe(chave);
  });

  it("t3: as classes de fonte seguem a tabela da STN", () => {
    expect(["500", "540", "542", "550", "600", "621", "634", "700"].map((f) => `${f}:${classeAspsDaFonte(f)}/${classeEducacaoDaFonte(f)}`)).toEqual([
      "500:PROPRIOS/IMPOSTOS_MDE", "540:OUTROS/FUNDEB", "542:OUTROS/VAAT", "550:OUTROS/OUTRAS", "600:SUS/OUTRAS", "621:SUS/OUTRAS", "634:OPERACAO_CREDITO/OUTRAS", "700:OUTROS/OUTRAS",
    ]);
  });

  describe("contra banco", () => {
    beforeEach(async () => {
      await limparBanco(prisma);
      await prisma.naturezaReceita.createMany({
        data: ["11125001", "11125003", "17115111", "17115121", "17515001", "17135011"].map((codigo) => ({ codigo, descricao: codigo })),
      });
      await prisma.fonteRecurso.createMany({ data: ["500", "540", "600"].map((codigo) => ({ codigo, descricao: codigo, codigoTce: codigo })) });
    });

    it("t4: grava só o que falta, não toca o mapeamento do ente, e a segunda geração não cria nada", async () => {
      // o ente já mapeou o FPM mensal para outra linha: a decisão dele fica
      await prisma.deParaRclAnexo3.create({ data: { naturezaCodigo: "17115111", chaveLinha: "LINHA_DO_ENTE", tipo: "corrente", criadoPor: POR } });
      const r = await gerarDeParasDaLrf(prisma, { criadoPor: POR });
      // base de impostos: IPTU principal, IPTU dívida ativa, FPM, FPM 1% (4); RCL só principal e sem o já mapeado: IPTU,
      // FPM 1% (2); FUNDEB: retorno (1); fontes: 3 + 3
      expect(r).toEqual({ rcl: 2, baseImpostos: 4, fundeb: 1, fontesAsps: 3, fontesEducacao: 3 });
      expect((await prisma.deParaRclAnexo3.findUnique({ where: { naturezaCodigo: "17115111" } }))?.chaveLinha).toBe("LINHA_DO_ENTE");
      expect((await prisma.deParaBaseImpostoAsps.findMany({ where: { naturezaCodigo: "11125003" } })).map((x) => x.chave)).toEqual(["IPTU"]);
      expect(await gerarDeParasDaLrf(prisma, { criadoPor: POR })).toEqual({ rcl: 0, baseImpostos: 0, fundeb: 0, fontesAsps: 0, fontesEducacao: 0 });
    });
  });
});
