import { describe, expect, it } from "vitest";
import { fimDoDiaCivil, inicioDoDiaCivil, instanteCivil } from "../../packages/datas/index.js";
import { periodosSeSobrepoem, sobreposicao, type PeriodoMedido } from "./medicoes.js";

function periodo(numero: number, de: string, ate: string): PeriodoMedido {
  return { numero, inicio: inicioDoDiaCivil(de), fim: fimDoDiaCivil(ate) };
}

/**
 * ⚠️ FIXTURE N=2 SEMPRE. "Os períodos se sobrepõem?" com UMA medição não é pergunta — e uma
 * implementação que respondesse `false` sempre passaria.
 */
describe("M11 — os períodos de medição não se sobrepõem", () => {
  it("t1: períodos disjuntos não se sobrepõem", () => {
    expect(
      periodosSeSobrepoem(periodo(1, "2026-01-01", "2026-01-31"), periodo(2, "2026-02-01", "2026-02-28"))
    ).toBe(false);
  });

  it("t2: a BORDA É INCLUSIVA — acabar em X e começar em X SE SOBREPÕE", () => {
    // ⚠️ É O CASO MAIS COMUM E O MAIS FÁCIL DE DEIXAR PASSAR. Quem digita períodos
    // consecutivos repete o dia por hábito, e aquele dia seria medido duas vezes. Uma
    // implementação com borda exclusiva passa em t1 e falha aqui.
    expect(
      periodosSeSobrepoem(periodo(1, "2026-01-01", "2026-01-31"), periodo(2, "2026-01-31", "2026-02-28"))
    ).toBe(true);
  });

  it("t3: um período CONTIDO no outro se sobrepõe", () => {
    expect(
      periodosSeSobrepoem(periodo(1, "2026-01-01", "2026-03-31"), periodo(2, "2026-02-01", "2026-02-28"))
    ).toBe(true);
  });

  it("t4: a sobreposição é SIMÉTRICA — a ordem dos argumentos não muda a resposta", () => {
    const a = periodo(1, "2026-01-01", "2026-02-15");
    const b = periodo(2, "2026-02-01", "2026-03-01");
    expect(periodosSeSobrepoem(a, b)).toBe(periodosSeSobrepoem(b, a));
    expect(periodosSeSobrepoem(a, b)).toBe(true);
  });

  it("t5: `sobreposicao` ignora a própria medição e acha a primeira conflitante", () => {
    const existentes = [periodo(1, "2026-01-01", "2026-01-31"), periodo(2, "2026-02-01", "2026-02-28")];
    // Ela mesma não conflita consigo.
    expect(sobreposicao(periodo(2, "2026-02-01", "2026-02-28"), existentes)?.numero).toBeUndefined();
    // A nova invade a 2ª.
    expect(sobreposicao(periodo(3, "2026-02-20", "2026-03-10"), existentes)?.numero).toBe(2);
    // A nova cabe no buraco.
    expect(sobreposicao(periodo(3, "2026-03-01", "2026-03-31"), existentes)).toBeNull();
  });

  it("t6: o fim do período é o ÚLTIMO instante CIVIL do dia — e 22:00 daquele dia cabe nele", () => {
    // ⚠️ EM UTC O PERÍODO ACABARIA ÀS 20:59:59, e as três horas restantes de 31/01 ficariam
    // ou sem medição nenhuma ou dentro da medição seguinte. Um dia na virada do mês decide se
    // a obra fecha.
    const jan = periodo(1, "2026-01-01", "2026-01-31");
    const fato = instanteCivil(2026, 1, 31, 22, 0);
    expect(fato >= jan.inicio && fato <= jan.fim).toBe(true);

    const fev = periodo(2, "2026-02-01", "2026-02-28");
    expect(fato >= fev.inicio && fato <= fev.fim).toBe(false);
  });
});
