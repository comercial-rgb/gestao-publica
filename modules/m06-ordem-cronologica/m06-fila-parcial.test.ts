import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroPagamento } from "../m05-despesa/dominio.js";
import { pagar } from "../m05-despesa/servico-bloco2.js";
import { anularLiquidacaoParcial, estornarAnulacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarOrdemCronologicaPrisma } from "./adapter-prisma.js";
import { empenharELiquidar, FICHA_500, FONTE_500, POR, semearM06 } from "./fixture-m06.js";

/**
 * ═══ V33 — A ANULAÇÃO PARCIAL DA LIQUIDAÇÃO NA FILA DO ART. 141 ═══
 *
 * Dois defeitos da fila (`liquidacoesComSaldo`), nos dois sentidos — e a fila é a mesma do lote do M09:
 *
 * 1. A LINHA DA PARCIAL ENTRAVA NA FILA como liquidação própria (filtro só por `estornoDeId`), com o
 *    valor da glosa como saldo e a data da glosa como exigibilidade: uma posição fantasma na frente de
 *    liquidações reais, que a fila mandava pagar primeiro.
 *      A (100, 05/01) · paga 60 · parcial de 40 (12/02) → A quitada pelo líquido.
 *      B (200, 10/03). Certo: B é a cabeça. Com o defeito: a parcial de 12/02 é a cabeça, e pagar B
 *      sem justificativa é recusado por "quebra da ordem".
 *
 * 2. A PARCIAL ESTORNADA CONTINUAVA DESCONTANDO (lida por `estornoDeId`, que numa parcial é sempre nulo).
 *      A (100, 05/01) · paga 70 · parcial de 30 ESTORNADA → A com saldo 30, continua na frente.
 *      Certo: B é a 2ª, e pagá-la sem justificativa é recusado. Com o defeito: A "quitada", B cabeça.
 */

const prisma = criarPrismaDeTeste();
const MOTIVO = "glosa registrada pela fiscalização do contrato";
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.01.00",
});
const pgto = (liquidacaoId: string, numero: string, valor: string, data = "2026-07-01") => ({
  liquidacaoId,
  numero,
  valor,
  data: new Date(`${data}T12:00:00Z`),
  contaBancaria: "CC-001",
  fonteId: FONTE_500,
  historico: `Pagamento ${numero}`,
  criadoPor: POR,
});

describe("M06 V33 — a fila da ordem cronológica com anulação parcial da liquidação", () => {
  let deps: M05Deps;
  const ordem = criarOrdemCronologicaPrisma(prisma);
  let a = "";
  let b = "";

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM06();
    a = await empenharELiquidar(deps, { fichaId: FICHA_500, numero: "NL1", valor: "100.00", categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z" });
    b = await empenharELiquidar(deps, { fichaId: FICHA_500, numero: "NL2", valor: "200.00", categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-03-10T12:00:00Z" });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a parcial que quita a liquidação não vira posição fantasma: B passa a ser a cabeça e é paga sem justificativa", async () => {
    await pagar(pgto(a, "NP1", "60.00", "2026-01-20"), R_PAGAMENTO, deps);
    await anularLiquidacaoParcial(
      { originalId: a, numero: "NL1-AP1", valor: "40.00", data: new Date("2026-02-12T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    const fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila.map((l) => `${l.numero} ${l.saldoAPagar.toFixed(2)}`)).toEqual(["NL2 200.00"]);
    expect(await ordem.posicaoNaFila(b)).toBe(1);
    await expect(pagar(pgto(b, "NP2", "200.00"), R_PAGAMENTO, deps)).resolves.toBeDefined();
  });

  it("a parcial estornada volta a não descontar: A continua na frente, e pagar B antes dela é recusado com o motivo", async () => {
    await pagar(pgto(a, "NP1", "70.00", "2026-01-20"), R_PAGAMENTO, deps);
    const ap = await anularLiquidacaoParcial(
      { originalId: a, numero: "NL1-AP1", valor: "30.00", data: new Date("2026-02-12T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    await estornarAnulacaoParcial(
      { nivel: "LIQUIDACAO", anulacaoId: ap.anulacaoId, numero: "NL1-AP1-E", data: new Date("2026-02-13T12:00:00Z"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );
    const fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila.map((l) => `${l.numero} ${l.saldoAPagar.toFixed(2)}`)).toEqual(["NL1 30.00", "NL2 200.00"]);
    expect(await ordem.posicaoNaFila(b)).toBe(2);
    await expect(pagar(pgto(b, "NP2", "200.00"), R_PAGAMENTO, deps)).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA sem justificativa/);
  });
});
