/**
 * MÁSCARAS BR — as funções puras, testadas SEM React (o precedente do `moeda.test.ts`).
 *
 * O teste de componente (`Campos.test.tsx`) prova a FIAÇÃO — que o que se vê é mascarado e o que se
 * submete é cru. Este prova a REGRA, que é onde mora o risco: `desmascararValor` desambigua um
 * separador decimal que o próprio sistema ensinou de dois jeitos, e errar isso é errar por 1000×.
 */

import { describe, expect, it } from "vitest";
import {
  desmascararValor,
  mascararCep,
  mascararCpfCnpj,
  mascararTelefone,
  soDigitos,
} from "../../lib/format/mascaras.js";
import { formatarMoeda } from "../../lib/format/moeda.js";

describe("desmascararValor — a tela → o domínio", () => {
  it("lê o pt-BR que o campo exibe", () => {
    expect(desmascararValor("1.234.567,89")).toBe("1234567.89");
    expect(desmascararValor("10.000,00")).toBe("10000.00");
    expect(desmascararValor("0,50")).toBe("0.50");
  });

  it("lê o en-US que os placeholders sempre ensinaram — o campo não pode quebrar quem já sabia", () => {
    expect(desmascararValor("10000.00")).toBe("10000.00");
    expect(desmascararValor("1234.56")).toBe("1234.56");
    expect(desmascararValor("1234.5")).toBe("1234.50");
  });

  it("lê o que a pessoa digita sem enfeite", () => {
    expect(desmascararValor("10000")).toBe("10000.00");
    expect(desmascararValor("10000,00")).toBe("10000.00");
    expect(desmascararValor(" R$ 10.000,00 ")).toBe("10000.00");
  });

  it("⚠️ O PONTO AMBÍGUO: 3 dígitos depois é MILHAR, 1-2 é DECIMAL", () => {
    // É este par que separa um empenho de mil reais de um de um real e vinte e três.
    expect(desmascararValor("1.234")).toBe("1234.00"); // milhar
    expect(desmascararValor("1.23")).toBe("1.23"); // decimal
    expect(desmascararValor("1.2")).toBe("1.20"); // decimal
    expect(desmascararValor("1.234.567")).toBe("1234567.00"); // milhar encadeado
  });

  it("⚠️ 10000 NÃO vira 100,00 — o acumulador de centavos é justamente o que não se usa aqui", () => {
    // Se um dia alguém trocar por máscara de centavos ao vivo, este teste cai — e deve cair.
    expect(desmascararValor("10000")).not.toBe("100.00");
    expect(desmascararValor("10000")).toBe("10000.00");
  });

  it("lê negativo com sinal E com parêntese contábil (é o que o campo exibe)", () => {
    expect(desmascararValor("-5000")).toBe("-5000.00");
    expect(desmascararValor("-5.000,00")).toBe("-5000.00");
    expect(desmascararValor("(5.000,00)")).toBe("-5000.00");
    expect(desmascararValor("(1.234,56)")).toBe("-1234.56");
  });

  it("zero não tem sinal contábil — a mesma regra do formatarMoeda", () => {
    expect(desmascararValor("-0,00")).toBe("0.00");
    expect(desmascararValor("(0,00)")).toBe("0.00");
    expect(desmascararValor("0")).toBe("0.00");
  });

  it("vazio é vazio — o campo em branco não inventa zero", () => {
    // Inventar "0.00" faria um empenho vazio virar um empenho de zero, que o domínio recusaria por
    // outro motivo (valor não-positivo) — mensagem errada para o erro real.
    expect(desmascararValor("")).toBe("");
    expect(desmascararValor("   ")).toBe("");
  });

  it("⚠️ o que não entende, devolve CRU — para o domínio recusar NOMEANDO", () => {
    expect(desmascararValor("abc")).toBe("abc");
    expect(desmascararValor("1,2,3")).toBe("1,2,3");
    expect(desmascararValor("10-20")).toBe("10-20");
  });

  it("preserva centavos exatos acima do seguro do `number` (nunca passa por Number())", () => {
    expect(desmascararValor("12.345.678.901.234,56")).toBe("12345678901234.56");
  });

  it("é a INVERSA do formatarMoeda — ida e volta, sem perda", () => {
    for (const cru of ["1234567.89", "-1234.50", "0.00", "10000.00", "0.05"]) {
      expect(desmascararValor(formatarMoeda(cru).texto), `ida e volta de ${cru}`).toBe(cru);
    }
  });
});

describe("mascararCpfCnpj — 11 ↔ 14 por comprimento", () => {
  it("CPF completo", () => {
    expect(mascararCpfCnpj("12345678901")).toBe("123.456.789-01");
  });

  it("CNPJ completo", () => {
    expect(mascararCpfCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("vira CNPJ no 12º dígito — a troca é por COMPRIMENTO, ao vivo", () => {
    expect(mascararCpfCnpj("12345678901")).toBe("123.456.789-01"); // 11 = CPF
    expect(mascararCpfCnpj("123456789012")).toBe("12.345.678/9012"); // 12 = já é CNPJ
  });

  it("mascara enquanto se digita, sem exigir que esteja completo", () => {
    expect(mascararCpfCnpj("123")).toBe("123");
    expect(mascararCpfCnpj("1234")).toBe("123.4");
    expect(mascararCpfCnpj("1234567")).toBe("123.456.7");
  });

  it("ignora o que já vem pontuado (colar de uma planilha não duplica máscara)", () => {
    expect(mascararCpfCnpj("123.456.789-01")).toBe("123.456.789-01");
    expect(mascararCpfCnpj("12.345.678/0001-99")).toBe("12.345.678/0001-99");
  });

  it("corta no 14º dígito — não existe documento maior", () => {
    expect(mascararCpfCnpj("123456780001999999")).toBe("12.345.678/0001-99");
  });

  it("não valida dígito verificador (máscara é FORMA, não verdade)", () => {
    expect(mascararCpfCnpj("00000000000")).toBe("000.000.000-00");
  });
});

describe("mascararTelefone / mascararCep", () => {
  it("celular (11) e fixo (10)", () => {
    expect(mascararTelefone("83999887766")).toBe("(83) 99988-7766");
    expect(mascararTelefone("8333221100")).toBe("(83) 3322-1100");
  });

  it("telefone parcial e excedente", () => {
    expect(mascararTelefone("83")).toBe("83");
    expect(mascararTelefone("839")).toBe("(83) 9");
    expect(mascararTelefone("839998877669999")).toBe("(83) 99988-7766");
  });

  it("CEP", () => {
    expect(mascararCep("58400000")).toBe("58400-000");
    expect(mascararCep("58400")).toBe("58400");
    expect(mascararCep("584000009999")).toBe("58400-000");
  });
});

describe("soDigitos", () => {
  it("tira tudo que não é dígito", () => {
    expect(soDigitos("123.456.789-01")).toBe("12345678901");
    expect(soDigitos("(83) 99988-7766")).toBe("83999887766");
    expect(soDigitos("")).toBe("");
  });
});
