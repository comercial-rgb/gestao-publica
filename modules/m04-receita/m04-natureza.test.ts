import { describe, expect, it } from "vitest";
import {
  ORIGEM_RECEITA,
  TIPOS_QUE_QUITAM_DIVIDA_ATIVA,
  TIPO_RECEITA,
  ehIntraorcamentaria,
  origemDaNatureza,
  parsearNaturezaReceita,
  tipoDaNatureza,
} from "./natureza.js";

/**
 * M04 — CLASSIFICADORES DA NATUREZA DA RECEITA (MTO / Portaria 163/2001).
 *
 * ⚠️ TODOS OS CÓDIGOS DECOMPOSTOS À MÃO, ANTES DO CÓDIGO.
 *
 *   posição:   1   2   3   4 5 6 7   8
 *              cat org esp  desdobr  tipo
 *
 *   11180111  ->  1 · 1 · 1 · 8011 · 1   corrente · IMPOSTOS...     · PRINCIPAL
 *   21180111  ->  2 · 1 · 1 · 8011 · 1   capital  · OPER. DE CRÉDITO · PRINCIPAL
 *   72180111  ->  7 · 2 · 1 · 8011 · 1   INTRA cor· CONTRIBUICOES    · PRINCIPAL
 *   82180111  ->  8 · 2 · 1 · 8011 · 1   INTRA cap· ALIENACAO_DE_BENS· PRINCIPAL
 *   11180113  ->  1 · 1 · 1 · 8011 · 3   corrente · IMPOSTOS...     · DÍVIDA ATIVA
 *
 * ⚠️ O MESMO 2º DÍGITO, DUAS RECEITAS DIFERENTES: "1" é IMPOSTOS quando a categoria
 * é corrente e OPERAÇÕES DE CRÉDITO quando é de capital. É a razão de a chave do
 * Record ser `${categoria}${dígito}` — um Record indexado pelo dígito solto diria
 * que a 2.1 é imposto, e o guard da dívida (TR 4.64) engoliria o IPTU.
 *
 * REJEITAM:
 *   18180111  origem 8 não existe na categoria CORRENTE (rol: 1-7, 9)
 *   25180111  origem 5 não existe na categoria de CAPITAL (rol: 1-4, 9)
 *   11180117  tipo 7 está RESERVADO (o rol vigente é 0-4)
 */

describe("M04 — parsearNaturezaReceita (t1)", () => {
  it("decompõe corrente, capital e as duas INTRA", () => {
    const iptu = parsearNaturezaReceita("11180111");
    expect(iptu.categoria).toBe("1");
    expect(iptu.origem).toBe("IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA");
    expect(iptu.especie).toBe("1");
    expect(iptu.desdobramento).toBe("8011");
    expect(iptu.tipo).toBe("PRINCIPAL");
    expect(iptu.intraorcamentaria).toBe(false);

    const opCredito = parsearNaturezaReceita("21180111");
    expect(opCredito.categoria).toBe("2");
    expect(opCredito.origem).toBe("OPERACOES_DE_CREDITO");
    expect(opCredito.intraorcamentaria).toBe(false);

    // 7 = corrente INTRA: o rol de origens é o DA 1 (Portaria 338/2006 — a intra é
    // especificação da mesma categoria, não categoria nova).
    const intraCorrente = parsearNaturezaReceita("72180111");
    expect(intraCorrente.categoria).toBe("7");
    expect(intraCorrente.origem).toBe("CONTRIBUICOES");
    expect(intraCorrente.intraorcamentaria).toBe(true);

    // 8 = capital INTRA: o rol de origens é o DA 2.
    const intraCapital = parsearNaturezaReceita("82180111");
    expect(intraCapital.categoria).toBe("8");
    expect(intraCapital.origem).toBe("ALIENACAO_DE_BENS");
    expect(intraCapital.intraorcamentaria).toBe(true);

    expect(ehIntraorcamentaria("11180111")).toBe(false);
    expect(ehIntraorcamentaria("82180111")).toBe(true);
  });

  it("o MESMO dígito de origem classifica diferente conforme a categoria", () => {
    expect(origemDaNatureza("11180111")).toBe(
      "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA"
    );
    expect(origemDaNatureza("21180111")).toBe("OPERACOES_DE_CREDITO");
  });

  it("o TIPO é o 8º dígito — e é ele que separa o tributo da dívida ativa", () => {
    expect(tipoDaNatureza("11180111")).toBe("PRINCIPAL");
    expect(tipoDaNatureza("11180113")).toBe("DIVIDA_ATIVA");
    expect(tipoDaNatureza("11180114")).toBe(
      "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA"
    );
    expect(tipoDaNatureza("11180110")).toBe("NAO_VALORIZAVEL_AGREGADORA");
  });

  it("origem fora do rol DA PRÓPRIA CATEGORIA rejeita, nomeando o rol", () => {
    // 1.8 não existe: o rol das correntes é 1-7 e 9.
    expect(() => parsearNaturezaReceita("18180111")).toThrow(
      /origem "8" não existe na categoria 1/
    );
    expect(() => parsearNaturezaReceita("18180111")).toThrow(
      /rol dela é \{1, 2, 3, 4, 5, 6, 7, 9\}/
    );
    // 2.5 não existe: o rol das de capital é 1-4 e 9.
    expect(() => parsearNaturezaReceita("25180111")).toThrow(
      /origem "5" não existe na categoria 2/
    );
    expect(() => parsearNaturezaReceita("25180111")).toThrow(
      /rol dela é \{1, 2, 3, 4, 9\}/
    );
    // ...e a 2.5 rejeita mesmo que o dígito 5 EXISTA nas correntes (receita
    // industrial). É a prova de que a chave é composta.
    expect(parsearNaturezaReceita("15180111").origem).toBe("RECEITA_INDUSTRIAL");
  });

  it("tipo RESERVADO (5-9) rejeita apontando a reserva", () => {
    expect(() => parsearNaturezaReceita("11180117")).toThrow(
      /tipo "7" \(8º dígito\) está RESERVADO/
    );
    expect(() => parsearNaturezaReceita("11180119")).toThrow(/RESERVADO/);
  });

  it("forma: 8 dígitos, e nada além disso", () => {
    expect(() => parsearNaturezaReceita("1118011")).toThrow(/8 DÍGITOS/);
    expect(() => parsearNaturezaReceita("111801111")).toThrow(/8 DÍGITOS/);
    expect(() => parsearNaturezaReceita("1.1.1.8.01.1.1")).toThrow(/8 DÍGITOS/);
    expect(() => parsearNaturezaReceita("")).toThrow(/8 DÍGITOS/);
    // Categoria fora do rol: 3 não é categoria econômica de receita.
    expect(() => parsearNaturezaReceita("31180111")).toThrow(
      /não é categoria econômica conhecida/
    );
  });
});

describe("M04 — cardinalidade dos Records (t2)", () => {
  it("ORIGEM_RECEITA cobre EXATAMENTE 13 combinações: 8 correntes + 5 de capital", () => {
    const chaves = Object.keys(ORIGEM_RECEITA);
    expect(chaves).toHaveLength(13);

    const correntes = chaves.filter((k) => k.startsWith("1"));
    const capital = chaves.filter((k) => k.startsWith("2"));
    expect(correntes).toHaveLength(8);
    expect(capital).toHaveLength(5);

    // ⚠️ 13, e NÃO 26: as intra (7 e 8) reusam o rol da 1 e da 2. Duplicá-las
    // criaria duas verdades sobre o mesmo dígito.
    expect(chaves.sort()).toEqual([
      "11", "12", "13", "14", "15", "16", "17", "19",
      "21", "22", "23", "24", "29",
    ]);

    // Nenhum valor de origem repetido — 13 chaves, 13 origens distintas.
    expect(new Set(Object.values(ORIGEM_RECEITA)).size).toBe(13);
  });

  it("TIPO_RECEITA cobre 0 a 4, e só", () => {
    expect(Object.keys(TIPO_RECEITA).sort()).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("TIPOS_QUE_QUITAM_DIVIDA_ATIVA: os dois da dívida ativa, e nenhum outro", () => {
    const quitam = Object.entries(TIPOS_QUE_QUITAM_DIVIDA_ATIVA)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    expect(quitam).toEqual([
      "DIVIDA_ATIVA",
      "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA",
    ]);
    // O PRINCIPAL (tipo 1) é o tributo do exercício — quitar a inscrição com ele
    // baixaria do ativo um crédito que ninguém pagou.
    expect(TIPOS_QUE_QUITAM_DIVIDA_ATIVA.PRINCIPAL).toBe(false);
    expect(TIPOS_QUE_QUITAM_DIVIDA_ATIVA.MULTAS_E_JUROS_DE_MORA).toBe(false);
  });
});
