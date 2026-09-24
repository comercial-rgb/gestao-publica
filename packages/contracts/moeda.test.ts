import { describe, expect, it } from "vitest";
import { emProsa, formatarMoeda } from "./moeda.js";

/**
 * ═══ AS DUAS APRESENTAÇÕES, E POR QUE SÃO DUAS ═══
 *
 * `formatarMoeda` serve COLUNA: 2 casas sempre, negativo entre parênteses (convenção contábil).
 * `emProsa` serve FRASE: casas preservadas, negativo com sinal de menos.
 *
 * O motor textual é o mesmo — se um dia divergirem, é aqui que se vê.
 */
describe("formatarMoeda — a coluna contábil", () => {
  it("agrupa o milhar e usa vírgula decimal", () => {
    expect(formatarMoeda("1234567.89").texto).toBe("1.234.567,89");
    expect(formatarMoeda("0").texto).toBe("0,00");
    expect(formatarMoeda("7.5").texto).toBe("7,50");
  });

  it("negativo entre PARÊNTESES, e o zero não tem sinal", () => {
    expect(formatarMoeda("-1234.50")).toEqual({ texto: "(1.234,50)", negativo: true });
    expect(formatarMoeda("-0.00")).toEqual({ texto: "0,00", negativo: false });
  });
});

describe("emProsa — o dinheiro dentro de uma frase", () => {
  it("agrupa o milhar e usa vírgula, como a coluna", () => {
    expect(emProsa("3000.00")).toBe("3.000,00");
    expect(emProsa("1234567.89")).toBe("1.234.567,89");
    expect(emProsa("0.00")).toBe("0,00");
  });

  it("⚠️ negativo leva SINAL DE MENOS, não parênteses — a frase já tem os dela", () => {
    // "(teto sobre (1.234,50))" seria lido como texto, não como sinal. Em coluna o parêntese é a
    // convenção; em oração corrida ele é ambiguidade.
    expect(emProsa("-1234.50")).toBe("-1.234,50");
    expect(formatarMoeda("-1234.50").texto).toBe("(1.234,50)");
    expect(emProsa("-0.00")).toBe("0,00");
  });

  it("⚠️ PRESERVA as casas decimais acima de 2 — a memória da fórmula fala delas", () => {
    // `dominio.ts` escreve "... = X, arredondado a N casa(s) half-even = Y". Truncar em 2 casas
    // apagaria exatamente o número sobre o qual a frase está falando.
    expect(emProsa("1234.5678")).toBe("1.234,5678");
    expect(emProsa("0.123456")).toBe("0,123456");
    // e completa até 2 quando vêm menos
    expect(emProsa("12")).toBe("12,00");
    expect(emProsa("12.5")).toBe("12,50");
  });

  it("é textual: formata exato acima do inteiro seguro do `number`", () => {
    // 12345678901234.56 não sobrevive a um Number() — e este é o ponto de a função ser textual.
    expect(emProsa("12345678901234.56")).toBe("12.345.678.901.234,56");
  });

  it("RECUSA o que não é string decimal — fail-closed, com o motivo", () => {
    expect(() => emProsa("abc")).toThrow(/malformado/);
    expect(() => emProsa("1.234,50")).toThrow(/malformado/); // já formatado é erro
    expect(() => emProsa("")).toThrow(/malformado/);
    // @ts-expect-error — `valor` é string; passar number é erro de tipo (a regra de ouro).
    expect(() => emProsa(1234.5)).toThrow();
  });
});
