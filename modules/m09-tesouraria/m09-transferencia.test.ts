import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { transferirEntreContas } from "./transferencia.js";

/**
 * M09 — transferência entre contas da mesma UG (TR 5.61). O fato que destrava o SAGRES §4.59.
 * A contabilização vai pelo funil (razao.ts): D contábil-destino / C contábil-origem, balanceada.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({ data: { id: "c-bancos", codigo: "1.1.1.1.2.00.00", nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Ordinarios", codigoTce: "500" } });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-a", codigo: "CC-A", descricao: "Conta A", fonteId: "fnt-500", contaContabilId: "c-bancos", banco: "001", agencia: "1234", digitoAgencia: "0", conta: "11111", digitoConta: "1" },
      { id: "cb-b", codigo: "CC-B", descricao: "Conta B", fonteId: "fnt-500", contaContabilId: "c-bancos", banco: "001", agencia: "5678", digitoAgencia: "0", conta: "22222", digitoConta: "2" },
    ],
  });
}

describe("transferirEntreContas (TR 5.61)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria o FATO e o lançamento balanceado pelo funil (D/C na conta contábil)", async () => {
    const r = await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-b", valor: "2500.00",
      data: new Date(Date.UTC(2026, 6, 15)), codigo: "TRF0001", historico: "transferência POC A→B", criadoPor: POR,
    });

    const transf = await prisma.transferenciaEntreContas.findUniqueOrThrow({ where: { id: r.transferenciaId } });
    expect(transf.contaOrigemId).toBe("cb-a");
    expect(transf.contaDestinoId).toBe("cb-b");
    expect(transf.valor.toFixed(2)).toBe("2500.00");
    expect(transf.lancamentoId).toBe(r.lancamentoId);

    const partidas = await prisma.partidaContabil.findMany({ where: { lancamentoId: r.lancamentoId }, orderBy: { tipo: "asc" } });
    expect(partidas).toHaveLength(2);
    // D e C, mesmo valor → balanceado por construção; ambas na conta Bancos.
    const deb = partidas.find((p) => p.tipo === "DEBITO")!;
    const cred = partidas.find((p) => p.tipo === "CREDITO")!;
    expect(deb.valor.toFixed(2)).toBe("2500.00");
    expect(cred.valor.toFixed(2)).toBe("2500.00");
    expect(deb.contaId).toBe("c-bancos");
    expect(cred.contaId).toBe("c-bancos");
    expect(deb.subsistema).toBe("PATRIMONIAL");
  });

  it("origem === destino → recusa", async () => {
    await expect(transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-a", valor: "100.00",
      data: new Date(Date.UTC(2026, 6, 15)), codigo: "X", historico: "invalida", criadoPor: POR,
    })).rejects.toThrow(/mesma conta/);
  });

  it("conta sem contaContabil mapeada → FAIL-CLOSED nomeando", async () => {
    await prisma.contaBancaria.create({ data: { id: "cb-c", codigo: "CC-C", descricao: "Conta C sem PCASP", fonteId: "fnt-500", banco: "001", agencia: "9999", digitoAgencia: "0", conta: "33333", digitoConta: "3" } });
    await expect(transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-c", valor: "100.00",
      data: new Date(Date.UTC(2026, 6, 15)), codigo: "Y", historico: "sem pcasp", criadoPor: POR,
    })).rejects.toThrow(/conta contábil/);
  });
});
