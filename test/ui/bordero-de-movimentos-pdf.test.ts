import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { documentoDoBorderoDeMovimentos } from "../../lib/pdf/bordero-de-movimentos";
import type { BorderoDeMovimentos } from "../../modules/m09-tesouraria/bordero-de-movimentos";

/** V36 (TR 5.10.2.22) — o PDF do borderô: entrada e saída em colunas próprias, os totais, o visto e a nota dos estornos. */
const bordero = (foraPorEstorno: number): BorderoDeMovimentos => ({
  conta: { codigo: "CC-B", descricao: "Movimento B", banco: "001", agencia: "1234-5", numero: "98765-X" },
  linhas: [
    { id: "a", data: new Date("2026-09-02T15:00:00Z"), tipo: "DEPOSITO", sentido: "ENTRADA", fonteCodigo: "500", historico: "depósito", valor: toMoney("1050.00") },
    { id: "b", data: new Date("2026-09-03T15:00:00Z"), tipo: "TARIFA", sentido: "SAIDA", fonteCodigo: "500", historico: "tarifa", valor: toMoney("12.34") },
  ],
  entradas: toMoney("1050.00"),
  saidas: toMoney("12.34"),
  foraPorEstorno,
});

describe("PDF do borderô dos movimentos bancários", () => {
  it("cada movimento na coluna do seu sentido, a linha de total, o visto e os dados do banco", () => {
    const d = documentoDoBorderoDeMovimentos({ ente: "E", desde: "2026-09-01", ate: "2026-09-30", bordero: bordero(2) });
    expect(d.periodo).toBe("01/09/2026 a 30/09/2026");
    expect(d.secoes[0]?.linhas).toEqual([
      ["02/09/2026", "Depósito", "500", "depósito", "1.050,00", ""],
      ["03/09/2026", "Tarifa bancária", "500", "tarifa", "", "12,34"],
      ["", "", "", "Total (2 movimento(s))", "1.050,00", "12,34"],
    ]);
    expect(d.secoes[1]?.titulo).toBe("Visto");
    expect(d.filtros).toEqual(["Banco: 001", "Agência: 1234-5", "Conta: 98765-X"]);
    expect(d.notas).toContain("2 movimento(s) do período ficaram fora por estorno.");
  });
  it("sem estornos, a nota da contagem não aparece", () => {
    const d = documentoDoBorderoDeMovimentos({ ente: "E", desde: "2026-09-01", ate: "2026-09-30", bordero: bordero(0) });
    expect(d.notas?.some((n: string) => n.includes("ficaram fora"))).toBe(false);
  });
});
