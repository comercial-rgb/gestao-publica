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
  saldoDaInscricao,
  SINAL_MOVIMENTO_RP,
} from "./dominio.js";
import {
  anularCancelamentoRestosAPagar,
  anularPagamentoRestosAPagar,
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
  saldoDosRestos,
} from "./restos.js";
import {
  empenharDe2026,
  liquidarDe2026,
  semearM08,
  FONTE,
  POR,
} from "./m08-encerramento.test.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * FIX — anulação de CANCELAMENTO de RP (a assimetria irmã do 345af7d).
 *
 * O BUG: o cancelamento não tinha volta. Um cancelamento por engano era
 * IRREVERSÍVEL — a obrigação com o credor ficava extinta no sistema **sem ter
 * sido extinta na vida**. O credor continuava com direito a receber, e o sistema
 * não tinha mais como pagá-lo: o saldo estava zerado.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const R_LIQ_RP = roteiroLiquidacaoRestos({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  restosAPagarProcessados: "2.1.3.1.1.00.00",
});
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
});
/**
 * RP (D) / variação AUMENTATIVA (C) — o ganho patrimonial do cancelamento.
 *
 * ⚠️ A VPA ERA `6.2.2.1.3.03.00` (Crédito Liquidado a Pagar, classe 6 = ORÇAMENTÁRIA)
 * numa perna PATRIMONIAL — o comentário acima dizia "variação aumentativa" e o código
 * apontava para uma conta de controle orçamentário. O guard de natureza de informação
 * pegou. A conta certa é a do PCASP 4.6.4: "ganhos com desincorporação de passivos,
 * INCLUSIVE as baixas de passivo decorrentes do cancelamento de restos a pagar".
 */
const CONTA_RP = "2.1.3.1.1.00.00";
const CONTA_VPA = "4.6.4.1.1.00.00";
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: CONTA_RP,
  variacaoAumentativa: CONTA_VPA,
});

const MOTIVO = "Cancelamento indevido: o fornecedor comprovou a entrega.";

async function movimentosDotacao() {
  const m = await prisma.movimentoDotacao.findMany({
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true, valor: true },
  });
  return m.map((x) => ({ id: x.id, tipo: x.tipo, valor: x.valor.toFixed(2) }));
}

async function conferirBalanceamento(): Promise<void> {
  const lancs = await prisma.lancamentoContabil.findMany({
    select: { numeroControle: true, partidas: true },
  });
  for (const l of lancs) {
    for (const s of new Set(l.partidas.map((p) => p.subsistema))) {
      const doSub = l.partidas.filter((p) => p.subsistema === s);
      const soma = (tipo: string) =>
        doSub
          .filter((p) => p.tipo === tipo)
          .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
      expect(
        soma("DEBITO").toFixed(2),
        `lançamento ${l.numeroControle}, subsistema ${s}`
      ).toBe(soma("CREDITO").toFixed(2));
    }
  }
}

// ── DOMÍNIO PURO ───────────────────────────────────────────────────────────

describe("M08 — SINAL_MOVIMENTO_RP (a fonte única do sinal)", () => {
  it("os dois ESTORNO_* somam; PAGAMENTO e CANCELAMENTO subtraem", () => {
    expect(SINAL_MOVIMENTO_RP.PAGAMENTO).toBe(-1);
    expect(SINAL_MOVIMENTO_RP.CANCELAMENTO).toBe(-1);
    expect(SINAL_MOVIMENTO_RP.ESTORNO_PAGAMENTO).toBe(1);
    expect(SINAL_MOVIMENTO_RP.ESTORNO_CANCELAMENTO).toBe(1);
  });

  it("ESTORNO_CANCELAMENTO devolve saldo", () => {
    const s = saldoDaInscricao(toMoney("1000.00"), [
      { tipo: "CANCELAMENTO", valor: toMoney("1000.00") },
      { tipo: "ESTORNO_CANCELAMENTO", valor: toMoney("1000.00") },
    ]);
    expect(s.toFixed(2)).toBe("1000.00");
  });

  it("os quatro tipos juntos", () => {
    const s = saldoDaInscricao(toMoney("1000.00"), [
      { tipo: "PAGAMENTO", valor: toMoney("400.00") },
      { tipo: "ESTORNO_PAGAMENTO", valor: toMoney("400.00") },
      { tipo: "CANCELAMENTO", valor: toMoney("300.00") },
      { tipo: "ESTORNO_CANCELAMENTO", valor: toMoney("300.00") },
    ]);
    expect(s.toFixed(2)).toBe("1000.00"); // tudo desfeito
  });
});

// ── INTEGRAÇÃO ─────────────────────────────────────────────────────────────

describe("M08 — anulação de CANCELAMENTO de RP", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** RPP inscrito em 1000 (empenha, liquida, encerra). */
  async function rppInscrito(): Promise<{
    inscricaoId: string;
    liquidacaoId: string;
  }> {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    return { inscricaoId: enc.inscricoes[0]!.id, liquidacaoId: l };
  }

  async function cancelar(inscricaoId: string, valor: string): Promise<string> {
    const c = await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId, valor, motivo: "Fornecedor não entregou o objeto.",
        data: new Date("2027-03-01T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );
    return c.movimentoId;
  }

  // (a)
  it("O FIX: cancela 1000 → saldo 0 → anula → saldo 1000 (por SUM)", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "1000.00");

    let s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.cancelado.toFixed(2)).toBe("1000.00");
    expect(s.saldo.toFixed(2)).toBe("0.00");

    const movsAntes = await movimentosDotacao();

    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "CANC-A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    // ═══ O SALDO VOLTOU ═══ (antes, o cancelamento era irreversível)
    s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.cancelado.toFixed(2)).toBe("1000.00"); // bruto
    expect(s.estornoCancelamento.toFixed(2)).toBe("1000.00");
    expect(s.canceladoLiquido.toFixed(2)).toBe("0.00"); // nada morreu de verdade
    expect(s.saldo.toFixed(2)).toBe("1000.00"); // RESTAURADO

    // append-only: o original está intacto e o estorno o referencia
    const movs = await prisma.movimentoRestosAPagar.findMany({
      orderBy: { criadoEm: "asc" },
    });
    expect(movs).toHaveLength(2);
    expect(movs[0]!.tipo).toBe("CANCELAMENTO");
    expect(movs[0]!.estornoDeId).toBeNull();
    expect(movs[1]!.tipo).toBe("ESTORNO_CANCELAMENTO");
    expect(movs[1]!.estornoDeId).toBe(movs[0]!.id);

    // (f) RP não toca dotação, nem na anulação
    expect(await movimentosDotacao()).toEqual(movsAntes);

    await conferirBalanceamento();
  });

  it("o estorno REVERTE a variação AUMENTATIVA do cancelamento", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "1000.00");

    const cancelamento = await prisma.movimentoRestosAPagar.findUniqueOrThrow({
      where: { id: movId },
      select: { lancamentoId: true },
    });
    const lancCanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: cancelamento.lancamentoId! },
      include: { partidas: { include: { conta: true } } },
    });

    // no CANCELAMENTO: D restos a pagar / C variação AUMENTATIVA (ganho)
    const papelCanc = new Map(
      lancCanc.partidas.map((p) => [p.conta.codigo, p.tipo])
    );
    expect(papelCanc.get(CONTA_RP)).toBe("DEBITO");
    expect(papelCanc.get(CONTA_VPA)).toBe("CREDITO");

    const a = await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "CANC-A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    const lancEst = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: a.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    expect(lancEst.estornoDeId).toBe(lancCanc.id);

    // no ESTORNO: INVERTIDO. O ganho patrimonial deixa de existir, porque a
    // obrigação com o credor voltou.
    const papelEst = new Map(
      lancEst.partidas.map((p) => [p.conta.codigo, p.tipo])
    );
    expect(papelEst.get(CONTA_VPA)).toBe("DEBITO"); // reverte o ganho
    expect(papelEst.get(CONTA_RP)).toBe("CREDITO"); // a obrigação volta
  });

  // (b) — o saldo governa a PERMISSÃO
  it("depois do estorno, o RP volta a ser PAGÁVEL", async () => {
    const { inscricaoId, liquidacaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "1000.00");

    // saldo zero -> não dá para pagar
    await expect(
      pagarRestosAPagar(
        prisma,
        {
          liquidacaoId, numero: "NP-RP1", valor: "1000.00",
          data: new Date("2027-05-01T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
        },
        R_PAG_RP
      )
    ).rejects.toThrow(/excede o saldo do resto a pagar.*saldo 0\.00/s);

    // anula o cancelamento -> o saldo volta e o pagamento PASSA
    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "CANC-A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "1000.00",
        data: new Date("2027-05-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pagoLiquido.toFixed(2)).toBe("1000.00");
    expect(s.saldo.toFixed(2)).toBe("0.00");
  });

  // (c)
  it("anular DUAS VEZES o mesmo cancelamento: rejeitado, saldo não dobra", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "1000.00");

    const anul = {
      movimentoId: movId,
      data: new Date("2027-04-01T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    };
    await anularCancelamentoRestosAPagar(prisma, { ...anul, numero: "A1" });

    await expect(
      anularCancelamentoRestosAPagar(prisma, { ...anul, numero: "A2" })
    ).rejects.toThrow(/já foi anulado/);

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.saldo.toFixed(2)).toBe("1000.00"); // não 2000
  });

  it("DUPLA DEVOLUÇÃO: o índice único parcial rejeita mesmo driblando o serviço", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "1000.00");
    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    // INSERT direto, sem passar pelo serviço. O uq_estorno_mov_rp_unico é
    // ON (estornoDeId) WHERE NOT NULL — ele cobre QUALQUER tipo de estorno,
    // por isso não foi preciso um índice novo.
    let erro: unknown;
    try {
      await prisma.movimentoRestosAPagar.create({
        data: {
          inscricaoId,
          tipo: "ESTORNO_CANCELAMENTO",
          valor: "1000.00",
          estornoDeId: movId, // JÁ estornado!
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (dupla devolução por estorno de cancelamento):\n" +
        String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_mov_rp_unico|Unique constraint/i);
  });

  // (d)
  it("REJEITA anular por aqui um movimento que é PAGAMENTO", async () => {
    const { inscricaoId, liquidacaoId } = await rppInscrito();
    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "500.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const movPag = await prisma.movimentoRestosAPagar.findFirstOrThrow({
      where: { tipo: "PAGAMENTO" },
    });

    await expect(
      anularCancelamentoRestosAPagar(prisma, {
        movimentoId: movPag.id, numero: "A1",
        data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
      })
    ).rejects.toThrow(/é PAGAMENTO, não CANCELAMENTO.*anularPagamentoRestosAPagar/s);

    // e o saldo não mudou
    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.saldo.toFixed(2)).toBe("500.00");
  });

  it("REJEITA estornar um ESTORNO", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "500.00");
    const a = await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    await expect(
      anularCancelamentoRestosAPagar(prisma, {
        movimentoId: a.movimentoId, numero: "A2",
        data: new Date("2027-05-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
      })
    ).rejects.toThrow(/é ESTORNO_CANCELAMENTO, não CANCELAMENTO/);
  });

  it("REJEITA motivo com menos de 10 caracteres (Zod)", async () => {
    const { inscricaoId } = await rppInscrito();
    const movId = await cancelar(inscricaoId, "500.00");

    await expect(
      anularCancelamentoRestosAPagar(prisma, {
        movimentoId: movId, numero: "A1",
        data: new Date("2027-04-01T12:00:00Z"), motivo: "erro", criadoPor: POR,
      })
    ).rejects.toThrow(/ao menos 10 caracteres/);

    expect(
      await prisma.movimentoRestosAPagar.count({
        where: { tipo: "ESTORNO_CANCELAMENTO" },
      })
    ).toBe(0);
  });

  // (e) — a interação com liquidações, preservada
  it("RPNP: cancelamento PARCIAL estornado devolve EXATAMENTE a parte cancelada", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const inscricaoId = enc.inscricoes[0]!.id;
    expect(enc.inscricoes[0]!.tipo).toBe("NAO_PROCESSADO");

    // liquida 600 -> só 400 são canceláveis
    await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP1", valor: "600.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "h", criadoPor: POR,
      },
      R_LIQ_RP
    );

    // cancela 400 (o máximo)
    const movId = await cancelar(inscricaoId, "400.00");

    // agora não dá para liquidar mais nada
    await expect(
      liquidarRestosAPagar(
        prisma,
        {
          empenhoId: e, numero: "NL-RP2", valor: "1.00",
          data: new Date("2027-03-05T12:00:00Z"),
          responsavelAtesto: "F", historico: "h", criadoPor: POR,
        },
        R_LIQ_RP
      )
    ).rejects.toThrow(/disponível 0\.00/);

    // ANULA o cancelamento -> os 400 voltam ao campo do "ainda pode virar despesa"
    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movId, numero: "A1",
      data: new Date("2027-04-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    // e o limite "cancelável só o não liquidado" CONTINUA valendo: 400, não 1000
    await expect(
      cancelarRestosAPagar(
        prisma,
        {
          inscricaoId, valor: "500.00", motivo: "Tentando cancelar demais.",
          data: new Date("2027-04-02T12:00:00Z"), criadoPor: POR,
        },
        R_CANC_RP
      )
    ).rejects.toThrow(/cancelável 400\.00.*A parte já liquidada não é cancelável/s);

    // liquidar os 400 restantes agora PASSA
    await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP2", valor: "400.00",
        data: new Date("2027-04-03T12:00:00Z"),
        responsavelAtesto: "F", historico: "h", criadoPor: POR,
      },
      R_LIQ_RP
    );

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.canceladoLiquido.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("1000.00"); // nada baixado ainda
  });

  it("pagamento e cancelamento, ambos estornados: saldo volta ao inscrito", async () => {
    const { inscricaoId, liquidacaoId } = await rppInscrito();

    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "400.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );
    const movCanc = await cancelar(inscricaoId, "300.00");

    expect((await saldoDosRestos(prisma, inscricaoId)).saldo.toFixed(2)).toBe("300.00");

    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "PA1",
      data: new Date("2027-05-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });
    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: movCanc, numero: "CA1",
      data: new Date("2027-05-02T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pagoLiquido.toFixed(2)).toBe("0.00");
    expect(s.canceladoLiquido.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("1000.00");
    await conferirBalanceamento();
  });
});
