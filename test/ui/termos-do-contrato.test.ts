import { afterAll, describe, expect, it } from "vitest";
import { hashDoDocumento } from "../../lib/pdf/documento.js";
import { documentoDoManifesto } from "../../lib/pdf/termos-do-contrato.js";
import { manifestoCanonico } from "../../modules/m11-licitacoes/ordem-de-servico.js";

const { fecharBrowser, gerarPdfDoDemonstrativo } = await import("../../lib/pdf/gerar.js");

/**
 * ═══ OS DOCUMENTOS DA EXECUÇÃO EM PDF (V7 M2 U4 — DO01, DO02) ═══
 *
 * DO01 — um termo definitivo com 60 itens, descrição longa e acentos: o PDF tem mais de uma página, o texto completo
 *        (título, descrição acentuada, último item, total) está nele, e o total impresso é o do manifesto — que aqui é
 *        conferido contra uma soma INDEPENDENTE (centavos inteiros), não pelo mesmo calculador.
 * DO02 — a segunda via: o mesmo manifesto dá o mesmo documento e o mesmo hash de conteúdo; o nome do ente é o do
 *        manifesto (congelado na emissão), não o do cadastro atual.
 */

afterAll(async () => { await fecharBrowser(); });

async function textoDoPdf(bytes: Uint8Array): Promise<{ readonly paginas: number; readonly texto: string }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i += 1) texto += ` ${(await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ")}`;
  return { paginas: pdf.numPages, texto: texto.replace(/\s+/g, " ") };
}

const DESCRICAO_LONGA = "Manutenção preventiva e corretiva de equipamentos de climatização nas unidades básicas de saúde — inspeção, limpeza de serpentinas, substituição de filtros e verificação elétrica conforme o plano de manutenção, operação e controle";

function termoCom60Itens() {
  const itens = Array.from({ length: 60 }, (_, k) => {
    const quantidade = (k % 7) + 1;
    const unitario = 37 + k;
    return { item: k + 1, descricao: `${DESCRICAO_LONGA} (lote ${k + 1})`, unidade: "visita", quantidade: `${quantidade}.0000`, valorUnitario: `${unitario}.0000`, valor: `${quantidade * unitario}.00` };
  });
  // O total ESPERADO, somado em centavos inteiros — independente do domínio.
  const totalCentavos = itens.reduce((t, i) => t + Number(i.valor.replace(".", "")), 0);
  const total = `${Math.floor(totalCentavos / 100)}.${String(totalCentavos % 100).padStart(2, "0")}`;
  const bruto = {
    documento: "TERMO_DE_RECEBIMENTO_DEFINITIVO", ente: "Município de São João do Açaí — PB (sintético)", fundamento: "Lei 14.133/2021, art. 140, I, b",
    contrato: { numero: "CT-2026/0042", contratado: "Climatização Ação & Cia. Ltda. (sintética)", documentoDoContratado: "12345678000195" },
    ordem: { numero: 3, ano: 2026 }, medicao: { numero: 2, periodo: { inicio: "2026-08-01", fim: "2026-08-31" } }, recebimento: 1, data: "2026-09-10",
    responsavel: { nome: "Conceição Araújo", ato: "Portaria nº 123/2026", papel: "RECEBEDOR_DEFINITIVO" },
    conclusao: "Serviços executados conforme relatórios assinados e verificação in loco.", itens, valor: total, pendencias: ["item 7: 1 visita em controvérsia aguardando decisão"],
  };
  return { ...manifestoCanonico(bruto), totalEsperado: total, totalCentavos };
}

describe("termo de recebimento definitivo em PDF", () => {
  it("DO01: 60 itens com descrição longa e acentos — várias páginas, texto completo e o total independente", async () => {
    const t = termoCom60Itens();
    const doc = documentoDoManifesto("definitivo", t.manifesto, t.sha256);
    const r = await gerarPdfDoDemonstrativo(doc, { nomeBase: "termo-definitivo", geradoEm: new Date("2026-09-15T12:00:00Z") });
    const { paginas, texto } = await textoDoPdf(r.pdf);
    expect(paginas).toBeGreaterThan(1);
    expect(texto).toContain("TERMO DE RECEBIMENTO DEFINITIVO");
    expect(texto).toContain("Município de São João do Açaí");
    expect(texto).toContain("Manutenção preventiva e corretiva de equipamentos de climatização");
    expect(texto).toContain("(lote 60)");
    expect(texto).toContain("Conceição Araújo");
    expect(texto).toContain("item 7: 1 visita em controvérsia aguardando decisão");
    const esperadoBr = `R$ ${t.totalEsperado.split(".")[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${t.totalEsperado.split(".")[1]}`;
    expect(texto).toContain("Total recebido");
    expect(texto).toContain(esperadoBr);
    expect(texto).toContain(t.sha256);
    expect(texto).toMatch(/Página \d+ de \d+/);
    // Nada fabricado: nenhuma linha digitável ou código de barras.
    expect(/\d{44,48}/.test(texto.replace(/[ .]/g, ""))).toBe(false);
  }, 120_000);

  it("DO02: a segunda via é o mesmo documento, com o mesmo hash de conteúdo — o ente é o do manifesto", () => {
    const t = termoCom60Itens();
    const primeira = documentoDoManifesto("definitivo", t.manifesto, t.sha256);
    const segunda = documentoDoManifesto("definitivo", JSON.parse(JSON.stringify(t.manifesto)), t.sha256);
    expect(hashDoDocumento(segunda)).toBe(hashDoDocumento(primeira));
    expect(segunda.ente).toBe("Município de São João do Açaí — PB (sintético)");
    // Um manifesto diferente (outro valor) muda o hash — o hash não é constante.
    const alterado = manifestoCanonico({ ...(t.manifesto as object), valor: "1.00" });
    expect(hashDoDocumento(documentoDoManifesto("definitivo", alterado.manifesto, alterado.sha256))).not.toBe(hashDoDocumento(primeira));
  });
});

/**
 * V7 M2 U7 — A MEMÓRIA DA MEDIÇÃO PELA PLANILHA em PDF: 70 serviços com descrição longa e acentos — várias páginas, o
 * último serviço presente, os DOIS totais (no contrato e na planilha) conferidos contra somas INDEPENDENTES em centavos
 * inteiros, a versão da planilha e a referência de preços impressas; e a segunda via idêntica.
 */
function memoriaCom70Servicos() {
  const itens = Array.from({ length: 70 }, (_, k) => {
    const q = (k % 5) + 1;
    const unitContrato = 100 + k; // centavos inteiros: (100 + k) reais
    const precoPlanilha = 90 + k;
    return {
      codigo: `2.${k + 1}`, descricao: `${DESCRICAO_LONGA} (serviço ${k + 1})`, unidade: "visita",
      previstoNaVersao: "10.0000", anteriorNaObra: "0.0000", atual: `${q}.0000`, acumulado: `${q}.0000`, saldoNaPlanilha: `${10 - q}.0000`,
      precoDaPlanilha: `${precoPlanilha}.0000`, valorNaPlanilha: `${q * precoPlanilha}.00`,
      itemDoContrato: { numero: k + 1, descricao: `Item contratual ${k + 1}`, unidade: "visita" }, vinculo: { motivo: "Correspondência conferida pela engenharia" },
      autorizadoNaOrdem: "10.0000", anteriorNaOrdem: "0.0000", aExecutarNaOrdem: `${10 - q}.0000`, unitarioDoContrato: `${unitContrato}.0000`, valorNoContrato: `${q * unitContrato}.00`,
    };
  });
  const centavos = (campo: "valorNoContrato" | "valorNaPlanilha") => itens.reduce((t, i) => t + Number(i[campo].replace(".", "")), 0);
  const fmt = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  const totalContrato = fmt(centavos("valorNoContrato"));
  const totalPlanilha = fmt(centavos("valorNaPlanilha"));
  const bruto = {
    documento: "MEMORIA_DA_MEDICAO", ente: "Município de São João do Açaí — PB (sintético)",
    contrato: { numero: "CT-2026/0077", contratado: "Construções Ação & Cia. Ltda. (sintética)", documentoDoContratado: "12345678000195" },
    ordem: { numero: 4, ano: 2026, finalidade: "Reforma da unidade básica de saúde" }, obra: { identificador: "OBRA-2026-003", descricao: "Reforma da UBS Conceição" },
    planilha: { versao: 2, descricao: "Orçamento revisado", vigenciaInicio: "2026-08-01", dataBaseDosPrecos: "2026-06-01", referenciaDePrecos: "Tabela sintética de orçamento, 06/2026", sha256: "a".repeat(64) },
    medicao: { numero: 3, periodo: { inicio: "2026-08-01", fim: "2026-08-31" }, registradaEm: "2026-09-02" },
    responsavel: { nome: "Conceição Araújo", ato: "Portaria nº 321/2026", papel: "FISCAL" }, observacao: null,
    itens, totais: { contrato: totalContrato, planilha: totalPlanilha }, arredondamento: "valor por linha arredondado uma vez aos centavos", evidencias: [{ nome: "relatório-de-campo.pdf", sha256: "b".repeat(64) }],
  };
  return { ...manifestoCanonico(bruto), totalContrato, totalPlanilha };
}

const emReais = (v: string): string => `R$ ${v.split(".")[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${v.split(".")[1]}`;

describe("memória da medição pela planilha em PDF", () => {
  it("DO01 (memória): 70 serviços — várias páginas, último serviço, os dois totais independentes, versão e referência de preços", async () => {
    const t = memoriaCom70Servicos();
    const doc = documentoDoManifesto("memoria", t.manifesto, t.sha256);
    const r = await gerarPdfDoDemonstrativo(doc, { nomeBase: "memoria-da-medicao", geradoEm: new Date("2026-09-15T12:00:00Z") });
    const { paginas, texto } = await textoDoPdf(r.pdf);
    expect(paginas).toBeGreaterThan(1);
    expect(texto).toContain("MEMÓRIA DA MEDIÇÃO Nº 3 DA ORDEM DE SERVIÇO Nº 4/2026");
    expect(texto).toContain("(serviço 70)");
    expect(texto).toContain("versão 2 — Orçamento revisado");
    expect(texto).toContain("Tabela sintética de orçamento, 06/2026");
    expect(texto).toContain("relatório-de-campo.pdf");
    expect(texto).toContain(emReais(t.totalContrato));
    expect(texto).toContain(emReais(t.totalPlanilha));
    expect(t.totalContrato).not.toBe(t.totalPlanilha);
    expect(texto).toContain(t.sha256);
    expect(texto).toMatch(/Página \d+ de \d+/);
  }, 120_000);

  it("DO02 (memória): a segunda via é o mesmo documento; outra memória muda o hash", () => {
    const t = memoriaCom70Servicos();
    const primeira = documentoDoManifesto("memoria", t.manifesto, t.sha256);
    expect(hashDoDocumento(documentoDoManifesto("memoria", JSON.parse(JSON.stringify(t.manifesto)), t.sha256))).toBe(hashDoDocumento(primeira));
    const alterado = manifestoCanonico({ ...(t.manifesto as object), totais: { contrato: "1.00", planilha: "1.00" } });
    expect(hashDoDocumento(documentoDoManifesto("memoria", alterado.manifesto, alterado.sha256))).not.toBe(hashDoDocumento(primeira));
  });
});
