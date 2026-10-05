import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { declararRoteiroPatrimonial } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { apuracoesDoAjusteDePerdas, apurarAjusteDePerdas, declararPercentualDePerda } from "./ajuste-de-perdas.js";

/**
 * V35 — AJUSTE PARA PERDAS DA DÍVIDA ATIVA (MCASP 11ª ed., Parte III, 5.2.5). Profundidade: razão.
 *
 * ⚠️ CONTAS À MÃO. Contas com código e nome do PCASP 2025.
 *   Tributária: T1 8.000 inscrita em 10/03/2025; T2 2.000 inscrita em 01/06/2025, recebe 500 em 01/02/2026.
 *   Não tributária: N1 1.000 inscrita em 2026-01-01T02:00Z = 31/12/2025 23h no fuso do ente (é de 2025).
 *
 *   t1 tributária, 60% em 2025, corte 31/12/2025: saldo 10.000 → esperado 6.000; anterior 0 → constitui 6.000
 *      40% em 2026, corte 30/06/2026: saldo 9.500 → esperado 3.800; anterior 6.000 → reverte 2.200
 *      corte 31/12/2026: esperado 3.800 = anterior → registra sem lançar
 *   t2 não tributária, 50% em 2025, corte 31/12/2025: saldo 1.000 (o dia civil de borda entra) → constitui 500
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const METODOLOGIA = "Média dos recebimentos dos três últimos exercícios sobre o saldo inscrito no início de cada um (estudo da Procuradoria, processo 1/2026).";

const CONTAS = [
  ["1.2.1.1.1.04.03", "DÍVIDA ATIVA TRIBUTÁRIA DOS IMPOSTOS", "DEVEDORA"],
  ["1.2.1.1.1.05.01", "DÍVIDA ATIVA DE MULTAS", "DEVEDORA"],
  ["1.2.1.1.1.99.04", "(-) AJUSTE DE PERDAS DE DÍVIDA ATIVA TRIBUTÁRIA", "CREDORA"],
  ["1.2.1.1.1.99.05", "(-) AJUSTE DE PERDAS DE DÍVIDA ATIVA NÃO TRIBUTÁRIA", "CREDORA"],
  ["3.6.1.7.1.05.00", "AJUSTE PARA PERDAS EM DÍVIDA ATIVA TRIBUTÁRIA", "DEVEDORA"],
  ["3.6.1.7.1.06.00", "AJUSTE PARA PERDAS EM DÍVIDA ATIVA NÃO TRIBUTÁRIA", "DEVEDORA"],
  ["4.9.7.2.1.01.00", "REVERSÃO DE AJUSTES DE PERDAS DE CRÉDITOS", "CREDORA"],
] as const;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: CONTAS.map(([codigo, nome, naturezaSaldo]) => ({ codigo, nome, naturezaSaldo, nivel: 7, analitica: true })),
  });
  const conta = async (codigo: string) => (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
  const nova = async (id: string, origem: "TRIBUTARIA" | "NAO_TRIBUTARIA", contaCodigo: string) =>
    prisma.dividaAtiva.create({ data: { id, identificador: id, devedorNome: "Contribuinte", devedorDocumento: "00000000191", origem, contaContabilId: await conta(contaCodigo), criadoPor: POR } });
  const mov = (dividaAtivaId: string, tipo: "INSCRICAO" | "RECEBIMENTO", valor: string, data: string) =>
    prisma.movimentoDividaAtiva.create({ data: { dividaAtivaId, tipo, valor, dataMovimento: new Date(data), motivo: "fixture do ajuste para perdas", criadoPor: POR } });
  await nova("T1", "TRIBUTARIA", "1.2.1.1.1.04.03");
  await mov("T1", "INSCRICAO", "8000.00", "2025-03-10T12:00:00Z");
  await nova("T2", "TRIBUTARIA", "1.2.1.1.1.04.03");
  await mov("T2", "INSCRICAO", "2000.00", "2025-06-01T12:00:00Z");
  await mov("T2", "RECEBIMENTO", "500.00", "2026-02-01T12:00:00Z");
  await nova("N1", "NAO_TRIBUTARIA", "1.2.1.1.1.05.01");
  await mov("N1", "INSCRICAO", "1000.00", "2026-01-01T02:00:00Z");
}

const FUNDAMENTO = "MCASP 11ª ed., Parte III, 5.2.5 — ajuste para perdas da dívida ativa, contas do PCASP 2025.";
async function roteiro(chave: string, debito: string, credito: string): Promise<void> {
  await declararRoteiroPatrimonial(prisma, { familia: "PERDAS_DIVIDA_ATIVA", chave, contaDebitoCodigo: debito, contaCreditoCodigo: credito, historicoPadrao: "Ajuste para perdas da dívida ativa", fundamento: FUNDAMENTO, criadoPor: POR });
}

/** Saldo credor da conta no razão, somado à mão a partir das partidas. */
async function saldoCredor(codigo: string): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } });
  let c = 0n;
  for (const p of ps) c += (p.tipo === "CREDITO" ? 1n : -1n) * BigInt(p.valor.toFixed(2).replace(".", ""));
  const s = c.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

describe("M10 — ajuste para perdas da dívida ativa", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: constitui, reverte a diferença quando a estimativa cai, e não lança quando ela não muda", async () => {
    await roteiro("CONSTITUICAO/TRIBUTARIA", "3.6.1.7.1.05.00", "1.2.1.1.1.99.04");
    await roteiro("REVERSAO/TRIBUTARIA", "1.2.1.1.1.99.04", "4.9.7.2.1.01.00");
    await declararPercentualDePerda(prisma, { exercicio: 2025, origem: "TRIBUTARIA", percentual: "60", metodologia: METODOLOGIA, criadoPor: POR });
    await declararPercentualDePerda(prisma, { exercicio: 2026, origem: "TRIBUTARIA", percentual: "40", metodologia: METODOLOGIA, criadoPor: POR });

    const a = await apurarAjusteDePerdas(prisma, { origem: "TRIBUTARIA", corte: "2025-12-31", criadoPor: POR });
    expect(a).toMatchObject({ saldoDaDividaAtiva: "10000.00", ajusteEsperado: "6000.00", saldoAnterior: "0.00", diferenca: "6000.00" });
    expect(await saldoCredor("1.2.1.1.1.99.04")).toBe("6000.00");
    expect(await saldoCredor("3.6.1.7.1.05.00")).toBe("-6000.00");

    const b = await apurarAjusteDePerdas(prisma, { origem: "TRIBUTARIA", corte: "2026-06-30", criadoPor: POR });
    expect(b).toMatchObject({ saldoDaDividaAtiva: "9500.00", ajusteEsperado: "3800.00", saldoAnterior: "6000.00", diferenca: "-2200.00" });
    expect(await saldoCredor("1.2.1.1.1.99.04")).toBe("3800.00");
    expect(await saldoCredor("4.9.7.2.1.01.00")).toBe("2200.00");

    const c = await apurarAjusteDePerdas(prisma, { origem: "TRIBUTARIA", corte: "2026-12-31", criadoPor: POR });
    expect(c).toMatchObject({ diferenca: "0.00", lancamentoId: null });

    await expect(apurarAjusteDePerdas(prisma, { origem: "TRIBUTARIA", corte: "2026-06-30", criadoPor: POR })).rejects.toThrow(/Já há apuração.*30\/06\/2026/);
    const lista = await apuracoesDoAjusteDePerdas(prisma);
    expect(lista.map((l) => [l.corte, l.diferenca, l.lancou])).toEqual([
      ["2026-12-31", "0.00", false],
      ["2026-06-30", "-2200.00", true],
      ["2025-12-31", "6000.00", true],
    ]);
    expect(lista[0]!.metodologia).toBe(METODOLOGIA);
  });

  it("t2: não tributária — o inscrito às 23h de 31/12 no fuso do ente é de 2025; sem percentual e com roteiro trocado, recusa nomeada sem lançar", async () => {
    await roteiro("CONSTITUICAO/NAO_TRIBUTARIA", "3.6.1.7.1.06.00", "1.2.1.1.1.99.05");
    await roteiro("REVERSAO/NAO_TRIBUTARIA", "1.2.1.1.1.99.04", "4.9.7.2.1.01.00");
    await expect(apurarAjusteDePerdas(prisma, { origem: "NAO_TRIBUTARIA", corte: "2025-12-31", criadoPor: POR })).rejects.toThrow(
      /Não há percentual de perda declarado para a dívida ativa não tributária de 2025/
    );
    await declararPercentualDePerda(prisma, { exercicio: 2025, origem: "NAO_TRIBUTARIA", percentual: "50", metodologia: METODOLOGIA, criadoPor: POR });
    await expect(apurarAjusteDePerdas(prisma, { origem: "NAO_TRIBUTARIA", corte: "2025-12-31", criadoPor: POR })).rejects.toThrow(
      /A reversão do ajuste debita uma conta diferente da que a constituição credita/
    );
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    expect(await prisma.apuracaoDoAjusteDePerdas.count()).toBe(0);

    await roteiro("REVERSAO/NAO_TRIBUTARIA", "1.2.1.1.1.99.05", "4.9.7.2.1.01.00");
    const a = await apurarAjusteDePerdas(prisma, { origem: "NAO_TRIBUTARIA", corte: "2025-12-31", criadoPor: POR });
    expect(a).toMatchObject({ saldoDaDividaAtiva: "1000.00", ajusteEsperado: "500.00", diferenca: "500.00" });
    expect(await saldoCredor("1.2.1.1.1.99.05")).toBe("500.00");
  });

  it("t3: quem não tem a ação de atualizar a dívida ativa é recusado, pelo nome da ação, e nada é gravado", async () => {
    await expect(
      declararPercentualDePerda(prisma, { exercicio: 2025, origem: "TRIBUTARIA", percentual: "60", metodologia: METODOLOGIA, criadoPor: SEM_PODER })
    ).rejects.toThrow(/ATUALIZAR_DIVIDA_ATIVA/);
    await expect(apurarAjusteDePerdas(prisma, { origem: "TRIBUTARIA", corte: "2025-12-31", criadoPor: SEM_PODER })).rejects.toThrow(/ATUALIZAR_DIVIDA_ATIVA/);
    expect(await prisma.percentualDePerdaDaDividaAtiva.count()).toBe(0);
  });
});
