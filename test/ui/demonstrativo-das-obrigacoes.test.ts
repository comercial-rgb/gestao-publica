import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/pdf/ente.js", () => ({ nomeDoEnteParaDocumentos: async () => "Prefeitura de Demonstração (sintética)" }));

const { demonstrativoInternoDasObrigacoes, linhasDasGuias, linhasDasObrigacoes, colunasDasObrigacoes } = await import("../../lib/portas/recursos/obrigacoes-dos-encargos.js");
const { paraCsv } = await import("../../lib/csv/csv.js");
const { fecharBrowser, gerarPdfDoDemonstrativo } = await import("../../lib/pdf/gerar.js");

/**
 * O DEMONSTRATIVO INTERNO DAS OBRIGAÇÕES (V7 M1 U3.2) lido de volta por pdf.js — não MIME: o título diz
 * que não é guia, não há nada pagável, vencimento sem fundamento sai "não informado", e as quatro
 * grandezas (liquidado, pago, restituição, total da guia) não se misturam.
 */
const O = [
  {
    grupoId: "g1", grupo: "ENCARGOS", destinatario: "Instituto (fixture) (11222333000181)", naturezas: ["Cota patronal — RGPS", "RAT — RGPS"],
    liquidado: "1189.00", pago: "1247.00", restituicaoAProvidenciar: "58.00", pagamentosDisponiveis: [],
    guias: [
      { id: "a", identificador: "GPS-2026-05-0001", natureza: "Contribuição patronal", vencimento: null, fundamentoDoVencimento: null, principal: "1247.00", componentes: [], total: "1247.00", situacao: "BAIXADA" as const, anexoId: "x" },
      { id: "b", identificador: "GPS-2026-05-0002", natureza: "Complemento", vencimento: "2026-06-20", fundamentoDoVencimento: "campo vencimento da guia", principal: "10.00", componentes: [{ rotulo: "Juros", valor: "0.50" }], total: "10.50", situacao: "CANCELADA" as const, anexoId: null },
    ],
  },
];

afterAll(async () => { await fecharBrowser(); });

describe("o demonstrativo interno das obrigações", () => {
  it("CSV: as grandezas em colunas próprias, formato BR", () => {
    const csv = paraCsv(colunasDasObrigacoes(), linhasDasObrigacoes(O));
    expect(csv).toContain("Liquidado (obrigação);Pago;Restituição a providenciar");
    expect(csv).toContain("1.189,00;1.247,00;58,00");
    expect(linhasDasGuias(O)[0]?.[3]).toBe("não informado");
  });

  it("PDF: diz que não é guia, não traz linha digitável, e mostra 'não informado' e as situações", async () => {
    const doc = await demonstrativoInternoDasObrigacoes("2026-05", O);
    const r = await gerarPdfDoDemonstrativo(doc, { nomeBase: "demonstrativo", geradoEm: new Date("2026-06-10T12:00:00Z") });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(r.pdf), useSystemFonts: true }).promise;
    let texto = "";
    for (let i = 1; i <= pdf.numPages; i += 1) texto += ` ${(await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ")}`;
    const plano = texto.replace(/\s+/g, " ");
    expect(plano).toContain("DEMONSTRATIVO INTERNO");
    expect(plano).toContain("NÃO É GUIA DE RECOLHIMENTO");
    expect(plano).toContain("não informado");
    expect(plano).toContain("baixada por pagamento");
    expect(plano).toContain("cancelada");
    expect(plano).toContain("1.189,00");
    // Nada pagável: nenhuma sequência de 44 a 48 dígitos (código de barras / linha digitável).
    expect(/\d{44,48}/.test(plano.replace(/[ .]/g, ""))).toBe(false);
  }, 90_000);
});
