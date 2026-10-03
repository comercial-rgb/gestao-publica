import { describe, expect, it } from "vitest";
import { toMoney } from "../contracts/index.js";
import { liquidoDoFato, somaLiquidaEstornaveis, type LinhaEstornavel } from "./index.js";

/**
 * V33 — A RÉGUA DOS ESTORNÁVEIS, com a terceira perna que os chamadores esqueciam: o ESTORNO DE UMA PARCIAL
 * (aponta para a parcial, não para o fato). Literais por aritmética manual; N=2 parciais por fato, uma viva e
 * uma estornada, e dois fatos — para que "subtrair todas" e "subtrair a última" não passem.
 *
 *   A 1.000 · parcial 100 viva · parcial 50 estornada → 900
 *   B   400 · anulado inteiro                         →   0
 *   C   300 · parcial 30 viva                          → 270
 */
const m = toMoney;
const LINHAS: readonly LinhaEstornavel[] = [
  { id: "A", valor: m("1000.00"), estornoDeId: null },
  { id: "A-p1", valor: m("100.00"), estornoDeId: null, anulacaoParcialDeId: "A" },
  { id: "A-p2", valor: m("50.00"), estornoDeId: null, anulacaoParcialDeId: "A" },
  { id: "A-p2-e", valor: m("50.00"), estornoDeId: "A-p2" },
  { id: "B", valor: m("400.00"), estornoDeId: null },
  { id: "B-e", valor: m("400.00"), estornoDeId: "B" },
  { id: "C", valor: m("300.00"), estornoDeId: null },
  { id: "C-p1", valor: m("30.00"), estornoDeId: null, anulacaoParcialDeId: "C" },
];

describe("packages/estornaveis — a régua única", () => {
  it("a soma de todos: 900 + 0 + 270", () => {
    expect(somaLiquidaEstornaveis(LINHAS).toFixed(2)).toBe("1170.00");
  });

  it("o líquido de UM fato enxerga o estorno da parcial dele (A = 900, e não 850)", () => {
    expect(liquidoDoFato("A", LINHAS).toFixed(2)).toBe("900.00");
  });

  it("o fato anulado inteiro dá zero; o outro fato desconta só a sua parcial; a parcial em si dá zero", () => {
    expect(liquidoDoFato("B", LINHAS).toFixed(2)).toBe("0.00");
    expect(liquidoDoFato("C", LINHAS).toFixed(2)).toBe("270.00");
    expect(liquidoDoFato("A-p1", LINHAS).toFixed(2)).toBe("0.00");
  });
});
