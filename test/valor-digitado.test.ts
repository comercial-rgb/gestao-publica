import { describe, expect, it } from "vitest";
import { somarValoresDigitados, subtrairValores, valorDigitadoEmDecimal } from "../lib/format/moeda.js";
import { inteiroBr, umaCasaBr } from "../lib/format/quantidade.js";

/**
 * Os formulários da guia de recolhimento e da guia repartida somavam as parcelas digitadas em
 * ponto flutuante. Os valores esperados aqui são escritos à mão, não derivados da função.
 */
describe("valor digitado em formato brasileiro", () => {
  it("converte as três formas de digitar e recusa o ilegível sem lançar", () => {
    expect(valorDigitadoEmDecimal("1.234,56")).toBe("1234.56");
    expect(valorDigitadoEmDecimal("1234,56")).toBe("1234.56");
    expect(valorDigitadoEmDecimal("1234.56")).toBe("1234.56");
    expect(valorDigitadoEmDecimal("  ")).toBe("0");
    expect(valorDigitadoEmDecimal("12,3a")).toBe("");
  });

  it("soma parcelas sem o erro do ponto flutuante: 0,10 + 0,20 fecha com 0,30", () => {
    const soma = somarValoresDigitados(["0,10", "0,20"].map(valorDigitadoEmDecimal));
    expect(soma).toBe("0.30");
    expect(subtrairValores("0.30", soma)).toBe("0.00");
  });

  it("a diferença diz o lado: falta e excesso", () => {
    expect(subtrairValores("1000.00", "999.99")).toBe("0.01");
    expect(subtrairValores("1000.00", "1000.01")).toBe("-0.01");
    expect(subtrairValores("1000.00", "-5.00")).toBe("1005.00");
  });

  it("parcela meio digitada fica fora da soma em vez de zerar o resto", () => {
    expect(somarValoresDigitados(["1.500,00", "2,", "300"].map(valorDigitadoEmDecimal))).toBe("1800.00");
  });
});

describe("contagens na tela", () => {
  it("agrupam o milhar com ponto e a casa decimal com vírgula", () => {
    expect(inteiroBr(1234567)).toBe("1.234.567");
    expect(umaCasaBr(1536 / 1024)).toBe("1,5");
  });
});
