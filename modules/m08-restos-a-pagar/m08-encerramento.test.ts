import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { calcularInscricoes, saldoDaInscricao } from "./dominio.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { semearM08, empenharDe2026, liquidarDe2026, pagarDe2026, POR } from "./fixture-m08.js";

/**
 * M08 bloco 2 — o encerramento INSCREVE os restos a pagar (art. 36).
 *
 * Os valores inscritos são o retrato dos SUMs no momento do encerramento. Todos
 * os testes conferem contra `SELECT SUM` — nenhum cache é aceito como prova.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

// A fixture (plano, ficha, fontes, atalhos) mora em `fixture-m08.ts` — arquivo de teste não exporta fixture (V27).

// ── DOMÍNIO PURO ───────────────────────────────────────────────────────────

describe("M08 — calcularInscricoes (puro, art. 36)", () => {
  const base = { empenhoId: "e", numero: "NE1" };

  it("só empenhado: 1 inscrição NÃO PROCESSADA", () => {
    const i = calcularInscricoes({
      ...base,
      empenhado: toMoney("1000.00"),
      liquidado: toMoney("0.00"),
      pago: toMoney("0.00"),
    });
    expect(i).toHaveLength(1);
    expect(i[0]!.tipo).toBe("NAO_PROCESSADO");
    expect(i[0]!.valorInscrito.toFixed(2)).toBe("1000.00");
  });

  it("empenhado + liquidado parcial + pago parcial: AS DUAS inscrições", () => {
    // empenhado 1000, liquidado 600, pago 250
    //   PROCESSADO     = 600 − 250 = 350
    //   NAO_PROCESSADO = 1000 − 600 = 400
    const i = calcularInscricoes({
      ...base,
      empenhado: toMoney("1000.00"),
      liquidado: toMoney("600.00"),
      pago: toMoney("250.00"),
    });
    expect(i).toHaveLength(2);
    const porTipo = new Map(i.map((x) => [x.tipo, x.valorInscrito.toFixed(2)]));
    expect(porTipo.get("PROCESSADO")).toBe("350.00");
    expect(porTipo.get("NAO_PROCESSADO")).toBe("400.00");
  });

  it("empenho QUITADO: nenhuma inscrição", () => {
    const i = calcularInscricoes({
      ...base,
      empenhado: toMoney("1000.00"),
      liquidado: toMoney("1000.00"),
      pago: toMoney("1000.00"),
    });
    expect(i).toHaveLength(0);
  });

  it("liquidado e não pago (totalmente): só PROCESSADO", () => {
    const i = calcularInscricoes({
      ...base,
      empenhado: toMoney("1000.00"),
      liquidado: toMoney("1000.00"),
      pago: toMoney("0.00"),
    });
    expect(i).toHaveLength(1);
    expect(i[0]!.tipo).toBe("PROCESSADO");
    expect(i[0]!.valorInscrito.toFixed(2)).toBe("1000.00");
  });

  it("empenho ANULADO (empenhado = 0): nenhuma inscrição", () => {
    const i = calcularInscricoes({
      ...base,
      empenhado: toMoney("0.00"),
      liquidado: toMoney("0.00"),
      pago: toMoney("0.00"),
    });
    expect(i).toHaveLength(0);
  });
});

describe("M08 — saldoDaInscricao (puro)", () => {
  it("PAGAMENTO e CANCELAMENTO ambos REDUZEM o saldo", () => {
    const s = saldoDaInscricao(toMoney("1000.00"), [
      { tipo: "PAGAMENTO", valor: toMoney("300.00") },
      { tipo: "CANCELAMENTO", valor: toMoney("200.00") },
    ]);
    expect(s.toFixed(2)).toBe("500.00");
  });

  it("sem movimento: saldo = valor inscrito", () => {
    expect(saldoDaInscricao(toMoney("1000.00"), []).toFixed(2)).toBe("1000.00");
  });
});

// ── ENCERRAMENTO (banco real) ──────────────────────────────────────────────

describe("M08 — encerramento inscreve RP", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Confere o valor inscrito contra o SUM REAL, no SQL. */
  async function conferirContraSum(empenhoId: string): Promise<{
    empenhado: string;
    liquidado: string;
    pago: string;
  }> {
    const [r] = (await prisma.$queryRawUnsafe(
      `SELECT
         (SELECT COALESCE(SUM(e.valor),0) FROM "Empenho" e WHERE e.id = $1
            AND NOT EXISTS (SELECT 1 FROM "Empenho" x WHERE x."estornoDeId" = e.id)) AS empenhado,
         (SELECT COALESCE(SUM(l.valor),0) FROM "Liquidacao" l WHERE l."empenhoId" = $1
            AND l."estornoDeId" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "Liquidacao" x WHERE x."estornoDeId" = l.id)) AS liquidado,
         (SELECT COALESCE(SUM(p.valor),0) FROM "Pagamento" p
            JOIN "Liquidacao" l ON l.id = p."liquidacaoId"
           WHERE l."empenhoId" = $1 AND p."estornoDeId" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "Pagamento" x WHERE x."estornoDeId" = p.id)) AS pago`,
      empenhoId
    )) as { empenhado: unknown; liquidado: unknown; pago: unknown }[];
    // o SQL cru devolve Decimal; normaliza para 2 casas
    return {
      empenhado: toMoney(String(r!.empenhado)).toFixed(2),
      liquidado: toMoney(String(r!.liquidado)).toFixed(2),
      pago: toMoney(String(r!.pago)).toFixed(2),
    };
  }

  it("empenho SÓ EMPENHADO: 1 inscrição NÃO PROCESSADA, valor == SUM", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");

    const r = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    expect(r.inscricoes).toHaveLength(1);
    expect(r.inscricoes[0]!.tipo).toBe("NAO_PROCESSADO");
    expect(r.inscricoes[0]!.valorInscrito.toFixed(2)).toBe("1000.00");

    const sums = await conferirContraSum(e);
    expect(sums.empenhado).toBe("1000.00");
    expect(sums.liquidado).toBe("0.00");
    // NP = empenhado − liquidado
    expect(r.inscricoes[0]!.valorInscrito.toFixed(2)).toBe(sums.empenhado);
  });

  it("empenhado + liquidado parcial + pago parcial: AS DUAS inscrições, valores == SUMs", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "600.00");
    await pagarDe2026(deps, l, "NP1", "250.00");

    const r = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    expect(r.inscricoes).toHaveLength(2);
    const porTipo = new Map(
      r.inscricoes.map((i) => [i.tipo, i.valorInscrito.toFixed(2)])
    );
    expect(porTipo.get("PROCESSADO")).toBe("350.00"); // 600 − 250
    expect(porTipo.get("NAO_PROCESSADO")).toBe("400.00"); // 1000 − 600

    // conferido contra o SUM REAL, em SQL
    const sums = await conferirContraSum(e);
    expect(sums.empenhado).toBe("1000.00");
    expect(sums.liquidado).toBe("600.00");
    expect(sums.pago).toBe("250.00");
  });

  it("empenho QUITADO: NENHUMA inscrição", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await pagarDe2026(deps, l, "NP1", "1000.00");

    const r = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    expect(r.inscricoes).toHaveLength(0);
    expect(await prisma.inscricaoRestosAPagar.count()).toBe(0);

    const sums = await conferirContraSum(e);
    expect(sums.pago).toBe(sums.empenhado); // quitado
  });

  it("empenho ANULADO não é inscrito", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const { anularEmpenho } = await import("../m05-despesa/servico.js");
    await anularEmpenho(
      {
        empenhoId: e, numero: "NE1-A", data: new Date("2026-07-01T12:00:00Z"),
        historico: "anula", criadoPor: POR,
      },
      deps
    );

    const r = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    expect(r.inscricoes).toHaveLength(0);
  });

  it("O ENCERRAMENTO NÃO TOCA MovimentoDotacao (RP não consome dotação)", async () => {
    await empenharDe2026(deps, "NE1", "1000.00");

    const antes = await prisma.movimentoDotacao.findMany({
      orderBy: { criadoEm: "asc" },
      select: { id: true, tipo: true, valor: true },
    });

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    const depois = await prisma.movimentoDotacao.findMany({
      orderBy: { criadoEm: "asc" },
      select: { id: true, tipo: true, valor: true },
    });
    expect(depois).toEqual(antes); // NADA mudou
  });

  it("TUDO OU NADA: encerrar 2x rejeita e o 2º não cria inscrição duplicada", async () => {
    await empenharDe2026(deps, "NE1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR })
    ).rejects.toThrow(/já está encerrado/);

    expect(await prisma.inscricaoRestosAPagar.count()).toBe(1);
    expect(await prisma.encerramentoExercicio.count()).toBe(1);
  });

  it("vários empenhos: cada um gera as suas inscrições", async () => {
    const e1 = await empenharDe2026(deps, "NE1", "1000.00"); // só empenhado
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    const l2 = await liquidarDe2026(deps, e2, "NL2", "500.00"); // liquidado, não pago
    const e3 = await empenharDe2026(deps, "NE3", "300.00");
    // liquidada ANTES da NL2, para ser a cabeça da fila do art. 141 — senão o
    // pagamento abaixo seria (corretamente) rejeitado como quebra de ordem.
    const l3 = await liquidarDe2026(deps, e3, "NL3", "300.00", "2026-07-01T12:00:00Z");
    await pagarDe2026(deps, l3, "NP3", "300.00"); // quitado

    const r = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    expect(r.inscricoes).toHaveLength(2);
    const porEmpenho = new Map(
      r.inscricoes.map((i) => [i.empenhoId, `${i.tipo}:${i.valorInscrito.toFixed(2)}`])
    );
    expect(porEmpenho.get(e1)).toBe("NAO_PROCESSADO:1000.00");
    expect(porEmpenho.get(e2)).toBe("PROCESSADO:500.00");
    expect(porEmpenho.has(e3)).toBe(false); // quitado, não inscreve
    void l2;
  });
});
