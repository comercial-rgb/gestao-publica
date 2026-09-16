import { describe, expect, it } from "vitest";
import { Decimal } from "../../packages/contracts/index.js";
import { calcular } from "../../packages/formula/index.js";
import {
  CicloDeRubricasError,
  DependenciaInexistenteError,
  DependenciaPosteriorError,
  FormulaDaRubricaInvalidaError,
  SemVersaoVigenteError,
  VersaoAmbiguaError,
  analisarFormulaDaRubrica,
  escolherVersaoVigente,
  ordemDeCalculo,
  type NoDoGrafo,
  type VersaoLida,
} from "./rubrica-versionada.js";

/**
 * V11 V1.1 — a rubrica versionada e o grafo.
 *
 * ⚠️ O RESULTADO ESPERADO É CALCULADO À MÃO, e não pela função sob teste. Onde uma fórmula é
 * avaliada, o número esperado está escrito com a conta ao lado, para que um erro consistente de
 * interpretação não passe por conferir o código contra ele mesmo.
 */

const versao = (p: Partial<VersaoLida> & { readonly versao: number }): VersaoLida => ({
  id: `v${p.versao}`,
  competenciaInicio: "2026-01",
  competenciaFim: null,
  formula: null,
  percentual: null,
  incideContribuicao: true,
  incideIrrf: true,
  proporcionalAosDias: false,
  casasDecimais: 2,
  regime: "TODOS",
  fundamentacaoLegal: "Lei municipal sintética 1/2026",
  situacao: "APROVADA",
  ...p,
});

const no = (codigo: string, deps: readonly string[] = [], ordem = 10, natureza: NoDoGrafo["natureza"] = "FORMULA"): NoDoGrafo => ({
  codigo,
  natureza,
  ordem,
  dependencias: deps,
});

describe("V11 V1.1 — a fórmula da rubrica, em universo fechado", () => {
  it("a1. separa as variáveis do contracheque das rubricas citadas", () => {
    const a = analisarFormulaDaRubrica("INSAL", "vencimento_base * 0.20 + rubrica.ADNOT");
    expect(a.variaveisDoSistema).toEqual(["vencimento_base"]);
    expect(a.dependencias).toEqual(["ADNOT"]);
  });

  it("a2. recusa NOMEANDO a variável que não existe, e diz quais existem", () => {
    let erro: unknown;
    try {
      analisarFormulaDaRubrica("INSAL", "salario_minimo * 0.20");
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(FormulaDaRubricaInvalidaError);
    const m = (erro as Error).message;
    expect(m).toContain("salario_minimo");
    expect(m).toContain("vencimento_base");
    // ⚠️ O MOTIVO, E NÃO SÓ A RECUSA: "não completou" é compatível com o motor tendo aceitado
    // a fórmula e devolvido zero.
    expect(m).toContain("não é variável do contracheque nem rubrica");
  });

  it("a3. auto-referência é ciclo de comprimento 1", () => {
    expect(() => analisarFormulaDaRubrica("INSAL", "rubrica.INSAL + 1")).toThrow(CicloDeRubricasError);
  });

  it("a4. a fuga clássica do interpretador NÃO passa — sem eval, sem lista negra", () => {
    // `this.constructor.constructor("…")()` atravessa qualquer lista de palavras proibidas.
    // Aqui ela não é "proibida": ela simplesmente não existe no universo fechado.
    for (const ataque of [
      "this.constructor.constructor",
      "process.env.DATABASE_URL",
      "globalThis.fetch",
      "vencimento_base.toString",
    ]) {
      expect(() => analisarFormulaDaRubrica("X", ataque), ataque).toThrow(FormulaDaRubricaInvalidaError);
    }
  });

  it("a5. fórmula vazia e sintaxe quebrada são recusas nomeadas", () => {
    expect(() => analisarFormulaDaRubrica("X", "   ")).toThrow(/está vazia/);
    expect(() => analisarFormulaDaRubrica("X", "vencimento_base * * 2")).toThrow(FormulaDaRubricaInvalidaError);
  });

  it("a6. o valor da fórmula confere com a conta feita à mão", () => {
    // 20% de 3.000 = 600; mais o adicional noturno de 150 → 750.
    const { valor } = calcular("vencimento_base * 0.20 + rubrica.ADNOT", {
      vencimento_base: new Decimal("3000"),
      "rubrica.ADNOT": new Decimal("150"),
    });
    expect(valor.toFixed(2)).toBe("750.00");
  });
});

describe("V11 V1.1 — a versão vigente", () => {
  const v1 = versao({ versao: 1, competenciaInicio: "2026-01", competenciaFim: "2026-06" });
  const v2 = versao({ versao: 2, competenciaInicio: "2026-07" });

  it("b1. escolhe pela competência, e a de junho não é a de julho", () => {
    expect(escolherVersaoVigente("X", [v1, v2], "2026-03", "RPPS")?.versao).toBe(1);
    expect(escolherVersaoVigente("X", [v1, v2], "2026-06", "RPPS")?.versao).toBe(1);
    expect(escolherVersaoVigente("X", [v1, v2], "2026-07", "RPPS")?.versao).toBe(2);
  });

  it("b2. RASCUNHO e REVOGADA não calculam nada", () => {
    const rascunho = versao({ versao: 3, situacao: "RASCUNHO" });
    const revogada = versao({ versao: 4, situacao: "REVOGADA" });
    expect(escolherVersaoVigente("X", [rascunho], "2026-03", "RPPS")).toBeNull();
    expect(escolherVersaoVigente("X", [revogada], "2026-03", "RPPS")).toBeNull();
  });

  it("b3. a versão do regime específico tem precedência sobre a de TODOS", () => {
    const todos = versao({ versao: 1, regime: "TODOS" });
    const rpps = versao({ versao: 2, regime: "RPPS" });
    expect(escolherVersaoVigente("X", [todos, rpps], "2026-03", "RPPS")?.versao).toBe(2);
    // ⚠️ E O ESTATUTÁRIO NÃO HERDA A REGRA DO CELETISTA: para o RGPS só sobra a de TODOS.
    expect(escolherVersaoVigente("X", [todos, rpps], "2026-03", "RGPS")?.versao).toBe(1);
  });

  it("b4. duas aprovadas na mesma competência é recusa, não sorteio", () => {
    const a = versao({ versao: 1, competenciaInicio: "2026-01" });
    const b = versao({ versao: 2, competenciaInicio: "2026-02" });
    expect(() => escolherVersaoVigente("X", [a, b], "2026-03", "RPPS")).toThrow(VersaoAmbiguaError);
  });

  it("b5. sem versão vigente devolve nulo — quem recusa é quem sabe o contexto", () => {
    expect(escolherVersaoVigente("X", [v2], "2026-01", "RPPS")).toBeNull();
    expect(new SemVersaoVigenteError("X", "2026-01", "RPPS").message).toContain("2026-01");
  });
});

describe("V11 V1.1 — a ordem de cálculo", () => {
  it("c1. toda dependência vem antes de quem depende", () => {
    const nos = [no("C", ["B"], 30), no("B", ["A"], 20), no("A", [], 10, "VENCIMENTO_BASE")];
    expect(ordemDeCalculo(nos).map((n) => n.codigo)).toEqual(["A", "B", "C"]);
  });

  it("c2. a ordem é DETERMINÍSTICA: embaralhar a entrada não muda a saída", () => {
    // Duas independentes com a mesma ordem de contracheque: o desempate é o código.
    const base = [no("VENC", [], 10, "VENCIMENTO_BASE"), no("ZZZ", ["VENC"], 20), no("AAA", ["VENC"], 20)];
    const direta = ordemDeCalculo(base).map((n) => n.codigo);
    const invertida = ordemDeCalculo([...base].reverse()).map((n) => n.codigo);
    expect(direta).toEqual(["VENC", "AAA", "ZZZ"]);
    expect(invertida).toEqual(direta);
  });

  it("c3. dependência inexistente é recusa NOMEANDO o código citado", () => {
    let erro: unknown;
    try {
      ordemDeCalculo([no("A", ["NAO_EXISTE"])]);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DependenciaInexistenteError);
    expect((erro as Error).message).toContain("NAO_EXISTE");
  });

  it("c4. citar a contribuição é recusa: ela é calculada DEPOIS, sobre a base que inclui esta", () => {
    const nos = [no("A", ["INSS"]), no("INSS", [], 90, "CONTRIBUICAO_PREVIDENCIARIA")];
    let erro: unknown;
    try {
      ordemDeCalculo(nos);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DependenciaPosteriorError);
    expect((erro as Error).message).toContain("CONTRIBUICAO_PREVIDENCIARIA");
  });

  it("c5. ciclo indireto é recusado COM o caminho", () => {
    const nos = [no("A", ["B"]), no("B", ["C"]), no("C", ["A"])];
    let erro: unknown;
    try {
      ordemDeCalculo(nos);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(CicloDeRubricasError);
    const caminho = (erro as CicloDeRubricasError).caminho;
    // Fecha em si mesmo: o primeiro e o último são o mesmo código.
    expect(caminho[0]).toBe(caminho[caminho.length - 1]);
    expect(caminho).toContain("A");
    expect(caminho).toContain("B");
    expect(caminho).toContain("C");
  });

  it("c6. N=2 de verdade: duas rubricas que dependem da MESMA terceira", () => {
    // Com N=1 um grafo passa por vacuidade. Aqui a terceira precisa sair uma vez só, antes das duas.
    const nos = [no("X", ["BASE"], 20), no("Y", ["BASE"], 21), no("BASE", [], 10, "VALOR_INFORMADO")];
    const ordem = ordemDeCalculo(nos).map((n) => n.codigo);
    expect(ordem).toEqual(["BASE", "X", "Y"]);
    expect(ordem.filter((c) => c === "BASE")).toHaveLength(1);
  });
});
