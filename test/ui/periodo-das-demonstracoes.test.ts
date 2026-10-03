import { describe, expect, it } from "vitest";
import { lerCorteStr, lerExercicio } from "../../app/(areas)/relatorios/demonstracoes/exercicio";
import { anoCivil } from "../../packages/datas/index";

/** V33 — as demonstrações abrem no exercício do contexto, e não em 2026 cravado. */
describe("período das demonstrações", () => {
  it("o exercício da URL manda; ausente ou inválido, o ano civil corrente", () => {
    expect(lerExercicio({ exercicio: "2027" }).exercicio).toBe(2027);
    expect(lerExercicio({}).exercicio).toBe(anoCivil(new Date()));
    expect(lerExercicio({ exercicio: "20x7" }).exercicio).toBe(anoCivil(new Date()));
  });
  it("o corte explícito manda; sem ele, 31/12 do exercício do contexto", () => {
    expect(lerCorteStr({ corte: "2027-06-30", exercicio: "2026" })).toBe("2027-06-30");
    expect(lerCorteStr({ exercicio: "2027" })).toBe("2027-12-31");
    expect(lerCorteStr({})).toBe(`${String(anoCivil(new Date()))}-12-31`);
  });
});
