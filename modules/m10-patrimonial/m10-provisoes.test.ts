import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  atualizarProvisao,
  cadastrarProvisao,
  conferirProvisaoContraRazao,
  constituirProvisao,
  estornarMovimentoProvisao,
  reverterProvisao,
  saldoDaProvisaoEm,
} from "./provisoes.js";

/**
 * M10 — PROVISÕES MATEMÁTICAS PREVIDENCIÁRIAS (TR 5.89).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CICLO DO t5 ═══
 *   CONSTITUIÇÃO ........ + 100.000,00   D VPD / C passivo
 *   ATUALIZAÇÃO (2026-07) +   4.000,00   D VPD / C passivo
 *   REVERSÃO ............ −  10.000,00   D passivo / C **VPA**  ← FATO NOVO
 *
 *   SALDO = 100.000 + 4.000 − 10.000 = 94.000,00
 *
 *   ⚠️ A AMARRAÇÃO — a conta de passivo (CREDORA):
 *     ΣC = 100.000 + 4.000 = 104.000
 *     ΣD = 10.000 (a reversão)
 *     saldo credor = 104.000 − 10.000 = 94.000,00 ✓
 *
 * ═══ A REVERSÃO É VPA, E ISSO NÃO É DETALHE ═══
 * O cálculo atuarial de 2027 mostrou que o ente deve MENOS. Isso é um GANHO do
 * exercício em que se descobriu (D passivo / C VPA) — não a correção de um erro. O
 * ESTORNO existe para o outro caso (a provisão lançada errada), e ele NÃO gera VPA:
 * ele INVERTE as pernas do lançamento original. Confundir os dois faria o resultado
 * do exercício absorver, como ganho, a correção de uma digitação.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "atuarial@cg.pb.gov.br";
const PROVISAO = "2.2.7.1.1.00.00";
const VPD_PROVISAO = "3.5.1.1.1.00.00";
const VPA_REVERSAO = "4.9.1.1.1.00.00";

let provisaoId: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-provisao", codigo: PROVISAO, nome: "Provisões matemáticas", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD_PROVISAO, nome: "VPD provisões", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA_REVERSAO, nome: "VPA reversão de provisões", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.roteiroProvisao.createMany({
    data: [
      { tipo: "CONSTITUICAO", contaDebitoId: "c-vpd", contaCreditoId: "c-provisao", criadoPor: POR },
      { tipo: "ATUALIZACAO", contaDebitoId: "c-vpd", contaCreditoId: "c-provisao", criadoPor: POR },
      // ⚠️ A REVERSÃO CREDITA UMA **VPA** — é fato novo, não estorno.
      { tipo: "REVERSAO", contaDebitoId: "c-provisao", contaCreditoId: "c-vpa", criadoPor: POR },
    ],
  });

  const p = await cadastrarProvisao(prisma, {
    identificador: "RPPS-2026",
    descricao: "Provisão matemática previdenciária do RPPS municipal",
    contaContabilId: "c-provisao",
    criadoPor: POR,
  });
  provisaoId = p.provisaoId;
}

/** Saldo de uma conta no razão, com a natureza dela. */
async function saldoNoRazao(codigo: string, credora: boolean): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce((acc, p) => {
    const v = Number(p.valor);
    const soma = credora ? p.tipo === "CREDITO" : p.tipo === "DEBITO";
    return soma ? acc + v : acc - v;
  }, 0);
}

describe("M10 — provisões matemáticas", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t5
  it("t5: 100.000 + 4.000 − 10.000 = 94.000; a REVERSÃO gera VPA; o razão concorda", async () => {
    await constituirProvisao(prisma, {
      provisaoId, valor: "100000.00",
      dataMovimento: new Date("2026-01-31T12:00:00Z"),
      motivo: "cálculo atuarial de abertura do exercício", criadoPor: POR,
    });
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("100000.00");

    // ── ATUALIZAÇÃO: idempotente por competência ──────────────────────────
    const atual = await atualizarProvisao(prisma, {
      provisaoId, valor: "4000.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "reavaliação atuarial de julho", criadoPor: POR,
    });
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("104000.00");

    await expect(
      atualizarProvisao(prisma, {
        provisaoId, valor: "999.00", competencia: "2026-07",
        dataMovimento: new Date("2026-07-31T12:00:00Z"),
        motivo: "atualizando julho de novo, por engano", criadoPor: POR,
      })
    ).rejects.toThrow(/COMPETÊNCIA 2026-07 JÁ ATUALIZADA/);

    // ESTORNA → a competência ABRE de novo (o saldo governa)
    await estornarMovimentoProvisao(prisma, {
      movimentoId: atual.movimentoId,
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "premissa atuarial errada; refazer julho", criadoPor: POR,
    });
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("100000.00");

    await atualizarProvisao(prisma, {
      provisaoId, valor: "4000.00", competencia: "2026-07",
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "reavaliação atuarial de julho, com a premissa certa", criadoPor: POR,
    });
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("104000.00");

    // ── REVERSÃO: FATO NOVO, gera VPA ────────────────────────────────────
    await reverterProvisao(prisma, {
      provisaoId, valor: "10000.00",
      dataMovimento: new Date("2026-12-31T12:00:00Z"),
      motivo: "novo cálculo atuarial apontou passivo menor que o provisionado",
      criadoPor: POR,
    });

    // 100.000 + 4.000 − 10.000
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("94000.00");

    // ⚠️ A AMARRAÇÃO: ΣC 104.000 − ΣD 10.000 = 94.000
    expect(await saldoNoRazao(PROVISAO, true)).toBe(94000);
    const conf = await conferirProvisaoContraRazao(prisma, "c-provisao");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("94000.00");
    expect(conf.peloRazao.toFixed(2)).toBe("94000.00");

    // ⚠️ A REVERSÃO CREDITOU UMA **VPA** — 10.000 de ganho patrimonial.
    expect(await saldoNoRazao(VPA_REVERSAO, true)).toBe(10000);
    // e o estorno da atualização NÃO gerou VPA: ele inverteu as pernas (D passivo /
    // C VPD), então a VPD líquida é 100.000 + 4.000 (a de julho, refeita) = 104.000.
    expect(await saldoNoRazao(VPD_PROVISAO, false)).toBe(104000);

    // o ledger fecha
    const todas = await prisma.partidaContabil.findMany({ select: { tipo: true, valor: true } });
    const d = todas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
    const c = todas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
    expect(d).toBe(c);
  });

  // reversão além do saldo
  it("t5b: reverter mais do que se provisionou é rejeitado (o ente não deve menos que zero)", async () => {
    await constituirProvisao(prisma, {
      provisaoId, valor: "100000.00",
      dataMovimento: new Date("2026-01-31T12:00:00Z"),
      motivo: "cálculo atuarial de abertura", criadoPor: POR,
    });

    let erro: unknown;
    try {
      await reverterProvisao(prisma, {
        provisaoId, valor: "100000.01",
        dataMovimento: new Date("2026-12-31T12:00:00Z"),
        motivo: "revertendo mais do que existe, por engano", criadoPor: POR,
      });
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> REVERSÃO > PROVISÃO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/REVERSÃO MAIOR QUE A PROVISÃO/);
    expect(msg).toMatch(/devia menos do que zero/);
    expect((await saldoDaProvisaoEm(prisma, provisaoId)).toFixed(2)).toBe("100000.00");
    await conferirProvisaoContraRazao(prisma, "c-provisao");
  });
});
