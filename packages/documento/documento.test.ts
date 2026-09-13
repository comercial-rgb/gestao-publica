import { describe, expect, it } from "vitest";
import {
  calcularDvDoCnpj,
  cnpjEhAlfanumerico,
  documentoTemDigitoValido,
  documentoTemFormatoValido,
  formatarDocumento,
  normalizarDocumento,
  tipoDeDocumento,
} from "./index.js";

/**
 * O CNPJ ALFANUMÉRICO (sessão noturna V4, §7 — achado A09), conferido contra os VETORES OFICIAIS:
 * o manual "Cálculo dos dígitos verificadores de CNPJ alfanumérico" (SERPRO/Receita Federal,
 * 05/11/2024) e o `test.ts` dos arquivos de referência (`codigos-cnpj.zip`) — não contra a nossa
 * própria implementação. O exemplo do manual (12.ABC.345/01DE → DV 35) é o primeiro caso.
 */

describe("normalização — a máscara sai, as letras ficam", () => {
  it("t1: tira ponto, barra, hífen e espaço; põe em maiúsculas; NÃO remove letras", () => {
    expect(normalizarDocumento("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
    expect(normalizarDocumento("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizarDocumento(" 529.982.247-25 ")).toBe("52998224725");
    expect(normalizarDocumento(null)).toBe("");
    expect(normalizarDocumento(undefined)).toBe("");
  });

  it("t2: A MUTILAÇÃO ANTIGA NÃO ACONTECE MAIS — o que antes virava '123450135' continua sendo o CNPJ inteiro", () => {
    expect(normalizarDocumento("12ABC34501DE35")).toBe("12ABC34501DE35");
    expect(normalizarDocumento("12ABC34501DE35")).not.toBe("123450135");
  });

  it("t3: caractere fora de A–Z/0–9 não some — torna o documento INVÁLIDO", () => {
    expect(tipoDeDocumento(normalizarDocumento("12$BC34501DE35"))).toBe("INVALIDO");
    expect(documentoTemFormatoValido(normalizarDocumento("0123456?789ABC"))).toBe(false);
  });
});

describe("formato e tipo", () => {
  it("t4: CPF é 11 dígitos; CNPJ é 12 [A-Z0-9] + 2 dígitos; o numérico continua CNPJ", () => {
    expect(tipoDeDocumento("52998224725")).toBe("CPF");
    expect(tipoDeDocumento("11222333000181")).toBe("CNPJ");
    expect(tipoDeDocumento("12ABC34501DE35")).toBe("CNPJ");
    expect(cnpjEhAlfanumerico("12ABC34501DE35")).toBe(true);
    expect(cnpjEhAlfanumerico("11222333000181")).toBe(false);
    // letra na posição do DV não é CNPJ (os dois últimos são NUMÉRICOS)
    expect(tipoDeDocumento("0000000000019L")).toBe("INVALIDO");
    expect(tipoDeDocumento("000000000001P1")).toBe("INVALIDO");
    // CPF com letra não existe
    expect(tipoDeDocumento("5299822472A")).toBe("INVALIDO");
    expect(documentoTemFormatoValido("0000000000019")).toBe(false); // 13
    expect(documentoTemFormatoValido("000000000001911")).toBe(false); // 15
  });
});

describe("o DV pela regra oficial (SERPRO/Receita Federal)", () => {
  it("t5: o exemplo do manual — 12.ABC.345/01DE → 35 — e a raiz numérica 000000000001 → 91", () => {
    expect(calcularDvDoCnpj("12.ABC.345/01DE")).toBe("35");
    expect(calcularDvDoCnpj("000000000001")).toBe("91");
  });

  it("t6: os vetores VÁLIDOS dos arquivos de referência", () => {
    for (const c of [
      "12.ABC.345/01DE-35",
      "90.021.382/0001-22",
      "90.024.778/0001-23",
      "90.025.108/0001-21",
      "90.025.255/0001-00",
      "90.024.420/0001-09",
      "90.024.781/0001-47",
      "04.740.714/0001-97",
      "44.108.058/0001-29",
      "90.024.780/0001-00",
      "90.024.779/0001-78",
      "00000000000191",
      "ABCDEFGHIJKL80",
    ]) {
      expect(documentoTemDigitoValido(c), c).toBe(true);
    }
  });

  it("t7: os vetores INVÁLIDOS dos arquivos de referência (DV errado, zerado, tamanho, caractere proibido)", () => {
    for (const c of [
      "",
      "'!@#$%&*-_=+^~",
      "$0123456789ABC",
      "0123456?789ABC",
      "0123456789ABC#",
      "0000000000019",
      "000000000001911",
      "0000000000019L",
      "000000000001P1",
      "00000000000192",
      "ABCDEFGHIJKL81",
      "00000000000000",
      "00.000.000/0000-00",
    ]) {
      expect(documentoTemDigitoValido(c), c).toBe(false);
    }
  });

  it("t8: a raiz zerada e a entrada fora do formato lançam nomeando", () => {
    expect(() => calcularDvDoCnpj("000000000000")).toThrow(/raiz de um CNPJ/);
    expect(() => calcularDvDoCnpj("12ABc34501D")).toThrow(/raiz de um CNPJ/);
  });

  it("t9: o instrumento acusa — trocar UM caractere da raiz muda o DV", () => {
    expect(calcularDvDoCnpj("12ABC34501DE")).toBe("35");
    expect(calcularDvDoCnpj("12ABC34501DF")).not.toBe("35");
    expect(documentoTemDigitoValido("12ABC34501DF35")).toBe(false);
  });

  it("t10: o CPF continua com a sua regra (o alfanumérico é só do CNPJ)", () => {
    expect(documentoTemDigitoValido("529.982.247-25")).toBe(true);
    expect(documentoTemDigitoValido("52998224726")).toBe(false);
    expect(documentoTemDigitoValido("11111111111")).toBe(false);
  });
});

describe("exibição", () => {
  it("t11: o alfanumérico é formatado nas mesmas posições do numérico", () => {
    expect(formatarDocumento("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("12$BC34501DE35")).toBe("12$BC34501DE35"); // inválido: devolve como veio, sem fingir máscara
  });
});
