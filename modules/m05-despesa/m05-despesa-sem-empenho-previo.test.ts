import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { liquidar } from "./servico-bloco2.js";
import { listarLiquidacoes } from "./consultas.js";
import { empenharDe2026, R_LIQUIDACAO, semearM08, POR } from "../m08-restos-a-pagar/fixture-m08.js";
import type { M05Deps } from "./ports.js";

/**
 * V36 — DESPESA SEM EMPENHO PRÉVIO (TR 5.10.1.30): a liquidação diz se a despesa foi realizada antes do empenho.
 *
 *   NE1 300 → NL1 300 informada como SEM empenho prévio; NE2 200 → NL2 200 sem a marca.
 *   A lista devolve a marca de cada uma; o lançamento das duas tem as mesmas contas (a marca é só informação).
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

describe("M05 — despesa sem empenho prévio na liquidação", () => {
  let deps: M05Deps;
  let nl1: string;
  let nl2: string;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
    const liq = async (empenhoId: string, numero: string, valor: string, sem?: boolean) =>
      (
        await liquidar(
          {
            empenhoId,
            numero,
            valor,
            data: new Date("2026-08-01T12:00:00Z"),
            responsavelAtesto: "Fulano",
            historico: `liq ${numero}`,
            criadoPor: POR,
            ...(sem === undefined ? {} : { despesaSemEmpenhoPrevio: sem }),
          },
          R_LIQUIDACAO,
          deps
        )
      ).liquidacaoId;
    nl1 = await liq(await empenharDe2026(deps, "NE1", "300.00"), "NL1", "300.00", true);
    nl2 = await liq(await empenharDe2026(deps, "NE2", "200.00"), "NL2", "200.00");
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a marca é gravada na liquidação e devolvida pela lista, uma a uma", async () => {
    const ls = await listarLiquidacoes(prisma, { exercicio: 2026 });
    expect(ls.map((l) => [l.numero, l.despesaSemEmpenhoPrevio]).sort()).toEqual([
      ["NL1", true],
      ["NL2", false],
    ]);
    const gravadas = await prisma.liquidacao.findMany({ where: { id: { in: [nl1, nl2] } }, select: { numero: true, despesaSemEmpenhoPrevio: true }, orderBy: { numero: "asc" } });
    expect(gravadas).toEqual([
      { numero: "NL1", despesaSemEmpenhoPrevio: true },
      { numero: "NL2", despesaSemEmpenhoPrevio: false },
    ]);
  });

  it("t2: a marca não muda o lançamento — as duas liquidações movem as mesmas contas", async () => {
    const contasDe = async (id: string): Promise<string[]> => {
      const l = await prisma.liquidacao.findUniqueOrThrow({ where: { id }, select: { lancamento: { select: { partidas: { select: { tipo: true, conta: { select: { codigo: true } } } } } } } });
      return l.lancamento.partidas.map((p) => `${p.tipo} ${p.conta.codigo}`).sort();
    };
    expect(await contasDe(nl1)).toEqual(await contasDe(nl2));
  });
});
