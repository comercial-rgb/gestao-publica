import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import {
  categoriaDaReceita,
  montarBalancoOrcamentario,
  origemDaReceita,
  serializar,
  sinalDaReceitaRealizada,
  SINAL_PREVISAO,
  SINAL_RECEITA_REALIZADA,
  type FatoDespesa,
  type FatoReceita,
  type FatosBalanco,
} from "./dominio.js";

/**
 * M12 — o domínio puro do Anexo 12.
 *
 * Aqui moram os casos que o teste de ouro NÃO cobre por construção: dedução de
 * receita, retificação (sinal indefinido), e o superávit — o outro lado da linha
 * de equilíbrio.
 */

const receita = (codigo: string, previsto: string, realizado: string): FatoReceita => ({
  codigoNatureza: codigo,
  previsto: toMoney(previsto),
  realizado: toMoney(realizado),
});

const despesa = (empenhadas: string): FatoDespesa => ({
  codCategoria: "3",
  codGrupo: "3",
  dotacaoInicial: toMoney("0.00"),
  creditosAdicionais: toMoney("0.00"),
  empenhadas: toMoney(empenhadas),
  liquidadas: toMoney("0.00"),
  pagas: toMoney("0.00"),
});

const fatos = (
  receitas: readonly FatoReceita[],
  despesas: readonly FatoDespesa[]
): FatosBalanco => ({
  exercicio: 2026,
  parcial: false,
  receitas,
  despesas,
  restos: [],
  saldosExerciciosAnteriores: toMoney("0.00"),
});

const linha = (b: ReturnType<typeof montarBalancoOrcamentario>, nota: string) => ({
  r: b.receitas.find((l) => l.nota === nota),
  d: b.despesas.find((l) => l.nota === nota),
});

describe("M12 — sinais (a verdade é o SUM, e o SUM precisa do sinal)", () => {
  it("DEDUÇÃO subtrai da previsão; orçamentária e intra somam", () => {
    expect(SINAL_PREVISAO.ORCAMENTARIA).toBe(1);
    expect(SINAL_PREVISAO.INTRA_ORCAMENTARIA).toBe(1);
    // O caso clássico: prevê-se o FUNDEB e deduz-se a parcela transferida.
    // Somar a dedução como previsão infla a receita prevista do ente.
    expect(SINAL_PREVISAO.DEDUCAO).toBe(-1);
  });

  it("ANULAÇÃO subtrai da realizada (é a definição do M04)", () => {
    expect(sinalDaReceitaRealizada("ARRECADACAO")).toBe(1);
    expect(sinalDaReceitaRealizada("ANULACAO")).toBe(-1);
  });

  it("RETIFICAÇÃO: sinal INDEFINIDO — o relatório PARA (fail-closed)", () => {
    // O enum tem o valor, o M04 nunca o emite, e a semântica (delta? valor novo?)
    // não está escrita. Chutar aqui publicaria receita errada no Anexo 12.
    expect(SINAL_RECEITA_REALIZADA.RETIFICACAO).toBeNull();
    expect(() => sinalDaReceitaRealizada("RETIFICACAO")).toThrow(
      /não tem sinal definido/
    );
  });
});

describe("M12 — classificação (as linhas saem do CÓDIGO, que vem do banco)", () => {
  it("categoria = 1º dígito; origem = 2º", () => {
    expect(categoriaDaReceita("11130111")).toBe("1");
    expect(categoriaDaReceita("24100000")).toBe("2");
    expect(origemDaReceita("11130111")).toBe("1.1");
    expect(origemDaReceita("24100000")).toBe("2.4");
  });

  it("REJEITA categoria que o Anexo 12 não tem linha para receber", () => {
    expect(() => categoriaDaReceita("31130111")).toThrow(/não é categoria/);
  });
});

describe("M12 — a linha de equilíbrio", () => {
  it("SUPERÁVIT: realizada > empenhada → entra na coluna EMPENHADAS da despesa", () => {
    // arrecada 10.000, empenha 6.000 -> superávit de 4.000
    const b = montarBalancoOrcamentario(
      fatos([receita("11130111", "10000.00", "10000.00")], [despesa("6000.00")])
    );

    expect(linha(b, "XIV").d!.rotulo).toBe("SUPERÁVIT");
    expect(linha(b, "XIV").d!.empenhadas).toBe("4000.00");
    // o déficit, no mesmo balanço, é ZERO — eles nunca coexistem
    expect(linha(b, "VI").r!.realizadas).toBe("0.00");

    // e a amarração fecha: 10.000 == 6.000 + 4.000
    expect(linha(b, "VII").r!.realizadas).toBe("10000.00");
    expect(linha(b, "XV").d!.empenhadas).toBe("10000.00");
  });

  it("DÉFICIT: empenhada > realizada → entra na coluna REALIZADAS da receita", () => {
    const b = montarBalancoOrcamentario(
      fatos([receita("11130111", "10000.00", "5000.00")], [despesa("8000.00")])
    );

    expect(linha(b, "VI").r!.realizadas).toBe("3000.00"); // 8.000 − 5.000
    expect(linha(b, "XIV").d!.empenhadas).toBe("0.00");
    expect(linha(b, "VII").r!.realizadas).toBe("8000.00");
    expect(linha(b, "XV").d!.empenhadas).toBe("8000.00");
  });

  it("EQUILÍBRIO EXATO: nem déficit nem superávit", () => {
    const b = montarBalancoOrcamentario(
      fatos([receita("11130111", "7000.00", "7000.00")], [despesa("7000.00")])
    );
    expect(linha(b, "VI").r!.realizadas).toBe("0.00");
    expect(linha(b, "XIV").d!.empenhadas).toBe("0.00");
    expect(linha(b, "VII").r!.realizadas).toBe("7000.00");
  });

  it("balanço VAZIO: fecha em zero (e não explode)", () => {
    const b = montarBalancoOrcamentario(fatos([], []));
    expect(linha(b, "VII").r!.realizadas).toBe("0.00");
    expect(linha(b, "XV").d!.empenhadas).toBe("0.00");
  });
});

describe("M12 — serialização do dinheiro", () => {
  it("Decimal vira string com 2 casas — nunca number", () => {
    expect(serializar(toMoney("1234.5"))).toBe("1234.50");
    expect(serializar(toMoney("-2000"))).toBe("-2000.00");
    expect(typeof serializar(toMoney("0"))).toBe("string");
  });
});
