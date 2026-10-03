import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  anularEmpenhoParcial,
  anularLiquidacaoParcial,
  anularPagamentoParcial,
  estornarAnulacaoParcial,
} from "../m05-despesa/anulacao-parcial.js";
import { encerrarExercicioComRestos, situacaoDosEmpenhos } from "./encerramento.js";
import { empenharDe2026, liquidarDe2026, pagarDe2026, POR, semearM08 } from "./fixture-m08.js";

/**
 * ═══ V33 — A ANULAÇÃO PARCIAL NO ENCERRAMENTO: caracterização do defeito e régua da correção ═══
 *
 * A anulação parcial (TR 5.35) é uma LINHA NOVA na tabela do fato que reduz, com `anulacaoParcialDeId`
 * apontando para ele e `estornoDeId` nulo. A soma local do encerramento só conhecia o `estornoDeId`:
 *   - a parcial do EMPENHO entrava como um empenho próprio, e era INSCRITA em restos a pagar;
 *   - o empenho original não recebia o desconto;
 *   - as parciais de LIQUIDAÇÃO e de PAGAMENTO somavam em vez de subtrair.
 * Achado pela composição das linhas do Anexo 13 (`m12-composicao.test.ts`): o balanço do exercício
 * encerrado deixou de fechar contra o caixa pelo dobro da parcial.
 *
 * ⚠️ N=2 parciais vivas por nível, e uma parcial ESTORNADA (volta a não descontar). Com uma parcial
 * só, "subtrair a última" passaria; sem a estornada, "subtrair todas" também.
 *
 * Literais por aritmética manual:
 *   NE-1 10.000 · parciais 1.000 e 500 vivas · parcial 200 estornada   → empenhado 8.500
 *   liquida 6.000 · parciais 700 e 300 vivas · parcial 150 estornada     → liquidado 5.000
 *   paga 4.000 · parciais 400 e 100 vivas · parcial 50 estornada         → pago 3.500
 *   restos: processado = 5.000 − 3.500 = 1.500; não processado = 8.500 − 5.000 = 3.500
 * Com o defeito: o empenho original saía 10.000 (liquidado 7.000, pago 4.500) e as duas parciais vivas
 * do empenho (1.000 e 500), mais a estornada (200), viravam três "empenhos" a inscrever.
 */

const prisma = criarPrismaDeTeste();
const MOTIVO = "glosa registrada pela fiscalização do contrato";
const dia = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe("M08 V33 — encerramento com anulação parcial de empenho, liquidação e pagamento", () => {
  beforeAll(async () => {
    await semearM08();
    const deps = criarM05Deps(prisma);
    const e = await empenharDe2026(deps, "NE-1", "10000.00");
    for (const [n, v] of [["NE-1-AP1", "1000.00"], ["NE-1-AP2", "500.00"]] as const) {
      await anularEmpenhoParcial({ originalId: e, numero: n, valor: v, data: dia("2026-06-10"), motivo: MOTIVO, criadoPor: POR }, deps);
    }
    const ap3 = await anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP3", valor: "200.00", data: dia("2026-06-11"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial(
      { nivel: "EMPENHO", anulacaoId: ap3.anulacaoId, numero: "NE-1-AP3-E", data: dia("2026-06-12"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );

    const l = await liquidarDe2026(deps, e, "NL-1", "6000.00");
    const p = await pagarDe2026(deps, l, "NP-1", "4000.00");
    for (const [n, v] of [["NP-1-AP1", "400.00"], ["NP-1-AP2", "100.00"]] as const) {
      await anularPagamentoParcial({ originalId: p, numero: n, valor: v, data: dia("2026-09-10"), motivo: MOTIVO, criadoPor: POR }, deps);
    }
    const pp3 = await anularPagamentoParcial({ originalId: p, numero: "NP-1-AP3", valor: "50.00", data: dia("2026-09-11"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial(
      { nivel: "PAGAMENTO", anulacaoId: pp3.anulacaoId, numero: "NP-1-AP3-E", data: dia("2026-09-12"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );
    for (const [n, v] of [["NL-1-AP1", "700.00"], ["NL-1-AP2", "300.00"]] as const) {
      await anularLiquidacaoParcial({ originalId: l, numero: n, valor: v, data: dia("2026-10-01"), motivo: MOTIVO, criadoPor: POR }, deps);
    }
    const lp3 = await anularLiquidacaoParcial({ originalId: l, numero: "NL-1-AP3", valor: "150.00", data: dia("2026-10-02"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial(
      { nivel: "LIQUIDACAO", anulacaoId: lp3.anulacaoId, numero: "NL-1-AP3-E", data: dia("2026-10-03"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a situação tem UM empenho, com as três colunas descontadas das parciais vivas", async () => {
    const s = await situacaoDosEmpenhos(prisma, 2026);
    expect(s.map((x) => `${x.numero} ${x.empenhado.toFixed(2)} ${x.liquidado.toFixed(2)} ${x.pago.toFixed(2)}`)).toEqual([
      "NE-1 8500.00 5000.00 3500.00",
    ]);
  });

  it("o encerramento inscreve 1.500 processados e 3.500 não processados — e nenhuma parcial vira resto a pagar", async () => {
    const r = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(r.inscricoes.map((i) => `${i.numeroEmpenho} ${i.tipo} ${i.valorInscrito.toFixed(2)}`).sort()).toEqual([
      "NE-1 NAO_PROCESSADO 3500.00",
      "NE-1 PROCESSADO 1500.00",
    ]);
  });
});
