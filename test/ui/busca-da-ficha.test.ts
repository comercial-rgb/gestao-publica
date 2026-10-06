import { describe, expect, it } from "vitest";
import { fichasQueCasam } from "../../app/(areas)/despesa/empenhos/busca-da-ficha";

/**
 * A BUSCA DA DOTAÇÃO NO EMPENHO (V36, TR 5.10.1.9). Três fichas; a busca acha por qualquer parte (número,
 * natureza, fonte, unidade, programa, ação), sem caixa nem acento, e vários termos restringem (E).
 */
const fichas = [
  { id: "a", numero: 10816, naturezaCodigo: "339014", naturezaDescricao: "Diárias - Civil", fonteCodigo: "500", unidade: "02004 Secretaria de Administração", classificacao: "04.122.0004.2001 — Manutenção da Secretaria de Administração" },
  { id: "b", numero: 10821, naturezaCodigo: "339039", naturezaDescricao: "Outros Serviços de Terceiros - PJ", fonteCodigo: "500", unidade: "02004 Secretaria de Administração", classificacao: "04.122.0004.2001 — Manutenção da Secretaria de Administração" },
  { id: "c", numero: 20210, naturezaCodigo: "339039", naturezaDescricao: "Outros Serviços de Terceiros - PJ", fonteCodigo: "540", unidade: "02007 Secretaria de Educação e Cultura", classificacao: "12.361.0010.2020 — Manutenção do Ensino Fundamental" },
] as const;
const ids = (busca: string): string[] => fichasQueCasam(fichas, busca).map((f) => f.id);

describe("busca da dotação no empenho", () => {
  it("sem termo, todas", () => {
    expect(ids("   ")).toEqual(["a", "b", "c"]);
  });
  it("por número, natureza, fonte, unidade, programa e ação", () => {
    expect(ids("10821")).toEqual(["b"]);
    expect(ids("339039")).toEqual(["b", "c"]);
    expect(ids("fonte 540")).toEqual(["c"]);
    expect(ids("02007")).toEqual(["c"]);
    expect(ids("0004")).toEqual(["a", "b"]);
    expect(ids("ensino fundamental")).toEqual(["c"]);
  });
  it("sem caixa nem acento, e vários termos restringem", () => {
    expect(ids("EDUCACAO")).toEqual(["c"]);
    expect(ids("diarias")).toEqual(["a"]);
    expect(ids("339039 administracao")).toEqual(["b"]);
    expect(ids("339039 administracao 540")).toEqual([]);
  });
});
