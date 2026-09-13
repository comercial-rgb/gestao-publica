import { describe, expect, it } from "vitest";
import { svgCode128, textoCodificavelEmCode128 } from "./index.js";

/**
 * O DECODIFICADOR INDEPENDENTE DE CODE 128 — escrito da especificação (ISO/IEC 15417), não
 * da biblioteca. Lê as barras do SVG, reconstrói a sequência de módulos, casa cada símbolo
 * na tabela, confere START, STOP e o dígito verificador (mod 103), e devolve o texto. Se
 * qualquer parte da geração estiver fora do padrão — ou qualquer entrada desta tabela
 * estiver errada — o teste acusa.
 *
 * Instrumento nasce com a prova de que acusa: um módulo alterado no meio do código tem de
 * derrubar o decodificador (símbolo desconhecido ou verificador errado), e é o que t4 faz.
 */

/** As larguras (barra, espaço, barra, espaço, barra, espaço) dos 107 símbolos; o STOP tem 7. */
const TABELA: readonly string[] = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];
const START_A = 103;
const START_B = 104;
const START_C = 105;
const STOP = 106;

interface Barra {
  readonly x: number;
  readonly largura: number;
}

/** As barras do SVG do bwip-js: cada `<path stroke-width="w">` traz linhas verticais `M x y`. */
function barrasDoSvg(svg: string): readonly Barra[] {
  const barras: Barra[] = [];
  for (const m of svg.matchAll(/<path stroke="#000000" stroke-width="(\d+(?:\.\d+)?)" d="([^"]+)"/g)) {
    const largura = Number(m[1]);
    for (const x of m[2]!.matchAll(/M(\d+(?:\.\d+)?) /g)) barras.push({ x: Number(x[1]), largura });
  }
  return [...barras].sort((a, b) => a.x - b.x);
}

/** Barras e espaços em MÓDULOS (1 a 4), alternados, começando por barra. */
function modulos(barras: readonly Barra[]): readonly number[] {
  if (barras.length === 0) throw new Error("SVG sem barras.");
  const modulo = Math.min(...barras.map((b) => b.largura));
  const seq: number[] = [];
  for (let i = 0; i < barras.length; i++) {
    const b = barras[i]!;
    seq.push(Math.round(b.largura / modulo));
    const proxima = barras[i + 1];
    if (proxima !== undefined) {
      const fim = b.x + b.largura / 2;
      const inicio = proxima.x - proxima.largura / 2;
      seq.push(Math.round((inicio - fim) / modulo));
    }
  }
  return seq;
}

function simbolos(seq: readonly number[]): readonly number[] {
  const saida: number[] = [];
  let i = 0;
  while (i < seq.length) {
    const resto = seq.length - i;
    const tamanho = resto === 7 ? 7 : 6;
    const chave = seq.slice(i, i + tamanho).join("");
    const v = TABELA.indexOf(chave);
    if (v < 0) throw new Error(`Símbolo desconhecido na posição ${i}: ${chave}`);
    saida.push(v);
    i += tamanho;
  }
  return saida;
}

/** O decodificador: START, dados (A/B/C com trocas e SHIFT), verificador, STOP. */
export function decodificarCode128(svg: string): string {
  const s = simbolos(modulos(barrasDoSvg(svg)));
  const start = s[0];
  if (start !== START_A && start !== START_B && start !== START_C) throw new Error(`Sem START (primeiro símbolo ${start}).`);
  if (s[s.length - 1] !== STOP) throw new Error("Sem STOP.");
  const dados = s.slice(1, -2);
  const verificador = s[s.length - 2];
  let soma = start;
  dados.forEach((v, k) => {
    soma += v * (k + 1);
  });
  if (soma % 103 !== verificador) throw new Error(`Dígito verificador ${verificador} ≠ ${soma % 103}.`);

  let conjunto: "A" | "B" | "C" = start === START_A ? "A" : start === START_B ? "B" : "C";
  let shift: "A" | "B" | null = null;
  let texto = "";
  for (const v of dados) {
    const c: "A" | "B" | "C" = shift ?? conjunto;
    shift = null;
    if (c === "C") {
      if (v < 100) { texto += String(v).padStart(2, "0"); continue; }
      if (v === 100) { conjunto = "B"; continue; }
      if (v === 101) { conjunto = "A"; continue; }
      throw new Error(`Código ${v} inválido no conjunto C.`);
    }
    if (v === 99) { conjunto = "C"; continue; }
    if (v === 100) { conjunto = "B"; continue; }
    if (v === 101) { conjunto = "A"; continue; }
    if (v === 98) { shift = c === "A" ? "B" : "A"; continue; }
    if (v >= 102) throw new Error(`Código ${v} (FNC) não esperado numa etiqueta.`);
    if (c === "B") {
      if (v <= 95) { texto += String.fromCharCode(v + 32); continue; }
      throw new Error(`Código ${v} inválido no conjunto B.`);
    }
    if (v <= 63) { texto += String.fromCharCode(v + 32); continue; }
    if (v <= 95) { texto += String.fromCharCode(v - 64); continue; }
    throw new Error(`Código ${v} inválido no conjunto A.`);
  }
  return texto;
}

describe("Code 128 — gerado pela biblioteca, lido por decodificador próprio", () => {
  it("t1: tombamentos reais voltam idênticos (N=2, com letras, hífen e dígitos)", () => {
    for (const texto of ["TOMB-0001", "PAT-2026-000123"]) {
      expect(decodificarCode128(svgCode128(texto))).toBe(texto);
    }
  });

  it("t2: sequência longa de dígitos (o gerador troca para o conjunto C) e texto curto (conjunto B) — os dois decodificam", () => {
    expect(decodificarCode128(svgCode128("1234567890"))).toBe("1234567890");
    expect(decodificarCode128(svgCode128("A1"))).toBe("A1");
    expect(decodificarCode128(svgCode128("Sala 101/B"))).toBe("Sala 101/B");
  });

  it("t3: fora do ASCII imprimível ou vazio, RECUSA nomeando — nada é 'limpo' em silêncio", () => {
    expect(textoCodificavelEmCode128("Móvel-01")).toBe(false);
    expect(textoCodificavelEmCode128("")).toBe(false);
    expect(textoCodificavelEmCode128("TOMB-0001")).toBe(true);
    expect(() => svgCode128("Móvel-01")).toThrow(/CÓDIGO NÃO CODIFICÁVEL[\s\S]*Móvel-01/);
    expect(() => svgCode128("")).toThrow(/CÓDIGO NÃO CODIFICÁVEL/);
  });

  it("t4: o decodificador ACUSA — uma barra alargada no meio derruba a leitura (símbolo desconhecido ou verificador)", () => {
    const svg = svgCode128("TOMB-0001");
    // Muta a primeira barra de 1 módulo do código (stroke-width 2 → 4): ela passa a ocupar o
    // espaço dos vizinhos, e o símbolo deixa de existir na tabela. A altura (y) vem do SVG.
    const alvo = /<path stroke="#000000" stroke-width="2" d="M(\d+) (\d+)L\1 0/.exec(svg);
    expect(alvo).not.toBeNull();
    const x = alvo![1]!;
    const y = alvo![2]!;
    const mutado = svg
      .replace(`M${x} ${y}L${x} 0`, "")
      .replace(/(<path stroke="#000000" stroke-width="4" d=")/, `$1M${x} ${y}L${x} 0`);
    expect(mutado).not.toBe(svg);
    expect(() => decodificarCode128(mutado)).toThrow(/Símbolo desconhecido|verificador|START|STOP/);
    // ...e o original continua lendo — a mutação foi no dado, não no leitor.
    expect(decodificarCode128(svg)).toBe("TOMB-0001");
  });
});
