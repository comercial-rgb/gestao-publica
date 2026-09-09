import { describe, expect, it } from "vitest";
import { paraCsv } from "../../lib/csv/csv.js";

/** CSV (TR 7.48) — a função pura, testada sem React (o precedente do moeda.test.ts). */

const BOM = "﻿";

describe("paraCsv — o CSV é a tela, para o Excel BR", () => {
  it("cabeçalho + separador `;` + BOM + CRLF", () => {
    const csv = paraCsv(["Guia", "Valor"], [["2026RC001", "1.234,56"]]);
    expect(csv.startsWith(BOM)).toBe(true); // UTF-8 declarado
    expect(csv).toContain("Guia;Valor\r\n"); // cabeçalho com `;` e CRLF
    expect(csv).toContain("2026RC001;1.234,56"); // a vírgula decimal NÃO separa (o `;` separa)
  });

  it("célula com `;`, aspas ou quebra vai entre aspas (RFC 4180)", () => {
    const csv = paraCsv(["Histórico"], [['pagamento; parcela "A"']]);
    expect(csv).toContain('"pagamento; parcela ""A"""');
  });

  it("sem linhas, sai só o cabeçalho (com BOM e CRLF final)", () => {
    const csv = paraCsv(["A", "B"], []);
    expect(csv).toBe(`${BOM}A;B\r\n`);
  });
});
