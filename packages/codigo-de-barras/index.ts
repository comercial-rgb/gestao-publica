import bwipjs from "bwip-js/node";

/**
 * CÓDIGO DE BARRAS — Code 128 em SVG (orquestração V3, pacote 2, unidade 5; TR 5.19.2).
 *
 * ═══ POR QUE UMA BIBLIOTECA, E POR QUE ESTA ═══
 * `bwip-js` é a versão JavaScript do BWIPP (Barcode Writer in Pure PostScript), o gerador
 * de referência usado por impressoras e leitores há vinte anos. O SVG sai como linhas
 * verticais com `stroke-width` em múltiplos do módulo — o que permite que o TESTE leia as
 * barras de volta com um DECODIFICADOR PRÓPRIO (`codigo-de-barras.test.ts`), escrito da
 * especificação, e não com a mesma biblioteca. Parser se testa contra implementação
 * independente: se a tabela de símbolos do decodificador estiver errada, o teste acusa;
 * se a biblioteca gerar um símbolo fora do padrão, o teste acusa.
 *
 * ⚠️ CODE 128 SÓ CODIFICA ASCII (32–127). Um tombamento com acento NÃO é silenciosamente
 * "limpo": a etiqueta colada no armário tem de dizer exatamente o que o cadastro diz, e
 * o leitor devolver exatamente o que está impresso. Fora do alfabeto, recusa nomeando.
 */

export const ALTURA_PADRAO_MM = 10;

export function textoCodificavelEmCode128(texto: string): boolean {
  return texto.length > 0 && /^[\x20-\x7e]+$/.test(texto);
}

export function svgCode128(texto: string, opcoes?: { readonly alturaMm?: number; readonly comTexto?: boolean }): string {
  if (!textoCodificavelEmCode128(texto)) {
    throw new Error(
      `CÓDIGO NÃO CODIFICÁVEL: "${texto}" tem caractere fora do ASCII imprimível (letras acentuadas, ` +
        `símbolos) ou está vazio. O Code 128 só codifica ASCII 32–127; a etiqueta precisa dizer ` +
        `exatamente o que o cadastro diz. Nada foi gerado.`
    );
  }
  return bwipjs.toSVG({
    bcid: "code128",
    text: texto,
    height: opcoes?.alturaMm ?? ALTURA_PADRAO_MM,
    includetext: opcoes?.comTexto ?? true,
    textxalign: "center",
    textsize: 8,
  });
}
