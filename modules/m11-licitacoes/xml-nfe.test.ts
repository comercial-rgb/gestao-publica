import { describe, expect, it } from "vitest";
import { extrairNfe, recusarXmlInseguro } from "./xml-nfe.js";

const NFE_MINIMA = `<?xml version="1.0"?>
<NFe>
  <infNFe Id="NFe35260214200166000187550010000000011234567890">
    <ide><mod>55</mod><serie>1</serie><nNF>100</nNF><dhEmi>2026-03-01T12:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000181</CNPJ></emit>
    <dest><CNPJ>00000000000191</CNPJ></dest>
    <det nItem="1"><prod><cProd>A</cProd><xProd>Papel</xProd><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>11.000000</vUnCom><vProd>110.00</vProd></prod></det>
    <det nItem="2"><prod><cProd>B</cProd><xProd>Toner</xProd><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.000000</vUnCom><vProd>100.00</vProd></prod></det>
    <ICMSTot><vProd>210.00</vProd><vDesc>0.00</vDesc><vNF>210.00</vNF></ICMSTot>
  </infNFe>
</NFe>`;

describe("extrator constrito de NF-e", () => {
  it("recusa DTD, ENTITY e SYSTEM antes de ler tags", () => {
    expect(recusarXmlInseguro(`<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><a/>`)).toMatch(/DTD|entidade|externa/);
    expect(recusarXmlInseguro(`<a SYSTEM "http://evil">`)).toMatch(/externa/);
    expect(() => extrairNfe(`<!DOCTYPE nfe><NFe><mod>55</mod></NFe>`)).toThrow(/DTD|entidade|externa/);
  });

  it("recusa o que não começa com '<' — a conferência é do conteúdo", () => {
    expect(recusarXmlInseguro("nota.pdf")).toMatch(/não é XML/);
  });

  it("extrai modelo 55, dois itens e totais de ICMSTot", () => {
    const n = extrairNfe(NFE_MINIMA);
    expect(n.modelo).toBe("NFE");
    expect(n.numero).toBe("100");
    expect(n.serie).toBe("1");
    expect(n.emitenteCnpj).toBe("11222333000181");
    expect(n.itens).toHaveLength(2);
    expect(n.valorTotal).toBe("210.00");
    expect(n.chaveAcesso).toBe("35260214200166000187550010000000011234567890");
  });

  it("recusa modelo que não é 55 nem 65", () => {
    expect(() => extrairNfe(`<NFe><ide><mod>57</mod><nNF>1</nNF></ide></NFe>`)).toThrow(/não é NF-e/);
  });
});
