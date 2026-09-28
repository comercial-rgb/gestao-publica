import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "./money.js";
import {
  CASAS_DO_PERCENTUAL,
  serializarPercentual,
  toPercentual,
  zPercentual,
  zPercentualDeRateio,
} from "./percentual.js";

/**
 * ═══ O CONTRATO DO PERCENTUAL, E O DEFEITO QUE ELE CORRIGE ═══
 *
 * O `_base.prisma` declara desde o começo: "alíquotas/índices: Decimal(9,6)". O contrato de
 * dinheiro, porém, arredonda a DUAS casas — e um percentual que passava por `toMoney` era achatado
 * em silêncio. Os dois primeiros testes deste arquivo são o CONTRASTE: eles afirmam o que o
 * contrato errado fazia, para que a correção não possa voltar sem que alguém veja.
 */

describe("o contrato do percentual", () => {
  it("t1 CONTRASTE: `toMoney` achata 33,333333 em 33,33 — e `toPercentual` nao", () => {
    // ⚠️ ESTE É O DEFEITO, escrito como asserção. Não é uma crítica ao `toMoney`: dinheiro TEM
    // duas casas. É a prova de que usar o contrato errado perde dado.
    expect(toMoney("33.333333").toFixed(6)).toBe("33.330000");
    expect(toPercentual("33.333333").toFixed(6)).toBe("33.333333");
    expect(CASAS_DO_PERCENTUAL).toBe(6);
  });

  it("t2 CONTRASTE: tres partes iguais SOMAM 100 com o contrato certo, e 99,99 com o errado", () => {
    // O rateio em três centros é o caso mais comum que o achatamento arruinava: a soma dava 99,99 e
    // a publicação era RECUSADA por não fechar em 100 — recusada pelo contrato, culpando o usuário.
    const fatias = ["33.333333", "33.333333", "33.333334"];
    const comPercentual = fatias.reduce((a, v) => a.plus(toPercentual(v)), new Decimal(0));
    expect(comPercentual.toFixed(6)).toBe("100.000000");

    const comDinheiro = fatias.reduce((a, v) => a.plus(toMoney(v)), new Decimal(0));
    expect(comDinheiro.toFixed(2)).toBe("99.99");
  });

  it("t3 arredonda half-even na SEXTA casa, e nao trunca", () => {
    expect(toPercentual("0.0000005").toFixed(6)).toBe("0.000000");
    expect(toPercentual("0.0000015").toFixed(6)).toBe("0.000002");
    expect(toPercentual("12.3456785").toFixed(6)).toBe("12.345678");
    expect(toPercentual("12.3456795").toFixed(6)).toBe("12.345680");
  });

  it("t4 recusa NaN e infinito — fail-closed, como o dinheiro", () => {
    expect(() => toPercentual(Number.NaN)).toThrow(/Percentual inválido/);
    expect(() => toPercentual(Number.POSITIVE_INFINITY)).toThrow(/Percentual inválido/);
    expect(() => toPercentual("nao e numero")).toThrow();
  });

  it("t5 serializa SEMPRE com seis casas, para o percentual inteiro tambem", () => {
    expect(serializarPercentual(toPercentual("50"))).toBe("50.000000");
    expect(serializarPercentual(toPercentual("0.5"))).toBe("0.500000");
  });

  it("t6 o zod aceita string decimal e Decimal, e RECUSA number", () => {
    expect(zPercentual.parse("33.333333").toFixed(6)).toBe("33.333333");
    expect(zPercentual.parse(new Decimal("7.5")).toFixed(6)).toBe("7.500000");
    // ⚠️ `number` recusado de propósito: um percentual que chegou como float já perdeu a
    // discussão sobre precisão antes de entrar. Em teste, escreva a string.
    expect(zPercentual.safeParse(33.333333).success).toBe(false);
  });

  it("t7 o recorte de rateio recusa zero, negativo e acima de 100", () => {
    expect(zPercentualDeRateio.safeParse("0").success).toBe(false);
    expect(zPercentualDeRateio.safeParse("-1").success).toBe(false);
    expect(zPercentualDeRateio.safeParse("100.000001").success).toBe(false);
    expect(zPercentualDeRateio.safeParse("100").success).toBe(true);
    expect(zPercentualDeRateio.safeParse("0.000001").success).toBe(true);
  });
});
