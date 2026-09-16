import { describe, expect, it } from "vitest";
import { calcular, FormulaInvalidaError, variaveisDaFormula } from "./index.js";

/**
 * ═══ O INTERPRETADOR DE FÓRMULA DO ENTE (V7 B1) ═══
 *
 * FM01 — a conta: precedência, parênteses, unário, funções e Decimal (sem ponto flutuante);
 * FM02 — o universo é FECHADO: nada que não seja número, variável declarada ou as funções permitidas passa —
 *        inclusive as passagens clássicas de escape (`this.constructor.constructor`, `process`, `require`, `[]`);
 * FM03 — variável que o cadastro não forneceu é recusa NOMEADA, nunca zero em silêncio;
 * FM04 — a memória traz cada variável usada com o seu valor, para a conta ser conferível;
 * FM05 — divisão por zero e fórmula malformada recusam com a posição.
 */

const num = (f: string, v: Record<string, string> = {}): string => calcular(f, v).valor.toString();

describe("a fórmula do ente", () => {
  it("FM01: precedência, parênteses, unário, funções e decimais exatos", () => {
    expect(num("2 + 3 * 4")).toBe("14");
    expect(num("(2 + 3) * 4")).toBe("20");
    expect(num("-3 + 10")).toBe("7");
    expect(num("10 / 4")).toBe("2.5");
    // 0.1 + 0.2 em ponto flutuante daria 0.30000000000000004; aqui é Decimal.
    expect(num("0.1 + 0.2")).toBe("0.3");
    expect(num("arredondar(2.675, 2)")).toBe("2.68");
    expect(num("min(3, 5) + max(3, 5)")).toBe("8");
    expect(num("teto(2.1) + piso(2.9)")).toBe("5");
    expect(num("se(area > 100, 2, 1)", { area: "150" })).toBe("2");
    expect(num("se(area > 100, 2, 1)", { area: "100" })).toBe("1");
    expect(num("se(uso = 1, 0.005, 0.01) * valorVenal", { uso: "1", valorVenal: "200000" })).toBe("1000");
  });

  it("FM02: o universo é fechado — nenhuma passagem de escape chega a ser avaliada", () => {
    const proibidas = [
      "this.constructor.constructor('return process')()",
      "process.env.DATABASE_URL",
      "require('fs')",
      "[].constructor",
      "globalThis",
      "area; process.exit(1)",
      "área + `x`",
      "1 && 2",
      "area[0]",
      "{}",
    ];
    for (const f of proibidas) {
      expect(() => calcular(f, { area: "1", "área": "1" }), f).toThrow(FormulaInvalidaError);
    }
    // `constructor` e `process` SÓ passariam se fossem variáveis declaradas — e aí são números, não objetos.
    expect(num("constructor + 1", { constructor: "2" })).toBe("3");
  });

  it("FM03/FM04: variável não fornecida é recusa nomeada; a memória traz cada variável usada", () => {
    expect(() => calcular("area * valorDoM2", { area: "100" })).toThrow(/VARIAVEL-DESCONHECIDA: "valorDoM2".*Disponíveis: area/s);
    const r = calcular("area * valorDoM2 * fator", { area: "100", valorDoM2: "1200.50", fator: "0.8", naoUsada: "9" });
    expect(r.valor.toString()).toBe("96040");
    expect(r.memoria).toEqual([
      { expressao: "area", valor: "100" },
      { expressao: "fator", valor: "0.8" },
      { expressao: "valorDoM2", valor: "1200.5" },
    ]);
    expect(variaveisDaFormula("se(area > limite, area * a, b)")).toEqual(["a", "area", "b", "limite"]);
  });

  it("FM05: divisão por zero, função desconhecida, aridade errada e parêntese aberto recusam com a posição", () => {
    expect(() => calcular("10 / 0", {})).toThrow(/DIVISAO-POR-ZERO/);
    expect(() => calcular("raiz(9)", {})).toThrow(/FUNCAO-DESCONHECIDA: "raiz"/);
    expect(() => calcular("min(1)", {})).toThrow(/ARGUMENTOS-DA-FUNCAO: min recebe 2/);
    expect(() => calcular("(1 + 2", {})).toThrow(FormulaInvalidaError);
    expect(() => calcular("1 + 2)", {})).toThrow(/SOBRA-NA-FORMULA/);
    expect(() => calcular("arredondar(1.5, 9)", {})).toThrow(/ARREDONDAMENTO-INVALIDO/);
    try {
      calcular("2 @ 3", {});
      expect.unreachable("a fórmula com caractere proibido tinha de recusar");
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaInvalidaError);
      expect((e as FormulaInvalidaError).posicao).toBe(2);
    }
  });
});
