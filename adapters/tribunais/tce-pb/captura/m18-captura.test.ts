import { describe, expect, it } from "vitest";
import { toMoney } from "../../../../packages/contracts/index.js";
import type { DotacaoFato } from "../sagres/index.js";
import { dotacaoParaCaptura, montarEnvelope } from "./dto-captura.js";
import { validarEnvelopeCaptura } from "./validacao-captura.js";
import { criarTransporte, transicaoSubmissaoMock, transicaoValidacao, CredentialNotConfiguredError } from "./estado.js";

/**
 * S3 — Captura 2.0. O DTO da S1 vira JSON e passa (ou não) no SCHEMA OFICIAL (ajv, draft 2020-12).
 * Golden do JSON + prova de que o validador acusa o que o schema recusa (nada inventado).
 */

const TS = "2026-07-19T10:00:00.000000"; // injetado — determinismo

const dotacao = (over: Partial<DotacaoFato> = {}): DotacaoFato => ({
  codUnidadeGestora: "999001", competencia: 2026, codUnidadeOrcamentaria: "02001",
  codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
  codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "30",
  exercicioFonteRecurso: 1, codFonteRecurso: "500", valor: toMoney("150000.00"), ...over,
});

describe("F1 — DTO da S1 → JSON Captura 2.0 (mesma massa, outra serialização)", () => {
  it("Dotação: nomes/format oficiais (codigo*, enum ATUAL, valor number)", () => {
    const el = dotacaoParaCaptura(dotacao());
    expect(el).toEqual({
      codigoUnidadeGestora: "999001", codigoUnidadeOrcamentaria: "02001",
      codigoFuncao: "04", codigoSubfuncao: "122", codigoPrograma: "0001", codigoAcao: "2001",
      codigoCategoriaEconomica: "3", codigoNaturezaDespesa: "3", codigoModalidadeDespesa: "90", codigoElementoDespesa: "30",
      exercicioFonteRecurso: "ATUAL", codigoFonteRecurso: "500",
      valorDotacao: 150000, action: "CREATE",
    });
  });

  it("envelope determinístico { timestamp, elementos }", () => {
    const env = montarEnvelope([dotacaoParaCaptura(dotacao())], TS);
    expect(env.timestamp).toBe(TS);
    expect(env.elementos).toHaveLength(1);
    expect(JSON.stringify(env)).toContain('"valorDotacao":150000');
  });
});

describe("F2 — validação contra o JSON Schema OFICIAL (ajv)", () => {
  it("Dotação da massa POC passa (envelope válido → zero violação)", () => {
    const env = montarEnvelope([dotacaoParaCaptura(dotacao())], TS);
    expect(validarEnvelopeCaptura("dotacao", env)).toEqual([]);
  });

  it("valor ZERO → o schema recusa (exclusiveMinimum), nomeando o campo", () => {
    const env = montarEnvelope([dotacaoParaCaptura(dotacao({ valor: toMoney("0.00") }))], TS);
    const vs = validarEnvelopeCaptura("dotacao", env);
    expect(vs.length).toBeGreaterThan(0);
    expect(vs.some((v) => v.campo.includes("valorDotacao") && v.regra === "exclusiveMinimum")).toBe(true);
  });

  it("campo obrigatório ausente → o schema recusa (required)", () => {
    const el = dotacaoParaCaptura(dotacao());
    delete (el as Record<string, unknown>)["codigoUnidadeGestora"];
    const vs = validarEnvelopeCaptura("dotacao", montarEnvelope([el], TS));
    expect(vs.some((v) => v.regra === "required" && v.campo.endsWith("codigoUnidadeGestora"))).toBe(true);
  });

  it("timestamp fora do padrão ISO → o schema recusa (pattern)", () => {
    const env = montarEnvelope([dotacaoParaCaptura(dotacao())], "ontem");
    const vs = validarEnvelopeCaptura("dotacao", env);
    expect(vs.some((v) => v.regra === "pattern")).toBe(true);
  });
});

describe("F3 — máquina de estados + transporte (MOCK/SANDBOX/LIVE)", () => {
  it("validação: DRAFT → VALIDATED_LOCAL (limpo) ou REJECTED_LOCAL (com violação)", () => {
    expect(transicaoValidacao("DRAFT", true)).toBe("VALIDATED_LOCAL");
    expect(transicaoValidacao("DRAFT", false)).toBe("REJECTED_LOCAL");
  });

  it("MOCK: submete → SIMULATED + simulationId interno (uuid), SEM protocolo/recibo", async () => {
    expect(transicaoSubmissaoMock("VALIDATED_LOCAL")).toBe("SIMULATED");
    const t = criarTransporte("MOCK", { novoId: () => "sim-123" });
    const r = await t.submeter("corr-1");
    expect(r).toEqual({ modo: "MOCK", simulationId: "sim-123" });
    expect(JSON.stringify(r)).not.toMatch(/protocolo|recibo|aceite|transmit/i);
  });

  it("SANDBOX/LIVE sem credencial → CREDENTIAL_NOT_CONFIGURED (nunca cai em MOCK)", async () => {
    for (const modo of ["SANDBOX", "LIVE"] as const) {
      const t = criarTransporte(modo);
      await expect(t.submeter("corr-2")).rejects.toBeInstanceOf(CredentialNotConfiguredError);
      await expect(t.submeter("corr-2")).rejects.toThrow(/CREDENTIAL_NOT_CONFIGURED/);
    }
  });

  it("submeter fora de VALIDATED_LOCAL é recusado (a máquina não pula etapas)", () => {
    expect(() => transicaoSubmissaoMock("DRAFT")).toThrow(/VALIDATED_LOCAL/);
    expect(() => transicaoSubmissaoMock("SIMULATED")).toThrow(/VALIDATED_LOCAL/);
  });
});
