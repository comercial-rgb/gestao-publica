import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { arrecadadoPorFonteMesAMes, arrecadadoPorNaturezaFonteMesAMes } from "./arrecadado-mes-a-mes.js";
import { roteiroArrecadacao } from "./dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";

/**
 * V36 — A RECEITA MÊS A MÊS POR FONTE, DE VÁRIOS EXERCÍCIOS (TR 5.10.2.60).
 *
 * ═══ AS CONTAS, À MÃO ═══
 *   2025, fonte 500: 1.000,00 em 31/03 (hora de borda: no dia civil é MARÇO; em UTC já seria abril)
 *   2026, fonte 500: 700,00 em 10/02; anulada em 05/04 → fevereiro +700, abril −700, total 0,00
 *   2026, fonte 540: 300,00 em 10/02 e 200,00 em 31/12 (hora de borda: dezembro)
 * N=2 em fontes e em exercícios; a anulação cai no MÊS DELA, não no da guia (o corte é a data do fato).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "m04@cg.pb.gov.br";

const ROTEIRO = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: "6.2.1.1.0.00.00",
  receitaRealizada: "6.2.1.2.0.00.00",
});

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.1.1.2.1.01.00", nome: "VPA - Impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-a-realizar", codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-realizada", codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.codigoAcompanhamento.create({ data: { id: "co-0001", codigo: "0001", descricao: "Execução direta" } });
  for (const exercicio of [2025, 2026]) {
    for (const fonteId of ["fnt-500", "fnt-540"]) {
      await prisma.receitaPrevista.create({
        data: { exercicio, naturezaReceitaId: "nr-iptu", fonteId, exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "5000.00" },
      });
    }
  }
}

async function arrecada(exercicio: number, fonte: string, valor: string, numero: string, data: Date, naturezaReceita = "11121101"): Promise<string> {
  const r = await registrarArrecadacao(
    { exercicio, naturezaReceita, fonte, co: "0001", exercicioFonte: 1, valor, dataArrecadacao: data, numeroReceita: numero, criadoPor: POR },
    ROTEIRO,
    criarM04Deps(prisma)
  );
  return r.receitaId;
}

describe("M04 V36 — a receita mês a mês por fonte", () => {
  beforeEach(async () => {
    await semear();
    await arrecada(2025, "500", "1000.00", "2025RC000001", DIA_DE_BORDA(2025, 3, 31));
    const g = await arrecada(2026, "500", "700.00", "2026RC000001", DIA_DE_BORDA(2026, 2, 10));
    await arrecada(2026, "540", "300.00", "2026RC000002", DIA_DE_BORDA(2026, 2, 10));
    await arrecada(2026, "540", "200.00", "2026RC000003", DIA_DE_BORDA(2026, 12, 31));
    await anularArrecadacao({ receitaId: g, dataAnulacao: DIA_DE_BORDA(2026, 4, 5), numeroReceita: "2026RC000001", criadoPor: POR }, criarM04Deps(prisma));
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: cada guia no mês do dia civil, a anulação no mês dela, por fonte e por exercício", async () => {
    const r = await arrecadadoPorFonteMesAMes(prisma, [2026, 2025]);
    const ver = (fonteId: string, ano: number): string[] | undefined =>
      r.find((x) => x.fonteId === fonteId && x.ano === ano)?.meses.map((m) => m.toFixed(2));
    const zeros = (): string[] => Array.from({ length: 12 }, () => "0.00");

    const a2025 = zeros();
    a2025[2] = "1000.00";
    expect(ver("fnt-500", 2025)).toEqual(a2025);
    expect(ver("fnt-540", 2025)).toBeUndefined();

    const p2026 = zeros();
    p2026[1] = "700.00";
    p2026[3] = "-700.00";
    expect(ver("fnt-500", 2026)).toEqual(p2026);
    expect(r.find((x) => x.fonteId === "fnt-500" && x.ano === 2026)?.total.toFixed(2)).toBe("0.00");

    const f2026 = zeros();
    f2026[1] = "300.00";
    f2026[11] = "200.00";
    expect(ver("fnt-540", 2026)).toEqual(f2026);

    // Os exercícios saem em ordem, qualquer que seja a ordem pedida.
    expect(r.map((x) => x.ano)).toEqual([2025, 2026, 2026]);
  });

  it("t2: por natureza e fonte num exercício (N=2 em naturezas e fontes), e a visão por fonte é a soma dela", async () => {
    await prisma.naturezaReceita.create({ data: { id: "nr-iss", codigo: "11145111", descricao: "ISS - Principal" } });
    await prisma.receitaPrevista.create({
      data: { exercicio: 2026, naturezaReceitaId: "nr-iss", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "5000.00" },
    });
    await arrecada(2026, "500", "450.00", "2026RC000004", DIA_DE_BORDA(2026, 2, 28), "11145111");

    const r = await arrecadadoPorNaturezaFonteMesAMes(prisma, 2026);
    expect(r.map((l) => `${l.naturezaCodigo}/${l.fonteId}`)).toEqual(["11121101/fnt-500", "11121101/fnt-540", "11145111/fnt-500"]);
    const linha = (nat: string, fonte: string): string[] | undefined =>
      r.find((l) => l.naturezaCodigo === nat && l.fonteId === fonte)?.meses.map((m) => m.toFixed(2));
    const zeros = (): string[] => Array.from({ length: 12 }, () => "0.00");
    const iptu500 = zeros();
    iptu500[1] = "700.00";
    iptu500[3] = "-700.00";
    expect(linha("11121101", "fnt-500")).toEqual(iptu500);
    const iss500 = zeros();
    iss500[1] = "450.00";
    expect(linha("11145111", "fnt-500")).toEqual(iss500);
    expect(r.find((l) => l.naturezaCodigo === "11145111")?.naturezaDescricao).toBe("ISS - Principal");
    expect(r.find((l) => l.naturezaCodigo === "11121101" && l.fonteId === "fnt-540")?.total.toFixed(2)).toBe("500.00");
    // Nada de 2025 no exercício pedido.
    expect(r.every((l) => l.ano === 2026)).toBe(true);

    // A visão por fonte soma as naturezas: a 500 de 2026 é IPTU (700 − 700) mais ISS (450) — fevereiro 1.150,00.
    const porFonte = await arrecadadoPorFonteMesAMes(prisma, [2026]);
    const f500 = porFonte.find((x) => x.fonteId === "fnt-500");
    expect(f500?.meses[1]?.toFixed(2)).toBe("1150.00");
    expect(f500?.meses[3]?.toFixed(2)).toBe("-700.00");
    expect(f500?.total.toFixed(2)).toBe("450.00");
  });
});
