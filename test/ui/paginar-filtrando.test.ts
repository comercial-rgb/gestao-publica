import { describe, expect, it } from "vitest";
import { paginarFiltrando } from "../../lib/portas/paginar-filtrando.js";

/**
 * V37 — a página colhida em lotes (`paginarFiltrando`), contra uma consulta em memória que conta as chamadas. As
 * fronteiras importam: o lote é de 100, e o que decide "há mais" é achar UM além da página.
 */

function consulta(linhas: readonly number[]): { readonly fn: (skip: number, take: number) => Promise<readonly number[]>; readonly chamadas: () => number } {
  let n = 0;
  return {
    fn: (skip, take) => {
      n += 1;
      return Promise.resolve(linhas.slice(skip, skip + take));
    },
    chamadas: () => n,
  };
}

const ate = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("paginarFiltrando", () => {
  it("t1: atravessa lotes até encher a página (o mantido está depois do primeiro lote)", async () => {
    // 250 linhas; só as múltiplas de 10 ficam: 25 mantidas, espalhadas por três lotes.
    const c = consulta(ate(250));
    const p1 = await paginarFiltrando(c.fn, (x) => x % 10 === 0, 1, 20);
    expect([p1.linhas, p1.temMais]).toEqual([ate(20).map((i) => i * 10), true]);
    const p2 = await paginarFiltrando(c.fn, (x) => x % 10 === 0, 2, 20);
    expect([p2.linhas, p2.temMais]).toEqual([[200, 210, 220, 230, 240], false]);
  });

  it("t2: página exatamente cheia e nada além — sem 'há mais'; um mantido além, mesmo no lote seguinte — com", async () => {
    const vinte = await paginarFiltrando(consulta(ate(120)).fn, (x) => x < 20, 1, 20);
    expect([vinte.linhas.length, vinte.temMais]).toEqual([20, false]);
    // Os 20 primeiros no lote 1, e o 21º só na linha 105 (lote 2).
    const mais = await paginarFiltrando(consulta(ate(120)).fn, (x) => x < 20 || x === 105, 1, 20);
    expect([mais.linhas.length, mais.temMais]).toEqual([20, true]);
  });

  it("t3: para quando tem o que precisa (não lê a tabela inteira) e quando a consulta acaba", async () => {
    const longa = consulta(ate(1000));
    await paginarFiltrando(longa.fn, () => true, 1, 20);
    expect(longa.chamadas()).toBe(1);
    const curta = consulta(ate(30));
    const r = await paginarFiltrando(curta.fn, () => false, 1, 20);
    expect([r.linhas, r.temMais, curta.chamadas()]).toEqual([[], false, 1]);
  });
});
