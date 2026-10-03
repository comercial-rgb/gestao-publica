import { describe, expect, it } from "vitest";
import { avisoDoAmbiente, orientacaoDo, renderizarCorpo, rodapeTemplate, type DocumentoPdf } from "../../lib/pdf/documento.js";

/**
 * V33 — O PADRÃO ÚNICO DO DOCUMENTO: o que o cabeçalho e o rodapé dizem, a orientação e o aviso de demonstração.
 * Puro (sem navegador). A conferência VISUAL das amostras curta, multipágina e sem movimento está em
 * `scripts/amostras-de-pdf.ts` (saída em `.registro-de-execucao/amostras-pdf/`).
 */

const base: DocumentoPdf = {
  ente: "Município de Exemplo/PB",
  titulo: "A pagar",
  subtitulo: "Obrigações por credor",
  periodo: "Exercício 2026",
  secoes: [{ colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }], linhas: [["Total", "0,00"]] }],
};

describe("padrão do documento", () => {
  it("o cabeçalho diz a unidade, o número e os filtros quando o documento os tem", () => {
    const html = renderizarCorpo({ ...base, unidade: "Unidade orçamentária 01001", numero: "000123/2026", filtros: ["Credor: Fulano", "Fase: liquidado a pagar"] });
    expect(html).toContain("Unidade orçamentária 01001");
    expect(html).toContain("documento nº 000123/2026");
    expect(html).toContain("Filtros: Credor: Fulano · Fase: liquidado a pagar");
    expect(renderizarCorpo(base)).not.toContain("Filtros:");
  });

  it("fora da produção, o cabeçalho e o rodapé dizem que é de demonstração; em produção, nada", () => {
    expect(avisoDoAmbiente("producao")).toBeNull();
    const aviso = avisoDoAmbiente("demonstracao");
    expect(aviso).toBe("Documento de demonstração — sem valor oficial");
    expect(renderizarCorpo(base, aviso)).toContain(aviso ?? "-");
    expect(rodapeTemplate("ab", new Date("2026-10-03T12:00:00Z"), aviso)).toContain(aviso ?? "-");
    expect(renderizarCorpo(base, null)).not.toContain("sem valor oficial");
  });

  it("a hora de emissão é a do ente, com o fuso dito — 21h de 31/12 no ente não vira 1º/01", () => {
    const r = rodapeTemplate("ab", new Date("2027-01-01T00:30:00Z"));
    expect(r).toContain("31/12/2026 21:30 (horário de Brasília)");
    expect(r).not.toContain("UTC");
  });

  it("paisagem quando alguma seção tem mais de 8 colunas, a não ser que o documento declare", () => {
    const larga = { ...base, secoes: [{ colunas: Array.from({ length: 9 }, (_, i) => ({ rotulo: `c${String(i)}` })), linhas: [] }] };
    expect(orientacaoDo(base)).toBe("retrato");
    expect(orientacaoDo(larga)).toBe("paisagem");
    expect(orientacaoDo({ ...larga, orientacao: "retrato" })).toBe("retrato");
  });
});
