import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularLiquidacaoParcial, anularPagamentoParcial } from "../m05-despesa/anulacao-parcial.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import { roteiroPagamentoRestos } from "./dominio.js";
import { pagarRestosAPagar } from "./restos.js";
import { empenharDe2026, FONTE, liquidarDe2026, pagarDe2026, POR, semearM08 } from "./fixture-m08.js";

/**
 * ═══ V33 — A ANULAÇÃO PARCIAL NO PAGAMENTO DE RESTOS A PAGAR ═══
 *
 * A ponte local do M08 (`somaLiquida` em `restos.ts`) não repassava o `anulacaoParcialDeId` à régua, e o
 * LIMITE 1 do pagamento de resto ("não pagar mais que a liquidação") lia o valor BRUTO da liquidação. O
 * M05 recusa anulação parcial depois do encerramento — então o caso real é a parcial feita no PRÓPRIO
 * exercício, que atravessa a virada:
 *
 *   NE-1 (10.000) · NL-1 5.000 com parcial de 1.000 (líquida 4.000) · NL-2 3.000 · nada pago
 *     → RP processado 7.000. Em 2027, pagar 5.000 pela NL-1 passava nos dois limites com o defeito
 *       (5.000 ≤ 5.000 bruto; 5.000 ≤ 7.000 do resto): 1.000 pagos além da liquidação, e a NL-2
 *       ficava sem saldo para ser paga inteira.
 *   NE-2 (6.000) · NL-3 5.000 · paga 3.000 com parcial de 1.000 (pago líquido 2.000)
 *     → RP processado 3.000. Em 2027, pagar os 3.000 que faltam era RECUSADO com o defeito: a parcial
 *       somava como mais pagamento (já pago 4.000 + 3.000 > 5.000).
 *
 * N=2 por construção: duas liquidações no mesmo resto (é a segunda que impede o limite do resto de
 * esconder o erro do limite da liquidação), e os dois sentidos do erro (passar o que não devia e
 * recusar o que devia passar).
 */

const prisma = criarPrismaDeTeste();
const MOTIVO = "glosa registrada pela fiscalização do contrato";
const dia = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
});

let nl1 = "";
let nl1Parcial = "";
let nl3 = "";

const pagarRp = (liquidacaoId: string, numero: string, valor: string) =>
  pagarRestosAPagar(
    prisma,
    { liquidacaoId, numero, valor, data: dia("2027-02-10"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de RP", criadoPor: POR },
    R_PAG_RP
  );

describe("M08 V33 — pagamento de restos a pagar com anulação parcial feita antes da virada", () => {
  beforeAll(async () => {
    await semearM08();
    const deps = criarM05Deps(prisma);

    const e1 = await empenharDe2026(deps, "NE-1", "10000.00", "GLOBAL");
    nl1 = await liquidarDe2026(deps, e1, "NL-1", "5000.00");
    nl1Parcial = (
      await anularLiquidacaoParcial({ originalId: nl1, numero: "NL-1-AP1", valor: "1000.00", data: dia("2026-08-10"), motivo: MOTIVO, criadoPor: POR }, deps)
    ).anulacaoId;
    await liquidarDe2026(deps, e1, "NL-2", "3000.00");

    const e2 = await empenharDe2026(deps, "NE-2", "6000.00", "GLOBAL");
    // Liquidada antes da NL-1 e da NL-2: é a cabeça da fila do art. 141, e o pagamento dela em 2026 não fura a ordem.
    nl3 = await liquidarDe2026(deps, e2, "NL-3", "5000.00", "2026-07-01T12:00:00Z");
    const p = await pagarDe2026(deps, nl3, "NP-3", "3000.00");
    await anularPagamentoParcial({ originalId: p, numero: "NP-3-AP1", valor: "1000.00", data: dia("2026-09-10"), motivo: MOTIVO, criadoPor: POR }, deps);

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sanidade: os restos processados foram inscritos pelo líquido (7.000 e 3.000)", async () => {
    const ins = await prisma.inscricaoRestosAPagar.findMany({
      where: { tipo: "PROCESSADO" },
      select: { valorInscrito: true, empenho: { select: { numero: true } } },
      orderBy: { empenho: { numero: "asc" } },
    });
    expect(ins.map((i) => `${i.empenho.numero} ${i.valorInscrito.toFixed(2)}`)).toEqual(["NE-1 7000.00", "NE-2 3000.00"]);
  });

  it("pagar a NL-1 pelo bruto (5.000) é recusado pelo limite da liquidação, que é a líquida (4.000) — e nada é gravado", async () => {
    const antes = await prisma.pagamento.count();
    await expect(pagarRp(nl1, "NP-RP-1", "5000.00")).rejects.toThrow(/excede a liquidação: liquidado 4000\.00, já pago 0\.00, solicitado 5000\.00/);
    expect(await prisma.pagamento.count()).toBe(antes);
  });

  it("pagar os 3.000 que faltam da NL-3 passa: a parcial do pagamento desconta, não soma (e ela é a cabeça da fila do art. 141)", async () => {
    await expect(pagarRp(nl3, "NP-RP-3", "3000.00")).resolves.toBeDefined();
  });

  it("pagar a NL-1 pelo líquido (4.000) passa", async () => {
    await expect(pagarRp(nl1, "NP-RP-2", "4000.00")).resolves.toBeDefined();
  });

  it("a linha da anulação parcial não é liquidação a pagar — e o motivo é dito", async () => {
    await expect(pagarRp(nl1Parcial, "NP-RP-4", "100.00")).rejects.toThrow(/é uma anulação, e não uma liquidação a pagar/);
  });
});
