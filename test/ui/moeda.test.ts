import { describe, expect, it } from "vitest";
import { formatarMoeda } from "../../lib/format/moeda.js";

/**
 * FORMATAÇÃO MONETÁRIA — a função pura da UI, testada SEM React.
 *
 * ⚠️ É a fronteira onde a regra de ouro (dinheiro como STRING, nunca number) encosta na tela. Os
 * literais aqui são o contrato: o que o cidadão lê no portal.
 */
describe("UI — formatarMoeda (pt-BR contábil)", () => {
  it("milhar com ponto, decimal com vírgula", () => {
    expect(formatarMoeda("1234567.89").texto).toBe("1.234.567,89");
    expect(formatarMoeda("1234567.89").negativo).toBe(false);
  });

  it("negativo entre PARÊNTESES contábeis (e marcado como negativo)", () => {
    const r = formatarMoeda("-1234.50");
    expect(r.texto).toBe("(1.234,50)");
    expect(r.negativo).toBe(true);
  });

  it("zero e valores pequenos", () => {
    expect(formatarMoeda("0").texto).toBe("0,00");
    expect(formatarMoeda("0.05").texto).toBe("0,05");
    expect(formatarMoeda("100").texto).toBe("100,00");
    expect(formatarMoeda("999.99").texto).toBe("999,99");
  });

  it("-0.00 NÃO é negativo (zero não tem sinal contábil)", () => {
    const r = formatarMoeda("-0.00");
    expect(r.texto).toBe("0,00");
    expect(r.negativo).toBe(false);
  });

  it("valores ACIMA do seguro do number formatam exato (o ponto flutuante quebraria)", () => {
    // 12.345.678.901.234,56 — além de Number.MAX_SAFE_INTEGER em centavos.
    expect(formatarMoeda("12345678901234.56").texto).toBe("12.345.678.901.234,56");
  });

  it("completa 2 casas quando o decimal vem curto", () => {
    expect(formatarMoeda("10.5").texto).toBe("10,50");
    expect(formatarMoeda("10").texto).toBe("10,00");
  });

  it("REJEITA string malformada (defesa fail-closed)", () => {
    expect(() => formatarMoeda("abc")).toThrow(/malformado/);
    expect(() => formatarMoeda("1,234.50")).toThrow(/malformado/); // já formatado é erro
    expect(() => formatarMoeda("")).toThrow(/malformado/);
  });

  it("⚠️ REJEITA number em tempo de COMPILAÇÃO (a regra de ouro)", () => {
    // @ts-expect-error — `valor` é string; passar number é erro de tipo (a defesa da UI).
    expect(() => formatarMoeda(1234.5)).toThrow();
  });
});
