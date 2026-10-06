import { describe, expect, it } from "vitest";
import { lerCronogramaColado } from "./cronograma-colado.js";

/**
 * V36 — O CRONOGRAMA COLADO. Os valores esperados foram escritos à mão a partir do texto, não pelo leitor.
 */
describe("M10 V36 — o cronograma colado de uma planilha", () => {
  it("ponto e vírgula e tabulação; data brasileira e ISO; valor brasileiro, do sistema e com R$; encargos opcional", () => {
    const texto = ["1;28/02/2026;10.000,00;500,00", "2\t2026-03-31\t400.00", "", "3;30/04/2026;R$ 1.234,5;"].join("\r\n");
    expect(lerCronogramaColado(texto)).toEqual([
      { numero: 1, vencimento: "2026-02-28", valorPrincipal: "10000.00", valorEncargos: "500.00" },
      { numero: 2, vencimento: "2026-03-31", valorPrincipal: "400.00", valorEncargos: null },
      { numero: 3, vencimento: "2026-04-30", valorPrincipal: "1234.50", valorEncargos: null },
    ]);
  });

  it("NEGAÇÃO — todas as linhas ruins aparecem, cada uma com o número dela e o campo", () => {
    const texto = ["1;31/02/2026;10.000,00", "x;28/02/2026;10,00", "3;28/02/2026", "4;28/02/2026;dez reais;1,00"].join("\n");
    let msg = "";
    try {
      lerCronogramaColado(texto);
    } catch (e) {
      msg = e instanceof Error ? e.message : "";
    }
    expect(msg).toMatch(/linha 1: vencimento "31\/02\/2026"/);
    expect(msg).toMatch(/linha 2: número "x"/);
    expect(msg).toMatch(/linha 3: são 3 ou 4 campos[\s\S]*vieram 2/);
    expect(msg).toMatch(/linha 4: principal "dez reais"/);
    expect(msg).toMatch(/Nada foi gravado\.$/);
  });

  it("texto vazio é recusado com o motivo", () => {
    expect(() => lerCronogramaColado("\n  \n")).toThrow(/cronograma está vazio/);
  });
});
