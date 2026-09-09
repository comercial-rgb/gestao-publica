import { describe, expect, it } from "vitest";
import { toMoney } from "../contracts/index.js";
import type { LancamentoContabil, Partida } from "./lancamento.js";
import { validarLancamento } from "./motor.js";
import { gerarEstorno } from "./estorno.js";

function debito(
  conta: string,
  valor: string,
  subsistema: Partida["subsistema"] = "PATRIMONIAL"
): Partida {
  return { conta, tipo: "DEBITO", subsistema, valor: toMoney(valor) };
}

function credito(
  conta: string,
  valor: string,
  subsistema: Partida["subsistema"] = "PATRIMONIAL"
): Partida {
  return { conta, tipo: "CREDITO", subsistema, valor: toMoney(valor) };
}

describe("motor de partidas dobradas (validarLancamento)", () => {
  it("aceita lançamento balanceado 1x1", () => {
    const partidas = [
      debito("1.1.1.1.1.00.00", "1500.00"),
      credito("1.1.2.2.1.00.00", "1500.00"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(2);
  });

  it("aceita lançamento balanceado com 2 débitos + 1 crédito somando igual", () => {
    const partidas = [
      debito("1.1.1.1.1.00.00", "750.50"),
      debito("1.1.1.1.2.00.00", "249.50"),
      credito("1.1.2.2.1.00.00", "1000.00"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(3);
  });

  it("aceita lançamento balanceado com 1 débito + 2 créditos somando igual", () => {
    const partidas = [
      debito("1.1.1.1.1.00.00", "1000.00"),
      credito("1.1.2.2.1.00.00", "750.50"),
      credito("2.1.1.1.0.00.00", "249.50"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(3);
  });

  it("REJEITA pernas que NÃO somam (ΣDEBITO != ΣCREDITO) — teste real do motor", () => {
    // 2 débitos = 1000.00; 1 crédito = 999.99. O motor tem de pegar.
    expect(() =>
      validarLancamento([
        debito("1.1.1.1.1.00.00", "750.50"),
        debito("1.1.1.1.2.00.00", "249.50"),
        credito("1.1.2.2.1.00.00", "999.99"),
      ])
    ).toThrow(/desbalanceado/i);
  });

  it("REJEITA lançamento sem nenhum crédito", () => {
    expect(() =>
      validarLancamento([
        debito("1.1.1.1.1.00.00", "500.00"),
        debito("1.1.1.1.2.00.00", "500.00"),
      ])
    ).toThrow(/partida simples/i);
  });

  it("REJEITA lançamento sem nenhum débito", () => {
    expect(() =>
      validarLancamento([
        credito("1.1.2.2.1.00.00", "500.00"),
        credito("2.1.1.1.0.00.00", "500.00"),
      ])
    ).toThrow(/partida simples/i);
  });

  it("REJEITA valor <= 0", () => {
    expect(() =>
      validarLancamento([
        debito("1.1.1.1.1.00.00", "0.00"),
        credito("1.1.2.2.1.00.00", "0.00"),
      ])
    ).toThrow(/valor deve ser > 0/);
    expect(() =>
      validarLancamento([
        debito("1.1.1.1.1.00.00", "-10.00"),
        credito("1.1.2.2.1.00.00", "-10.00"),
      ])
    ).toThrow(/valor deve ser > 0/);
  });

  it("REJEITA lançamento vazio", () => {
    expect(() => validarLancamento([])).toThrow(/vazio/i);
  });

  it("aceita multi-subsistema quando CADA subsistema fecha sozinho", () => {
    const partidas = [
      debito("5.2.1.1.0.00.00", "800.00", "ORCAMENTARIO"),
      credito("6.2.1.1.0.00.00", "800.00", "ORCAMENTARIO"),
      debito("1.1.1.1.1.00.00", "800.00", "PATRIMONIAL"),
      credito("2.1.1.1.0.00.00", "800.00", "PATRIMONIAL"),
    ];
    expect(validarLancamento(partidas)).toHaveLength(4);
  });

  it("REJEITA subsistema desbalanceado ainda que o total feche", () => {
    // Total: 1000 D / 1000 C. Mas ORCAMENTARIO tem 800 D / 700 C e
    // PATRIMONIAL tem 200 D / 300 C — cada subsistema deve fechar sozinho.
    expect(() =>
      validarLancamento([
        debito("5.2.1.1.0.00.00", "800.00", "ORCAMENTARIO"),
        credito("6.2.1.1.0.00.00", "700.00", "ORCAMENTARIO"),
        debito("1.1.1.1.1.00.00", "200.00", "PATRIMONIAL"),
        credito("2.1.1.1.0.00.00", "300.00", "PATRIMONIAL"),
      ])
    ).toThrow(/subsistema ORCAMENTARIO/);
  });

  it("REJEITA subsistema com partida simples ainda que o total feche", () => {
    // ORCAMENTARIO só tem débito; PATRIMONIAL só tem crédito. Total fecha.
    expect(() =>
      validarLancamento([
        debito("5.2.1.1.0.00.00", "500.00", "ORCAMENTARIO"),
        credito("2.1.1.1.0.00.00", "500.00", "PATRIMONIAL"),
      ])
    ).toThrow(/partida simples no subsistema/i);
  });
});

describe("estorno (gerarEstorno)", () => {
  const original: LancamentoContabil = {
    id: "lanc-001",
    numeroControle: "2026NL000001",
    partidas: [
      debito("1.1.1.1.1.00.00", "1500.00"),
      credito("1.1.2.2.1.00.00", "1200.00"),
      credito("2.1.1.1.0.00.00", "300.00"),
    ],
    dataTransacao: new Date("2026-07-01T12:00:00Z"),
    historico: "Arrecadação de IPTU",
    estornos: [],
  };

  it("gera lançamento NOVO com pernas invertidas; original permanece intacto", () => {
    const snapshot = original.partidas.map((p) => ({
      conta: p.conta,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
    }));

    const estorno = gerarEstorno(original, {
      idEstorno: "lanc-002",
      numeroControleEstorno: "2026NL000099",
      dataEstorno: new Date("2026-07-02T12:00:00Z"),
    });

    expect(estorno).not.toBe(original);
    expect(estorno.id).toBe("lanc-002");
    expect(estorno.estornoDeId).toBe("lanc-001");
    expect(estorno.estornos).toEqual([]);

    // tipo invertido; conta, subsistema e valor preservados
    expect(estorno.partidas).toHaveLength(3);
    for (const [i, partida] of estorno.partidas.entries()) {
      const antes = original.partidas[i]!;
      expect(partida.conta).toBe(antes.conta);
      expect(partida.subsistema).toBe(antes.subsistema);
      expect(partida.valor.equals(antes.valor)).toBe(true);
      expect(partida.tipo).toBe(antes.tipo === "DEBITO" ? "CREDITO" : "DEBITO");
    }

    // o estorno é, ele mesmo, um lançamento válido
    expect(() => validarLancamento(estorno.partidas)).not.toThrow();

    // INVARIANTE 3: NENHUM campo do original foi alterado
    expect(original.id).toBe("lanc-001");
    expect(original.numeroControle).toBe("2026NL000001");
    expect(original.historico).toBe("Arrecadação de IPTU");
    expect(original.estornoDeId).toBeUndefined();
    expect(original.estornos).toEqual([]);
    expect(
      original.partidas.map((p) => ({
        conta: p.conta,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: p.valor.toFixed(2),
      }))
    ).toEqual(snapshot);
  });

  /**
   * ⚠️ AQUI MORAVAM OS DOIS TESTES DA COMPETÊNCIA DORMENTE — e eles morreram COM ela.
   *
   * Um provava que o estorno HERDAVA a competência do original; o outro, que
   * `competenciaEstorno` a sobrescrevia. Os dois passavam, e os dois provavam uma coisa que
   * NÃO ACONTECIA EM LUGAR NENHUM: nada no repositório lia a competência do lançamento — nem
   * relatório, nem corte, nem filtro. O `competenciaEstorno` prometia "fazer o estorno cair na
   * competência aberta" e, em produção, ninguém jamais o passou.
   *
   * Era o pior tipo de teste verde: ele guardava um comportamento que ninguém consumia, e ao
   * guardá-lo dava a impressão de que alguém consumia.
   *
   * O que SOBRA é a única data que decide alguma coisa — e é ela que este teste fixa.
   */
  it("o estorno carrega a data do ATO (dataEstorno) — e não há segunda data", () => {
    const estorno = gerarEstorno(original, {
      idEstorno: "lanc-002",
      numeroControleEstorno: "2026NL000099",
      dataEstorno: new Date("2026-08-02T12:00:00Z"),
    });

    // A data do ATO de estornar, não a do fato original. É por ela que o travamento (M16) e
    // TODOS os relatórios cortam — estornar em agosto um fato de julho é um fato DE AGOSTO.
    expect(estorno.dataTransacao).toEqual(new Date("2026-08-02T12:00:00Z"));
    expect(estorno.dataTransacao).not.toEqual(original.dataTransacao);

    // ...e não existe um segundo carimbo de data escondido no lançamento.
    expect(Object.keys(estorno)).not.toContain("competencia");
  });

  it("REJEITA estornar lançamento já estornado (lido de `estornos`)", () => {
    const jaEstornado: LancamentoContabil = {
      ...original,
      estornos: ["lanc-002"],
    };
    expect(() =>
      gerarEstorno(jaEstornado, {
        idEstorno: "lanc-003",
        numeroControleEstorno: "2026NL000100",
        dataEstorno: new Date("2026-07-03T12:00:00Z"),
      })
    ).toThrow(/já foi estornado/);
  });
});
