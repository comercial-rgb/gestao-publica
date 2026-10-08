import { describe, expect, it } from "vitest";
import { codigosQueCasam, type CodigoReduzidoNaLista } from "../../modules/m02b-plurianual/codigo-reduzido.js";

/**
 * V36 — A BUSCA DOS CÓDIGOS REDUZIDOS: o número é exato ("12" não traz a função 12 nem o programa 0012); o resto é termo
 * na classificação ou nos nomes, sem caixa nem acento, vários termos restringindo. N=2 em cada lado.
 */
const c = (numero: number, classificacao: string, acao: string, programa = "0012 — Educação de qualidade"): CodigoReduzidoNaLista => ({
  numero, classificacao, unidade: "02001 — Secretaria de Educação", funcao: "12 — Educação", subfuncao: "361 — Ensino fundamental", programa, acao,
});
const LISTA = [
  c(1, "02.02001.12.361.0012.2001", "2001 — Manutenção do ensino"),
  c(2, "02.02001.12.361.0012.1001", "1001 — Construção de escola"),
  c(12, "03.03001.10.301.0020.2010", "2010 — Atenção básica à saúde", "0020 — Saúde em dia"),
];

describe("busca dos códigos reduzidos", () => {
  it("o número é exato", () => {
    expect(codigosQueCasam(LISTA, "12").map((x) => x.numero)).toEqual([12]);
    expect(codigosQueCasam(LISTA, "1").map((x) => x.numero)).toEqual([1]);
    expect(codigosQueCasam(LISTA, "99")).toEqual([]);
  });
  it("com zero à esquerda, ponto ou letra é termo: classificação e nomes, sem acento, vários termos restringem", () => {
    expect(codigosQueCasam(LISTA, "0012").map((x) => x.numero)).toEqual([1, 2]);
    expect(codigosQueCasam(LISTA, "0012.2001").map((x) => x.numero)).toEqual([1]);
    expect(codigosQueCasam(LISTA, "construcao").map((x) => x.numero)).toEqual([2]);
    expect(codigosQueCasam(LISTA, "SAÚDE atencao").map((x) => x.numero)).toEqual([12]);
    expect(codigosQueCasam(LISTA, "").length).toBe(3);
  });
});
