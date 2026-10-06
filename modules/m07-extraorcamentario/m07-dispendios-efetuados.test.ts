import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { estornarMovimentoExtra, registrarDispendioExtra, registrarIngressoExtra } from "./extraorcamentario.js";
import { dispendiosEfetuados, totalDosDispendios } from "./dispendios-efetuados.js";
import { FONTE_500, FONTE_540, POR, R_IN, R_OUT, T_CAUCAO, T_INSS, semearM07 } from "./fixture-m07.js";

/**
 * V36 — OS DISPÊNDIOS EXTRAORÇAMENTÁRIOS DO RELATÓRIO DE PAGAMENTOS EFETUADOS.
 *
 * N=2 em cada regra: dois dispêndios no período (um estornado, que continua na lista com vivo zero), um no dia
 * seguinte ao fim do período (em hora de borda — fora pelo dia civil, dentro se a comparação fosse em UTC), e
 * fontes e contas diferentes para os filtros.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const periodo = { de: inicioDoDiaCivil("2026-06-01"), ate: fimDoDiaCivil("2026-06-30") };

async function cenario(): Promise<{ readonly estornadoId: string }> {
  await semearM07();
  const entra = (tipo: string, credor: string, valor: string, conta: string, fonteId: string) =>
    registrarIngressoExtra(prisma, { tipoConsignacaoId: tipo, credorConsignatario: credor, contaBancaria: conta, fonteId, valor, data: DIA_DE_BORDA(2026, 5, 2), historico: "ingresso", criadoPor: POR }, R_IN);
  const sai = (tipo: string, credor: string, valor: string, conta: string, fonteId: string, data: Date) =>
    registrarDispendioExtra(prisma, { tipoConsignacaoId: tipo, credorConsignatario: credor, contaBancaria: conta, fonteId, valor, data, historico: `saída ${credor}`, criadoPor: POR }, R_OUT);

  await entra(T_CAUCAO, "Construtora Alfa", "5000.00", "CC-001", FONTE_500);
  await entra(T_INSS, "INSS", "800.00", "CC-002", FONTE_540);
  await sai(T_CAUCAO, "Construtora Alfa", "1200.00", "CC-001", FONTE_500, DIA_DE_BORDA(2026, 6, 10));
  const estornado = await sai(T_INSS, "INSS", "300.00", "CC-002", FONTE_540, DIA_DE_BORDA(2026, 6, 30));
  await sai(T_CAUCAO, "Construtora Alfa", "700.00", "CC-001", FONTE_500, DIA_DE_BORDA(2026, 7, 1));
  await estornarMovimentoExtra(prisma, { movimentoId: estornado.movimentoId, data: DIA_DE_BORDA(2026, 7, 5), motivo: "Recolhimento em duplicidade, devolvido pelo banco.", criadoPor: POR });
  return { estornadoId: estornado.movimentoId };
}

describe("M07 V36 — dispêndios extraorçamentários efetuados", () => {
  beforeEach(async () => {
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: o período pelo dia civil, o estorno descontado e a linha estornada mantida", async () => {
    const linhas = await dispendiosEfetuados(prisma, periodo);
    expect(linhas.map((l) => [l.consignatario, l.valor.toFixed(2), l.estornado.toFixed(2), l.vivo.toFixed(2), l.fonteCodigo, l.contaBancaria, l.tipoCodigo])).toEqual([
      ["Construtora Alfa", "1200.00", "0.00", "1200.00", "500", "CC-001", "CAUCAO"],
      ["INSS", "300.00", "300.00", "0.00", "540", "CC-002", "INSS"],
    ]);
    // O estorno de 05/07 desconta o dispêndio de 30/06 mesmo fora do período: a régua é a do fato original.
    expect(totalDosDispendios(linhas).toFixed(2)).toBe("1200.00");
    // O de 01/07 em hora de borda fica fora; julho inteiro o traz.
    const julho = await dispendiosEfetuados(prisma, { de: inicioDoDiaCivil("2026-07-01"), ate: fimDoDiaCivil("2026-07-31") });
    expect(julho.map((l) => l.valor.toFixed(2))).toEqual(["700.00"]);
  });

  it("t2: os filtros de fonte, conta e consignatário recortam", async () => {
    expect((await dispendiosEfetuados(prisma, { ...periodo, fonteCodigo: "540" })).map((l) => l.consignatario)).toEqual(["INSS"]);
    expect((await dispendiosEfetuados(prisma, { ...periodo, contaBancaria: "CC-001" })).map((l) => l.consignatario)).toEqual(["Construtora Alfa"]);
    expect((await dispendiosEfetuados(prisma, { ...periodo, consignatario: "INSS" })).map((l) => l.valor.toFixed(2))).toEqual(["300.00"]);
    expect(await dispendiosEfetuados(prisma, { ...periodo, fonteCodigo: "999" })).toEqual([]);
  });

  it("t3: o ingresso não entra — só a saída de caixa", async () => {
    const todos = await dispendiosEfetuados(prisma, { de: inicioDoDiaCivil("2026-01-01"), ate: fimDoDiaCivil("2026-12-31") });
    expect(todos).toHaveLength(3);
    expect(todos.every((l) => l.historico.startsWith("saída"))).toBe(true);
  });
});
