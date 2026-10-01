import { describe, expect, it } from "vitest";
import { janelaCivilDoMes } from "../../../../packages/datas/index.js";
import { competenciaDoLeiaute, nomeArquivo } from "./nomenclatura.js";

/**
 * V25 — O MÊS DO PACOTE MENSAL. A porta da tela ancorava o mês no último instante civil (30/09 23:59 em
 * Brasília), que em UTC já é 01/10; o gerador lê o mês em UTC, e o pacote de setembro saía nomeado e
 * calculado como outubro. A âncora do leiaute é o último dia do mês à meia-noite UTC.
 */
describe("V25 — a competência mensal no eixo do leiaute", () => {
  const nome = (c: Date): string => nomeArquivo({ codUnidadeGestora: "999001", periodicidade: "MENSAL", entidade: "SaldoMensal", competencia: c });

  it("setembro sai como setembro; dezembro como dezembro; fevereiro de ano bissexto no dia 29 (N=3)", () => {
    expect(nome(competenciaDoLeiaute("2026-09"))).toBe("999001092026SaldoMensal.txt");
    expect(nome(competenciaDoLeiaute("2026-12"))).toBe("999001122026SaldoMensal.txt");
    expect(competenciaDoLeiaute("2028-02").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("a âncora antiga (o fim do mês civil) cai no mês seguinte em UTC — é o defeito que esta função fecha", () => {
    expect(nome(janelaCivilDoMes("2026-09").fim)).toBe("999001102026SaldoMensal.txt");
  });

  it("recusa competência fora do formato", () => {
    expect(() => competenciaDoLeiaute("09/2026")).toThrow(/AAAA-MM/);
  });
});
