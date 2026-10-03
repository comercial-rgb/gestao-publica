import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { compararItens, type ItemComparavel } from "./comparacao-de-exercicios.js";
import { pedidoDaUrl } from "../../lib/portas/comparacao-de-exercicios.js";

/**
 * A COMPARAÇÃO DE EXERCÍCIOS (V31) — a agregação pura. N=2 por chave (duas fichas da mesma ação somam),
 * linha que só existe de um lado, total e variação.
 */

const item = (chave: string, ini: string, atu: string, emp: string | null = "0.00"): ItemComparavel => ({
  chave,
  rotulo: `rótulo ${chave}`,
  inicial: toMoney(ini),
  atualizado: toMoney(atu),
  executado: emp === null ? null : toMoney(emp),
});

describe("a comparação de exercícios", () => {
  it("x1: duas fichas da mesma chave somam; a linha extinta e a nova aparecem com zero do outro lado", () => {
    const { linhas, total } = compararItens(
      [item("2001", "100.00", "120.00", "50.00"), item("2001", "30.00", "30.00", "10.00"), item("2009", "40.00", "40.00")],
      [item("2001", "160.00", "160.00", "0.00"), item("2010", "25.00", "25.00")],
      true
    );
    expect(linhas.map((l) => l.chave)).toEqual(["2001", "2009", "2010"]);
    const a2001 = linhas[0]!;
    expect(a2001.a).toEqual({ inicial: "130.00", atualizado: "150.00", executado: "60.00" });
    expect(a2001.diferenca).toBe("10.00");
    expect(a2001.variacao).toBe("6.7");
    const extinta = linhas[1]!;
    expect(extinta.b.atualizado).toBe("0.00");
    expect(extinta.variacao).toBe("-100.0");
    const nova = linhas[2]!;
    expect(nova.a.atualizado).toBe("0.00");
    // Negação com motivo: sem base no exercício de referência, não há percentual (e não é "infinito").
    expect(nova.variacao).toBeNull();
    expect(total.a.atualizado).toBe("190.00");
    expect(total.b.atualizado).toBe("185.00");
    expect(total.diferenca).toBe("-5.00");
  });

  it("x2: receita não tem coluna de execução — fica null, não zero", () => {
    const { linhas, total } = compararItens([item("1.1", "10.00", "12.00", null)], [item("1.1", "11.00", "11.00", null)], false);
    expect(linhas[0]!.a.executado).toBeNull();
    expect(total.b.executado).toBeNull();
  });

  it("x3: a URL escolhe o recorte; agrupamento fora do rol (inclusive chave de protótipo) cai no padrão", () => {
    const anos = [2027, 2026, 2025];
    expect(pedidoDaUrl({ exercicio: "2027" }, anos)).toEqual({ exercicioA: 2026, exercicioB: 2027, lado: "despesa", agrupamento: "unidade" });
    expect(pedidoDaUrl({ a: "2025", b: "2026", lado: "receita", por: "fonte" }, anos)).toEqual({
      exercicioA: 2025,
      exercicioB: 2026,
      lado: "receita",
      agrupamento: "fonte",
    });
    expect(pedidoDaUrl({ por: "constructor" }, anos).agrupamento).toBe("unidade");
    expect(pedidoDaUrl({ lado: "receita", por: "acao" }, anos).agrupamento).toBe("natureza");
  });
});
