import { describe, expect, it } from "vitest";
import { tabelasParaCsv } from "../../lib/csv/csv.js";

/**
 * V37 — VÁRIAS TABELAS NUM CSV (os demonstrativos do RREO e do RGF). Conferido contra o texto esperado escrito à mão,
 * não contra o `paraCsv` (o teste não usa a função para conferir a função).
 */
describe("tabelasParaCsv", () => {
  it("dois quadros (N=2): título em linha própria, quadros separados por linha em branco, BOM no início", () => {
    const csv = tabelasParaCsv([
      { titulo: "Receitas", linhas: [["Rubrica", "Previsto"], ["Impostos", "1.000,00"]] },
      { titulo: "Despesas", linhas: [["Função", "Empenhado"], ["Saúde", "500,00"]] },
    ]);
    expect(csv).toBe("﻿Receitas\r\nRubrica;Previsto\r\nImpostos;1.000,00\r\n\r\nDespesas\r\nFunção;Empenhado\r\nSaúde;500,00\r\n");
  });

  it("quadro vazio sai; sem título, não há linha de título; ponto e vírgula e aspas entre aspas; fórmula neutralizada", () => {
    const csv = tabelasParaCsv([
      { titulo: "Vazio", linhas: [] },
      { titulo: "", linhas: [["A; B", 'disse "x"', "=SOMA(A1)", "-1.234,56"]] },
    ]);
    expect(csv).toBe('﻿"A; B";"disse ""x""";"\'=SOMA(A1)";-1.234,56\r\n');
  });
});
