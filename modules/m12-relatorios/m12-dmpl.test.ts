import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { dmpl, linhaDoMovimento } from "./dmpl.js";

/**
 * V35 — DMPL (MCASP 11ª ed., Parte V, item 7), lida do razão.
 *
 * ⚠️ CONTAS À MÃO. Antes de 2026: patrimônio social 10.000; 2025 com VPA 3.000 e VPD 1.000, encerrado → RA 2.000.
 * Em 2026:
 *   transferência do superávit 2025 para "exercícios anteriores" (mesma coluna) ........ não aparece
 *   aumento de capital em dinheiro ......................................... PS +5.000
 *   correção de erro de exercício anterior (2.3.7.1.1.03) contra bancos ..... RA −400
 *   ajuste de avaliação patrimonial do imobilizado .......................... AAP +700
 *   constituição de reserva (RA → reserva de reavaliação) ................... RA −300 / DR +300
 *   resultado do exercício: VPA 6.000 − VPD 2.500 ........................... RA +3.500
 *   RA → patrimônio social (nenhuma regra) .................................. sem linha: PS +250 / RA −250
 *   Saldos finais: PS 15.250 · AAP 700 · DR 300 · RA 2.000 − 400 + 3.500 − 300 − 250 = 4.550 · total 20.800
 * N=2 no resultado: o mesmo ano com e sem o encerramento de 2026 dá a mesma linha e os mesmos saldos finais.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const CONTAS = [
  ["1.1.1.1.2.00.00", "BANCOS", "DEVEDORA"],
  ["1.2.3.1.1.01.00", "BENS MÓVEIS", "DEVEDORA"],
  ["2.3.1.1.1.00.00", "PATRIMÔNIO SOCIAL - CONSOLIDAÇÃO", "CREDORA"],
  ["2.3.4.1.1.00.00", "AJUSTES DE AVALIAÇÃO PATRIMONIAL DE ATIVOS - CONSOLIDAÇÃO", "CREDORA"],
  ["2.3.6.1.1.00.00", "RESERVA DE REAVALIAÇÃO - CONSOLIDAÇÃO", "CREDORA"],
  ["2.3.7.1.1.01.00", "SUPERÁVITS OU DÉFICITS DO EXERCÍCIO", "CREDORA"],
  ["2.3.7.1.1.02.00", "SUPERAVITS OU DEFICITS DE EXERCÍCIOS ANTERIORES", "CREDORA"],
  ["2.3.7.1.1.03.00", "AJUSTES DE EXERCÍCIOS ANTERIORES", "CREDORA"],
  ["3.1.1.1.1.01.00", "VPD (fixture)", "DEVEDORA"],
  ["4.1.1.1.1.01.00", "VPA (fixture)", "CREDORA"],
] as const;

let n = 0;
async function lancar(dia: string, debito: string, credito: string, valor: string): Promise<void> {
  n += 1;
  const id = async (codigo: string) => (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
  const [d, c] = [await id(debito), await id(credito)];
  await prisma.$transaction(async (tx) =>
    lancarNoRazao(tx, {
      numeroControle: `PL-${String(n)}`, dataTransacao: meioDiaCivil(dia), historico: "fixture da DMPL", origemTipo: "LANCAMENTO_MANUAL", criadoPor: POR,
      partidas: [
        { contaId: d, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
        { contaId: c, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
      ],
    })
  );
}

async function anoDe2026(encerrado: boolean): Promise<void> {
  await lancar("2025-06-10", "1.1.1.1.2.00.00", "2.3.1.1.1.00.00", "10000.00");
  await lancar("2025-08-01", "1.1.1.1.2.00.00", "4.1.1.1.1.01.00", "3000.00");
  await lancar("2025-09-01", "3.1.1.1.1.01.00", "1.1.1.1.2.00.00", "1000.00");
  await lancar("2025-12-31", "4.1.1.1.1.01.00", "2.3.7.1.1.01.00", "3000.00");
  await lancar("2025-12-31", "2.3.7.1.1.01.00", "3.1.1.1.1.01.00", "1000.00");

  await lancar("2026-01-02", "2.3.7.1.1.01.00", "2.3.7.1.1.02.00", "2000.00");
  await lancar("2026-02-10", "1.1.1.1.2.00.00", "2.3.1.1.1.00.00", "5000.00");
  await lancar("2026-03-05", "2.3.7.1.1.03.00", "1.1.1.1.2.00.00", "400.00");
  await lancar("2026-04-01", "1.2.3.1.1.01.00", "2.3.4.1.1.00.00", "700.00");
  await lancar("2026-05-01", "2.3.7.1.1.02.00", "2.3.6.1.1.00.00", "300.00");
  await lancar("2026-06-15", "1.1.1.1.2.00.00", "4.1.1.1.1.01.00", "6000.00");
  await lancar("2026-07-15", "3.1.1.1.1.01.00", "1.1.1.1.2.00.00", "2500.00");
  await lancar("2026-08-01", "2.3.7.1.1.02.00", "2.3.1.1.1.00.00", "250.00");
  if (encerrado) {
    await lancar("2026-12-31", "4.1.1.1.1.01.00", "2.3.7.1.1.01.00", "6000.00");
    await lancar("2026-12-31", "2.3.7.1.1.01.00", "3.1.1.1.1.01.00", "2500.00");
  }
}

/** colunas: PS, AFAC, RC, AAP, RL, DR, RA, AT, Total */
const linha = (d: Awaited<ReturnType<typeof dmpl>>, chave: string) => d.linhas.find((l) => l.chave === chave)?.valores;

describe("M12 — DMPL lida do razão (MCASP, Parte V, item 7)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    n = 0;
    await prisma.contaPcasp.createMany({ data: CONTAS.map(([codigo, nome, naturezaSaldo]) => ({ codigo, nome, naturezaSaldo, nivel: 7, analitica: true })) });
  });

  for (const encerrado of [false, true]) {
    it(`t1 (${encerrado ? "encerrado" : "sem encerrar"}): cada movimento na linha do seu par; o resultado é VPA − VPD do ano; inicial + mutações = final`, async () => {
      await anoDe2026(encerrado);
      const d = await dmpl(prisma, { exercicio: 2026 });
      expect(linha(d, "SALDOS_INICIAIS")).toEqual(["10000.00", "0.00", "0.00", "0.00", "0.00", "0.00", "2000.00", "0.00", "12000.00"]);
      expect(linha(d, "AUMENTO_DE_CAPITAL")).toEqual(["5000.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "5000.00"]);
      expect(linha(d, "AJUSTES_DE_EXERCICIOS_ANTERIORES")?.[6]).toBe("-400.00");
      expect(linha(d, "AJUSTES_DE_AVALIACAO_PATRIMONIAL")?.[3]).toBe("700.00");
      expect(linha(d, "CONSTITUICAO_REVERSAO_DE_RESERVAS")).toEqual(["0.00", "0.00", "0.00", "0.00", "0.00", "300.00", "-300.00", "0.00", "0.00"]);
      expect(linha(d, "RESULTADO_DO_EXERCICIO")?.[6]).toBe("3500.00");
      expect(linha(d, "SEM_LINHA")).toEqual(["250.00", "0.00", "0.00", "0.00", "0.00", "0.00", "-250.00", "0.00", "0.00"]);
      expect(d.semLinha.map((s) => `${s.numeroControle} ${s.conta} ${s.valor}`).sort()).toEqual(["PL-13 2.3.1.1.1.00.00 250.00", "PL-13 2.3.7.1.1.02.00 -250.00"]);
      expect(d.notas[0]).toMatch(/^2 movimento\(s\) no patrimônio líquido sem linha definida.*lançamentos PL-13 e explique-os em nota/);
      expect(linha(d, "SALDOS_FINAIS")).toEqual(["15250.00", "0.00", "0.00", "700.00", "0.00", "300.00", "4550.00", "0.00", "20800.00"]);
    });
  }

  it("t2: as regras de linha, uma a uma, pelo par do lançamento", () => {
    expect(linhaDoMovimento("2.3.7.1.1.01.00", ["2.3.7.1.1.01.00", "2.3.7.1.1.02.00"])).toBeNull();
    expect(linhaDoMovimento("2.3.7.1.2.03.00", ["2.3.7.1.2.03.00", "1.1.1.1.2.00.00"])).toBe("AJUSTES_DE_EXERCICIOS_ANTERIORES");
    expect(linhaDoMovimento("2.3.7.1.1.01.00", ["4.1.1.1.1.01.00", "2.3.7.1.1.01.00"])).toBe("RESULTADO_DO_EXERCICIO");
    expect(linhaDoMovimento("2.3.4.2.1.00.00", ["2.3.4.2.1.00.00", "2.2.1.1.1.01.00"])).toBe("AJUSTES_DE_AVALIACAO_PATRIMONIAL");
    expect(linhaDoMovimento("2.3.9.1.1.00.00", ["2.3.9.1.1.00.00", "1.1.1.1.2.00.00"])).toBe("RESGATE_REEMISSAO");
    expect(linhaDoMovimento("2.3.5.1.1.00.00", ["2.3.7.2.1.01.00", "2.3.5.1.1.00.00"])).toBe("CONSTITUICAO_REVERSAO_DE_RESERVAS");
    expect(linhaDoMovimento("2.3.2.1.1.00.00", ["1.1.1.1.2.00.00", "2.3.2.1.1.00.00"])).toBe("AUMENTO_DE_CAPITAL");
    expect(linhaDoMovimento("2.3.7.1.1.02.00", ["2.3.7.1.1.02.00", "2.1.8.9.1.00.00"])).toBe("SEM_LINHA");
  });

  it("t3: exercício sem movimento no PL mostra só os saldos, e o razão vazio dá tudo zero", async () => {
    const d = await dmpl(prisma, { exercicio: 2026 });
    expect(linha(d, "SALDOS_FINAIS")).toEqual(Array(9).fill("0.00"));
    expect(d.semLinha).toEqual([]);
  });
});
