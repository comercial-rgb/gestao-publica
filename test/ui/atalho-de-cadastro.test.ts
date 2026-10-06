import { describe, expect, it } from "vitest";
import { CADASTRO_DE_CREDOR, linkDeCadastro, voltaComCredor } from "../../lib/atalho-de-cadastro.js";
import { retornoSeguro } from "../../lib/retorno-seguro.js";

/**
 * V37 — O ATALHO "CADASTRAR A PARTIR DO AVISO": o link que a tela monta e o caminho de volta que a
 * tela de cadastro aceita. O retorno é o ponto de risco: um parâmetro de URL que vira redirecionamento.
 */
describe("o link do atalho de cadastro", () => {
  it("leva o documento só quando o texto É documento — CPF e CNPJ, com ou sem máscara", () => {
    const cpf = new URL(linkDeCadastro(CADASTRO_DE_CREDOR, "418.273.659-19", "/despesa/empenhos?exercicio=2026"), "http://x");
    expect(cpf.pathname).toBe("/cadastros/pessoas/nova");
    expect(cpf.searchParams.get("papel")).toBe("CREDOR");
    expect(cpf.searchParams.get("documento")).toBe("41827365919");
    expect(cpf.searchParams.get("retorno")).toBe("/despesa/empenhos?exercicio=2026");

    const cnpj = new URL(linkDeCadastro(CADASTRO_DE_CREDOR, "11.222.333/0001-81", "/despesa/solicitacoes-de-empenho"), "http://x");
    expect(cnpj.searchParams.get("documento")).toBe("11222333000181");
  });

  it("nome, pedaço de número ou texto misturado não preenchem o documento — mas o atalho continua com a volta", () => {
    for (const t of ["Maria da Silva", "4182736", "CPF 41827365919", ""]) {
      const u = new URL(linkDeCadastro(CADASTRO_DE_CREDOR, t, "/despesa/empenhos"), "http://x");
      expect(u.searchParams.has("documento"), t).toBe(false);
      expect(u.searchParams.get("retorno")).toBe("/despesa/empenhos");
    }
  });
});

describe("o caminho de volta aceito pela tela de cadastro", () => {
  it("caminho interno passa como veio, com a consulta", () => {
    expect(retornoSeguro("/despesa/empenhos?exercicio=2026&ug=01", "/padrao")).toBe("/despesa/empenhos?exercicio=2026&ug=01");
    expect(retornoSeguro("/despesa/solicitacoes-de-empenho", "/padrao")).toBe("/despesa/solicitacoes-de-empenho");
  });

  it("⚠️ NEGAÇÃO — endereço externo, protocolo, barra dupla ou invertida e quebra de linha voltam ao padrão", () => {
    for (const ruim of ["https://golpe.example/x", "//golpe.example/x", "/\\golpe.example", "javascript:alert(1)", "despesa/empenhos", "/x\r\nLocation: //golpe", "/\t/golpe.example", "/\u0000/golpe.example", "/\u001f/golpe.example", "", undefined]) {
      expect(retornoSeguro(ruim, "/cadastros/pessoas"), String(ruim)).toBe("/cadastros/pessoas");
    }
  });
});

describe("a volta com o credor escolhido", () => {
  it("N=2 — com e sem consulta na origem; o credor anterior é trocado, não duplicado; a âncora fica", () => {
    expect(voltaComCredor("/despesa/empenhos", "41827365919")).toBe("/despesa/empenhos?credor=41827365919");
    expect(voltaComCredor("/despesa/empenhos?exercicio=2026&ug=01", "11222333000181")).toBe(
      "/despesa/empenhos?exercicio=2026&ug=01&credor=11222333000181"
    );
    expect(voltaComCredor("/despesa/empenhos?credor=1&exercicio=2026", "41827365919")).toBe("/despesa/empenhos?credor=41827365919&exercicio=2026");
    expect(voltaComCredor("/despesa/solicitacoes-de-empenho?exercicio=2026#nova", "41827365919")).toBe(
      "/despesa/solicitacoes-de-empenho?exercicio=2026&credor=41827365919#nova"
    );
  });
});
