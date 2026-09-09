import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularPagamento } from "../m05-despesa/servico-bloco2.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
  saldoDaInscricao,
} from "./dominio.js";
import {
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
 * FIX — anulação de pagamento de RP.
 *
 * O BUG: anular pelo M05 um Pagamento que era de RP criava o Pagamento de
 * estorno mas deixava o MovimentoRestosAPagar(PAGAMENTO) ÓRFÃO. A inscrição
 * continuava baixada e o sistema achava que tinha pago algo que foi desfeito —
 * saldo de RP errado PARA MENOS, dinheiro sumindo do resto a pagar sem ter saído
 * do caixa.
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
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: "2.1.3.1.1.00.00",
  variacaoAumentativa: "4.6.4.1.1.00.00",
});

const MOTIVO = "Pagamento efetuado em duplicidade por erro operacional.";

async function movimentosDotacao() {
  const m = await prisma.movimentoDotacao.findMany({
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true, valor: true },
  });
  return m.map((x) => ({ id: x.id, tipo: x.tipo, valor: x.valor.toFixed(2) }));
}

/** ΣD == ΣC por subsistema, em TODO lançamento. */
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

describe("M08 — saldoDaInscricao com ESTORNO_PAGAMENTO (puro)", () => {
  it("ESTORNO_PAGAMENTO DEVOLVE saldo (é o único tipo que soma)", () => {
    const s = saldoDaInscricao(toMoney("1000.00"), [
      { tipo: "PAGAMENTO", valor: toMoney("600.00") },
      { tipo: "ESTORNO_PAGAMENTO", valor: toMoney("600.00") },
    ]);
    expect(s.toFixed(2)).toBe("1000.00"); // voltou ao inscrito
  });

  it("pagamento + cancelamento + estorno do pagamento", () => {
    const s = saldoDaInscricao(toMoney("1000.00"), [
      { tipo: "PAGAMENTO", valor: toMoney("600.00") },
      { tipo: "CANCELAMENTO", valor: toMoney("100.00") },
      { tipo: "ESTORNO_PAGAMENTO", valor: toMoney("600.00") },
    ]);
    // 1000 − (600 + 100 − 600) = 900
    expect(s.toFixed(2)).toBe("900.00");
  });
});

// ── INTEGRAÇÃO ─────────────────────────────────────────────────────────────

describe("M08 — anulação de pagamento de RP", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** RPP: empenha 1000, liquida 1000, encerra. Devolve {inscricaoId, liquidacaoId}. */
  async function rppInscrito(): Promise<{ inscricaoId: string; liquidacaoId: string }> {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    return { inscricaoId: enc.inscricoes[0]!.id, liquidacaoId: l };
  }

  // (a)
  it("O FIX: pagar RP → anular → saldo RESTAURADO (por SUM)", async () => {
    const { inscricaoId, liquidacaoId } = await rppInscrito();

    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    // saldo baixado
    let s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pago.toFixed(2)).toBe("600.00");
    expect(s.saldo.toFixed(2)).toBe("400.00");

    const movsAntes = await movimentosDotacao();

    // ANULA
    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "NP-RP1-A",
      data: new Date("2027-03-01T12:00:00Z"),
      motivo: MOTIVO, criadoPor: POR,
    });

    // ═══ O SALDO VOLTOU ═══ (antes do fix, ficava em 400.00 para sempre)
    s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.pago.toFixed(2)).toBe("600.00"); // bruto
    expect(s.estornado.toFixed(2)).toBe("600.00");
    expect(s.pagoLiquido.toFixed(2)).toBe("0.00"); // nada saiu do caixa
    expect(s.saldo.toFixed(2)).toBe("1000.00"); // RESTAURADO

    // append-only: o pagamento original está intacto e há um estorno NOVO
    const pagamentos = await prisma.pagamento.findMany({ orderBy: { criadoEm: "asc" } });
    expect(pagamentos).toHaveLength(2);
    expect(pagamentos[0]!.id).toBe(p.pagamentoId);
    expect(pagamentos[0]!.estornoDeId).toBeNull();
    expect(pagamentos[1]!.estornoDeId).toBe(p.pagamentoId);

    // o movimento de estorno referencia o original
    const movs = await prisma.movimentoRestosAPagar.findMany({
      orderBy: { criadoEm: "asc" },
    });
    expect(movs).toHaveLength(2);
    expect(movs[1]!.tipo).toBe("ESTORNO_PAGAMENTO");
    expect(movs[1]!.estornoDeId).toBe(movs[0]!.id);

    // (d) RP não toca dotação, nem na anulação
    expect(await movimentosDotacao()).toEqual(movsAntes);

    // ΣD == ΣC por subsistema no estorno
    await conferirBalanceamento();
  });

  it("o lançamento de estorno tem as PERNAS INVERTIDAS", async () => {
    const { liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const a = await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "NP-RP1-A",
      data: new Date("2027-03-01T12:00:00Z"),
      motivo: MOTIVO, criadoPor: POR,
    });

    const orig = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: p.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    const est = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: a.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });

    expect(est.estornoDeId).toBe(p.lancamentoId);

    const papel = (l: typeof orig) =>
      new Map(l.partidas.map((x) => [x.conta.codigo, x.tipo]));
    const po = papel(orig);
    const pe = papel(est);
    for (const [conta, tipo] of po) {
      expect(pe.get(conta)).toBe(tipo === "DEBITO" ? "CREDITO" : "DEBITO");
    }
  });

  // (b)
  it("o M05 REJEITA anular pagamento de RP — nada grava", async () => {
    const { liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const pagsAntes = await prisma.pagamento.count();
    const movsAntes = await prisma.movimentoRestosAPagar.count();
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      anularPagamento(
        {
          pagamentoId: p.pagamentoId, numero: "NP-RP1-A",
          data: new Date("2027-03-01T12:00:00Z"),
          historico: "h", criadoPor: POR,
        },
        deps
      )
    ).rejects.toThrow(
      /Pagamento de RESTOS A PAGAR.*use anularPagamentoRestosAPagar/s
    );

    // prova por SELECT: NADA gravou
    expect(await prisma.pagamento.count()).toBe(pagsAntes);
    expect(await prisma.movimentoRestosAPagar.count()).toBe(movsAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
  });

  // (c)
  it("anular DUAS VEZES o mesmo pagamento: rejeitado", async () => {
    const { liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const anul = {
      pagamentoId: p.pagamentoId,
      data: new Date("2027-03-01T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    };
    await anularPagamentoRestosAPagar(prisma, { ...anul, numero: "A1" });

    await expect(
      anularPagamentoRestosAPagar(prisma, { ...anul, numero: "A2" })
    ).rejects.toThrow(/já foi anulado/);

    // o saldo NÃO foi devolvido duas vezes
    const insc = await prisma.inscricaoRestosAPagar.findFirstOrThrow();
    const s = await saldoDosRestos(prisma, insc.id);
    expect(s.saldo.toFixed(2)).toBe("1000.00"); // não 1600
    expect(
      await prisma.movimentoRestosAPagar.count({ where: { tipo: "ESTORNO_PAGAMENTO" } })
    ).toBe(1);
  });

  it("DUPLA DEVOLUÇÃO: o índice único parcial rejeita mesmo driblando o serviço", async () => {
    const { liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );
    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "A1",
      data: new Date("2027-03-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    const movOriginal = await prisma.movimentoRestosAPagar.findFirstOrThrow({
      where: { tipo: "PAGAMENTO" },
    });

    let erro: unknown;
    try {
      await prisma.movimentoRestosAPagar.create({
        data: {
          inscricaoId: movOriginal.inscricaoId,
          tipo: "ESTORNO_PAGAMENTO",
          valor: "600.00",
          estornoDeId: movOriginal.id, // JÁ estornado!
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (dupla devolução de saldo de RP):\n" +
        String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_mov_rp_unico|Unique constraint/i);
  });

  it("REJEITA anular por aqui um pagamento que NÃO é de RP", async () => {
    // pagamento corrente (exercício aberto), pelo M05
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    const { pagar } = await import("../m05-despesa/servico-bloco2.js");
    const { roteiroPagamento } = await import("../m05-despesa/dominio.js");
    const p = await pagar(
      {
        liquidacaoId: l, numero: "NP1", valor: "500.00",
        data: new Date("2026-09-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      roteiroPagamento({
        obrigacaoAPagar: "2.1.3.1.1.00.00",
        disponibilidade: "1.1.1.1.2.00.00",
        creditoLiquidado: "6.2.2.1.3.03.00",
        creditoPago: "6.2.2.1.3.01.00",
      }),
      deps
    );

    await expect(
      anularPagamentoRestosAPagar(prisma, {
        pagamentoId: p.pagamentoId, numero: "A1",
        data: new Date("2026-10-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
      })
    ).rejects.toThrow(/NÃO é de restos a pagar.*use a anulação do M05/s);
  });

  it("REJEITA motivo com menos de 10 caracteres (Zod)", async () => {
    const { liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "600.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    await expect(
      anularPagamentoRestosAPagar(prisma, {
        pagamentoId: p.pagamentoId, numero: "A1",
        data: new Date("2027-03-01T12:00:00Z"), motivo: "erro", criadoPor: POR,
      })
    ).rejects.toThrow(/ao menos 10 caracteres/);

    expect(
      await prisma.movimentoRestosAPagar.count({ where: { tipo: "ESTORNO_PAGAMENTO" } })
    ).toBe(0);
  });

  it("depois de anular o pagamento, o valor volta a ser CANCELÁVEL", async () => {
    const { inscricaoId, liquidacaoId } = await rppInscrito();
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId, numero: "NP-RP1", valor: "1000.00", // quita tudo
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    // saldo zero -> nada a cancelar
    await expect(
      cancelarRestosAPagar(
        prisma,
        {
          inscricaoId, valor: "100.00", motivo: MOTIVO,
          data: new Date("2027-03-01T12:00:00Z"), criadoPor: POR,
        },
        R_CANC_RP
      )
    ).rejects.toThrow(/excede o saldo cancelável.*cancelável 0\.00/s);

    // anula o pagamento -> o saldo volta e o cancelamento passa
    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "A1",
      data: new Date("2027-03-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId, valor: "1000.00", motivo: MOTIVO,
        data: new Date("2027-04-01T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.cancelado.toFixed(2)).toBe("1000.00");
    expect(s.saldo.toFixed(2)).toBe("0.00");
  });

  it("RPNP: anular o pagamento devolve saldo e permite pagar de novo", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const inscricaoId = enc.inscricoes[0]!.id;

    const l = await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e, numero: "NL-RP1", valor: "1000.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "h", criadoPor: POR,
      },
      R_LIQ_RP
    );
    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-RP1", valor: "1000.00",
        data: new Date("2027-04-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    expect((await saldoDosRestos(prisma, inscricaoId)).saldo.toFixed(2)).toBe("0.00");

    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "A1",
      data: new Date("2027-05-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    const s = await saldoDosRestos(prisma, inscricaoId);
    expect(s.saldo.toFixed(2)).toBe("1000.00");
    expect(s.pagoLiquido.toFixed(2)).toBe("0.00");
  });
});

// ── REGRESSÃO: o estorno espelha VALOR A VALOR ──────────────────────────────

/**
 * ═══ O BUG QUE ESTE TESTE TRANCA ═══
 * Os estornos do M08 jogavam fora o valor que o `gerarEstorno` produz em cada
 * perna e recarimbavam UM valor único em todas (`pagamento.valor`). Enquanto todo
 * lançamento de RP teve pernas de valor igual, isso foi invisível.
 *
 * Com a RETENÇÃO NA FONTE (M07) o lançamento virou COMPOSTO — o caixa leva o
 * LÍQUIDO, as demais pernas o BRUTO — e o bug ganhou consequência: o estorno
 * devolveria ao caixa 1.000 de um pagamento que só desembolsou 900. O caixa
 * fecharia o mês com 100 que nunca existiram, e o balanço fecharia junto (as
 * pernas continuam batendo entre si — só que todas erradas).
 *
 * É REGRESSÃO CLÁSSICA porque a condição que a esconde ("todas as pernas têm o
 * mesmo valor") é exatamente a que qualquer teste antigo satisfaz. Este aqui é o
 * único do M08 com pernas DESIGUAIS: se alguém voltar a carimbar valor único,
 * ele cai — e cai apontando o número errado.
 */
describe("M08 — estorno de lançamento com pernas DESIGUAIS", () => {
  let deps: M05Deps;

  const P_INSS = "2.1.8.8.1.01.00";
  const CAIXA_RP = "1.1.1.1.2.00.00"; // a "disponibilidade" do R_PAG_RP
  const FORNECEDOR_RP = "2.1.3.1.1.00.00";
  let tipoInss: string;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();

    // O mínimo do M07 para produzir um lançamento com pernas desiguais.
    await prisma.contaPcasp.create({
      data: {
        id: "c-inss", codigo: P_INSS, nome: "Consignações INSS",
        naturezaSaldo: "CREDORA", nivel: 5, analitica: true,
      },
    });
    const t = await prisma.tipoConsignacao.create({
      // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
      data: { codigo: "INSS", descricao: "INSS", contaPassivoId: "c-inss", criadoPor: "TESTE" },
    });
    tipoInss = t.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("paga RP 1000 retendo 100 → o estorno devolve 900 ao caixa, NÃO 1000", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026, encerradoPor: POR,
    });
    const inscricaoId = enc.inscricoes[0]!.id;

    const p = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l, numero: "NP-RP1", valor: "1000.00",
        data: new Date("2027-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP,
      {
        contaDisponibilidade: CAIXA_RP,
        retencoes: [
          {
            tipoConsignacaoId: tipoInss,
            credorConsignatario: "INSS",
            valor: "100.00",
            contaConsignacaoAPagar: P_INSS,
          },
        ],
      }
    );

    // O pagamento: pernas DESIGUAIS (1000 / 900 / 100).
    const pago = await partidasPorConta(p.lancamentoId);
    expect(pago.get(FORNECEDOR_RP)).toEqual({ tipo: "DEBITO", valor: "1000.00" });
    expect(pago.get(CAIXA_RP)).toEqual({ tipo: "CREDITO", valor: "900.00" });
    expect(pago.get(P_INSS)).toEqual({ tipo: "CREDITO", valor: "100.00" });

    const a = await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: p.pagamentoId, numero: "A1",
      data: new Date("2027-05-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR,
    });

    // O ESTORNO: cada perna com o SEU valor, invertida.
    const estornado = await partidasPorConta(a.lancamentoId);
    expect(estornado.get(FORNECEDOR_RP)).toEqual({ tipo: "CREDITO", valor: "1000.00" });
    // ⚠️ O CORAÇÃO DO TESTE: 900, o que de fato saiu do caixa — não 1000.
    expect(estornado.get(CAIXA_RP)).toEqual({ tipo: "DEBITO", valor: "900.00" });
    expect(estornado.get(P_INSS)).toEqual({ tipo: "DEBITO", valor: "100.00" });

    // e a inscrição volta pelo BRUTO (a obrigação com o credor ressuscita inteira)
    expect((await saldoDosRestos(prisma, inscricaoId)).saldo.toFixed(2)).toBe("1000.00");

    await conferirBalanceamento();
    expect(await movimentosDotacao()).toHaveLength(2); // dotação inicial + empenho
  });
});

/** As pernas de um lançamento, indexadas por código de conta. */
async function partidasPorConta(
  lancamentoId: string
): Promise<Map<string, { tipo: string; valor: string }>> {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    include: { partidas: { include: { conta: true } } },
  });
  return new Map(
    l.partidas.map((p) => [
      p.conta.codigo,
      { tipo: p.tipo as string, valor: p.valor.toFixed(2) },
    ])
  );
}
