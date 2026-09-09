import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { roteiroArrecadacao } from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { anexo3 as rreoAnexo3 } from "./rreo-anexo3.js";
import { rgfAnexo3 } from "./rgf-anexo3.js";

/**
 * RGF — ANEXO 3: GARANTIAS E CONTRAGARANTIAS (LRF art. 55, I, "c").
 *
 * ⚠️ CONTAS À MÃO. O demonstrativo NASCE ZERADO (GARANTIAS-SEM-CADASTRO) — e isso é um demonstrativo
 * VÁLIDO, não erro: o município não avalizou dívida de ninguém. O que este teste prova:
 *
 * ═══ O CENÁRIO (2026, 3º quadrimestre → corte 31/12) ═══
 *   arrecada IPTU (corrente) 1.000.000 → forma a RCL. Não há garantia cadastrada (nenhuma entidade).
 *
 *   GARANTIAS (I..IV) .......... 0,00 cada  →  TOTAL (V) = 0,00
 *   CONTRAGARANTIAS (IX..XII) .. 0,00 cada  →  TOTAL (XIII) = 0,00
 *   RCL (VI) = 1.000.000 · emendas (VII) = 0 · RCL AJUSTADA (VIII) = 1.000.000
 *   % (V/VIII) = 0 / 1.000.000 = 0,00%  →  dentro do limite (22%), sem alerta (19,8%)
 *
 * ═══ R1 (regra Siconfi) ═══ a RCL daqui == a RCL do RREO Anexo 3 do mesmo período (motor único).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const R_ARR = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11130111", descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: "fnt-500" } });
  for (const ano of [2025, 2026]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "1000000.00",
      dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "G1", criadoPor: POR,
    },
    R_ARR,
    criarM04Deps(prisma)
  );
}

const ref = (a3: Awaited<ReturnType<typeof rgfAnexo3>>) => a3.colunas[a3.colunas.length - 1]!.valores;

describe("M12 — RGF Anexo 3 (Garantias e Contragarantias)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: as garantias nascem ZERADAS e nomeadas — um demonstrativo válido, não erro", async () => {
    const a3 = await rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 3 });
    const v = ref(a3);

    // As quatro linhas de garantia (I..IV), cada uma zerada em externas/internas/total.
    expect(v.garantias.map((g) => g.chave)).toEqual([
      "AOS_ESTADOS", "AOS_MUNICIPIOS", "AS_ENTIDADES_CONTROLADAS", "POR_FUNDOS_PROGRAMAS",
    ]);
    for (const g of v.garantias) {
      expect(g.externas).toBe("0.00");
      expect(g.internas).toBe("0.00");
      expect(g.total).toBe("0.00");
    }
    // (V) = I + II + III + IV.
    expect(v.totalGarantias).toBe("0.00");

    // O espelho das contragarantias (IX..XII) e o total (XIII).
    expect(v.contragarantias.map((g) => g.chave)).toEqual([
      "CG_DOS_ESTADOS", "CG_DOS_MUNICIPIOS", "CG_DAS_ENTIDADES_CONTROLADAS", "CG_POR_FUNDOS_PROGRAMAS",
    ]);
    expect(v.totalContragarantias).toBe("0.00");

    // A nota do interruptor está lá.
    expect(a3.notas.some((n) => n.startsWith("GARANTIAS-SEM-CADASTRO"))).toBe(true);
  });

  it("t2: a RCL e os limites — 0% das garantias, dentro do teto de 22%", async () => {
    const a3 = await rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 3 });
    const v = ref(a3);

    expect(v.rcl).toBe("1000000.00");
    expect(v.emendasIndividuais).toBe("0.00");
    expect(v.rclAjustada).toBe("1000000.00");

    // % = 0 / 1.000.000 = 0,00. Dentro do limite, sem alerta.
    expect(v.percentGarantias).toBe("0.00");
    expect(v.excedeuLimite).toBe(false);
    expect(v.emAlerta).toBe(false);

    expect(a3.limiteSenado).toBe("22.00");
    expect(a3.limiteAlerta).toBe("19.80");
    // Sem excesso, não há o que corrigir: o campo de medidas fica vazio (null), não uma frase inventada.
    expect(a3.medidasCorretivas).toBeNull();
  });

  it("t3 (R1, regra Siconfi): a RCL daqui É a do RREO Anexo 3 — motor único", async () => {
    const a3 = await rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 3 });
    // O 3º quadrimestre termina no fim do bimestre 6 (31/12).
    const rreo = await rreoAnexo3(prisma, { exercicio: 2026, bimestre: 6 });

    // ⚠️ NÃO é confronto de dois cálculos: o RGF Anexo 3 CONSOME o motor do RREO Anexo 3.
    // Se alguém somar a RCL por conta própria aqui, este teste cai.
    expect(ref(a3).rcl).toBe(rreo.rcl.total12m);
  });

  it("t4: as colunas são ANTERIOR + os quadrimestres até o de referência", async () => {
    const a3 = await rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 3 });
    expect(a3.colunas.map((c) => c.coluna)).toEqual(["ANTERIOR", "Q1", "Q2", "Q3"]);

    // Publicar o 1º não mostra o futuro.
    const q1 = await rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 1 });
    expect(q1.colunas.map((c) => c.coluna)).toEqual(["ANTERIOR", "Q1"]);
  });
});
