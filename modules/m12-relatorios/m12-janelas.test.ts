import { describe, expect, it } from "vitest";
import { diaCivil, instanteCivil } from "../../packages/datas/index.js";
import { janelaDoBimestre } from "./rreo-anexo1.js";
import { janelaDosDozeMeses } from "./rreo-anexo3.js";

/**
 * ═══ AS RÉGUAS DE PERÍODO DOS RELATÓRIOS — E ELAS SÃO CIVIS ═══
 *
 * `janelaDoBimestre` é a régua de OITO anexos do RREO; `janelaDosDozeMeses` é a da RCL, que
 * entra no limite de pessoal e no de endividamento. As duas eram montadas com `Date.UTC`, e
 * a janela do 1º bimestre de 2026 nascia em **31/12/2025 às 21:00** e morria em **28/02 às
 * 20:59** — três horas do exercício anterior dentro, três horas do bimestre fora.
 *
 * ⚠️ ESTE ARQUIVO EXISTE POR CAUSA DE UMA MUTAÇÃO QUE FICOU VERDE. Corrigido o
 * `janelaDoBimestre`, `scripts/mutacoes-eixo-de-data.ts` devolveu o `Date.UTC` ao lugar e
 * **nenhum teste do repositório acusou** — os anexos do RREO todos passavam, porque as
 * fixtures deles usam meio-dia e ao meio-dia os dois eixos coincidem. Um sítio corrigido
 * sem nada que vigie a volta do defeito vale por hoje e não vale por amanhã.
 *
 * ⚠️ AS ASSERÇÕES SÃO EM INSTANTE EXATO, de propósito. Afirmar apenas `diaCivil(inicio) ===
 * "2026-01-01"` passaria tanto com 00:00 quanto com 03:00 locais — e é a HORA da borda que
 * decide se a receita das 22:00 do último dia entra no bimestre.
 */
describe("M12 — as janelas de período são civis", () => {
  it("t1: o 1º bimestre começa em 01/01 às 00:00 civis e acaba no último instante de 28/02", () => {
    const j = janelaDoBimestre(2026, 1);
    expect(j.inicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(j.fim.toISOString()).toBe("2026-03-01T02:59:59.999Z");
    expect(j.inicioExercicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
  });

  it("t2: o 6º bimestre acaba no último instante CIVIL de 31/12 — não às 20:59", () => {
    const j = janelaDoBimestre(2026, 6);
    expect(diaCivil(j.inicio)).toBe("2026-11-01");
    expect(diaCivil(j.fim)).toBe("2026-12-31");
    expect(j.fim.toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });

  it("t3: o fato de 22:00 do último dia do bimestre está DENTRO dele, e só dele", () => {
    // ⚠️ É O CASO QUE MOTIVOU TUDO. Uma arrecadação lançada em 28/02 às 22:00 pertence ao
    // 1º bimestre; no eixo de Greenwich ela caía no 2º, e os dois RREO publicados deixavam
    // de bater entre si sem que nenhuma conta estivesse errada.
    const fato = instanteCivil(2026, 2, 28, 22, 0);
    const b1 = janelaDoBimestre(2026, 1);
    const b2 = janelaDoBimestre(2026, 2);
    expect(fato >= b1.inicio && fato <= b1.fim).toBe(true);
    expect(fato >= b2.inicio && fato <= b2.fim).toBe(false);
  });

  it("t4: as seis janelas do exercício são contíguas e não se sobrepõem", () => {
    for (const b of [1, 2, 3, 4, 5] as const) {
      const atual = janelaDoBimestre(2026, b);
      const seguinte = janelaDoBimestre(2026, (b + 1) as 2 | 3 | 4 | 5 | 6);
      // Contíguas ao milissegundo: sem buraco onde um fato se perca, sem sobreposição
      // onde ele seja contado duas vezes.
      expect(seguinte.inicio.getTime() - atual.fim.getTime(), `bimestre ${b}`).toBe(1);
    }
  });

  it("t5: a corrida de doze meses do 1º bimestre recua para março do exercício anterior", () => {
    const j = janelaDosDozeMeses(2026, 1);
    expect(j).toHaveLength(12);
    expect(j[0]!.rotulo).toBe("Mar/2025");
    expect(j[11]!.rotulo).toBe("Fev/2026");
    expect(j[0]!.desde.toISOString()).toBe("2025-03-01T03:00:00.000Z");
    expect(j[11]!.ate.toISOString()).toBe("2026-03-01T02:59:59.999Z");
  });

  it("t6: as doze janelas mensais também são contíguas — a RCL não conta nem perde mês", () => {
    const j = janelaDosDozeMeses(2026, 6);
    expect(j[0]!.rotulo).toBe("Jan/2026");
    expect(j[11]!.rotulo).toBe("Dez/2026");
    for (let i = 0; i < 11; i++) {
      expect(j[i + 1]!.desde.getTime() - j[i]!.ate.getTime(), `mês ${i}`).toBe(1);
    }
    // e cada rótulo corresponde ao dia civil do próprio início.
    for (const m of j) {
      expect(diaCivil(m.desde).slice(0, 7)).toBe(
        `${m.ano}-${String(m.mes).padStart(2, "0")}`
      );
    }
  });
});
