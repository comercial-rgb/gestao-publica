import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O PORTAL DO SERVIDOR NÃO HERDA OS ENCARGOS DO ENTE (V6.2 U1).
 *
 * O servidor vê o PRÓPRIO contracheque; o patronal é obrigação do empregador e não é dele. A porta do
 * portal não importa nada dos encargos — e a contraprova confere que a regex acusaria se importasse.
 */
const PORTA = readFileSync(new URL("../../lib/portas/portal-do-servidor.ts", import.meta.url), "utf8");
const IMPORTA_ENCARGOS = /from\s+["'][^"']*(encargos|resumo-da-folha)[^"']*["']/;

describe("portal do servidor × encargos", () => {
  it("a porta do portal não importa encargos nem o resumo da folha do ente", () => {
    expect(IMPORTA_ENCARGOS.test(PORTA)).toBe(false);
    expect(PORTA).not.toMatch(/apuracaoDeEncargos|patronal/i);
  });
  it("contraprova: a regex acusa um import de encargos", () => {
    expect(IMPORTA_ENCARGOS.test(`import { x } from "../../modules/m33-folha/encargos-servico.js";`)).toBe(true);
  });
});
