import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { FONTE, POR, semearM08 } from "../m08-restos-a-pagar/fixture-m08.js";
import { borderoDosMovimentos } from "./bordero-de-movimentos.js";
import { estornarMovimentoBancario, registrarMovimentoBancario } from "./movimentacao.js";

/**
 * V36 — O BORDERÔ DOS MOVIMENTOS BANCÁRIOS (TR 5.10.2.22). Contas à mão, conta CC-B, setembro de 2026:
 *   02/09 depósito 50,00 (entrada) · 03/09 tarifa 12,34 (saída) · 04/09 depósito 20,00 ESTORNADO em 05/09
 *   01/10 depósito 99,00 (fora do período) · na outra conta, CC-X, um depósito de 7,00 no período.
 *   → setembro em CC-B: duas linhas (50,00 e 12,34), entradas 50,00, saídas 12,34, dois fora por estorno.
 * A borda do período vale pelo dia civil do ente: o depósito das 23:30 de 30/09 (02:30 UTC de 01/10) entra.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const mov = (contaBancariaId: string, tipo: "DEPOSITO" | "TARIFA", valor: string, iso: string, contra: string) =>
  registrarMovimentoBancario(prisma, { contaBancariaId, fonteId: FONTE, tipo, valor, data: new Date(iso), historico: `${tipo} de teste`, contaContrapartidaId: contra, criadoPor: POR });

describe("M09 V36 — borderô dos movimentos bancários", () => {
  beforeEach(async () => {
    await semearM08();
    await prisma.exercicio.createMany({ data: [{ ano: 2026, criadoPor: POR }], skipDuplicates: true });
    const bancos = await prisma.contaPcasp.findFirstOrThrow({ where: { codigo: "1.1.1.1.2.00.00" }, select: { id: true } });
    await prisma.contaPcasp.createMany({
      data: [
        { id: "c-rec-fin", codigo: "4.4.1.1.1.00.00", nome: "Receitas financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-desp-fin", codigo: "3.4.1.1.1.00.00", nome: "Despesas financeiras", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      ],
    });
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-b", codigo: "CC-B", descricao: "Movimento B", fonteId: FONTE, contaContabilId: bancos.id, banco: "001", agencia: "1234", digitoAgencia: "5", conta: "98765", digitoConta: "X" },
        { id: "cb-x", codigo: "CC-X", descricao: "Outra", fonteId: FONTE, contaContabilId: bancos.id },
      ],
    });
    await prisma.fonteDaContaBancaria.createMany({ data: [{ contaBancariaId: "cb-b", fonteId: FONTE, criadoPor: POR }, { contaBancariaId: "cb-x", fonteId: FONTE, criadoPor: POR }] });
    await mov("cb-b", "DEPOSITO", "50.00", "2026-09-02T15:00:00Z", "c-rec-fin");
    await mov("cb-b", "TARIFA", "12.34", "2026-09-03T15:00:00Z", "c-desp-fin");
    const estornado = await mov("cb-b", "DEPOSITO", "20.00", "2026-09-04T15:00:00Z", "c-rec-fin");
    await estornarMovimentoBancario(prisma, { movimentoId: estornado.movimentoId, motivo: "depósito lançado em duplicidade", data: new Date("2026-09-05T15:00:00Z"), criadoPor: POR });
    await mov("cb-b", "DEPOSITO", "99.00", "2026-10-01T15:00:00Z", "c-rec-fin");
    await mov("cb-x", "DEPOSITO", "7.00", "2026-09-10T15:00:00Z", "c-rec-fin");
  }, 120000);

  it("t1: só os vigentes da conta no período, com as entradas e as saídas; os estornos ficam fora e contados", async () => {
    const b = await borderoDosMovimentos(prisma, { contaBancariaId: "cb-b", de: inicioDoDiaCivil("2026-09-01"), ate: fimDoDiaCivil("2026-09-30") });
    expect(b?.conta).toEqual({ codigo: "CC-B", descricao: "Movimento B", banco: "001", agencia: "1234-5", numero: "98765-X" });
    expect(b?.linhas.map((l) => [l.tipo, l.sentido, l.valor.toFixed(2)])).toEqual([
      ["DEPOSITO", "ENTRADA", "50.00"],
      ["TARIFA", "SAIDA", "12.34"],
    ]);
    expect([b?.entradas.toFixed(2), b?.saidas.toFixed(2), b?.foraPorEstorno]).toEqual(["50.00", "12.34", 2]);
  });

  it("t2: a borda do período é o dia civil do ente; conta inexistente responde null", async () => {
    await mov("cb-b", "DEPOSITO", "1.00", "2026-10-01T02:30:00Z", "c-rec-fin");
    const b = await borderoDosMovimentos(prisma, { contaBancariaId: "cb-b", de: inicioDoDiaCivil("2026-09-01"), ate: fimDoDiaCivil("2026-09-30") });
    expect(b?.entradas.toFixed(2)).toBe("51.00");
    const outubro = await borderoDosMovimentos(prisma, { contaBancariaId: "cb-b", de: inicioDoDiaCivil("2026-10-01"), ate: fimDoDiaCivil("2026-10-31") });
    expect(outubro?.linhas.map((l) => l.valor.toFixed(2))).toEqual(["99.00"]);
    expect(await borderoDosMovimentos(prisma, { contaBancariaId: "nao-existe", de: inicioDoDiaCivil("2026-09-01"), ate: fimDoDiaCivil("2026-09-30") })).toBeNull();
  });
});
