import { describe, expect, it } from "vitest";
import { precisaRecarregar } from "../lib/versao-em-uso.js";

/** V38 — o vigia da versão só pede recarga quando há duas versões a comparar e elas diferem. */
describe("a versão em uso contra a versão no ar", () => {
  it("t1: commit diferente pede recarga; igual, não; o prefixo de sete caracteres é o que conta", () => {
    expect(precisaRecarregar("c13effb", "5e1800c598fb094c665286dfc672b4a970e66107")).toBe(true);
    expect(precisaRecarregar("c13effb", "c13effb7cf2f4d022dde3d4a47cb64ed39631bdb")).toBe(false);
    expect(precisaRecarregar("c13effb", "c13effb")).toBe(false);
  });

  it("t2: sem versão em uso (desenvolvimento) ou sem resposta do ar, nunca pede recarga", () => {
    expect(precisaRecarregar(null, "c13effb")).toBe(false);
    expect(precisaRecarregar("", "c13effb")).toBe(false);
    expect(precisaRecarregar("c13effb", null)).toBe(false);
    expect(precisaRecarregar("c13effb", undefined)).toBe(false);
    expect(precisaRecarregar("c13effb", "")).toBe(false);
  });
});
