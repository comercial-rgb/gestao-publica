import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
} from "./dominio.js";
import {
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
  saldoDosRestos,
} from "./restos.js";
import {
  empenharDe2026,
  liquidarDe2026,
  pagarDe2026,
  semearM08,
  FONTE,
  FONTE_540,
  POR,
} from "./m08-encerramento.test.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M08 bloco 3a — as três operações de RP.
 *
 * A asserção que atravessa todos: NENHUMA operação de RP cria MovimentoDotacao.
 * RP não consome dotação do exercício corrente.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

// Contas de RP: vêm por PARÂMETRO, como em todo o projeto. Não existe seed
// oficial de PCASP — o roteiro é do chamador (embrião da Matriz de Eventos).
const R_LIQ_RP = roteiroLiquidacaoRestos({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  restosAPagarProcessados: "2.1.3.1.1.00.00",
});
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
});
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: "2.1.3.1.1.00.00",
  variacaoAumentativa: "4.6.4.1.1.00.00",
});

/** Conta os MovimentoDotacao — nenhuma operação de RP pode mexer neles. */
async function movimentosDotacao(): Promise<
  readonly { id: string; tipo: string; valor: string }[]
> {
  const m = await prisma.movimentoDotacao.findMany({
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true, valor: true },
  });
  return m.map((x) => ({ id: x.id, tipo: x.tipo, valor: x.valor.toFixed(2) }));
}

/** Confere que TODO lançamento fecha por subsistema. */
async function conferirBalanceamento(): Promise<void> {
  const lancamentos = await prisma.lancamentoContabil.findMany({
    select: { id: true, numeroControle: true, partidas: true },
  });
  for (const l of lancamentos) {
    const subs = new Set(l.partidas.map((p) => p.subsistema));
    for (const s of subs) {
      const doSub = l.partidas.filter((p) => p.subsistema === s);
      const d = doSub
        .filter((p) => p.tipo === "DEBITO")
        .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
      const c = doSub
        .filter((p) => p.tipo === "CREDITO")
        .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
      expect(
        d.toFixed(2),
        `lançamento ${l.numeroControle}, subsistema ${s}`
      ).toBe(c.toFixed(2));
    }
  }
}

describe("M08 3a — ciclo RPNP (não processado)", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("CICLO COMPLETO: empenha → encerra → liquida RP → paga RP", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    expect(enc.inscricoes).toHaveLength(1);
    const insc = enc.inscricoes[0]!;
    expect(insc.tipo).toBe("NAO_PROCESSADO");
    expect(insc.valorInscrito.toFixed(2)).toBe("1000.00");

    const movsAntes = await movimentosDotacao();

    // LIQUIDA o RP
    const l = await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP1", valor: "600.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "Fulano", historico: "liquidação de RP",
        criadoPor: POR,
      },
      R_LIQ_RP
    );

    // PAGA o RP
    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-04-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE,
        historico: "pagamento de RP", criadoPor: POR,
      },
      R_PAG_RP
    );

    // saldo do RP, por SUM
    const s = await saldoDosRestos(prisma, insc.id);
    expect(s.valorInscrito.toFixed(2)).toBe("1000.00");
    expect(s.pago.toFixed(2)).toBe("600.00");
    expect(s.cancelado.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("400.00");

    // NENHUM MovimentoDotacao foi criado
    expect(await movimentosDotacao()).toEqual(movsAntes);

    // todo lançamento fecha por subsistema
    await conferirBalanceamento();
  });

  it("REJEITA liquidar RP acima do saldo NÃO PROCESSADO — nada grava", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP1", valor: "600.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "h", criadoPor: POR,
      },
      R_LIQ_RP
    );

    const lancAntes = await prisma.lancamentoContabil.count();

    await expect(
      liquidarRestosAPagar(
        prisma,
        {
          empenhoId: e, numero: "NL-RP2", valor: "500.00", // 600 + 500 > 1000
          data: new Date("2027-03-02T12:00:00Z"),
          responsavelAtesto: "F", historico: "h", criadoPor: POR,
        },
        R_LIQ_RP
      )
    ).rejects.toThrow(/excede o saldo não processado.*disponível 400\.00/s);

    // prova por SELECT: nem liquidação, nem lançamento
    expect(await prisma.liquidacao.count({ where: { numero: "NL-RP2" } })).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(lancAntes);
  });

  it("REJEITA liquidar RP de empenho SEM inscrição NP", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await pagarDe2026(deps, l, "NP1", "1000.00"); // quitado -> sem inscrição
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      liquidarRestosAPagar(
        prisma,
        {
          empenhoId: e, numero: "NL-RP1", valor: "100.00",
          data: new Date("2027-03-01T12:00:00Z"),
          responsavelAtesto: "F", historico: "h", criadoPor: POR,
        },
        R_LIQ_RP
      )
    ).rejects.toThrow(/não tem inscrição de RESTOS A PAGAR NÃO PROCESSADOS/);
  });
});

describe("M08 3a — ciclo RPP (processado)", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("CICLO: empenha → liquida → encerra → paga RP", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00"); // liquidado, não pago

    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    expect(enc.inscricoes).toHaveLength(1);
    const insc = enc.inscricoes[0]!;
    expect(insc.tipo).toBe("PROCESSADO");
    expect(insc.valorInscrito.toFixed(2)).toBe("1000.00");

    const movsAntes = await movimentosDotacao();

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l, numero: "NP-RP1", valor: "400.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE,
        historico: "pagamento de RPP", criadoPor: POR,
      },
      R_PAG_RP
    );

    const s = await saldoDosRestos(prisma, insc.id);
    expect(s.pago.toFixed(2)).toBe("400.00");
    expect(s.saldo.toFixed(2)).toBe("600.00");

    expect(await movimentosDotacao()).toEqual(movsAntes);
    await conferirBalanceamento();
  });

  it("A FONTE DA FICHA vale no RP também — e este caminho NÃO passa pelo pagar() do M05", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    // ⚠️ A conta CC-002 é do FUNDEB e o pagamento declara 540: o guard da TR 5.23
    // (pagamento × conta) CASA. Mas a ficha do empenho é da fonte 500. Sem o guard novo,
    // o RP era o caminho MAIS FÁCIL para trocar a fonte — o exercício virou, a conta
    // mudou, e ninguém conferia. E ele NÃO passa pelo `pagar()` do M05: o M08 cria o
    // `Pagamento` por conta própria.
    await expect(
      pagarRestosAPagar(
        prisma,
        {
          liquidacaoId: l, numero: "NP-RP1", valor: "100.00",
          data: new Date("2027-02-01T12:00:00Z"),
          contaBancaria: "CC-002", fonteId: FONTE_540,
          historico: "h", criadoPor: POR,
        },
        R_PAG_RP
      )
    ).rejects.toThrow(/FONTE DO PAGAMENTO DIVERGE DA FONTE DA DESPESA[\s\S]*fonte 500/);

    // SELECT prova: zero escrita — nem pagamento, nem movimento de RP.
    expect(await prisma.pagamento.count()).toBe(0);
    expect(
      await prisma.movimentoRestosAPagar.count({ where: { tipo: "PAGAMENTO" } })
    ).toBe(0);
  });

  it("TR 5.23 vale no RP: fonte divergente da conta bancária é REJEITADA", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      pagarRestosAPagar(
        prisma,
        {
          liquidacaoId: l, numero: "NP-RP1", valor: "100.00",
          data: new Date("2027-02-01T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: "fnt-inexistente",
          historico: "h", criadoPor: POR,
        },
        R_PAG_RP
      )
    ).rejects.toThrow(/FONTE FORA DO ROL \(TR 5\.23\)/);

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoRestosAPagar.count()).toBe(0);
  });

  it("REJEITA pagar RP acima do saldo da inscrição", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l, numero: "NP-RP1", valor: "700.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    await expect(
      pagarRestosAPagar(
        prisma,
        {
          liquidacaoId: l, numero: "NP-RP2", valor: "400.00", // 700 + 400 > 1000
          data: new Date("2027-02-02T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
        },
        R_PAG_RP
      )
    ).rejects.toThrow(/excede/);

    expect(await prisma.pagamento.count()).toBe(1);
  });
});

describe("M08 3a — cancelamento", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const MOTIVO = "Fornecedor não entregou o objeto no prazo contratual.";

  it("cancelamento PARCIAL reduz o saldo (por SUM)", async () => {
    await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const insc = enc.inscricoes[0]!;

    const movsAntes = await movimentosDotacao();

    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: insc.id, valor: "300.00", motivo: MOTIVO,
        data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );

    const s = await saldoDosRestos(prisma, insc.id);
    expect(s.cancelado.toFixed(2)).toBe("300.00");
    expect(s.saldo.toFixed(2)).toBe("700.00");

    expect(await movimentosDotacao()).toEqual(movsAntes);
    await conferirBalanceamento();
  });

  it("REJEITA cancelar acima do saldo — nada grava", async () => {
    await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const insc = enc.inscricoes[0]!;

    const lancAntes = await prisma.lancamentoContabil.count();

    await expect(
      cancelarRestosAPagar(
        prisma,
        {
          inscricaoId: insc.id, valor: "1500.00", motivo: MOTIVO,
          data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR,
        },
        R_CANC_RP
      )
    ).rejects.toThrow(/excede o saldo cancelável.*cancelável 1000\.00/s);

    expect(await prisma.movimentoRestosAPagar.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(lancAntes);
  });

  it("RPNP LIQUIDADO parcialmente: só a parte NÃO liquidada é cancelável", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const insc = enc.inscricoes[0]!;

    // liquida 600 do RP -> só 400 podem ser cancelados
    await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP1", valor: "600.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "h", criadoPor: POR,
      },
      R_LIQ_RP
    );

    // cancelar 500 (> 400) é REJEITADO
    await expect(
      cancelarRestosAPagar(
        prisma,
        {
          inscricaoId: insc.id, valor: "500.00", motivo: MOTIVO,
          data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR,
        },
        R_CANC_RP
      )
    ).rejects.toThrow(
      /cancelável 400\.00.*A parte já liquidada não é cancelável aqui/s
    );

    // cancelar exatamente 400 PASSA
    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: insc.id, valor: "400.00", motivo: MOTIVO,
        data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );

    const s = await saldoDosRestos(prisma, insc.id);
    expect(s.cancelado.toFixed(2)).toBe("400.00");
  });

  it("REJEITA motivo com menos de 10 caracteres (Zod)", async () => {
    await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });

    await expect(
      cancelarRestosAPagar(
        prisma,
        {
          inscricaoId: enc.inscricoes[0]!.id, valor: "100.00", motivo: "erro",
          data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR,
        },
        R_CANC_RP
      )
    ).rejects.toThrow(/ao menos 10 caracteres/);

    expect(await prisma.movimentoRestosAPagar.count()).toBe(0);
  });
});
