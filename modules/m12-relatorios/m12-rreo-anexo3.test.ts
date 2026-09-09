import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { anexo3, janelaDosDozeMeses, type LinhaRcl } from "./rreo-anexo3.js";

/**
 * RREO — ANEXO 3: DEMONSTRATIVO DA RECEITA CORRENTE LÍQUIDA. LRF art. 53, I · MDF 15ª ed.
 *
 * ═══ O CENÁRIO OURO (bimestre 1 de 2026 → janela Mar/2025 … Fev/2026) ═══
 * (as 12 colunas são cronológicas: col 0 = Mar/2025, col 10 = Jan/2026, col 11 = Fev/2026)
 *
 *   CORRENTES (I):
 *     IPTU  (11130111, mapeado): 50.000 em Mar/2025 + 100.000 em Jan/2026  → 150.000 · prev 300.000
 *     ICMS  (17210251, mapeado): 200.000 em Fev/2026                        → 200.000 · prev 250.000
 *     FPM   (17210151, mapeado):  30.000 em Jan/2026 [CO 3110 individual]
 *                               + 20.000 em Fev/2026 [CO 3120 bancada]      →  50.000 · prev  0
 *     Outras da origem 11 (11150111, NÃO mapeado → FAIL-OPEN): 10.000 em Dez/2025 → 10.000
 *     I = 150.000 + 200.000 + 50.000 + 10.000 = 410.000  ·  prev 550.000
 *   DEDUÇÕES (II):
 *     DED_FUNDEB (19229951, mapeado "deducao"): 40.000 em Jan/2026 → 40.000 · prev 60.000
 *   RCL (III) = I − II = 410.000 − 40.000 = 370.000  ·  prev 550.000 − 60.000 = 490.000
 *   (−) emendas individuais (IV, CO 3110/3111) = 30.000
 *   RCL AJUSTADA endividamento (V) = III − IV = 340.000
 *   (−) emendas de bancada (VI, CO 3120/3121) = 20.000
 *   RCL AJUSTADA pessoal (VII) = V − VI = 320.000
 *
 * ═══ AS IDENTIDADES (literais escolhidos ANTES; cada uma com mutação que grita) ═══
 *   R1  total12m == Σ das 12 colunas, em toda linha.
 *   R2  I == Σ sub-linhas de I ; II == Σ sub-linhas de II.
 *   R3  III == I − II ; V == III − IV ; VII == V − VI (por coluna e no total).
 *   R4  Σ(RCL de cada mês) == III.total12m.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br"; // usuário de fixtures já cadastrado (TR 4.55)
const FONTE = "500";

// naturezas (8 dígitos)
const NAT_IPTU = "11130111"; // corrente, mapeado IPTU
const NAT_ICMS = "17210251"; // corrente, mapeado ICMS
const NAT_FPM = "17210151"; // corrente, mapeado FPM (recebe as emendas)
const NAT_OUTRA = "11150111"; // corrente categoria 1, NÃO mapeado → fail-open "Outras origem 11"
const NAT_DED = "19229951"; // dedução, mapeado DED_FUNDEB

const CONTAS = [
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARREC = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.2.00.00",
  variacaoAumentativa: "4.1.1.1.1.00.00",
  receitaARealizar: "5.2.1.1.1.00.00",
  receitaRealizada: "6.2.1.1.1.00.00",
});

let m04: ReturnType<typeof criarM04Deps>;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  m04 = criarM04Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: FONTE, descricao: "Livre", codigoTce: "500" } });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU" },
      { id: "nr-icms", codigo: NAT_ICMS, descricao: "ICMS" },
      { id: "nr-fpm", codigo: NAT_FPM, descricao: "FPM" },
      { id: "nr-outra", codigo: NAT_OUTRA, descricao: "Outra corrente" },
      { id: "nr-ded", codigo: NAT_DED, descricao: "Dedução FUNDEB" },
    ],
  });
  // os códigos de acompanhamento das emendas (rol fechado do Anexo 3).
  await prisma.codigoAcompanhamento.createMany({
    data: [
      { id: "co-3110", codigo: "3110", descricao: "Emenda individual" },
      { id: "co-3120", codigo: "3120", descricao: "Emenda de bancada" },
      { id: "co-9999", codigo: "9999", descricao: "Acompanhamento não-emenda" },
    ],
  });
  // o de-para MÍNIMO (self-contained; não depende do seed de produção).
  await prisma.deParaRclAnexo3.createMany({
    data: [
      { naturezaCodigo: NAT_IPTU, chaveLinha: "IPTU", tipo: "corrente", criadoPor: "TESTE" },
      { naturezaCodigo: NAT_ICMS, chaveLinha: "ICMS", tipo: "corrente", criadoPor: "TESTE" },
      { naturezaCodigo: NAT_FPM, chaveLinha: "FPM", tipo: "corrente", criadoPor: "TESTE" },
      { naturezaCodigo: NAT_DED, chaveLinha: "DED_FUNDEB", tipo: "deducao", criadoPor: "TESTE" },
    ],
  });
}

async function prever(naturezaId: string, valor: string, tipo: "ORCAMENTARIA" | "DEDUCAO"): Promise<void> {
  await prisma.receitaPrevista.create({
    data: { exercicio: 2026, naturezaReceitaId: naturezaId, fonteId: "fnt-500", tipoReceita: tipo, valorPrevisto: valor },
  });
}

async function arrecadar(
  natureza: string,
  valor: string,
  data: string,
  guia: string,
  co?: string
): Promise<string> {
  const exercicio = new Date(data).getUTCFullYear(); // a data tem de cair no exercício declarado
  const r = await registrarArrecadacao(
    {
      exercicio,
      naturezaReceita: natureza,
      fonte: FONTE,
      valor,
      dataArrecadacao: new Date(data),
      numeroReceita: guia,
      criadoPor: POR,
      ...(co !== undefined ? { co } : {}),
    },
    R_ARREC,
    m04
  );
  return r.receitaId;
}

/** O cenário ouro inteiro (usado por vários testes). */
async function montarOuro(): Promise<void> {
  await prever("nr-iptu", "300000.00", "ORCAMENTARIA");
  await prever("nr-icms", "250000.00", "ORCAMENTARIA");
  await prever("nr-ded", "60000.00", "DEDUCAO");

  await arrecadar(NAT_IPTU, "50000.00", "2025-03-15T12:00:00Z", "G-IPTU-MAR25");
  await arrecadar(NAT_IPTU, "100000.00", "2026-01-20T12:00:00Z", "G-IPTU-JAN26");
  await arrecadar(NAT_ICMS, "200000.00", "2026-02-10T12:00:00Z", "G-ICMS-FEV26");
  await arrecadar(NAT_FPM, "30000.00", "2026-01-25T12:00:00Z", "G-FPM-JAN26", "3110"); // emenda individual
  await arrecadar(NAT_FPM, "20000.00", "2026-02-05T12:00:00Z", "G-FPM-FEV26", "3120"); // emenda bancada
  await arrecadar(NAT_OUTRA, "10000.00", "2025-12-10T12:00:00Z", "G-OUT-DEZ25"); // fail-open
  await arrecadar(NAT_DED, "40000.00", "2026-01-30T12:00:00Z", "G-DED-JAN26"); // dedução
}

const achar = (linhas: readonly LinhaRcl[], chave: string) => linhas.find((l) => l.chave === chave)!;

describe("M12 — RREO Anexo 3 (RCL, LRF art. 53 I)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t0 — A JANELA de 12 meses cruza o exercício e é cronológica.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t0: a janela do bim 1/2026 vai de Mar/2025 (col 0) a Fev/2026 (col 11)", () => {
    const j = janelaDosDozeMeses(2026, 1);
    expect(j.length).toBe(12);
    expect(j[0]!.rotulo).toBe("Mar/2025");
    expect(j[0]!.ano).toBe(2025);
    expect(j[11]!.rotulo).toBe("Fev/2026");
    expect(j[11]!.mes).toBe(2);
    // o 6º bimestre termina em Dez e a janela é o exercício inteiro.
    const j6 = janelaDosDozeMeses(2026, 6);
    expect(j6[0]!.rotulo).toBe("Jan/2026");
    expect(j6[11]!.rotulo).toBe("Dez/2026");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO: todas as linhas, todos os números (R2 e R3 nos literais).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: I=410.000 II=40.000 III=370.000 V=340.000 VII=320.000; previsões 550.000/60.000/490.000", async () => {
    await montarOuro();
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });

    // ── sub-linhas de I ──
    expect(achar(a3.linhas, "IPTU").total12m).toBe("150000.00");
    expect(achar(a3.linhas, "ICMS").total12m).toBe("200000.00");
    expect(achar(a3.linhas, "FPM").total12m).toBe("50000.00");
    expect(achar(a3.linhas, "OUTRAS_11").total12m).toBe("10000.00"); // fail-open
    expect(achar(a3.linhas, "OUTRAS_11").rotulo).toContain("Outras"); // nomeada, não sumiu

    // ── I (grupo) = Σ sub-linhas (R2) ──
    expect(achar(a3.linhas, "RECEITAS_CORRENTES").total12m).toBe("410000.00");
    expect(achar(a3.linhas, "RECEITAS_CORRENTES").previsaoAtualizada).toBe("550000.00");

    // ── II (fail-closed): só a dedução MAPEADA ──
    expect(achar(a3.linhas, "DED_FUNDEB").total12m).toBe("40000.00");
    expect(achar(a3.linhas, "DEDUCOES").total12m).toBe("40000.00");
    expect(achar(a3.linhas, "DEDUCOES").previsaoAtualizada).toBe("60000.00"); // magnitude positiva

    // ── III = I − II (R3) ──
    expect(a3.rcl.total12m).toBe("370000.00");
    expect(a3.rcl.previsaoAtualizada).toBe("490000.00");

    // ── IV, V, VI, VII ──
    expect(achar(a3.linhas, "EMENDAS_INDIVIDUAIS").total12m).toBe("30000.00");
    expect(achar(a3.linhas, "RCL_ENDIVIDAMENTO").total12m).toBe("340000.00"); // V = III − IV
    expect(achar(a3.linhas, "EMENDAS_BANCADA").total12m).toBe("20000.00");
    expect(a3.rclAjustadaPessoal.total12m).toBe("320000.00"); // VII = V − VI

    // ── MUTAÇÃO: os literais errados NÃO batem (a identidade grita) ──
    expect("370000.01").not.toBe(a3.rcl.total12m);
    expect("320000.01").not.toBe(a3.rclAjustadaPessoal.total12m);
    // R3 recomputado a partir das partes:
    const I = Number(achar(a3.linhas, "RECEITAS_CORRENTES").total12m);
    const II = Number(achar(a3.linhas, "DEDUCOES").total12m);
    const IV = Number(achar(a3.linhas, "EMENDAS_INDIVIDUAIS").total12m);
    const VI = Number(achar(a3.linhas, "EMENDAS_BANCADA").total12m);
    expect(Number(a3.rcl.total12m)).toBe(I - II); // 370.000
    expect(Number(achar(a3.linhas, "RCL_ENDIVIDAMENTO").total12m)).toBe(I - II - IV); // 340.000
    expect(Number(a3.rclAjustadaPessoal.total12m)).toBe(I - II - IV - VI); // 320.000
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — R1: total12m == Σ das 12 colunas, e as colunas caem no MÊS certo.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: R1 — total == Σ colunas; IPTU tem 50.000 em Mar/2025 (col 0) e 100.000 em Jan/2026 (col 10)", async () => {
    await montarOuro();
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });

    const iptu = achar(a3.linhas, "IPTU");
    expect(iptu.meses.length).toBe(12);
    expect(iptu.meses[0]).toBe("50000.00"); // Mar/2025
    expect(iptu.meses[10]).toBe("100000.00"); // Jan/2026
    // as demais colunas do IPTU são zero.
    const soma = iptu.meses.reduce((acc, s) => acc + Number(s), 0);
    expect(soma).toBe(150000); // R1
    expect(iptu.total12m).toBe("150000.00");
    // MUTAÇÃO: uma coluna forjada quebraria a soma.
    expect(149999).not.toBe(soma);

    // R1 em TODA linha (inclusive os totais compostos).
    for (const l of a3.linhas) {
      const s = l.meses.reduce((acc, x) => acc + Number(x), 0);
      expect(Number(l.total12m)).toBeCloseTo(s, 2);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — R4: Σ(RCL de cada mês) == III.total12m (pega corte de janela furado).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: R4 — a RCL do período é a soma das RCLs mensais (50k+10k+90k+220k = 370k)", async () => {
    await montarOuro();
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });

    const rcl = a3.rcl;
    // RCL por coluna: col0 (Mar25)=50k, col9 (Dez25)=10k, col10 (Jan26)=130k−40k=90k, col11 (Fev26)=220k.
    expect(rcl.meses[0]).toBe("50000.00");
    expect(rcl.meses[9]).toBe("10000.00");
    expect(rcl.meses[10]).toBe("90000.00");
    expect(rcl.meses[11]).toBe("220000.00");
    const somaMensal = rcl.meses.reduce((acc, s) => acc + Number(s), 0);
    expect(somaMensal).toBe(370000); // R4
    expect(Number(rcl.total12m)).toBe(somaMensal);
    // MUTAÇÃO: a soma mensal errada não fecha.
    expect(369999).not.toBe(somaMensal);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — FAIL-OPEN × FAIL-CLOSED: a dedução NÃO mapeada não vaza para as deduções.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: uma dedução SEM mapa não deduz (fail-closed); a corrente sem mapa aparece em Outras (fail-open)", async () => {
    // remove o mapa da dedução → a natureza 19229951 deixa de ser reconhecida como dedução.
    await prisma.deParaRclAnexo3.deleteMany({ where: { chaveLinha: "DED_FUNDEB" } });
    await montarOuro();
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });

    // a II fica VAZIA (não há dedução mapeada): fail-closed — nunca um zero silencioso vindo de I.
    expect(a3.linhas.find((l) => l.chave === "DED_FUNDEB")).toBeUndefined();
    expect(achar(a3.linhas, "DEDUCOES").total12m).toBe("0.00");

    // a natureza 19229951 (origem 19), sem mapa, cai em "Outras da origem 19" (fail-open) — não some.
    expect(achar(a3.linhas, "OUTRAS_19").total12m).toBe("40000.00");
    expect(achar(a3.linhas, "OUTRAS_19").rotulo).toContain("Outras");

    // consequência: a RCL fica MAIOR (a dedução não deduziu), e isso é honesto — a dedução virou
    // corrente até ser mapeada. I passou a incluir os 40.000: 410.000 + 40.000 = 450.000; III = 450.000.
    expect(achar(a3.linhas, "RECEITAS_CORRENTES").total12m).toBe("450000.00");
    expect(a3.rcl.total12m).toBe("450000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — EMENDAS: só o rol fechado {3110,3111}/{3120,3121} deduz; CO fora do rol é ignorado.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: um CO fora do rol das emendas (9999) NÃO vira dedução IV/VI", async () => {
    await prever("nr-iptu", "300000.00", "ORCAMENTARIA");
    // IPTU 100.000 marcado com CO 9999 (acompanhamento não-emenda).
    await arrecadar(NAT_IPTU, "100000.00", "2026-01-20T12:00:00Z", "G-1", "9999");
    // FPM 30.000 marcado com CO 3110 (emenda individual de verdade).
    await arrecadar(NAT_FPM, "30000.00", "2026-01-25T12:00:00Z", "G-2", "3110");

    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });
    // só os 30.000 do 3110 são emenda individual; o 9999 não deduz nada.
    expect(achar(a3.linhas, "EMENDAS_INDIVIDUAIS").total12m).toBe("30000.00");
    expect(achar(a3.linhas, "EMENDAS_BANCADA").total12m).toBe("0.00");
    // o IPTU com CO 9999 continua sendo corrente normal (100.000 em I).
    expect(achar(a3.linhas, "IPTU").total12m).toBe("100000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — FORA DA JANELA: uma arrecadação anterior a Mar/2025 não entra.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: arrecadação de Fev/2025 (fora da janela do bim 1/2026) NÃO aparece", async () => {
    await arrecadar(NAT_IPTU, "77000.00", "2025-02-15T12:00:00Z", "G-FEV25"); // 1 dia antes da janela
    await arrecadar(NAT_IPTU, "50000.00", "2025-03-15T12:00:00Z", "G-MAR25"); // primeiro mês da janela

    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });
    // só os 50.000 de Mar/2025 entram; os 77.000 de Fev/2025 ficam de fora.
    expect(achar(a3.linhas, "IPTU").total12m).toBe("50000.00");
    expect(achar(a3.linhas, "IPTU").meses[0]).toBe("50000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — LEITURA PURA (grep): zero escrita, zero soma bruta no motor.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: rreo-anexo3.ts é LEITURA PURA — zero escrita, zero SUM bruto", () => {
    const arquivo = fileURLToPath(new URL("./rreo-anexo3.ts", import.meta.url));
    const efetivo = readFileSync(arquivo, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;
    expect(ESCRITA.test(efetivo), "rreo-anexo3.ts tem ESCRITA").toBe(false);
    expect(SUM_BRUTO.test(efetivo), "rreo-anexo3.ts tem SUM bruto").toBe(false);
  });
});
