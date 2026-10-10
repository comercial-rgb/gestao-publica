import { describe, expect, it } from "vitest";
import { casaComABusca, LINHAS_POR_PAGINA, paginaDaLinha, recortar } from "../../app/(areas)/planejamento/proposta-orcamentaria/recorte-da-pagina";

/**
 * V39-013/014 — o recorte da página da proposta. N = 2,5 páginas (250 linhas): a última página é parcial, as páginas
 * juntas dão todas sem repetir, e o total do filtro é o do conjunto filtrado inteiro (não o da página).
 */
const linhas = Array.from({ length: 250 }, (_, i) => ({ id: `l${String(i)}`, texto: i % 2 === 0 ? `Ficha ${String(i)} 3.3.90.30 Educação fonte 500` : `Ficha ${String(i)} 4.4.90.52 Saúde fonte 540` }));
const texto = (l: { texto: string }): string => l.texto;

describe("V39 — o recorte da página da proposta (puro)", () => {
  it("pagina de 100 em 100: as três páginas dão as 250 linhas, sem repetir, e a última tem 50", () => {
    const p = [1, 2, 3].map((n) => recortar(linhas, texto, "", n));
    expect(p.map((r) => [r.linhas.length, r.primeira, r.ultima, r.paginas])).toEqual([[100, 1, 100, 3], [100, 101, 200, 3], [50, 201, 250, 3]]);
    expect(new Set(p.flatMap((r) => r.linhas.map((l) => l.id))).size).toBe(250);
    // página fora do intervalo vira a última; zero ou negativa vira a primeira
    expect([recortar(linhas, texto, "", 99).pagina, recortar(linhas, texto, "", 0).pagina, recortar(linhas, texto, "", Number.NaN).pagina]).toEqual([3, 1, 1]);
    expect(LINHAS_POR_PAGINA).toBe(100);
  });

  it("a busca ignora acento e caixa, acha código só pelos dígitos, e o total do filtro é do conjunto inteiro", () => {
    const saude = recortar(linhas, texto, "saude", 1);
    expect([saude.filtradas.length, saude.linhas.length, saude.paginas, saude.total]).toEqual([125, 100, 2, 250]);
    expect(recortar(linhas, texto, "339030", 2).filtradas.length).toBe(125);
    expect(recortar(linhas, texto, "3.3.90.30", 1).filtradas.length).toBe(125);
    const nada = recortar(linhas, texto, "inexistente", 1);
    expect([nada.linhas.length, nada.primeira, nada.ultima, nada.paginas]).toEqual([0, 0, 0, 1]);
    // "fonte 500" é texto, não código: não vira "500" solto casando com qualquer número
    expect(casaComABusca("Ficha 1500 fonte 540", "fonte 500")).toBe(false);
  });

  it("acha a página da linha a editar", () => {
    const f = recortar(linhas, texto, "", 1).filtradas;
    expect([paginaDaLinha(f, (l) => l.id === "l0"), paginaDaLinha(f, (l) => l.id === "l150"), paginaDaLinha(f, (l) => l.id === "x")]).toEqual([1, 2, null]);
  });
});
