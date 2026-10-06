import { describe, expect, it } from "vitest";
import { textoDoArquivoOfx } from "../../lib/portas/conciliacao";

/**
 * V36 — O OFX decodificado pelo charset do cabeçalho. Bytes construídos à mão (implementação independente do
 * decodificador): "PAGTO SERVIÇO" com o "Ç" em Windows-1252 (0xC7) e em UTF-8 (0xC3 0x87).
 */
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

describe("texto do arquivo OFX", () => {
  it("CHARSET:1252 — o Ç de 1 byte vira Ç, não '?'", () => {
    const bytes = new Uint8Array([...ascii("OFXHEADER:100\nCHARSET:1252\n\n<MEMO>PAGTO SERVI"), 0xc7, ...ascii("O")]);
    expect(textoDoArquivoOfx(bytes).endsWith("<MEMO>PAGTO SERVIÇO")).toBe(true);
  });
  it("sem charset declarado — UTF-8", () => {
    const bytes = new Uint8Array([...ascii("<OFX>\n<MEMO>PAGTO SERVI"), 0xc3, 0x87, ...ascii("O")]);
    expect(textoDoArquivoOfx(bytes).endsWith("<MEMO>PAGTO SERVIÇO")).toBe(true);
  });
});
