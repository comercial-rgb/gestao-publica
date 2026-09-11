import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  analisar,
  avaliar,
  camposUsados,
  formatarCelula,
  paraCelula,
  type Valor,
} from "./gramatica.js";

/**
 * M26 — A GRAMÁTICA SEGURA. Puro, sem banco.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROVA, E POR QUE ELE É O TESTE MAIS IMPORTANTE DO CORTE ═══
 * O teste 19 do lote é "campo calculado com expressão maliciosa é rejeitado pela
 * gramática, sem acesso ao banco". Ele não se prova com uma lista de proibições: prova-se
 * mostrando que a linguagem NÃO TEM a construção — que `process.env` não é sintaxe
 * válida aqui, e não uma palavra proibida numa língua grande.
 */

const LINHA: Readonly<Record<string, Valor>> = {
  numero: new Decimal(42),
  assunto: "Requerimento",
  valor: new Decimal("1000.50"),
  zero: new Decimal(0),
  aberto_em: new Date("2026-03-01T00:00:00Z"),
  encerrado_em: new Date("2026-03-11T00:00:00Z"),
  vazio: null,
};

const calc = (e: string): Valor => avaliar(analisar(e), LINHA);

describe("M26 — a expressão MALICIOSA não é proibida: ela não existe", () => {
  it("t1: acesso a objeto, propriedade e global não são sintaxe desta linguagem", () => {
    // Nenhum destes é "bloqueado por uma lista": o analisador não tem a construção.
    // O ponto não é sintaxe fora de um número: o acesso a propriedade morre no
    // tokenizador, antes de virar árvore.
    expect(() => analisar("process.env.DATABASE_URL")).toThrow(/Caractere não permitido: "\."/);
    expect(() => analisar("globalThis")).not.toThrow(); // vira um CAMPO, e...
    // ...o campo inexistente estoura na avaliação, nomeando os campos que existem.
    expect(() => avaliar(analisar("globalThis"), LINHA)).toThrow(
      /Campo "globalThis" não existe nesta fonte/
    );
    expect(() => analisar("linha['senha']")).toThrow(/Caractere não permitido/);
    // A aspa simples nem existe na linguagem; com aspas duplas, é a FUNÇÃO que é
    // recusada — e a mensagem lista as permitidas, em vez de dizer só "inválido".
    expect(() => analisar("require('fs')")).toThrow(/Caractere não permitido: "'"/);
    expect(() => analisar('require("fs")')).toThrow(
      /Função não permitida: "require"[\s\S]*As permitidas são SE, ARRED/
    );
    // A função anônima morre já no parêntese vazio: não há "expressão nenhuma" nesta
    // linguagem, e a seta nem chega a ser lida.
    expect(() => analisar("(() => 1)()")).toThrow(/Expressão incompleta/);
  });

  it("t2: SQL e ponto-e-vírgula não passam — e o resto NÃO é ignorado em silêncio", () => {
    // ⚠️ A PARTE QUE IMPORTA É O "EM SILÊNCIO". Um tokenizador complacente devolveria
    // `valor` e descartaria o resto — a expressão passaria a significar outra coisa sem
    // que ninguém fosse avisado.
    expect(() => analisar("valor; DROP TABLE Processo")).toThrow(/Caractere não permitido: ";"/);
    expect(() => analisar("valor UNION SELECT 1")).toThrow(/Sobrou conteúdo/);
  });

  it("t3: o limite de passos corta a expressão que não termina", () => {
    const longa = Array.from({ length: 120 }, () => "1").join("+");
    expect(avaliar(analisar(longa), LINHA)).toEqual(new Decimal(120));
    // Com um limite baixo, a MESMA expressão é recusada — e a mensagem ensina o que fazer.
    expect(() => avaliar(analisar(longa), LINHA, 10)).toThrow(
      /excedeu o limite de 10 passos[\s\S]*simplifique a expressão/
    );
  });

  it("t4: expressão longa demais é recusada ANTES de virar árvore", () => {
    expect(() => analisar("1+".repeat(300) + "1")).toThrow(/longa demais/);
  });

  it("t5: aspa não fechada e número inválido são erros, não interpretações", () => {
    expect(() => analisar('"sem fim')).toThrow(/Texto sem aspa de fechamento/);
    expect(() => analisar("1.2.3")).toThrow(/Número inválido/);
    expect(() => analisar("")).toThrow(/Expressão vazia/);
    expect(() => analisar("SE(1)")).toThrow(/SE recebeu 1 argumento\(s\)/);
  });
});

describe("M26 — a aritmética é Decimal, e a divisão por zero é erro nomeado", () => {
  it("t6: 0,1 + 0,2 dá exatamente 0,3 — não 0,30000000000000004", () => {
    // ⚠️ É A RAZÃO DE A LINGUAGEM SER DECIMAL. Um relatório financeiro somando em float
    // fecha errado por centavos que ninguém encontra.
    expect((calc("0.1 + 0.2") as Decimal).toString()).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3); // o que aconteceria com `eval`
  });

  it("t7: divisão por zero ESTOURA — não devolve Infinity", () => {
    // Um relatório com "Infinity" numa célula é pior que um que falhou: ele parece pronto.
    expect(() => calc("valor / zero")).toThrow(/Divisão por zero/);
  });

  it("t8: SE não avalia o ramo que não escolheu", () => {
    // ⚠️ SEM PREGUIÇA, ESTA EXPRESSÃO ESTOURARIA MESMO COM A GUARDA ESCRITA CERTA.
    expect(calc("SE(zero <> 0, valor / zero, 0)")).toEqual(new Decimal(0));
  });

  it("t9: precedência e parênteses como numa planilha", () => {
    expect((calc("2 + 3 * 4") as Decimal).toString()).toBe("14");
    expect((calc("(2 + 3) * 4") as Decimal).toString()).toBe("20");
    expect((calc("-numero + 2") as Decimal).toString()).toBe("-40");
  });
});

describe("M26 — as funções permitidas, e só elas", () => {
  it("t10: texto, arredondamento, dias e concatenação", () => {
    expect(calc('MAIUSC(assunto)')).toBe("REQUERIMENTO");
    expect(calc("TAMANHO(assunto)")).toEqual(new Decimal(12)); // "Requerimento"
    expect((calc("ARRED(valor, 0)") as Decimal).toString()).toBe("1001");
    expect((calc("ARRED(1000.505, 2)") as Decimal).toString()).toBe("1000.51");
    expect(calc("DIAS(encerrado_em, aberto_em)")).toEqual(new Decimal(10));
    // ⚠️ DIAS conta CALENDÁRIO: 01/03 a 11/03 são 10 dias com ou sem a hora batendo.
    expect(calc("DIAS(aberto_em, encerrado_em)")).toEqual(new Decimal(-10));
    expect(calc('CONCAT(assunto, " nº ", numero)')).toBe("Requerimento nº 42");
    expect(calc("VAZIO(vazio)")).toBe(true);
    expect(calc("VAZIO(assunto)")).toBe(false);
  });

  it("t11: o operador & concatena, e datas viram o DIA CIVIL DO ENTE em dd/mm/aaaa", () => {
    // ⚠️ 28/02, E ISSO É A CORREÇÃO, NÃO UMA REGRESSÃO. A fixture é o instante
    // `2026-03-01T00:00:00Z`, que em São Paulo é **28/02 às 21:00**. O relatório do
    // desenhista imprime o dia que o ente viveu, não o de Greenwich: o processo aberto na
    // noite do último dia de fevereiro não pode aparecer como de março num relatório que
    // alguém leva para a reunião. Ver `docs/adr/ADR-data-civil-do-ente.md`.
    expect(calc('"aberto em " & aberto_em')).toBe("aberto em 28/02/2026");
  });

  it("t12: ARRED recusa casas absurdas — e DIAS recusa o que não é data", () => {
    expect(() => calc("ARRED(valor, 50)")).toThrow(/de 0 a 10 casas/);
    expect(() => calc("DIAS(assunto, aberto_em)")).toThrow(/espera duas datas/);
    expect(() => calc("valor + assunto")).toThrow(/esperava número e recebeu "Requerimento"/);
  });

  it("t13: camposUsados enumera as dependências — para conferir ANTES de executar", () => {
    const usados = camposUsados(analisar('SE(valor > 100, MAIUSC(assunto), aberto_em)'));
    expect([...usados].sort()).toEqual(["aberto_em", "assunto", "valor"]);
  });

  it("t14: a célula CRUA não inventa precisão — quem sabe que é dinheiro é a COLUNA", () => {
    // ⚠️ `1000.50` em Decimal É `1000.5`. Acolchoar tudo para duas casas aqui faria uma
    // contagem de dias virar "10.00" e uma matrícula virar "12345.00".
    expect(paraCelula(new Decimal("1000.50"))).toBe("1000.5");
    expect(paraCelula(new Decimal(42))).toBe("42");
    expect(paraCelula(true)).toBe("Sim");
    expect(paraCelula(null)).toBe("");
    // ⚠️ O MESMO DE t11: `2026-03-01T00:00:00Z` é 28/02 às 21:00 no calendário do ente.
    expect(paraCelula(new Date("2026-03-01T00:00:00Z"))).toBe("28/02/2026");
    // e o meio-dia, onde os dois eixos coincidem, continua sendo o dia que se espera.
    expect(paraCelula(new Date("2026-03-01T12:00:00Z"))).toBe("01/03/2026");

    // A COLUNA declara o tipo, e é ele que decide a apresentação.
    expect(formatarCelula("MOEDA", new Decimal("1000.50"))).toBe("1000.50");
    expect(formatarCelula("MOEDA", new Decimal(42))).toBe("42.00");
    expect(formatarCelula("NUMERO", new Decimal(10))).toBe("10");
    expect(formatarCelula("TEXTO", new Decimal("1000.50"))).toBe("1000.5");
  });
});
