import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { criarOrdemCronologicaPrisma } from "./adapter-prisma.js";
import {
  avaliarOrdem,
  cabecaDaFila,
  ordenarFila,
  posicaoNaFila,
  zJustificativaQuebraOrdemInput,
  type LiquidacaoNaFila,
} from "./dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { FICHA_500, FICHA_540, FONTE_500, FONTE_540, POR, empenharELiquidar, semearM06 } from "./fixture-m06.js";

// ── DOMÍNIO PURO (sem banco) ───────────────────────────────────────────────

function liq(
  id: string,
  numero: string,
  data: string,
  saldo = "100.00"
): LiquidacaoNaFila {
  return {
    liquidacaoId: id,
    numero,
    dataLiquidacao: new Date(data),
    fonteId: "f500",
    categoria: "FORNECIMENTO_BENS",
    saldoAPagar: toMoney(saldo),
  };
}

describe("M06 — ordenarFila (puro)", () => {
  it("ordena pela data de liquidação (marco de exigibilidade, art. 141 caput)", () => {
    const fila = ordenarFila([
      liq("c", "NL3", "2026-03-10"),
      liq("a", "NL1", "2026-01-05"),
      liq("b", "NL2", "2026-02-20"),
    ]);
    expect(fila.map((l) => l.liquidacaoId)).toEqual(["a", "b", "c"]);
  });

  it("desempata pelo NÚMERO quando a data é a mesma (a fila precisa de ordem TOTAL)", () => {
    // sem desempate, "cabeça da fila" seria ambíguo e a regra viraria loteria
    const fila = ordenarFila([
      liq("z", "NL9", "2026-01-05"),
      liq("a", "NL1", "2026-01-05"),
      liq("m", "NL5", "2026-01-05"),
    ]);
    expect(fila.map((l) => l.numero)).toEqual(["NL1", "NL5", "NL9"]);
  });

  /**
   * ⚠️ O DESEMPATE SÓ EXISTE SE HOUVER EMPATE — e comparando INSTANTES ele nunca havia.
   *
   * Duas liquidações do MESMO dia civil, gravadas em horas diferentes, não empatavam por
   * `getTime()`. O desempate pelo número — que é o que dá ordem TOTAL à fila do art. 141 —
   * simplesmente não rodava, e a ordem cronológica virava a ordem de quem digitou
   * primeiro. Auditável não é.
   *
   * Aqui as duas são de 05/01 no calendário do ente, em horas distintas: `NL9` às 08:00 e
   * `NL1` às 22:00. Por instante, `NL9` viria primeiro. Pelo dia civil elas empatam, e o
   * número decide — `NL1` antes de `NL9`.
   */
  it("empata liquidações do MESMO DIA CIVIL, ainda que em horas diferentes", () => {
    const fila = ordenarFila([
      // 05/01 às 08:00 no horário do ente.
      liq("z", "NL9", "2026-01-05T11:00:00Z"),
      // 05/01 às 22:00 no horário do ente — MESMO dia civil, instante posterior.
      liq("a", "NL1", "2026-01-06T01:00:00Z"),
    ]);
    expect(fila.map((l) => l.numero)).toEqual(["NL1", "NL9"]);
  });

  /**
   * ⚠️ E A VIRADA DO DIA NÃO PODE INVERTER A FILA. Uma liquidação de 30/06 às 22:00
   * (civil) é `2026-07-01T01:00Z`. Pelo instante ela ordenaria DEPOIS de uma de 01/07 pela
   * manhã (`2026-07-01T11:00Z`) — invertendo dois dias diferentes, e preterindo a mais
   * antiga.
   */
  it("a liquidação da NOITE de 30/06 vem antes da MANHÃ de 01/07", () => {
    const fila = ordenarFila([
      liq("manha01", "NL2", "2026-07-01T11:00:00Z"), // 01/07 às 08:00 civil
      liq("noite30", "NL1", "2026-07-01T01:00:00Z"), // 30/06 às 22:00 civil
    ]);
    expect(fila.map((l) => l.liquidacaoId)).toEqual(["noite30", "manha01"]);
  });

  it("não muta o array original", () => {
    const original = [liq("c", "NL3", "2026-03-10"), liq("a", "NL1", "2026-01-05")];
    const copia = [...original];
    ordenarFila(original);
    expect(original).toEqual(copia);
  });

  it("fila vazia: sem cabeça", () => {
    expect(cabecaDaFila([])).toBeNull();
    expect(posicaoNaFila([], "x")).toBeNull();
  });
});

describe("M06 — avaliarOrdem (puro)", () => {
  const fila = [
    liq("a", "NL1", "2026-01-05"),
    liq("b", "NL2", "2026-02-20"),
    liq("c", "NL3", "2026-03-10"),
  ];

  it("a cabeça da fila não precisa de justificativa", () => {
    const r = avaliarOrdem(fila, "a");
    expect(r.ehCabecaDaFila).toBe(true);
    expect(r.posicao).toBe(1);
    expect(r.preterida).toBeNull();
  });

  it("fora de ordem: aponta QUEM está sendo preterido", () => {
    const r = avaliarOrdem(fila, "c");
    expect(r.ehCabecaDaFila).toBe(false);
    expect(r.posicao).toBe(3);
    expect(r.preterida?.liquidacaoId).toBe("a"); // a mais antiga
  });

  it("liquidação fora da fila: posição null", () => {
    expect(avaliarOrdem(fila, "inexistente").posicao).toBeNull();
  });
});

describe("M06 — justificativa (Zod, §1º)", () => {
  const valida = {
    hipotese: "V_ATIVIDADE_FINALISTICA",
    justificativa:
      "Pagamento imprescindível à continuidade do atendimento da rede municipal de ensino.",
    autorizadoPor: "Secretário de Finanças",
  };

  it("aceita justificativa válida", () => {
    expect(() => zJustificativaQuebraOrdemInput.parse(valida)).not.toThrow();
  });

  it("REJEITA texto com menos de 30 caracteres", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, justificativa: "urgente" })
    ).toThrow(/ao menos 30 caracteres/);
  });

  it("REJEITA hipótese fora do rol TAXATIVO do §1º", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, hipotese: "VI_OUTROS" })
    ).toThrow();
  });

  it("REJEITA sem quem autorizou", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, autorizadoPor: "" })
    ).toThrow();
  });
});

// ── FILA DERIVADA (banco de teste) ─────────────────────────────────────────

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);

describe("M06 — fila DERIVADA (banco real)", () => {
  let deps: M05Deps;
  const ordem = criarOrdemCronologicaPrisma(prisma);

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM06();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a fila sai ordenada pela data de liquidação", async () => {
    const b = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL2", valor: "200.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-03-10T12:00:00Z",
    });
    const a = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });

    const fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila.map((l) => l.liquidacaoId)).toEqual([a, b]);
    expect(fila[0]!.saldoAPagar.toFixed(2)).toBe("100.00");
    expect(await ordem.posicaoNaFila(a)).toBe(1);
    expect(await ordem.posicaoNaFila(b)).toBe(2);
  });

  it("FILAS INDEPENDENTES por FONTE", async () => {
    const antiga500 = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    const nova540 = await empenharELiquidar(deps, {
      fichaId: FICHA_540, numero: "NL2", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // a liquidação de junho é a CABEÇA da fila da fonte 540, mesmo havendo uma
    // de janeiro na fonte 500 — o art. 141 ordena POR FONTE.
    expect(await ordem.posicaoNaFila(nova540)).toBe(1);
    expect(await ordem.posicaoNaFila(antiga500)).toBe(1);

    const fila540 = await ordem.filaDePagamentos(FONTE_540, "FORNECIMENTO_BENS");
    expect(fila540.map((l) => l.liquidacaoId)).toEqual([nova540]);
  });

  it("FILAS INDEPENDENTES por CATEGORIA (mesma fonte)", async () => {
    const bens = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    const obras = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL2", valor: "100.00",
      categoria: "REALIZACAO_OBRAS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // a de obras é cabeça da SUA fila, mesmo sendo posterior à de bens
    expect(await ordem.posicaoNaFila(bens)).toBe(1);
    expect(await ordem.posicaoNaFila(obras)).toBe(1);

    expect(
      (await ordem.filaDePagamentos(FONTE_500, "REALIZACAO_OBRAS")).map((l) => l.liquidacaoId)
    ).toEqual([obras]);
  });

  it("a liquidação QUITADA sai da fila; a PARCIALMENTE paga CONTINUA", async () => {
    const { pagar } = await import("../m05-despesa/servico-bloco2.js");
    const { roteiroPagamento } = await import("../m05-despesa/dominio.js");
    const R_PAG = roteiroPagamento({
      obrigacaoAPagar: "2.1.3.1.1.00.00",
      disponibilidade: "1.1.1.1.2.00.00",
      creditoLiquidado: "6.2.2.1.3.03.00",
      creditoPago: "6.2.2.1.3.01.00",
    });

    const a = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });

    // paga METADE -> continua na fila, com saldo 50
    await pagar(
      {
        liquidacaoId: a, numero: "NP1", valor: "50.00",
        data: new Date("2026-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE_500,
        historico: "parcial", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    let fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila).toHaveLength(1);
    expect(fila[0]!.saldoAPagar.toFixed(2)).toBe("50.00");
    // e continua na data ORIGINAL — não foi para o fim da fila
    expect(fila[0]!.dataLiquidacao.toISOString().slice(0, 10)).toBe("2026-01-05");

    // quita -> SAI da fila
    await pagar(
      {
        liquidacaoId: a, numero: "NP2", valor: "50.00",
        data: new Date("2026-02-02T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE_500,
        historico: "quita", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila).toHaveLength(0);
    expect(await ordem.posicaoNaFila(a)).toBeNull();
  });

  it("consultaOrdemCronologica (§3º) devolve as filas e as quebras do mês", async () => {
    await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    await empenharELiquidar(deps, {
      fichaId: FICHA_540, numero: "NL2", valor: "100.00",
      categoria: "REALIZACAO_OBRAS", dataLiquidacao: "2026-01-20T12:00:00Z",
    });

    const c = await ordem.consultaOrdemCronologica({
      inicio: new Date("2026-01-01T00:00:00Z"),
      fim: new Date("2026-12-31T23:59:59Z"),
    });

    // duas filas distintas: (500, BENS) e (540, OBRAS)
    expect(c.filas).toHaveLength(2);
    const chaves = c.filas.map((f) => `${f.fonteCodigo}|${f.categoria}`).sort();
    expect(chaves).toEqual(["500|FORNECIMENTO_BENS", "540|REALIZACAO_OBRAS"]);
    expect(c.quebras).toHaveLength(0); // nenhuma quebra ainda
  });
});
