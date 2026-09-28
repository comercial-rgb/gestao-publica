import { describe, expect, it } from "vitest";
import { lerEntradasDoZip } from "../zip/index.js";
import { gerarXlsx, letraDaColuna } from "./escrever-xlsx.js";
import { indiceDaColuna, lerPlanilha } from "./index.js";

/**
 * ⚠️ O ESCRITOR SE CONFERE CONTRA UM LEITOR QUE NÃO É ELE. `lerPlanilha` foi escrito antes, para
 * a importação do TCE, sem saber deste arquivo; se o escritor gravar a célula no lugar errado ou
 * o texto mal escapado, é esse leitor quem acusa. Conferir o XML com as regex do próprio escritor
 * passaria com qualquer erro consistente.
 */
describe("gerarXlsx", () => {
  const pasta = gerarXlsx({
    aba: "Empenhos 2026",
    cabecalho: ["Nº", "Credor", "Empenhado"],
    linhas: [
      [{ texto: "2026NE000001" }, { texto: "Papelaria & Cia <Ltda> \"centro\"" }, { moeda: "10000.00" }],
      [{ texto: "2026NE000002" }, { texto: "=HYPERLINK(\"x\")" }, { moeda: "-15.30" }],
    ],
  });

  it("o leitor independente lê de volta cada célula, na coluna e na linha certas (N=2)", () => {
    const aba = lerPlanilha(pasta).get("Empenhos 2026");
    expect(aba).toEqual([
      ["Nº", "Credor", "Empenhado"],
      ["2026NE000001", "Papelaria & Cia <Ltda> \"centro\"", "10000.00"],
      ["2026NE000002", "=HYPERLINK(\"x\")", "-15.30"],
    ]);
  });

  it("dinheiro vai como número com formato de milhar — e a fórmula digitada NÃO vira fórmula", () => {
    const xml = lerEntradasDoZip(pasta).get("xl/worksheets/sheet1.xml")!.toString("utf8");
    expect(xml).toContain('<c r="C2" s="2"><v>10000.00</v></c>');
    expect(xml).not.toContain("<f>");
    const estilos = lerEntradasDoZip(pasta).get("xl/styles.xml")!.toString("utf8");
    expect(estilos).toContain('numFmtId="4"');
  });

  it("todo XML do pacote é bem formado — o leitor tolerante aceitaria '&' cru, o Excel não", () => {
    // ⚠️ PROPRIEDADE, NÃO PADRÃO: nenhum '&' fora de entidade e nenhum '<' dentro de texto, em QUALQUER parte.
    for (const [nome, conteudo] of lerEntradasDoZip(pasta)) {
      const xml = conteudo.toString("utf8");
      expect(xml, nome).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#d+;)/);
      expect(xml.replace(/<[^<>]*>/g, ""), nome).not.toMatch(/[<>]/);
    }
  });

  it("recusa valor que não é decimal, nomeando a célula — '10.000,00' no <v> corromperia o arquivo", () => {
    expect(() => gerarXlsx({ aba: "x", cabecalho: ["v"], linhas: [[{ moeda: "10.000,00" }]] })).toThrow(/Célula A2: "10.000,00" não é um valor decimal/);
  });

  it("recusa linha com largura diferente do cabeçalho, dizendo qual", () => {
    expect(() => gerarXlsx({ aba: "x", cabecalho: ["a", "b"], linhas: [[{ texto: "1" }]] })).toThrow(/Linha 2: 1 células para 2 colunas/);
  });

  it("letraDaColuna é o inverso de indiceDaColuna do leitor, inclusive depois do Z", () => {
    for (const i of [0, 1, 25, 26, 27, 51, 52, 701, 702]) expect(indiceDaColuna(letraDaColuna(i))).toBe(i);
  });

  it("o mesmo conteúdo gera os mesmos bytes", () => {
    const outra = gerarXlsx({
      aba: "Empenhos 2026",
      cabecalho: ["Nº", "Credor", "Empenhado"],
      linhas: [
        [{ texto: "2026NE000001" }, { texto: "Papelaria & Cia <Ltda> \"centro\"" }, { moeda: "10000.00" }],
        [{ texto: "2026NE000002" }, { texto: "=HYPERLINK(\"x\")" }, { moeda: "-15.30" }],
      ],
    });
    expect(outra.equals(pasta)).toBe(true);
  });
});
