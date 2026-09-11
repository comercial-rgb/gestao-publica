import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { repassadoLiquido, saldoDoRateio, tetoDoExercicio } from "./dominio.js";

const d = (v: string) => toMoney(v);

/**
 * ⚠️ FIXTURE N=2 EM TODO TETO. Com UM contrato de rateio, "o teto é o último valor" e "o teto
 * é a soma" dão a MESMA resposta — e as duas implementações passam. É com o ADITIVO que elas
 * divergem, e a divergência é do tamanho do contrato original.
 */
describe("M30 — o teto do contrato de rateio", () => {
  it("t1: com contrato original só, o teto é ele", () => {
    expect(tetoDoExercicio([{ valorDoEnte: d("120000.00"), ehAditivo: false }]).toFixed(2)).toBe(
      "120000.00"
    );
  });

  it("t2: o ADITIVO SOMA ao original — não o substitui", () => {
    // ⚠️ É O CASO QUE DISTINGUE AS DUAS IMPLEMENTAÇÕES. "O último vale" devolveria 30.000 e o
    // guard recusaria repasse legítimo de 100.000 — ou, no aditivo de acréscimo, o teto
    // CAIRIA de 120.000 para 30.000 no dia em que alguém aditasse.
    const teto = tetoDoExercicio([
      { valorDoEnte: d("120000.00"), ehAditivo: false },
      { valorDoEnte: d("30000.00"), ehAditivo: true },
    ]);
    expect(teto.toFixed(2)).toBe("150000.00");
  });

  it("t3: o aditivo de SUPRESSÃO entra negativo e reduz o teto", () => {
    const teto = tetoDoExercicio([
      { valorDoEnte: d("120000.00"), ehAditivo: false },
      { valorDoEnte: d("-20000.00"), ehAditivo: true },
    ]);
    expect(teto.toFixed(2)).toBe("100000.00");
  });

  it("t4: o repassado é líquido — o estorno devolve a cota", () => {
    expect(
      repassadoLiquido([
        { tipo: "REPASSE", valor: d("40000.00") },
        { tipo: "REPASSE", valor: d("30000.00") },
        { tipo: "ESTORNO_REPASSE", valor: d("30000.00") },
      ]).toFixed(2)
    ).toBe("40000.00");
  });

  it("t5: a DEVOLUÇÃO devolve cota ao teto do exercício", () => {
    expect(
      repassadoLiquido([
        { tipo: "REPASSE", valor: d("40000.00") },
        { tipo: "DEVOLUCAO", valor: d("10000.00") },
      ]).toFixed(2)
    ).toBe("30000.00");
  });

  it("t6: o saldo é teto − repassado, e o aditivo o reabre", () => {
    const rateios = [{ valorDoEnte: d("120000.00"), ehAditivo: false }];
    const movimentos = [
      { tipo: "REPASSE" as const, valor: d("60000.00") },
      { tipo: "REPASSE" as const, valor: d("60000.00") },
    ];
    expect(saldoDoRateio(rateios, movimentos).toFixed(2)).toBe("0.00");

    const comAditivo = [...rateios, { valorDoEnte: d("30000.00"), ehAditivo: true }];
    expect(saldoDoRateio(comAditivo, movimentos).toFixed(2)).toBe("30000.00");
  });

  it("t7: sem contrato de rateio, o teto é ZERO — e não 'sem limite'", () => {
    // ⚠️ O VAZIO TEM DE SER ZERO, NÃO INFINITO. Uma implementação que tratasse "sem rateio"
    // como "sem teto" autorizaria repasse de qualquer valor a um consórcio que não formalizou
    // o contrato daquele exercício — que é exatamente o que o art. 8º veda.
    expect(tetoDoExercicio([]).toFixed(2)).toBe("0.00");
    expect(saldoDoRateio([], []).toFixed(2)).toBe("0.00");
  });
});
