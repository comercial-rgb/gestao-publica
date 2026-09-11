import { describe, expect, it } from "vitest";
import { Decimal } from "../../packages/contracts/index.js";
import {
  SINAL_MOVIMENTO_FISICO,
  TIPO_DO_ESTORNO_FISICO,
  bloqueiosAplicaveis,
  bloqueiosDoInventario,
  consumoNaCompetencia,
  converterParaEstoque,
  divergenciaDeInventario,
  posicaoDeEstoque,
  precoMedioDaPosicao,
  saldoNaoAtendido,
  validadeDoEstoque,
  type MovimentoParaPosicao,
  type TipoMovimentoFisicoEstoque,
} from "./estoque-fisico-dominio.js";

/**
 * ═══ O EIXO FÍSICO DO ALMOXARIFADO — REGIME DE PROFUNDIDADE ═══
 *
 * Este arquivo prova as decisões D1, D2, D3, D5, D6 e D14 da varredura do ENT05 como
 * PROPRIEDADES, e não como exemplos felizes:
 *
 *  · **caracterização** — o que o código faz hoje, escrito antes de mudar nada;
 *  · **fixture em hora de borda** — 23h50 de 31/12 no fuso do ente, que é onde o eixo
 *    de data quebra e onde o `c2` do ENT03c foi pego lendo por `toISOString`;
 *  · **N = 2** — duas entradas com preços diferentes, porque N = 1 não distingue preço
 *    médio de "o preço da última entrada";
 *  · **negação** — o que o domínio tem de RECUSAR, com o motivo junto.
 */

const ENTRADA_11H = new Date("2026-12-31T14:00:00.000Z"); // 11h de 31/12 em Sao_Paulo
/** ⚠️ 23h50 de 31/12 CIVIL do ente = 02h50 de 01/01 em UTC. É a hora de borda. */
const ENTRADA_2350 = new Date("2027-01-01T02:50:00.000Z");

function mov(
  tipo: TipoMovimentoFisicoEstoque,
  quantidade: string,
  valorTotal: string,
  dataMovimento: Date
): MovimentoParaPosicao {
  return { tipo, quantidade, valorTotal, dataMovimento };
}

describe("sinais e estornos — o Record exaustivo", () => {
  it("todo tipo base tem estorno, e nenhum estorno tem estorno", () => {
    for (const [tipo, estorno] of Object.entries(TIPO_DO_ESTORNO_FISICO)) {
      const ehEstorno = tipo.startsWith("ESTORNO_");
      if (ehEstorno) {
        expect(estorno, `${tipo} não pode ter estorno de estorno`).toBeNull();
        continue;
      }
      expect(estorno, `${tipo} ficou sem estorno`).not.toBeNull();
    }
  });

  it("o estorno tem SEMPRE o sinal oposto ao do movimento que desfaz", () => {
    for (const [tipo, estorno] of Object.entries(TIPO_DO_ESTORNO_FISICO)) {
      if (estorno === null) continue;
      const t = tipo as TipoMovimentoFisicoEstoque;
      expect(
        SINAL_MOVIMENTO_FISICO[estorno],
        `${estorno} devia desfazer ${tipo}, e tem o MESMO sinal — um estorno que soma ` +
          `no mesmo sentido dobra o movimento em vez de anulá-lo`
      ).toBe(-SINAL_MOVIMENTO_FISICO[t]);
    }
  });
});

describe("D1 · a posição é Σ até uma data civil, nunca uma coluna", () => {
  const movimentos = [
    mov("ENTRADA", "100", "500.00", new Date("2026-11-10T12:00:00.000Z")),
    mov("SAIDA", "30", "150.00", new Date("2026-12-05T12:00:00.000Z")),
    mov("ENTRADA", "50", "300.00", ENTRADA_2350),
  ];

  it("caracterização: a posição de hoje soma tudo", () => {
    const p = posicaoDeEstoque(movimentos);
    expect(p.quantidade.toFixed(4)).toBe("120.0000");
    expect(p.valor.toFixed(2)).toBe("650.00");
  });

  it("a posição ANTERIOR ao período é outra — é o que a 5.18.16 pede", () => {
    const p = posicaoDeEstoque(movimentos, "2026-11-30");
    expect(p.quantidade.toFixed(4)).toBe("100.0000");
    expect(p.valor.toFixed(2)).toBe("500.00");
  });

  it("⚠️ BORDA: a entrada das 23h50 de 31/12 pertence a 31/12, não a 01/01", () => {
    // Se o corte fosse por INSTANTE UTC, este movimento cairia em 2027-01-01 e a
    // posição de 31/12 viria com 70 em vez de 120. É o defeito exato do `c2`.
    const em31 = posicaoDeEstoque(movimentos, "2026-12-31");
    expect(
      em31.quantidade.toFixed(4),
      "a entrada de 31/12 às 23h50 civis ficou de fora da posição de 31/12 — o corte " +
        "está sendo feito por instante UTC, e não por dia civil do ente"
    ).toBe("120.0000");
  });

  it("o estorno devolve a posição ao que era", () => {
    const comEstorno = [
      ...movimentos,
      mov("ESTORNO_ENTRADA", "50", "300.00", new Date("2027-01-05T12:00:00.000Z")),
    ];
    const p = posicaoDeEstoque(comEstorno);
    expect(p.quantidade.toFixed(4)).toBe("70.0000");
    expect(p.valor.toFixed(2)).toBe("350.00");
  });
});

describe("D2 · preço médio derivado — e N=2 é o que distingue média de última entrada", () => {
  it("⚠️ N=2 com preços DIFERENTES: a média não é o preço da última entrada", () => {
    // 100 a R$ 5,00 e 100 a R$ 9,00 -> média 7,00. Com N=1 qualquer implementação
    // erradazinha passaria; é a segunda entrada que separa média de "a última".
    const p = posicaoDeEstoque([
      mov("ENTRADA", "100", "500.00", ENTRADA_11H),
      mov("ENTRADA", "100", "900.00", ENTRADA_11H),
    ]);
    expect(precoMedioDaPosicao(p).toFixed(6)).toBe("7.000000");
  });

  it("o preço médio de ONTEM não é o de hoje — ele é da janela pedida", () => {
    const ms = [
      mov("ENTRADA", "100", "500.00", new Date("2026-11-10T12:00:00.000Z")),
      mov("ENTRADA", "100", "900.00", new Date("2026-12-10T12:00:00.000Z")),
    ];
    expect(precoMedioDaPosicao(posicaoDeEstoque(ms, "2026-11-30")).toFixed(6)).toBe(
      "5.000000"
    );
    expect(precoMedioDaPosicao(posicaoDeEstoque(ms)).toFixed(6)).toBe("7.000000");
  });

  it("⚠️ NEGAÇÃO: estoque zerado NÃO tem preço médio — recusa, não devolve zero", () => {
    const p = posicaoDeEstoque([
      mov("ENTRADA", "10", "50.00", ENTRADA_11H),
      mov("SAIDA", "10", "50.00", ENTRADA_11H),
    ]);
    expect(() => precoMedioDaPosicao(p)).toThrow(/custo zero atravessa o razão/);
  });
});

describe("D6 · conversão para a unidade de estoque", () => {
  it("3 caixas de 12 viram 36 unidades", () => {
    expect(converterParaEstoque("3", "12").toFixed(4)).toBe("36.0000");
  });

  it("o fator é Decimal — 1 caixa de 12,5 kg existe", () => {
    expect(converterParaEstoque("4", "12.5").toFixed(4)).toBe("50.0000");
  });

  it("⚠️ NEGAÇÃO: fator zero ou negativo recusa — faria entrada virar saída", () => {
    expect(() => converterParaEstoque("3", "0")).toThrow(/entrada virar saída ou sumir/);
    expect(() => converterParaEstoque("3", "-2")).toThrow(/entrada virar saída ou sumir/);
  });
});

describe("D14 · bloqueio é fato com início e fim, e o inventário passa pela mesma porta", () => {
  const alvo = { materialId: "mat-1", depositoId: "dep-1" };

  it("os três alcances da 5.18.13 saem das duas colunas opcionais", () => {
    const bs = [
      { materialId: "mat-1", depositoId: null, inicio: new Date("2026-01-01T12:00:00Z"), fim: null, motivo: "material em toda parte" },
      { materialId: null, depositoId: "dep-1", inicio: new Date("2026-01-01T12:00:00Z"), fim: null, motivo: "depósito inteiro" },
      { materialId: "mat-1", depositoId: "dep-1", inicio: new Date("2026-01-01T12:00:00Z"), fim: null, motivo: "o par" },
      { materialId: "mat-9", depositoId: "dep-9", inicio: new Date("2026-01-01T12:00:00Z"), fim: null, motivo: "outro par" },
    ];
    expect(bloqueiosAplicaveis(bs, alvo, "2026-06-01").map((b) => b.motivo)).toEqual([
      "material em toda parte",
      "depósito inteiro",
      "o par",
    ]);
  });

  it("⚠️ BORDA: as duas pontas são INCLUSIVAS — começa hoje bloqueia hoje", () => {
    const b = [
      {
        materialId: null,
        depositoId: "dep-1",
        // 23h50 de 31/12 civis: se a comparação fosse por instante, "2026-12-31"
        // acharia que o bloqueio ainda não começou.
        inicio: ENTRADA_2350,
        fim: ENTRADA_2350,
        motivo: "um dia só",
      },
    ];
    expect(bloqueiosAplicaveis(b, alvo, "2026-12-31")).toHaveLength(1);
    expect(bloqueiosAplicaveis(b, alvo, "2026-12-30")).toHaveLength(0);
    expect(bloqueiosAplicaveis(b, alvo, "2027-01-01")).toHaveLength(0);
  });

  it("o inventário ABERTO bloqueia; o fechado deixa de bloquear no dia seguinte", () => {
    const bs = bloqueiosDoInventario([
      {
        depositoId: "dep-1",
        dataAbertura: new Date("2026-06-01T12:00:00Z"),
        dataFechamento: new Date("2026-06-10T12:00:00Z"),
      },
    ]);
    expect(bloqueiosAplicaveis(bs, alvo, "2026-06-10")).toHaveLength(1);
    expect(bloqueiosAplicaveis(bs, alvo, "2026-06-11")).toHaveLength(0);
  });
});

describe("5.18.14 · vencidos e a vencer, com a fronteira que decide se o remédio é servido", () => {
  const lotes = [
    { id: "l1", identificacao: "A", validade: new Date("2026-06-09T12:00:00Z") },
    { id: "l2", identificacao: "B", validade: new Date("2026-06-10T12:00:00Z") },
    { id: "l3", identificacao: "C", validade: new Date("2026-07-10T12:00:00Z") },
    { id: "l4", identificacao: "D", validade: new Date("2026-07-11T12:00:00Z") },
    { id: "l5", identificacao: "E", validade: null },
  ];

  it("⚠️ o lote que vence HOJE não está vencido — ele vence no fim do dia", () => {
    const v = validadeDoEstoque(lotes, "2026-06-10");
    expect(v.vencidos.map((l) => l.identificacao)).toEqual(["A"]);
    expect(v.aVencer.map((l) => l.identificacao)).toEqual(["B", "C"]);
  });

  it("⚠️ 30 dias é inclusivo; 31 já está fora", () => {
    const v = validadeDoEstoque(lotes, "2026-06-10", 30);
    expect(v.aVencer.map((l) => l.identificacao)).toContain("C"); // exatamente 30
    expect(v.aVencer.map((l) => l.identificacao)).not.toContain("D"); // 31
  });

  it("lote sem validade não é vencido nem a vencer — ausência não é data", () => {
    const v = validadeDoEstoque(lotes, "2030-01-01");
    expect([...v.vencidos, ...v.aVencer].map((l) => l.id)).not.toContain("l5");
  });
});

describe("D5 · saldo não atendido — Σ, e o estorno devolve", () => {
  it("atendimento PARCIAL deixa saldo, e é o que a 5.18.9 pede", () => {
    const s = saldoNaoAtendido("100", [{ tipo: "SAIDA", quantidade: "30" }]);
    expect(s.toFixed(4)).toBe("70.0000");
  });

  it("dois atendimentos somam", () => {
    const s = saldoNaoAtendido("100", [
      { tipo: "SAIDA", quantidade: "30" },
      { tipo: "SAIDA", quantidade: "45" },
    ]);
    expect(s.toFixed(4)).toBe("25.0000");
  });

  it("⚠️ o estorno da saída DEVOLVE o saldo — é onde uma coluna derraparia", () => {
    const s = saldoNaoAtendido("100", [
      { tipo: "SAIDA", quantidade: "30" },
      { tipo: "ESTORNO_SAIDA", quantidade: "30" },
    ]);
    expect(s.toFixed(4)).toBe("100.0000");
  });
});

describe("5.18.4 · a cota é MENSAL, e o mês é o do FATO", () => {
  it("⚠️ BORDA: requisição de 31/12 às 23h50 consome a cota de DEZEMBRO", () => {
    const total = consumoNaCompetencia(
      [{ tipo: "SAIDA", quantidade: "10", dataMovimento: ENTRADA_2350 }],
      "2026-12"
    );
    expect(
      total.toFixed(4),
      "a saída das 23h50 de 31/12 civis foi para a competência de janeiro — a " +
        "competência está sendo lida do instante UTC, e não do calendário do ente"
    ).toBe("10.0000");
  });

  it("o estorno devolve a cota", () => {
    const total = consumoNaCompetencia(
      [
        { tipo: "SAIDA", quantidade: "10", dataMovimento: ENTRADA_11H },
        { tipo: "ESTORNO_SAIDA", quantidade: "4", dataMovimento: ENTRADA_11H },
      ],
      "2026-12"
    );
    expect(total.toFixed(4)).toBe("6.0000");
  });
});

describe("D3 · o inventário guarda o juízo; a divergência é derivada", () => {
  it("contado menos calculado, com sinal — sobra é positiva, falta é negativa", () => {
    const p = { quantidade: new Decimal("100"), valor: new Decimal("500") };
    expect(divergenciaDeInventario("103", p).divergencia.toFixed(4)).toBe("3.0000");
    expect(divergenciaDeInventario("97", p).divergencia.toFixed(4)).toBe("-3.0000");
  });

  it("a divergência é sempre recalculada a partir da posição da data", () => {
    const ms = [
      mov("ENTRADA", "100", "500.00", new Date("2026-06-01T12:00:00Z")),
      mov("SAIDA", "40", "200.00", new Date("2026-06-20T12:00:00Z")),
    ];
    // O inventário fechou em 10/06: a saída de 20/06 NÃO conta para ele.
    const d = divergenciaDeInventario("100", posicaoDeEstoque(ms, "2026-06-10"));
    expect(d.calculado.toFixed(4)).toBe("100.0000");
    expect(d.divergencia.toFixed(4)).toBe("0.0000");
  });
});
