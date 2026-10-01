import { describe, expect, it } from "vitest";
import { instanteCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { estaVigente, vigenciaDoFormulario } from "./dominio.js";

/**
 * A VIGÊNCIA DIGITADA NA TELA VALE O PRIMEIRO E O ÚLTIMO DIA INTEIROS.
 *
 * O cadastro do contrato gravava início e fim ao meio-dia civil. `estaVigente` compara instantes, e
 * com isso o empenho das 08:00 do primeiro dia e o das 20:00 do último ficavam fora da vigência. Os
 * instantes de prova estão nas duas pontas do dia civil, não ao meio-dia, onde o defeito não aparece.
 */
describe("M11 — vigência digitada no formulário", () => {
  const v = vigenciaDoFormulario("2026-03-01", "2026-03-31");

  it("o primeiro dia vale desde a madrugada", () => {
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 3, 1, 0, 0, 1, 0))).toBe(true);
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 3, 1, 8, 0, 0, 0))).toBe(true);
  });

  it("o último dia vale até a noite, inclusive depois das 21:00 (já é o dia seguinte em UTC)", () => {
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 3, 31, 20, 0, 0, 0))).toBe(true);
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 3, 31, 23, 59, 0, 0))).toBe(true);
  });

  it("a véspera e o dia seguinte continuam fora", () => {
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 2, 28, 23, 59, 0, 0))).toBe(false);
    expect(estaVigente(v.vigenciaInicio, v.vigenciaFimInicial, instanteCivil(2026, 4, 1, 0, 0, 1, 0))).toBe(false);
  });

  it("a gravação ao meio-dia, como a tela fazia, é a que perde as pontas", () => {
    const antes = { inicio: meioDiaCivil("2026-03-01"), fim: meioDiaCivil("2026-03-31") };
    expect(estaVigente(antes.inicio, antes.fim, instanteCivil(2026, 3, 1, 8, 0, 0, 0))).toBe(false);
    expect(estaVigente(antes.inicio, antes.fim, instanteCivil(2026, 3, 31, 20, 0, 0, 0))).toBe(false);
  });
});
