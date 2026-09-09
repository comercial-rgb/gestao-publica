import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import { roteiroLiquidacaoRestos, roteiroPagamentoRestos } from "./dominio.js";
import { liquidarRestosAPagar, pagarRestosAPagar } from "./restos.js";
import {
  empenharDe2026,
  liquidarDe2026,
  semearM08,
  FONTE,
  FICHA,
  POR,
  R_LIQUIDACAO,
  R_PAGAMENTO,
} from "./m08-encerramento.test.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import type { JustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";

/**
 * M08 bloco 3b — guards cruzados e a FILA DO ART. 141 atravessando exercícios.
 *
 * O teste-chave deste arquivo é o da fila: um resto a pagar de 2026 e uma
 * liquidação corrente de 2027, na MESMA fonte e categoria. Se a fila do M06
 * filtrasse por exercício em algum lugar, o RP antigo sumiria dela e a
 * preterição passaria batida. Ele não filtra — e o teste prova.
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
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});

const JUSTIFICATIVA: JustificativaQuebraOrdemInput = {
  hipotese: "I_EMERGENCIA_CALAMIDADE",
  justificativa:
    "Pagamento emergencial autorizado por decreto de calamidade pública municipal.",
  autorizadoPor: "Prefeito",
};

describe("M08 3b — guards cruzados", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("pagar() do M05 REJEITA liquidação de exercício ENCERRADO — nada grava", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      pagar(
        {
          liquidacaoId: l, numero: "NP1", valor: "100.00",
          data: new Date("2027-02-01T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: FONTE,
          historico: "h", criadoPor: POR,
        },
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow(/exercício ENCERRADO \(2026\).*use pagarRestosAPagar/s);

    // prova por SELECT: nada gravou
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoRestosAPagar.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO" } })
    ).toBe(0);
    expect(
      await prisma.partidaContabil.count({
        where: { lancamento: { origemTipo: "PAGAMENTO" } },
      })
    ).toBe(0);
  });

  it("liquidar() do M05 REJEITA empenho de exercício ENCERRADO — direciona ao RP", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      liquidar(
        {
          empenhoId: e, numero: "NL1", valor: "500.00",
          data: new Date("2027-03-01T12:00:00Z"),
          responsavelAtesto: "F", historico: "h", criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(
      /exercício ENCERRADO \(2026\).*use liquidarRestosAPagar.*NÃO PROCESSADOS/s
    );

    expect(await prisma.liquidacao.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "LIQUIDACAO" } })
    ).toBe(0);
  });

  it("liquidar() REJEITA empenho encerrado e NÃO INSCRITO (quitado antes da virada)", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    await pagar(
      {
        liquidacaoId: l, numero: "NP1", valor: "1000.00",
        data: new Date("2026-09-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      liquidar(
        {
          empenhoId: e, numero: "NL2", valor: "1.00",
          data: new Date("2027-03-01T12:00:00Z"),
          responsavelAtesto: "F", historico: "h", criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      )
    ).rejects.toThrow(/NÃO INSCRITO em restos a pagar.*não há o que liquidar/s);
  });

  it("pagarRestosAPagar REJEITA liquidação de exercício ABERTO — direciona ao pagar()", async () => {
    const e = await empenharDe2026(deps, "NE1", "1000.00");
    const l = await liquidarDe2026(deps, e, "NL1", "1000.00");
    // NÃO encerra o exercício

    await expect(
      pagarRestosAPagar(
        prisma,
        {
          liquidacaoId: l, numero: "NP-RP1", valor: "100.00",
          data: new Date("2026-10-01T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
        },
        R_PAG_RP
      )
    ).rejects.toThrow(/Exercício 2026 está ABERTO.*use pagar\(\) do M05/s);

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoRestosAPagar.count()).toBe(0);
  });
});

describe("M08 3b — A FILA DO ART. 141 ATRAVESSA EXERCÍCIOS", () => {
  let deps: M05Deps;
  const ordem = criarOrdemCronologicaPrisma(prisma);

  /** RP de 2026 (antigo) e liquidação corrente de 2027, MESMA fonte+categoria. */
  let liqRP: string;
  let liqCorrente: string;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();

    // ── 2026: empenha, encerra, e liquida o RP (fica na fila, data de 2027-03)
    const e2026 = await empenharDe2026(deps, "NE-2026", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    const l = await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e2026, numero: "NL-RP-2026", valor: "1000.00",
        data: new Date("2027-03-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "liq RP", criadoPor: POR,
      },
      R_LIQ_RP
    );
    liqRP = l.liquidacaoId;

    // ── 2027: ficha nova, empenho corrente, liquidação POSTERIOR (2027-06)
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await criarFichaDeTeste(prisma, {
      id: "ficha-2027", exercicio: 2027, numero: 2,
      orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
      subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
    });
    const e2027 = await empenhar(
      {
        fichaId: "ficha-2027", numero: "NE-2027", tipo: "ORDINARIO",
        valor: "500.00", data: new Date("2027-05-01T12:00:00Z"),
        credorCpfCnpj: "98765432000188", historico: "empenho corrente",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const lc = await liquidar(
      {
        empenhoId: e2027.empenhoId, numero: "NL-2027", valor: "500.00",
        data: new Date("2027-06-01T12:00:00Z"),
        responsavelAtesto: "F", historico: "liq corrente", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    liqCorrente = lc.liquidacaoId;
    void FICHA;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("O RP ANTIGO ESTÁ NA FILA, à frente da liquidação corrente", async () => {
    const fila = await ordem.filaDePagamentos(FONTE, "FORNECIMENTO_BENS");

    // se a fila filtrasse por exercício, o RP sumiria daqui e a preterição
    // passaria batida. Ela não filtra.
    expect(fila.map((l) => l.liquidacaoId)).toEqual([liqRP, liqCorrente]);
    expect(await ordem.posicaoNaFila(liqRP)).toBe(1);
    expect(await ordem.posicaoNaFila(liqCorrente)).toBe(2);
  });

  it("pagar a CORRENTE furando o RP antigo SEM justificativa: REJEITA, nada grava", async () => {
    await expect(
      pagar(
        {
          liquidacaoId: liqCorrente, numero: "NP-2027", valor: "500.00",
          data: new Date("2027-07-01T12:00:00Z"),
          contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
        },
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA sem justificativa/);

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO" } })
    ).toBe(0);
  });

  it("pagar a CORRENTE COM justificativa: pagamento + justificativa, atomicamente", async () => {
    await pagar(
      {
        liquidacaoId: liqCorrente, numero: "NP-2027", valor: "500.00",
        data: new Date("2027-07-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
        justificativaQuebraOrdem: JUSTIFICATIVA,
      },
      R_PAGAMENTO,
      deps
    );

    expect(await prisma.pagamento.count()).toBe(1);
    const q = await prisma.justificativaQuebraOrdem.findMany();
    expect(q).toHaveLength(1);
    expect(q[0]!.liquidacaoId).toBe(liqCorrente);
    expect(q[0]!.hipotese).toBe("I_EMERGENCIA_CALAMIDADE");

    // o RP antigo continua na fila, agora sozinho
    expect(await ordem.posicaoNaFila(liqRP)).toBe(1);
  });

  it("pagar o RP (cabeça da fila) NÃO exige justificativa", async () => {
    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: liqRP, numero: "NP-RP-2026", valor: "1000.00",
        data: new Date("2027-07-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    expect(await prisma.pagamento.count()).toBe(1);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);

    // quitado o RP, a corrente vira a cabeça e passa sem justificativa
    expect(await ordem.posicaoNaFila(liqCorrente)).toBe(1);
    await pagar(
      {
        liquidacaoId: liqCorrente, numero: "NP-2027", valor: "500.00",
        data: new Date("2027-08-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
    expect(await prisma.pagamento.count()).toBe(2);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  it("o pagamento do RP não criou NENHUM MovimentoDotacao novo", async () => {
    const antes = await prisma.movimentoDotacao.findMany({
      select: { id: true, tipo: true, valor: true },
      orderBy: { criadoEm: "asc" },
    });

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: liqRP, numero: "NP-RP-2026", valor: "1000.00",
        data: new Date("2027-07-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE, historico: "h", criadoPor: POR,
      },
      R_PAG_RP
    );

    const depois = await prisma.movimentoDotacao.findMany({
      select: { id: true, tipo: true, valor: true },
      orderBy: { criadoEm: "asc" },
    });
    expect(depois).toEqual(antes);
  });
});
