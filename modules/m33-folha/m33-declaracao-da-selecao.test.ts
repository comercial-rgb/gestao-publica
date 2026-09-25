import { describe, expect, it } from "vitest";
import {
  conferirDeclaracao,
  matriculasDeclaradas,
  resolverMatriculas,
  DeclaracaoDeSelecaoInvalidaError,
} from "./declaracao-da-selecao.js";

/**
 * ═══ A DECLARAÇÃO DA SELEÇÃO — o que a TELA entrega, antes de virar `SelecaoDoCalculo` ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO PROTEGE É A SUPERFÍCIE, NÃO O MOTOR. O domínio já garante que o modo é
 * declarado e nunca inferido; o que faltava era a tela não trair isso. Cada recusa aqui é uma
 * forma de a superfície decidir sozinha uma coisa que só o operador pode decidir.
 */
describe("as matrículas declaradas", () => {
  it("aceita vírgula, ponto e vírgula e quebra de linha — o separador é do teclado, não do sistema", () => {
    expect(matriculasDeclaradas("M-A, M-B")).toEqual(["M-A", "M-B"]);
    expect(matriculasDeclaradas("M-A;M-B")).toEqual(["M-A", "M-B"]);
    expect(matriculasDeclaradas("M-A\nM-B\r\nM-C")).toEqual(["M-A", "M-B", "M-C"]);
    expect(matriculasDeclaradas("  M-A  ,  M-B  ")).toEqual(["M-A", "M-B"]);
  });

  it("descarta vazias e repetidas, preservando a ORDEM em que a pessoa digitou", () => {
    expect(matriculasDeclaradas("M-B,,M-A,M-B,\n\n,M-C")).toEqual(["M-B", "M-A", "M-C"]);
    expect(matriculasDeclaradas("")).toEqual([]);
    expect(matriculasDeclaradas("   \n  ")).toEqual([]);
  });
});

describe("modo e matrículas, conferidos um contra o outro", () => {
  it("o caminho ordinário: TODOS sem texto, e EXPLÍCITA com texto", () => {
    expect(conferirDeclaracao("TODOS_OS_ELEGIVEIS", "")).toEqual({ modo: "TODOS_OS_ELEGIVEIS", matriculas: [] });
    expect(conferirDeclaracao("", "")).toEqual({ modo: "TODOS_OS_ELEGIVEIS", matriculas: [] });
    expect(conferirDeclaracao("EXPLICITA", "M-A, M-B")).toEqual({ modo: "EXPLICITA", matriculas: ["M-A", "M-B"] });
  });

  it("⚠️ EXPLÍCITA SEM MATRÍCULA RECUSA — 'recorte de ninguém' não vira 'todos'", () => {
    // Assumir "então são todos" seria a tela decidindo por ele exatamente a coisa que a ação
    // SELECIONAR_VINCULOS_DA_FOLHA existe para não deixar ninguém decidir sozinho.
    const erro = (): unknown => conferirDeclaracao("EXPLICITA", "   ");
    expect(erro).toThrow(DeclaracaoDeSelecaoInvalidaError);
    expect(erro).toThrow(/SELECAO-EXPLICITA-SEM-MATRICULA/);
    expect(erro).toThrow(/Nada foi calculado/);
  });

  it("⚠️ TODOS COM MATRÍCULAS DIGITADAS RECUSA — as duas leituras são opostas e nenhuma se adivinha", () => {
    const erro = (): unknown => conferirDeclaracao("TODOS_OS_ELEGIVEIS", "M-A\nM-B");
    expect(erro).toThrow(/SELECAO-CONTRADITORIA/);
    // A recusa mostra o que foi digitado: sem isso o operador não sabe o que o sistema viu.
    expect(erro).toThrow(/M-A, M-B/);
  });

  it("modo desconhecido recusa nomeando os dois que existem", () => {
    const erro = (): unknown => conferirDeclaracao("SOMENTE_OS_BONS", "");
    expect(erro).toThrow(/MODO-DE-SELECAO-DESCONHECIDO/);
    expect(erro).toThrow(/TODOS_OS_ELEGIVEIS/);
    expect(erro).toThrow(/EXPLICITA/);
  });
});

describe("matrícula para vínculo — e as duas recusas que impedem a subtração silenciosa", () => {
  const cadastro = [
    { id: "v-a", matricula: "M-A" },
    { id: "v-b", matricula: "M-B" },
    { id: "v-c", matricula: "M-C" },
  ];

  it("resolve na ORDEM declarada, não na ordem do cadastro", () => {
    expect(resolverMatriculas(["M-C", "M-A"], cadastro)).toEqual(["v-c", "v-a"]);
  });

  /**
   * ⚠️ N=2 DE PROPÓSITO: uma existente e uma que não existe. Com só a inexistente, "recusa quando
   * não acha" passaria também para uma implementação que recusasse SEMPRE. O par prova que ela
   * recusa por causa da que falta, e não por não ter achado nada.
   */
  it("⚠️ matrícula inexistente RECUSA nomeando — não calcula as que achou", () => {
    const erro = (): unknown => resolverMatriculas(["M-A", "M-Z"], cadastro);
    expect(erro).toThrow(/MATRICULA-NAO-ENCONTRADA/);
    expect(erro).toThrow(/M-Z/);
    expect(erro).toThrow(/Nada foi calculado/);
    // e a que existe sozinha passa — é o que torna o caso acima uma afirmação, não uma vacuidade.
    expect(resolverMatriculas(["M-A"], cadastro)).toEqual(["v-a"]);
  });

  it("⚠️ matrícula AMBÍGUA recusa — escolher seria o sistema decidindo quem o ente paga", () => {
    const duplicado = [...cadastro, { id: "v-a2", matricula: "M-A" }];
    const erro = (): unknown => resolverMatriculas(["M-A"], duplicado);
    expect(erro).toThrow(/MATRICULA-AMBIGUA/);
    expect(erro).toThrow(/M-A/);
  });
});
