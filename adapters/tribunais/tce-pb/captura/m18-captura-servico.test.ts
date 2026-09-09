import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { limparBanco } from "../../../../test/limpar-banco.js";
import { toMoney } from "../../../../packages/contracts/index.js";
import type { DotacaoFato } from "../sagres/index.js";
import { dotacaoParaCaptura } from "./dto-captura.js";
import { submeterCaptura } from "./servico.js";

/**
 * F3 — o serviço de submissão contra o banco real: persiste ExecucaoCaptura + RegistroDeOperacao, e o
 * estado reflete o que ACONTECEU (SIMULATED no MOCK, CREDENTIAL_NOT_CONFIGURED no SANDBOX, REJECTED no
 * inválido) — nunca fingimento de aceitação externa.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m05@cg.pb.gov.br"; // fixture com ADMIN (limparBanco semeia)
const TS = "2026-07-19T10:00:00.000000";

const elDotacao = (over: Partial<DotacaoFato> = {}) =>
  dotacaoParaCaptura({
    codUnidadeGestora: "999001", competencia: 2026, codUnidadeOrcamentaria: "02001",
    codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
    codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "30",
    exercicioFonteRecurso: 1, codFonteRecurso: "500", valor: toMoney("150000.00"), ...over,
  });

describe("submeterCaptura (censo SUBMETER_CAPTURA)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("MOCK, válido → SIMULATED + simulationId; persiste a execução e o log", async () => {
    const r = await submeterCaptura(prisma, { entidade: "dotacao", elementos: [elDotacao()], modo: "MOCK", criadoPor: POR, timestamp: TS, correlationId: "corr-mock-1" });
    expect(r.estado).toBe("SIMULATED");
    expect(r.simulationId).not.toBeNull();
    expect(r.violacoes).toEqual([]);

    const exec = await prisma.execucaoCaptura.findUniqueOrThrow({ where: { correlationId: "corr-mock-1" } });
    expect(exec.estado).toBe("SIMULATED");
    expect(exec.modo).toBe("MOCK");
    expect(exec.hashPayload).toHaveLength(64);
    const log = await prisma.registroDeOperacao.findFirst({ where: { acao: "SUBMETER_CAPTURA" } });
    expect(log).not.toBeNull();
  });

  it("SANDBOX sem credencial → VALIDATED_LOCAL + CREDENTIAL_NOT_CONFIGURED (nunca MOCK)", async () => {
    const r = await submeterCaptura(prisma, { entidade: "dotacao", elementos: [elDotacao()], modo: "SANDBOX", criadoPor: POR, timestamp: TS, correlationId: "corr-sbx-1" });
    expect(r.estado).toBe("VALIDATED_LOCAL");
    expect(r.credencialNaoConfigurada).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(r.simulationId).toBeNull();
    const exec = await prisma.execucaoCaptura.findUniqueOrThrow({ where: { correlationId: "corr-sbx-1" } });
    expect(exec.estado).toBe("VALIDATED_LOCAL");
    expect(exec.simulationId).toBeNull();
  });

  it("inválido (valor 0) → REJECTED_LOCAL, sem simulationId, violações persistidas", async () => {
    const r = await submeterCaptura(prisma, { entidade: "dotacao", elementos: [elDotacao({ valor: toMoney("0.00") })], modo: "MOCK", criadoPor: POR, timestamp: TS, correlationId: "corr-rej-1" });
    expect(r.estado).toBe("REJECTED_LOCAL");
    expect(r.simulationId).toBeNull();
    expect(r.violacoes.length).toBeGreaterThan(0);
    const exec = await prisma.execucaoCaptura.findUniqueOrThrow({ where: { correlationId: "corr-rej-1" } });
    expect(exec.violacoes).toBeGreaterThan(0);
    expect(exec.estado).toBe("REJECTED_LOCAL");
  });
});
