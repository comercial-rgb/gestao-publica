import { describe, expect, it } from "vitest";
import { Decimal } from "../../packages/contracts/index.js";
import {
  NOMES_DAS_GRANDEZAS,
  avaliarFormula,
  validarFormula,
  type GrandezasDoBem,
} from "./formula-avaliacao.js";

/**
 * ═══ A FÓRMULA DE AVALIAÇÃO (TR 5.19.42) — REGIME DE PROFUNDIDADE ═══
 *
 * ⚠️ METADE DESTE ARQUIVO É NEGAÇÃO, e é de propósito. A cláusula pede fórmula EDITÁVEL
 * PELO USUÁRIO, e a implementação óbvia (`eval`) daria a quem editasse o cadastro a
 * capacidade de executar qualquer coisa no servidor. O que prova que este avaliador não é
 * `eval` disfarçado não são os casos que ele calcula certo: são os que ele RECUSA.
 *
 * Os ataques abaixo são os reais — os que funcionam contra sanitização por lista negra.
 */

const BEM: GrandezasDoBem = {
  valorBruto: new Decimal("10000.00"),
  acumulada: new Decimal("2500.00"),
  valorContabil: new Decimal("7500.00"),
  idadeMeses: new Decimal("30"),
  vidaUtilMeses: new Decimal("120"),
  percentualResidual: new Decimal("0.10"),
};

describe("a aritmética, e ela é Decimal", () => {
  it("as quatro operações e a precedência", () => {
    expect(avaliarFormula("2 + 3 * 4", BEM).toFixed(2)).toBe("14.00");
    expect(avaliarFormula("(2 + 3) * 4", BEM).toFixed(2)).toBe("20.00");
    expect(avaliarFormula("10 - 4 - 3", BEM).toFixed(2)).toBe("3.00");
    expect(avaliarFormula("100 / 4 / 5", BEM).toFixed(2)).toBe("5.00");
  });

  it("as grandezas do bem entram pelo nome", () => {
    expect(avaliarFormula("valorBruto - acumulada", BEM).toFixed(2)).toBe("7500.00");
    expect(avaliarFormula("valorContabil", BEM).toFixed(2)).toBe("7500.00");
  });

  it("uma fórmula de avaliação de verdade — valor residual pela vida remanescente", () => {
    // valorBruto × residual + (valorBruto − valorBruto × residual) ×
    //   (vidaUtil − idade) / vidaUtil
    //   = 10000 × 0,10 + 9000 × 90/120
    //   = 1000 + 6750 = 7750,00
    const f =
      "valorBruto * percentualResidual + " +
      "(valorBruto - valorBruto * percentualResidual) * " +
      "(vidaUtilMeses - idadeMeses) / vidaUtilMeses";
    expect(avaliarFormula(f, BEM).toFixed(2)).toBe("7750.00");
  });

  it("⚠️ é Decimal, não ponto flutuante: 0,1 + 0,2 dá exatamente 0,30", () => {
    expect(avaliarFormula("0.1 + 0.2", BEM).toFixed(2)).toBe("0.30");
    // Em `number`, (0.1+0.2)*1000 é 300.00000000000006.
    expect(avaliarFormula("(0.1 + 0.2) * 1000", BEM).toFixed(2)).toBe("300.00");
  });

  it("o menos unário existe, e o mais também", () => {
    expect(avaliarFormula("-valorContabil", BEM).toFixed(2)).toBe("-7500.00");
    expect(avaliarFormula("2 * -3", BEM).toFixed(2)).toBe("-6.00");
    expect(avaliarFormula("+5", BEM).toFixed(2)).toBe("5.00");
  });
});

describe("⚠️ AS NEGAÇÕES — o que prova que isto não é `eval` disfarçado", () => {
  /**
   * ⚠️ ESTE É O ATAQUE QUE DERROTA A SANITIZAÇÃO POR LISTA NEGRA.
   *
   * `this.constructor.constructor("return process.env")()` alcança o `Function` global
   * sem escrever `eval`, `require`, `import` nem `process` no lugar bloqueado. Quem
   * filtra palavras proibidas deixa isto passar.
   *
   * Aqui ele não é bloqueado: ele é INEXPRIMÍVEL. Não há acesso a propriedade na
   * gramática, e `this` não é uma grandeza do bem.
   */
  it("acesso a propriedade e `constructor` não existem na gramática", () => {
    expect(() => avaliarFormula('this.constructor.constructor("return 1")()', BEM)).toThrow();
    expect(() => avaliarFormula("valorBruto.constructor", BEM)).toThrow(
      /não pertence à linguagem de fórmulas/
    );
  });

  it("nenhuma função é chamável — nem as que parecem inofensivas", () => {
    expect(() => avaliarFormula("Math.max(1,2)", BEM)).toThrow();
    expect(() => avaliarFormula("Number(valorBruto)", BEM)).toThrow(/não é uma grandeza/);
  });

  it("identificadores globais não são visíveis", () => {
    for (const alvo of ["process", "globalThis", "require", "eval", "Function", "fetch"]) {
      expect(
        () => avaliarFormula(alvo, BEM),
        `"${alvo}" foi aceito como nome — o rol de grandezas deixou de ser fechado`
      ).toThrow(/não é uma grandeza do bem/);
    }
  });

  it("string, ponto e vírgula e comentário não existem", () => {
    expect(() => avaliarFormula('"x"', BEM)).toThrow(/não pertence à linguagem/);
    expect(() => avaliarFormula("1; 2", BEM)).toThrow(/não pertence à linguagem/);
    // ⚠️ `//` NÃO É COMENTÁRIO AQUI: são duas divisões seguidas, e a gramática recusa
    // porque falta operando entre elas. A mensagem tem de dizer isso — e não falar de
    // parêntese, como a primeira versão do avaliador fazia.
    expect(() => avaliarFormula("1 // 2", BEM)).toThrow(/dois operadores seguidos/);
    expect(() => avaliarFormula("1 /* 2 */", BEM)).toThrow(/dois operadores seguidos/);
  });

  it("⚠️ o caractere desconhecido RECUSA, em vez de ser ignorado", () => {
    // Ignorar faria `valorBruto @ drop` virar `valorBruto` e produzir um número
    // plausível — pior que recusar, porque ninguém procuraria o defeito.
    expect(() => avaliarFormula("valorBruto @ 2", BEM)).toThrow(/Recusar é deliberado/);
  });

  it("sintaxe quebrada recusa, e diz onde", () => {
    expect(() => avaliarFormula("(1 + 2", BEM)).toThrow(/não fechado/);
    expect(() => avaliarFormula("1 + 2)", BEM)).toThrow(/Sobra na fórmula/);
    expect(() => avaliarFormula("1 +", BEM)).toThrow(/termina onde esperava/);
    expect(() => avaliarFormula("", BEM)).toThrow(/vazia/);
    expect(() => avaliarFormula("1.2.3", BEM)).toThrow(/Número inválido/);
  });

  it("divisão por zero recusa com o motivo do domínio", () => {
    expect(() => avaliarFormula("valorBruto / 0", BEM)).toThrow(/Divisão por zero/);
    const semVida = { ...BEM, vidaUtilMeses: new Decimal(0) };
    expect(() => avaliarFormula("valorBruto / vidaUtilMeses", semVida)).toThrow(
      /vida útil zero/
    );
  });
});

describe("a validação no cadastro é fail-closed", () => {
  it("fórmula inválida NÃO chega a ser salva", () => {
    expect(() => validarFormula("valorBruto * ")).toThrow();
    expect(() => validarFormula("process.env")).toThrow();
  });

  it("fórmula válida passa", () => {
    expect(() => validarFormula("valorBruto - acumulada")).not.toThrow();
  });

  it("toda grandeza declarada é de fato avaliável — o rol não apodrece", () => {
    for (const nome of NOMES_DAS_GRANDEZAS) {
      expect(
        () => avaliarFormula(nome, BEM),
        `a grandeza "${nome}" está no rol e o avaliador não a resolve`
      ).not.toThrow();
    }
  });
});
