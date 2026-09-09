import { describe, expect, it } from "vitest";
import { toMoney } from "../../../../packages/contracts/index.js";
import type { EmpenhoFato } from "../sagres/index.js";
import { validarRespostaTce } from "./contrato.js";
import { fixturasDaRota } from "./fixtures-poc.js";
import { criarGatewayTce, estadoDoModoTce, TceCredentialNotConfiguredError } from "./gateway.js";
import { compararEmpenhos } from "./comparar.js";

/**
 * S4 — a API de consulta do TCE (mock contratual). O CONTRATO manda: as fixtures validam contra o
 * schema de RESPOSTA do OpenAPI. A comparação local × TCE mostra a divergência proposital.
 */

describe("F2 — as fixtures do MOCK são CONFORMES ao schema oficial (o contrato manda)", () => {
  it("empenhos/dotacoes/pagamentos: cada fixture valida contra o schema de resposta", () => {
    for (const rota of ["empenhos", "dotacoes", "pagamentos"] as const) {
      expect(validarRespostaTce(rota, fixturasDaRota(rota, "999001"))).toEqual([]);
    }
  });

  it("uma fixture que VIOLA o contrato (valor string, sem campo obrigatório) é REJEITADA", () => {
    const invalido = [{ codUnidadeGestora: "999001", valor: "cinquenta mil" }];
    const vs = validarRespostaTce("empenhos", invalido);
    expect(vs.length).toBeGreaterThan(0);
    expect(vs.some((v) => v.regra === "type" || v.regra === "required")).toBe(true);
  });
});

describe("F1 — gateway: modos MOCK/SANDBOX/LIVE (token só por configuração)", () => {
  it("MOCK devolve as fixtures conformes", async () => {
    const r = await criarGatewayTce("MOCK").consultar("empenhos", { codUnidadeGestora: "999001" });
    expect(r.modo).toBe("MOCK");
    expect(r.registros).toHaveLength(1);
  });

  it("SANDBOX sem token → CREDENTIAL_NOT_CONFIGURED (nunca MOCK)", async () => {
    await expect(criarGatewayTce("SANDBOX").consultar("empenhos", { codUnidadeGestora: "999001" }))
      .rejects.toBeInstanceOf(TceCredentialNotConfiguredError);
    expect(estadoDoModoTce("SANDBOX", false).disponivel).toBe(false);
    expect(estadoDoModoTce("MOCK").disponivel).toBe(true);
  });
});

describe("F3 — comparação dados locais × TCE (lê, não recalcula)", () => {
  const local = (): EmpenhoFato => ({
    codUnidadeGestora: "999001", anoEmissao: 2026, codUnidadeOrcamentaria: "02001",
    codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
    codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "39",
    codSubelemento: "040", modalidadeLicitacao: "9", numLicitacao: null, numEmpenho: "1",
    tipoEmpenho: "ORDINARIO", data: new Date(Date.UTC(2026, 6, 10)), valor: toMoney("50000.00"),
    historico: "x", complementacaoHistorico: null, credorCpfCnpj: "12345678000199",
    naturezaContratacao: "PRESTACAO_SERVICOS", numObra: null, exercicioFonteRecurso: 1, codFonteRecurso: "500",
    cpfOrdenador: "11144477735", co: "1001",
  });

  it("o empenho nº 1 aparece DIVERGENTE (local 50000.00 × TCE 50000.50)", () => {
    const linhas = compararEmpenhos([local()], fixturasDaRota("empenhos", "999001"));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ chave: "1", valorLocal: "50000.00", valorTce: "50000.50", situacao: "DIVERGENTE" });
  });

  it("empenho só-local (não veio do TCE) → SO_LOCAL", () => {
    const linhas = compararEmpenhos([local()], []);
    expect(linhas[0]!.situacao).toBe("SO_LOCAL");
  });
});
