import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarExtratoBb } from "./extrato.js";
import { normalizarExtratoBb } from "../m17-banco-bb/normalizar.js";

/**
 * M09 × M17-a — import via API do BB, ingerido pelo MESMO núcleo do OFX.
 *
 * A asserção que sustenta a sessão: importar o MESMO período por API duas vezes é NO-OP. A dedup de
 * origem (hash das linhas canônicas) é a mesma disciplina do hash do arquivo OFX — o operador que
 * puxa o extrato duas vezes não duplica o banco. A `origem` gravada é API_BB (a procedência aparece
 * na trilha; a conciliação é idêntica).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const CONTA = "cb-bb-1";

const CTX = { agencia: "1234", conta: "56789", desde: new Date(Date.UTC(2026, 6, 1)), ate: new Date(Date.UTC(2026, 6, 31)) };
const RESPOSTA_BB = {
  listaLancamento: [
    { dataLancamento: 5072026, valorLancamento: 8000.0, indicadorTipoLancamento: "C", textoDescricaoHistorico: "ARRECADACAO IPTU", numeroDocumento: 111, numeroLancamento: 1 },
    { dataLancamento: 15072026, valorLancamento: 1500.0, indicadorTipoLancamento: "D", textoDescricaoHistorico: "PAGTO FORNECEDOR", numeroDocumento: 222, numeroLancamento: 2 },
    { dataLancamento: 31072026, valorLancamento: 35.9, indicadorTipoLancamento: "D", textoDescricaoHistorico: "TARIFA", numeroDocumento: 0, numeroLancamento: 3 },
  ],
};

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: CONTA, codigo: "CC-BB", descricao: "Conta BB", fonteId: "fnt-500" } });
}

describe("M09×M17 — import de extrato via API do BB", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("importa 3 lançamentos normalizados e grava a origem API_BB", async () => {
    const extrato = normalizarExtratoBb(RESPOSTA_BB, CTX);
    const r = await importarExtratoBb(prisma, { contaBancariaId: CONTA, extrato, importadoPor: POR });

    expect(r.jaImportado).toBe(false);
    expect(r.inseridas).toBe(3);
    expect(r.puladas).toBe(0);

    const eb = await prisma.extratoBancario.findUniqueOrThrow({ where: { id: r.extratoId } });
    expect(eb.origem).toBe("API_BB"); // a procedência ficou gravada
    expect(eb.importadoPor).toBe(POR);

    const linhas = await prisma.lancamentoExtrato.findMany({ orderBy: { dataPostagem: "asc" } });
    expect(linhas).toHaveLength(3);
    const credito = linhas.find((l) => l.natureza === "CREDITO")!;
    expect(credito.valor.toFixed(2)).toBe("8000.00");
    expect(credito.fitid).toMatch(/^BB-/); // fitid sintetizado (não veio do banco)
    expect(linhas.every((l) => l.contaBancariaId === CONTA)).toBe(true);
  });

  it("IDEMPOTÊNCIA de origem: puxar o MESMO período 2x por API é no-op — não duplica", async () => {
    const primeira = await importarExtratoBb(prisma, { contaBancariaId: CONTA, extrato: normalizarExtratoBb(RESPOSTA_BB, CTX), importadoPor: POR });
    // Segunda ida à API do mesmo período: mesma resposta → mesmo hash de origem → no-op.
    const segunda = await importarExtratoBb(prisma, { contaBancariaId: CONTA, extrato: normalizarExtratoBb(RESPOSTA_BB, CTX), importadoPor: POR });

    expect(segunda.jaImportado).toBe(true);
    expect(segunda.extratoId).toBe(primeira.extratoId);
    expect(segunda.inseridas).toBe(0);

    // Não duplicou: um extrato, três linhas.
    expect(await prisma.extratoBancario.count()).toBe(1);
    expect(await prisma.lancamentoExtrato.count()).toBe(3);
  });
});
