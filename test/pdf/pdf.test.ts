import { afterAll, describe, expect, it } from "vitest";
import { hashDoDocumento, nomeCanonico, renderizarCorpo, type DocumentoPdf } from "../../lib/pdf/documento.js";
import { fecharBrowser, gerarPdfDoDemonstrativo } from "../../lib/pdf/gerar.js";

/**
 * O MOTOR DE PDF (TR 7.5/5.120). O corpo — hash, HTML, nome — é PURO e se testa sem navegador; a
 * impressão headless prova que o pipeline Chromium roda e devolve um PDF de verdade.
 */

const DOC: DocumentoPdf = {
  ente: "Município de Campina Grande/PB",
  titulo: "RREO — Anexo 1 · Balanço Orçamentário",
  subtitulo: "LRF art. 52 · regime orçamentário",
  periodo: "Exercício 2026 · 3º bimestre",
  secoes: [
    {
      titulo: "Receitas",
      colunas: [{ rotulo: "Especificação" }, { rotulo: "Previsão", alinhamento: "direita" }, { rotulo: "Realizada", alinhamento: "direita" }],
      linhas: [
        ["Impostos", "1.000.000,00", "800.000,00"],
        ["SUBTOTAL (I)", "1.000.000,00", "800.000,00"],
      ],
      totais: [1],
    },
  ],
  notas: ["Valores em R$ — o dado do <censo> & da tela, escapado no HTML."],
};

describe("PDF — o documento puro (hash, html, nome)", () => {
  it("o hash é estável para o mesmo conteúdo e muda quando o conteúdo muda", () => {
    const h1 = hashDoDocumento(DOC);
    const h2 = hashDoDocumento({ ...DOC });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);

    const outro = hashDoDocumento({ ...DOC, periodo: "Exercício 2026 · 1º bimestre" });
    expect(outro).not.toBe(h1);
  });

  it("o corpo HTML escapa o dado e traz cabeçalho e totais", () => {
    const html = renderizarCorpo(DOC);
    expect(html).toContain("Município de Campina Grande/PB");
    expect(html).toContain("RREO — Anexo 1");
    // ⚠️ escapado: `<censo>` e `&` não podem virar tag/entidade quebrada.
    expect(html).toContain("&lt;censo&gt; &amp; da tela");
    expect(html).not.toContain("<censo>");
    expect(html).toContain('class="total"'); // a linha de subtotal
  });

  it("o nome canônico é minúsculo, sem acento, com o período", () => {
    expect(nomeCanonico("RREO Anexo 1", "Exercício 2026 · 3º bimestre")).toBe("rreo-anexo-1-exercicio-2026-3-bimestre.pdf");
  });
});

describe("PDF — a impressão headless (Chromium)", () => {
  afterAll(async () => {
    await fecharBrowser();
  });

  it("gera um PDF de verdade: tamanho > 0, magic %PDF, e o hash bate com o do conteúdo", async () => {
    const geradoEm = new Date("2026-07-17T12:00:00Z");
    const r = await gerarPdfDoDemonstrativo(DOC, { nomeBase: "rreo-anexo1", geradoEm });

    expect(r.pdf.length).toBeGreaterThan(0);
    expect(Buffer.from(r.pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(r.hash).toBe(hashDoDocumento(DOC));
    expect(r.nomeArquivo).toBe("rreo-anexo1-exercicio-2026-3-bimestre.pdf");
  }, 60000);

  it("o hash é ESTÁVEL entre duas gerações do mesmo demonstrativo (os bytes variam com a hora; o hash não)", async () => {
    const a = await gerarPdfDoDemonstrativo(DOC, { nomeBase: "rreo-anexo1", geradoEm: new Date("2026-07-17T12:00:00Z") });
    const b = await gerarPdfDoDemonstrativo(DOC, { nomeBase: "rreo-anexo1", geradoEm: new Date("2026-08-01T09:30:00Z") });
    expect(a.hash).toBe(b.hash);
    expect(a.pdf.length).toBeGreaterThan(0);
    expect(b.pdf.length).toBeGreaterThan(0);
  }, 60000);
});
