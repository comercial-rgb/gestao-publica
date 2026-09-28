import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { apurarMinimo } from "./apuracao-do-minimo.js";

/**
 * ═══ O SELO DO MÍNIMO E A DIFERENÇA IMPRESSA AO LADO DIZEM A MESMA COISA ═══
 *
 * Caracterização do defeito medido na tela do Anexo 12: base de impostos 0,00 e aplicado em ASPS
 * 37.875,00 saíam como "0,00%", "abaixo de 15%" e "Falta para o mínimo 37.875,00" — o aplicado
 * EXCEDE 15% de uma base nula, e a diferença positiva estava certa; o selo, não. A causa era o
 * veredito tirado do percentual arredondado (que vale "0.00" por convenção quando a base é zero).
 *
 * ⚠️ N=2, E OS DOIS CASOS ERRAM EM DIREÇÕES OPOSTAS: a base nula dava "não atingiu" com sobra, e o
 * arredondamento (14,996% -> "15.00") dava "atingiu" com falta. Um conserto que só tratasse a
 * base zero passaria no primeiro e continuaria errado no segundo.
 *
 * Os valores esperados são aritmética escrita à mão, não saída da função.
 */

const m = (v: string) => toMoney(v);

describe("apurarMinimo — o veredito vem do dinheiro, não do percentual arredondado", () => {
  it("t1: ASPS com base nula e aplicado positivo — cumprido, com sobra igual ao aplicado", () => {
    const r = apurarMinimo(m("37875.00"), m("0.00"), m("15.00"));
    expect(r.baseNula).toBe(true);
    expect(r.percentual).toBe("0.00"); // convenção de exibição; a tela não o usa como veredito
    expect(r.minimoExigido).toBe("0.00");
    expect(r.diferenca).toBe("37875.00");
    expect(r.atingiu, "15% de uma base nula é zero, e 37.875,00 ≥ 0").toBe(true);
  });

  it("t2: ASPS com 14,996% — o percentual arredonda para 15,00, mas faltam R$ 0,04", () => {
    // 149,96 / 1.000,00 = 14,996% -> "15.00" (2 casas). Mínimo = 150,00. Diferença = −0,04.
    const r = apurarMinimo(m("149.96"), m("1000.00"), m("15.00"));
    expect(r.percentual).toBe("15.00");
    expect(r.minimoExigido).toBe("150.00");
    expect(r.diferenca).toBe("-0.04");
    expect(r.atingiu, "faltam R$ 0,04 para os 15% — o selo não pode dizer ≥ 15%").toBe(false);
  });

  it("t3: MDE/FUNDEB 70% — os mesmos dois casos no indicador dos profissionais", () => {
    // Sem FUNDEB recebido não há o que exigir; com 69,996% faltam R$ 0,04.
    const nula = apurarMinimo(m("12000.00"), m("0.00"), m("70.00"));
    expect(nula.atingiu).toBe(true);
    expect(nula.diferenca).toBe("12000.00");

    const arredonda = apurarMinimo(m("699.96"), m("1000.00"), m("70.00"));
    expect(arredonda.percentual).toBe("70.00");
    expect(arredonda.diferenca).toBe("-0.04");
    expect(arredonda.atingiu).toBe(false);
  });

  it("t4: controle nas duas direções — exatamente no mínimo cumpre; um centavo abaixo não", () => {
    const exato = apurarMinimo(m("60000.00"), m("400000.00"), m("15.00"));
    expect(exato).toEqual({ percentual: "15.00", minimoExigido: "60000.00", diferenca: "0.00", atingiu: true, baseNula: false });

    const centavo = apurarMinimo(m("59999.99"), m("400000.00"), m("15.00"));
    expect(centavo.diferenca).toBe("-0.01");
    expect(centavo.atingiu).toBe(false);

    const abaixo = apurarMinimo(m("40000.00"), m("400000.00"), m("15.00"));
    expect(abaixo.percentual).toBe("10.00");
    expect(abaixo.diferenca).toBe("-20000.00");
    expect(abaixo.atingiu).toBe(false);
  });

  it("t5: o selo e o sinal da diferença nunca se contradizem", () => {
    const casos: readonly [string, string, string][] = [
      ["37875.00", "0.00", "15.00"],
      ["0.00", "0.00", "15.00"],
      ["149.96", "1000.00", "15.00"],
      ["150.00", "1000.00", "15.00"],
      ["699.96", "1000.00", "70.00"],
      ["700.01", "1000.00", "70.00"],
      ["59999.99", "400000.00", "15.00"],
    ];
    for (const [ap, base, lim] of casos) {
      const r = apurarMinimo(m(ap), m(base), m(lim));
      expect(r.atingiu, `${ap} sobre ${base} a ${lim}%`).toBe(!r.diferenca.startsWith("-"));
    }
  });
});
