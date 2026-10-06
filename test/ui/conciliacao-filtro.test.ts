import { describe, expect, it } from "vitest";
import { filtrarEOrdenar, filtroDaConciliacao, somaExibida } from "../../app/(areas)/financeiro/conciliacao/filtro";
import { instanteCivil } from "../../packages/datas/index";

/**
 * V36 — OS FILTROS E A ORDENAÇÃO DA CONCILIAÇÃO (TR 5.10.2.50 e 5.10.2.51). Quatro linhas com sinal, uma delas às
 * 23h30 do dia 31 (no dia civil é março; em UTC já seria abril).
 */
type L = { readonly id: string; readonly data: Date; readonly descricao: string; readonly residual: string; readonly tipo: string };
const linhas: readonly L[] = [
  { id: "a", data: instanteCivil(2026, 3, 10, 12, 0, 0, 0), descricao: "Tarifa de manutenção", residual: "-35.00", tipo: "MOVIMENTO_BANCARIO" },
  { id: "b", data: instanteCivil(2026, 3, 31, 23, 30, 0, 0), descricao: "Pagamento NE 12/2026 FITID 998", residual: "-1234.56", tipo: "PAGAMENTO" },
  { id: "c", data: instanteCivil(2026, 4, 2, 9, 0, 0, 0), descricao: "Crédito FPM", residual: "1234.56", tipo: "ARRECADACAO" },
  { id: "d", data: instanteCivil(2026, 4, 3, 9, 0, 0, 0), descricao: "Rendimento de aplicação", residual: "12.40", tipo: "MOVIMENTO_BANCARIO" },
];
const acesso = { data: (l: L) => l.data, texto: (l: L) => l.descricao, valor: (l: L) => l.residual, tipo: (l: L) => l.tipo };
const ids = (sp: Record<string, string>): string[] => filtrarEOrdenar(linhas, filtroDaConciliacao(sp), acesso).map((l) => l.id);

describe("os filtros e a ordenação da conciliação", () => {
  it("período pelo dia civil: a linha das 23h30 de 31/03 fica em março", () => {
    expect(ids({ ate: "2026-03-31" })).toEqual(["a", "b"]);
    expect(ids({ desde: "2026-04-01" })).toEqual(["c", "d"]);
  });
  it("valor sem sinal, como digitado na tela: acha a saída e a entrada; valor ilegível não filtra e é avisado", () => {
    expect(ids({ valor: "1.234,56" })).toEqual(["b", "c"]);
    expect(ids({ valor: "1234.56" })).toEqual(["b", "c"]);
    const f = filtroDaConciliacao({ valor: "mil" });
    expect(f.valor).toBe("");
    expect(f.valorIgnorado).toBe("mil");
    expect(ids({ valor: "mil" })).toEqual(["a", "b", "c", "d"]);
  });
  it("texto sem caixa e sem acento, inclusive o FITID; tipo do registro", () => {
    expect(ids({ texto: "manutencao" })).toEqual(["a"]);
    expect(ids({ texto: "fitid 998" })).toEqual(["b"]);
    expect(ids({ tipo: "MOVIMENTO_BANCARIO" })).toEqual(["a", "d"]);
  });
  it("ordem pela coluna de valor, com sinal, nos dois sentidos; empate mantém a ordem de chegada", () => {
    expect(ids({ ordem: "valor-asc" })).toEqual(["b", "a", "d", "c"]);
    expect(ids({ ordem: "valor-desc" })).toEqual(["c", "d", "a", "b"]);
    const empate = filtrarEOrdenar([...linhas, { ...linhas[3]!, id: "e" }], filtroDaConciliacao({ ordem: "valor-desc" }), acesso).map((l) => l.id);
    expect(empate).toEqual(["c", "d", "e", "a", "b"]);
  });
  it("a soma das linhas exibidas, em Decimal", () => {
    const mostradas = filtrarEOrdenar(linhas, filtroDaConciliacao({ tipo: "MOVIMENTO_BANCARIO" }), acesso);
    expect(somaExibida(mostradas, (l) => l.residual)).toBe("-22.60");
  });
});
