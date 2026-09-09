import { describe, expect, it } from "vitest";
import { ELEMENTOS } from "./dados/elementos.js";
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
  MODALIDADES_APLICACAO,
} from "./dados/natureza-componentes.js";
import {
  montarNatureza,
  NATUREZAS_COMUNS,
} from "./dados/naturezas-despesa.js";
import { conferirCodigoNaturezaDespesa } from "../../modules/m02-planejamento/dominio.js";

/** Códigos que existem nos DOIS domínios, com significados diferentes. */
const CODIGOS_QUE_COLIDEM = ["32", "46", "67", "73", "93", "94"] as const;

describe("colisão elemento × modalidade (NÃO podem se contaminar)", () => {
  it("os códigos que colidem existem MESMO nos dois domínios", () => {
    for (const codigo of CODIGOS_QUE_COLIDEM) {
      expect(
        ELEMENTOS.some((e) => e.codigo === codigo),
        `${codigo} deveria existir como ELEMENTO`
      ).toBe(true);
      expect(
        MODALIDADES_APLICACAO.some((m) => m.codigo === codigo),
        `${codigo} deveria existir como MODALIDADE`
      ).toBe(true);
    }
  });

  it("e significam COISAS DIFERENTES em cada domínio", () => {
    for (const codigo of CODIGOS_QUE_COLIDEM) {
      const elemento = ELEMENTOS.find((e) => e.codigo === codigo)!;
      const modalidade = MODALIDADES_APLICACAO.find((m) => m.codigo === codigo)!;
      expect(
        elemento.nome,
        `${codigo}: elemento e modalidade não podem ter o mesmo texto — ` +
          `sinal de contaminação entre os rols`
      ).not.toBe(modalidade.descricao);
    }
  });

  it("46: elemento = Auxílio-Alimentação; modalidade = fundo a fundo SUAS", () => {
    expect(ELEMENTOS.find((e) => e.codigo === "46")!.nome).toBe(
      "Auxílio-Alimentação"
    );
    expect(
      MODALIDADES_APLICACAO.find((m) => m.codigo === "46")!.descricao
    ).toMatch(/SUAS/);
  });

  it("montarNatureza busca o elemento em ELEMENTOS, nunca em MODALIDADES", () => {
    // 3.3.90.46 -> elemento 46 = Auxílio-Alimentação. Se o montador tivesse
    // pescado o 46 da tabela de modalidades, a descrição viria "SUAS".
    const n = montarNatureza({
      categoria: "3",
      grupo: "3",
      modalidade: "90",
      elemento: "46",
    });
    expect(n.codigoCompleto).toBe("339046");
    expect(n.descricao).toBe("Auxílio-Alimentação");
    expect(n.descricao).not.toMatch(/SUAS/);
  });

  it("modalidade 46 e elemento 46 coexistem na MESMA natureza sem se misturar", () => {
    const n = montarNatureza({
      categoria: "3",
      grupo: "3",
      modalidade: "46", // fundo a fundo SUAS
      elemento: "46", // Auxílio-Alimentação
    });
    expect(n.codModalidade).toBe("46");
    expect(n.codElemento).toBe("46");
    expect(n.codigoCompleto).toBe("334646");
    // a descrição vem do ELEMENTO, como manda o schema
    expect(n.descricao).toBe("Auxílio-Alimentação");
  });
});

describe("montarNatureza — fail-closed", () => {
  it("REJEITA elemento inexistente (33.90.02) e diz que pode ser modalidade", () => {
    expect(() =>
      montarNatureza({
        categoria: "3",
        grupo: "3",
        modalidade: "90",
        elemento: "02",
      })
    ).toThrow(/elemento de despesa "02" não existe/);
  });

  it("REJEITA modalidade inexistente", () => {
    expect(() =>
      montarNatureza({
        categoria: "3",
        grupo: "3",
        modalidade: "35", // revogada — substituída por 31
        elemento: "39",
      })
    ).toThrow(/modalidade de aplicação "35" não existe/);
  });

  it("REJEITA categoria econômica inexistente", () => {
    expect(() =>
      montarNatureza({
        categoria: "9",
        grupo: "3",
        modalidade: "90",
        elemento: "39",
      })
    ).toThrow(/categoria econômica "9" não existe/);
  });

  it("REJEITA grupo de natureza inexistente", () => {
    expect(() =>
      montarNatureza({
        categoria: "3",
        grupo: "9",
        modalidade: "90",
        elemento: "39",
      })
    ).toThrow(/grupo de natureza "9" não existe/);
  });
});

describe("naturezas comuns", () => {
  it("as 12 montam e dão codigoCompleto de 6 dígitos", () => {
    expect(NATUREZAS_COMUNS).toHaveLength(12);
    for (const n of NATUREZAS_COMUNS) {
      const m = montarNatureza(n);
      expect(m.codigoCompleto).toHaveLength(6);
      // o codigoCompleto nunca pode divergir dos 4 componentes
      expect(() => conferirCodigoNaturezaDespesa(m)).not.toThrow();
    }
  });

  it("montam exatamente os códigos esperados", () => {
    expect(NATUREZAS_COMUNS.map((n) => montarNatureza(n).codigoCompleto)).toEqual([
      "319011", "319013", "319094",
      "339014", "339030", "339036", "339039", "339046", "339047", "339092",
      "449051", "449052",
    ]);
  });
});

describe("rols oficiais — formato", () => {
  it("elementos: 2 dígitos, sem duplicata", () => {
    for (const e of ELEMENTOS) expect(e.codigo).toMatch(/^\d{2}$/);
    expect(new Set(ELEMENTOS.map((e) => e.codigo)).size).toBe(ELEMENTOS.length);
  });

  it("modalidades: 2 dígitos, sem duplicata, e SEM as revogadas 35/45", () => {
    for (const m of MODALIDADES_APLICACAO) expect(m.codigo).toMatch(/^\d{2}$/);
    const codigos = MODALIDADES_APLICACAO.map((m) => m.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos).not.toContain("35");
    expect(codigos).not.toContain("45");
    // as acrescentadas na 2d
    expect(codigos).toContain("32");
    expect(codigos).toContain("42");
    expect(codigos).toContain("93");
    expect(codigos).toContain("94");
  });

  it("categoria e grupo: 1 dígito", () => {
    for (const c of CATEGORIAS_ECONOMICAS) expect(c.codigo).toMatch(/^\d$/);
    for (const g of GRUPOS_NATUREZA_DESPESA) expect(g.codigo).toMatch(/^\d$/);
  });
});
