import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { arrecadarIngressoOperacaoCredito } from "../m10-patrimonial/adapter-m04.js";
import { cadastrarDivida } from "../m10-patrimonial/divida.js";
import { roteiroArrecadacao } from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { anexo3 as rreoAnexo3 } from "./rreo-anexo3.js";
import { rgfAnexo4 } from "./rgf-anexo4.js";

/**
 * RGF — ANEXO 4: OPERAÇÕES DE CRÉDITO (LRF art. 55, I, "d").
 *
 * ⚠️ CONTAS À MÃO. Fixture com o composto 4.64 (`arrecadarIngressoOperacaoCredito`), que amarra a
 * RECEITA (M04, origem 21) ao INGRESSO da dívida (M10) na MESMA transação.
 *
 * ═══ O CENÁRIO (2026) ═══
 *   IPTU corrente ................ 3.000.000  (2026-02-10)  → forma a RCL
 *   op. crédito → dívida MOBILIÁRIA . 100.000  (2026-02-10, Q1)   natureza 21110000 (interna)
 *   op. crédito → dívida CONTRATUAL . 300.000  (2026-06-10, Q2)   natureza 21110000 (interna)
 *
 * ═══ QUADRIMESTRE 2 (corte 31/08) — as duas colunas ═══
 *   No Quadrimestre (mai–ago): só a contratual de junho .......... internas 300.000
 *   Até o Quadrimestre (jan–ago): mobiliária + contratual ........ internas 400.000
 *
 *   (I) OPERAÇÕES DE CRÉDITO   No 300.000 · Até 400.000
 *     Internas                 No 300.000 · Até 400.000   (receita origem 21, espécie 1)
 *       Mobiliária             No       0 · Até 100.000   (ingresso M10, dívida mobiliária)
 *       Contratual             No 300.000 · Até 300.000   (ingresso M10, dívida contratual)
 *     Externas                 No       0 · Até       0   (censo não tem código 2.1.2)
 *   (II) Vedadas / (III) Deduzidas .... 0 (parâmetros nomeados)
 *   TOTAL SUJEITO AO LIMITE = I + II − III = Até 400.000
 *
 *   RCL AJUSTADA = 3.000.000 · % = 400.000 / 3.000.000 = 13,33% → dentro (16%), sem alerta (14,4%)
 *
 * ═══ R2 (Siconfi) ═══ RCL == RREO Anexo 3.  ═══ R3 (a amarração) ═══ internas-receita == mob+contr.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const NAT_OP_CREDITO = "21110000"; // categoria 2 · origem 1 · espécie 1 (interna)
const DIVIDA = "2.2.1.1.1.00.00"; // passivo — dívida fundada (conta reservada do M10)

const R_ARR_IPTU = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });
// ⚠️ O roteiro da op. de crédito credita a DÍVIDA (2.2.1), não uma VPA — é o que força o composto.
const R_ARR_OPCRED = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: DIVIDA });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: "11130111", descricao: "IPTU" },
      { id: "nr-opc", codigo: NAT_OP_CREDITO, descricao: "Operações de crédito internas" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: "fnt-500" } });
  for (const ano of [2025, 2026]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }

  const passivo = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: DIVIDA }, select: { id: true } });
  await cadastrarDivida(prisma, {
    identificador: "TIT-2026-01", credorNome: "Mercado", credorDocumento: "00000000000191",
    tipo: "MOBILIARIA", leiAutorizativa: "Lei 1/2026", objeto: "emissão de títulos públicos municipais", contaContabilId: passivo.id, criadoPor: POR,
  });
  await cadastrarDivida(prisma, {
    identificador: "CTR-2026-01", credorNome: "Banco", credorDocumento: "00360305000104",
    tipo: "CONTRATUAL", leiAutorizativa: "Lei 2/2026", objeto: "financiamento", contaContabilId: passivo.id, criadoPor: POR,
  });
}

async function cenario(): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "3000000.00",
      dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "IPTU-1", criadoPor: POR,
    },
    R_ARR_IPTU,
    criarM04Deps(prisma)
  );

  const dMob = await prisma.dividaConsolidada.findFirstOrThrow({ where: { tipo: "MOBILIARIA" }, select: { id: true } });
  const dCon = await prisma.dividaConsolidada.findFirstOrThrow({ where: { tipo: "CONTRATUAL" }, select: { id: true } });

  // Q1 (fev) → mobiliária 100.000.
  await arrecadarIngressoOperacaoCredito(prisma, {
    arrecadacao: {
      exercicio: 2026, naturezaReceita: NAT_OP_CREDITO, fonte: "500", valor: "100000.00",
      dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "OPC-MOB", criadoPor: POR,
    },
    roteiro: R_ARR_OPCRED, dividaId: dMob.id, motivo: "emissão de títulos",
  });
  // Q2 (jun) → contratual 300.000.
  await arrecadarIngressoOperacaoCredito(prisma, {
    arrecadacao: {
      exercicio: 2026, naturezaReceita: NAT_OP_CREDITO, fonte: "500", valor: "300000.00",
      dataArrecadacao: new Date("2026-06-10T12:00:00Z"), numeroReceita: "OPC-CON", criadoPor: POR,
    },
    roteiro: R_ARR_OPCRED, dividaId: dCon.id, motivo: "liberação do financiamento",
  });
}

const linhaDe = (a4: Awaited<ReturnType<typeof rgfAnexo4>>, chave: string) => a4.linhas.find((l) => l.chave === chave)!;

describe("M12 — RGF Anexo 4 (Operações de Crédito)", () => {
  beforeEach(async () => {
    await semear();
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: as duas colunas — No Quadrimestre × Até o Quadrimestre (Q2)", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 2 });

    // (I) — pela receita origem 21.
    expect(linhaDe(a4, "OP_CREDITO").valores).toEqual({ noQuadrimestre: "300000.00", ateQuadrimestre: "400000.00" });
    expect(linhaDe(a4, "OP_INTERNAS").valores).toEqual({ noQuadrimestre: "300000.00", ateQuadrimestre: "400000.00" });
    expect(linhaDe(a4, "OP_EXTERNAS").valores).toEqual({ noQuadrimestre: "0.00", ateQuadrimestre: "0.00" });

    // O sub-split Mobiliária × Contratual — pelos ingressos do M10.
    expect(linhaDe(a4, "OP_INTERNAS_MOBILIARIA").valores).toEqual({ noQuadrimestre: "0.00", ateQuadrimestre: "100000.00" });
    expect(linhaDe(a4, "OP_INTERNAS_CONTRATUAL").valores).toEqual({ noQuadrimestre: "300000.00", ateQuadrimestre: "300000.00" });
  });

  it("t2: TOTAL SUJEITO AO LIMITE = I + II − III, e o % sobre a RCL ajustada", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 2 });

    // Vedadas e deduzidas são zero (parâmetros).
    expect(linhaDe(a4, "OP_VEDADAS").valores.ateQuadrimestre).toBe("0.00");
    expect(linhaDe(a4, "OP_DEDUZIDAS").valores.ateQuadrimestre).toBe("0.00");
    expect(linhaDe(a4, "OP_VEDADAS").interruptor).toBe(true);

    // TOTAL = 400.000 (Até); 300.000 (No).
    expect(a4.totalSujeitoAoLimite).toEqual({ noQuadrimestre: "300000.00", ateQuadrimestre: "400000.00" });

    // % = 400.000 / 3.000.000 = 13,33%. Dentro do limite (16%), sem alerta (14,4%).
    expect(a4.rclAjustada).toBe("3000000.00");
    expect(a4.percentSobreRcl).toBe("13.33");
    expect(a4.excedeuLimite).toBe(false);
    expect(a4.emAlerta).toBe(false);
    expect(a4.limiteSenado).toBe("16.00");
    expect(a4.limiteAlerta).toBe("14.40");
  });

  it("t3 (R3, a amarração): internas-receita == Σ ingressos M10 (mob + contr) — um fato", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 2 });

    const internasAte = Number.parseFloat(linhaDe(a4, "OP_INTERNAS").valores.ateQuadrimestre);
    const mob = Number.parseFloat(linhaDe(a4, "OP_INTERNAS_MOBILIARIA").valores.ateQuadrimestre);
    const contr = Number.parseFloat(linhaDe(a4, "OP_INTERNAS_CONTRATUAL").valores.ateQuadrimestre);
    // A receita (um subsistema) e os ingressos da dívida (outro) contam o MESMO fato.
    expect(mob + contr).toBe(internasAte);
    // E o composto manteve os dois em sincronia: nenhuma nota de divergência.
    expect(a4.notas.some((n) => n.startsWith("AMARRACAO-OPCRED"))).toBe(false);
  });

  it("t4 (R2, Siconfi): a RCL É a do RREO Anexo 3 — motor único", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 2 });
    const rreo = await rreoAnexo3(prisma, { exercicio: 2026, bimestre: 4 }); // Q2 → bimestre 4 (31/08)
    expect(a4.rcl).toBe(rreo.rcl.total12m);
  });

  it("t5: ARO (7%) e o quadro art. 29 §1º saem zerados e nomeados", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 2 });

    expect(a4.aro.limitePercent).toBe("7.00");
    expect(a4.aro.valores).toEqual({ noQuadrimestre: "0.00", ateQuadrimestre: "0.00" });

    expect(a4.outrasOperacoes.map((l) => l.chave)).toEqual(["ASSUNCAO", "RECONHECIMENTO", "CONFISSAO"]);
    for (const l of a4.outrasOperacoes) {
      expect(l.interruptor).toBe(true);
      expect(l.valores.ateQuadrimestre).toBe("0.00");
    }
    expect(a4.notas.some((n) => n.startsWith("ART-29"))).toBe(true);
    expect(a4.notas.some((n) => n.startsWith("ARO-CADASTRO"))).toBe(true);
  });

  it("t6: publicar o 1º quadrimestre — a mobiliária já entrou, a contratual (junho) NÃO", async () => {
    const a4 = await rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 1 });

    // Q1 (jan–abr): só a mobiliária de fevereiro. A contratual de junho é futuro.
    expect(linhaDe(a4, "OP_INTERNAS").valores.ateQuadrimestre).toBe("100000.00");
    expect(linhaDe(a4, "OP_INTERNAS_MOBILIARIA").valores.ateQuadrimestre).toBe("100000.00");
    expect(linhaDe(a4, "OP_INTERNAS_CONTRATUAL").valores.ateQuadrimestre).toBe("0.00");
    expect(a4.totalSujeitoAoLimite.ateQuadrimestre).toBe("100000.00");
  });
});
