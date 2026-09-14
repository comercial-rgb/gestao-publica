import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/pdf/ente.js", () => ({ nomeDoEnteParaDocumentos: async () => "Prefeitura de Demonstração (sintética)" }));

const { agregarResumoDaFolha, documentoDoResumo, linhasDoResumo, colunasDoResumo } = await import("../../lib/portas/recursos/resumo-da-folha.js");
const { paraCsv } = await import("../../lib/csv/csv.js");
const { fecharBrowser, gerarPdfDoDemonstrativo } = await import("../../lib/pdf/gerar.js");

/**
 * O RESUMO DA FOLHA — as quatro colunas que não se misturam, contra contas feitas à mão, e o PDF
 * lido de volta por um leitor INDEPENDENTE do gerador (pdf.js), não só MIME e tamanho.
 */

const L = (regime: string, lotacao: string, bruto: string, descontos: string, liquido: string, patronal: string | null) => ({ regime, lotacao, bruto, descontos, liquido, patronal });

describe("a agregação — N=2 grupos, contas à mão", () => {
  it("soma por regime × lotação; o patronal fica AO LADO; o custo do ente é bruto + patronal", () => {
    const r = agregarResumoDaFolha([
      L("RGPS", "SEDUC", "3500.00", "350.00", "3150.00", "752.50"),
      L("RGPS", "SEDUC", "2300.00", "230.00", "2070.00", "494.50"),
      L("RPPS", "SAUDE", "4000.00", "440.00", "3560.00", "880.00"),
    ]);
    expect(r.grupos.map((g) => `${g.regime}/${g.lotacao}/${g.vinculos}/${g.bruto}/${g.descontos}/${g.liquido}/${g.patronal}`)).toEqual([
      "RGPS/SEDUC/2/5800.00/580.00/5220.00/1247.00",
      "RPPS/SAUDE/1/4000.00/440.00/3560.00/880.00",
    ]);
    // 9800 + 2127 = 11927,00 — e o líquido (8780,00) NÃO foi tocado pelo patronal
    expect([r.total.bruto, r.total.liquido, r.total.patronal, r.custoDoEnte]).toEqual(["9800.00", "8780.00", "2127.00", "11927.00"]);
  });

  it("encargos NÃO APURADOS em algum vínculo: a coluna fica nula — nunca zero — e o custo do ente fica indisponível", () => {
    const r = agregarResumoDaFolha([L("RGPS", "SEDUC", "100.00", "10.00", "90.00", null), L("RGPS", "SEDUC", "100.00", "10.00", "90.00", "20.00")]);
    expect([r.total.patronal, r.custoDoEnte]).toEqual([null, null]);
  });
});

describe("CSV e PDF — a mesma consulta, conferida pelo conteúdo", () => {
  afterAll(async () => {
    await fecharBrowser();
  });

  const lotacaoLonga = "SECRETARIA MUNICIPAL DE EDUCAÇÃO, CULTURA, ESPORTE, JUVENTUDE E LAZER — ESCOLA MUNICIPAL DE ENSINO FUNDAMENTAL PROFESSORA MARIA DAS DORES";
  const muitas = Array.from({ length: 70 }, (_, i) => L(i % 2 === 0 ? "RGPS" : "RPPS", `${String(i).padStart(3, "0")} ${i === 7 ? lotacaoLonga : "LOTAÇÃO"}`, "1234567.89", "123456.78", "1111111.11", "246913.58"));
  const agregado = agregarResumoDaFolha(muitas);
  const resumo = { competencia: "2026-05", calculo: 1, apuracao: 2, filtros: { regime: "", lotacao: "" }, ...agregado, porComponente: [{ codigo: "RGPS-PATRONAL", descricao: "Cota patronal (sintética)", total: "1000.00" }] };

  it("CSV: cabeçalho, dinheiro no formato BR, total ao fim, texto longo intacto", () => {
    const csv = paraCsv(colunasDoResumo(), linhasDoResumo(resumo));
    const linhas = csv.replace(/^﻿/, "").split("\r\n");
    expect(linhas[0]).toBe("Regime;Lotação;Vínculos;Bruto;Descontos;Líquido;Patronal (ente)");
    expect(linhas[1]).toContain("1.234.567,89");
    // 70 × 1.234.567,89 = 86.419.752,30
    expect(linhas[71]).toBe("TOTAL;;70;86.419.752,30;8.641.974,60;77.777.777,70;17.283.950,60");
    expect(csv).toContain(lotacaoLonga);
  });

  it("PDF: várias páginas, o total e as notas saem no texto lido pelo pdf.js", async () => {
    const doc = await documentoDoResumo(resumo);
    const r = await gerarPdfDoDemonstrativo(doc, { nomeBase: "resumo-folha-2026-05", geradoEm: new Date("2026-06-01T12:00:00Z") });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(r.pdf), useSystemFonts: true }).promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    let texto = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const c = await (await pdf.getPage(i)).getTextContent();
      texto += ` ${c.items.map((it) => ("str" in it ? it.str : "")).join(" ")}`;
    }
    const plano = texto.replace(/\s+/g, " ");
    expect(plano).toContain("Resumo da folha mensal de 2026-05");
    expect(plano).toContain("86.419.752,30");
    expect(plano).toContain("Patronal (ente)");
    expect(plano).toContain("não se soma ao líquido");
    expect(plano).toContain("Custo do ente (bruto + patronal)");
    expect(plano.replace(/ /g, "")).toContain("PROFESSORAMARIADASDORES");
  }, 90_000);
});
