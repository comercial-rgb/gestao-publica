import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearSagresPoc } from "./sagres-poc.js";
import { lerFatosEmpenhos, validarDominioEmpenhos } from "../../adapters/tribunais/tce-pb/sagres/index.js";

/**
 * F4 — o ERRO SAGRES PROPOSITAL (DIRETIVA §5). A variante do seed (`comErroProposital`) planta um
 * subelemento FORA do domínio oficial; o motor de validações da S2 REJEITA nomeando o campo. O
 * caminho de correção é o seed PADRÃO (subelemento válido) → revalidação limpa. O erro nunca mora no
 * seed padrão — o teste prova os dois lados.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001";
const DIA_EMPENHO = new Date(Date.UTC(2026, 6, 10));
const POR = "m05@cg.pb.gov.br"; // identidade de fixture (o seed não cria usuários — t5)

describe("F4 — rejeição do erro proposital e caminho de correção", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("VARIANTE COM ERRO: o subelemento inválido é REJEITADO pelo validador, nomeando o campo", async () => {
    await semearSagresPoc(prisma, { comErroProposital: true, criadoPor: POR });
    const empenhos = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: DIA_EMPENHO });
    expect(empenhos).toHaveLength(1);
    expect(empenhos[0]!.codSubelemento).toBe("999");

    const violacoes = validarDominioEmpenhos(empenhos);
    expect(violacoes.length).toBeGreaterThan(0);
    const v = violacoes.find((x) => x.campo === "codSubelementoDespesa")!;
    expect(v).toBeDefined();
    expect(v.regra).toBe("DOMINIO");
    expect(v.detalhe).toMatch(/999/);
  });

  it("CORREÇÃO (seed padrão): o subelemento válido passa — revalidação limpa", async () => {
    await semearSagresPoc(prisma, { criadoPor: POR }); // sem erro — o "conserto"
    const empenhos = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: DIA_EMPENHO });
    expect(empenhos[0]!.codSubelemento).toBe("040");
    expect(validarDominioEmpenhos(empenhos)).toEqual([]); // pacote limpo
  });
});
