import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { baseDeImpostos } from "./base-impostos.js";
import { anexo12 } from "./rreo-anexo12.js";
import { anexo2 } from "./rreo-anexo2.js";
import { anexo3 } from "./rreo-anexo3.js";

/**
 * RREO — ANEXO 12: ASPS (Saúde). LC 141/2012 art. 35 · MDF Tabela 12.2.
 *
 * ═══ CENÁRIO OURO (bimestre 1 de 2026), FLUXO REAL ═══
 * RECEITAS (jan/2026):
 *   IPTU  principal 120.000 · multas 10.000 · dívida ativa 5.000 · multas DA 5.000  → IPTU total 140.000
 *   ISS   principal 60.000
 *   FPM   200.000 (transferência, BRUTO) · dedução FUNDEB 30.000 (redutora)
 *   (I) = 120.000(IPTU) + 60.000(ISS) + 10.000(multas) + 5.000(DA) + 5.000(multasDA) = 200.000
 *   (II) BRUTO = 200.000 · líquido = 200.000 − 30.000 = 170.000
 *   (III) = (I) + (II)bruto = 400.000
 * DESPESAS (função 10, liquidadas até o bimestre):
 *   própria/computada (fonte 500, elem 39):  60.000
 *   inativos (fonte 500, elem 01):            20.000  → não computada
 *   SUS (fonte 600, elem 51):                 25.000  → não computada
 *   IV = 105.000 · V = 20.000 + 25.000 = 45.000 · VI = 60.000
 *   VII% = 60.000 / 400.000 × 100 = 15,00% · diferença = 60.000 − 15%·400.000 = 0,00 · atingiu
 *
 * ═══ IDENTIDADES (literais escolhidos ANTES; mutação no t7) ═══
 *   R1 III=I+II · VI=IV−V · VII%=VI/III(b)×100 (ARRED 2) · dif=VI−0,15·III(b)
 *   R2 IPTU: principal+multas+DA+multasDA == total líquido do IPTU no M04
 *   R3 IPTU do Anexo 12 == IPTU do Anexo 3 (dois de-paras, um razão)
 *   R4 IV == recorte função 10 do Anexo 2
 *   R5 bruto (200.000) − líquido (170.000) == dedução FUNDEB (30.000)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";
const FONTE_PROPRIA = "500";
const FONTE_SUS = "600";

// receita (8 dígitos; 8º = tipo)
const N_IPTU_P = "11121101"; // IPTU principal (fixture)
const N_IPTU_M = "11121102"; // IPTU multas
const N_IPTU_DA = "11121103"; // IPTU dívida ativa
const N_IPTU_MDA = "11121104"; // IPTU multas da DA
const N_ISS = "11180011"; // ISS principal
const N_FPM = "17210151"; // FPM (transferência)
const N_DED = "19229951"; // dedução FUNDEB (redutora)

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Forn", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARREC = roteiroArrecadacao({ disponibilidade: "1.1.1.1.2.00.00", variacaoAumentativa: "4.1.1.1.1.00.00", receitaARealizar: "5.2.1.1.1.00.00", receitaRealizada: "6.2.1.1.1.00.00" });
const R_EMP = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQ = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Saúde", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção Básica" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  // naturezas de despesa: ODC (elem 39), pessoal-inativos (elem 01), investimento (elem 51)
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-odc", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC" },
      { id: "nd-inativo", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "01", codigoCompleto: "319001", descricao: "Aposentadorias" },
      { id: "nd-invest", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu-p", codigo: N_IPTU_P, descricao: "IPTU principal" },
      { id: "nr-iptu-m", codigo: N_IPTU_M, descricao: "IPTU multas" },
      { id: "nr-iptu-da", codigo: N_IPTU_DA, descricao: "IPTU dívida ativa" },
      { id: "nr-iptu-mda", codigo: N_IPTU_MDA, descricao: "IPTU multas DA" },
      { id: "nr-iss", codigo: N_ISS, descricao: "ISS" },
      { id: "nr-fpm", codigo: N_FPM, descricao: "FPM" },
      { id: "nr-ded", codigo: N_DED, descricao: "Dedução FUNDEB" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: FONTE_PROPRIA, descricao: "Impostos", codigoTce: "500" },
      { id: "fnt-600", codigo: FONTE_SUS, descricao: "SUS", codigoTce: "600" },
    ],
  });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: "fnt-500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });

  // DE-PARA base de impostos → chave
  await prisma.deParaBaseImpostoAsps.createMany({
    data: [
      { naturezaCodigo: N_IPTU_P, chave: "IPTU", criadoPor: "TESTE" },
      { naturezaCodigo: N_IPTU_M, chave: "IPTU", criadoPor: "TESTE" },
      { naturezaCodigo: N_IPTU_DA, chave: "IPTU", criadoPor: "TESTE" },
      { naturezaCodigo: N_IPTU_MDA, chave: "IPTU", criadoPor: "TESTE" },
      { naturezaCodigo: N_ISS, chave: "ISS", criadoPor: "TESTE" },
      { naturezaCodigo: N_FPM, chave: "FPM", criadoPor: "TESTE" },
      { naturezaCodigo: N_DED, chave: "DED_FUNDEB", criadoPor: "TESTE" },
    ],
  });
  // DE-PARA fonte → classe ASPS
  await prisma.deParaFonteClasseAsps.createMany({
    data: [
      { fonteCodigo: FONTE_PROPRIA, classe: "PROPRIOS", criadoPor: "TESTE" },
      { fonteCodigo: FONTE_SUS, classe: "SUS", criadoPor: "TESTE" },
    ],
  });
  // DE-PARA do Anexo 3 (para o R3): IPTU principal → "IPTU"
  await prisma.deParaRclAnexo3.create({ data: { naturezaCodigo: N_IPTU_P, chaveLinha: "IPTU", tipo: "corrente", criadoPor: "TESTE" } });
}

async function arrecadar(natureza: string, valor: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: natureza, fonte: FONTE_PROPRIA, valor, dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: guia, criadoPor: POR },
    R_ARREC, m04
  );
}
async function prever(naturezaId: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: naturezaId, fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: valor } });
}

let seqFicha = 0;
let seqDoc = 0;
async function despesaSaude(naturezaDespesaId: string, fonteId: string, empenhado: string, liquidado: string): Promise<void> {
  const fichaId = `ficha-${++seqFicha}`;
  await criarFichaDeTeste(prisma, {
    id: fichaId, exercicio: 2026, numero: seqFicha, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca",
    naturezaDespesaId, fonteId, valorDotado: "500000.00",
  });
  const e = await empenhar(
    { fichaId, numero: `NE-${++seqDoc}`, tipo: "ORDINARIO", valor: empenhado, data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMP, deps
  );
  if (liquidado !== "0.00") {
    await liquidar({ empenhoId: e.empenhoId, numero: `NL-${++seqDoc}`, valor: liquidado, data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
  }
}

/** O cenário ouro de receitas + despesas. */
async function montarOuro(): Promise<void> {
  await prever("nr-iptu-p", "240000.00");
  await prever("nr-fpm", "400000.00");
  await arrecadar(N_IPTU_P, "120000.00", "G-IPTU-P");
  await arrecadar(N_IPTU_M, "10000.00", "G-IPTU-M");
  await arrecadar(N_IPTU_DA, "5000.00", "G-IPTU-DA");
  await arrecadar(N_IPTU_MDA, "5000.00", "G-IPTU-MDA");
  await arrecadar(N_ISS, "60000.00", "G-ISS");
  await arrecadar(N_FPM, "200000.00", "G-FPM");
  await arrecadar(N_DED, "30000.00", "G-DED"); // dedução FUNDEB (redutora)

  await despesaSaude("nd-odc", "fnt-500", "80000.00", "60000.00"); // computada
  await despesaSaude("nd-inativo", "fnt-500", "20000.00", "20000.00"); // inativos
  await despesaSaude("nd-invest", "fnt-600", "30000.00", "25000.00"); // SUS
}

const acharR = <T extends { chave: string }>(linhas: readonly T[], chave: string): T => linhas.find((l) => l.chave === chave)!;

describe("M12 — RREO Anexo 12 (ASPS, LC 141/2012)", () => {
  beforeEach(async () => {
    seqFicha = 0;
    seqDoc = 0;
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO: receitas, despesas e apuração (R1).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: III=400.000, IV=105.000, V=45.000, VI=60.000, VII=15,00%, diferença 0,00 (atingiu)", async () => {
    await montarOuro();
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });

    // ── RECEITAS ──
    const iptu = acharR(a12.impostos, "IPTU");
    expect(iptu.realizada).toBe("120000.00"); // principal
    expect(iptu.previsaoAtualizada).toBe("240000.00");
    expect(iptu.percentRealizada).toBe("50.00"); // 120/240
    expect(acharR(a12.impostos, "ISS").realizada).toBe("60000.00");
    expect(acharR(a12.impostos, "MULTAS_IMPOSTOS").realizada).toBe("10000.00");
    expect(acharR(a12.impostos, "DA_IMPOSTOS").realizada).toBe("5000.00");
    expect(acharR(a12.impostos, "MULTAS_DA_IMPOSTOS").realizada).toBe("5000.00");
    expect(a12.totalImpostos.realizada).toBe("200000.00"); // (I)
    expect(a12.totalTransferencias.realizada).toBe("200000.00"); // (II) BRUTO
    expect(a12.baseAsps.realizada).toBe("400000.00"); // (III) = I + II
    expect(a12.baseAsps.percentRealizada).toBe("62.50"); // 400.000 / 640.000

    // ── DESPESAS (IV) ──
    expect(a12.totalDespesasSaude.liquidada).toBe("105000.00");

    // ── NÃO COMPUTADAS (V) ──
    expect(acharR(a12.naoComputadas, "INATIVOS").valor).toBe("20000.00");
    expect(acharR(a12.naoComputadas, "REC_SUS").valor).toBe("25000.00");
    expect(a12.totalNaoComputadas).toBe("45000.00");

    // ── APURAÇÃO (R1) ──
    expect(a12.totalAsps).toBe("60000.00"); // VI = IV − V
    expect(a12.percentualAplicacao).toBe("15.00"); // VII = 60.000/400.000
    expect(a12.valorDiferenca).toBe("0.00"); // VI − 15%·400.000
    expect(a12.atingiuMinimo).toBe(true);
    // mutação: os literais errados NÃO batem.
    expect("14.99").not.toBe(a12.percentualAplicacao);
    expect("60000.01").not.toBe(a12.totalAsps);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — R2: a partição por tipo não perde nem duplica.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: R2 — IPTU (principal+multas+DA+multasDA) == total líquido do IPTU no M04", async () => {
    await montarOuro();
    const base = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z") });
    const iptu = base.impostos.find((l) => l.chave === "IPTU")!;
    expect(iptu.total).toBe("140000.00"); // 120+10+5+5

    // Σ direto do M04 das 4 naturezas do IPTU (o particionador não inventou nem perdeu).
    const arrec = await arrecadadoPorNaturezaFonte(prisma, { ate: new Date("2026-12-31T23:59:59Z") });
    const somaIptu = arrec
      .filter((a) => a.naturezaCodigo.startsWith("111211"))
      .reduce((acc, a) => acc + Number(a.arrecadado.toFixed(2)), 0);
    expect(somaIptu).toBe(140000);
    expect(Number(iptu.total)).toBe(somaIptu);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — R3: o IPTU do Anexo 12 bate com o IPTU do Anexo 3 (dois de-paras, um razão).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: R3 — IPTU realizada do Anexo 12 == IPTU do Anexo 3 (mesma arrecadação, jan/2026)", async () => {
    await montarOuro();
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 1 });

    const iptu12 = acharR(a12.impostos, "IPTU").realizada; // principal
    const iptu3 = a3.linhas.find((l) => l.chave === "IPTU")!.total12m;
    // a arrecadação do IPTU principal (jan/2026) cai nas duas janelas.
    expect(iptu12).toBe("120000.00");
    expect(iptu3).toBe("120000.00");
    expect(iptu12).toBe(iptu3); // R3
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — R4: IV == recorte função 10 do Anexo 2.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: R4 — IV (despesas de saúde) == liquidadas da função 10 no Anexo 2", async () => {
    await montarOuro();
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });
    const a2 = await anexo2(prisma, { exercicio: 2026, bimestre: 1 });

    const funcao10 = a2.despesas.find((l) => l.nivel === "funcao" && l.codigo === "10")!;
    expect(a12.totalDespesasSaude.liquidada).toBe("105000.00");
    expect(funcao10.liquidadasAte).toBe("105000.00");
    expect(a12.totalDespesasSaude.liquidada).toBe(funcao10.liquidadasAte); // R4
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — R5: bruto × líquido (a dedução do FUNDEB não abate a base).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: R5 — (II) bruto 200.000, líquido 170.000, diferença == dedução FUNDEB 30.000", async () => {
    await montarOuro();
    const base = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z") });
    expect(base.totalTransferenciasBruto).toBe("200000.00");
    expect(base.totalTransferenciasLiquido).toBe("170000.00");
    expect(base.deducaoFundeb).toBe("30000.00");
    expect(Number(base.totalTransferenciasBruto) - Number(base.totalTransferenciasLiquido)).toBe(Number(base.deducaoFundeb));
    // a base do Anexo 12 (III) usa o BRUTO.
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });
    expect(a12.totalTransferencias.realizada).toBe(base.totalTransferenciasBruto);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — FAIL-CLOSED: fonte de saúde sem classe ASPS PARA o gerador, nomeando-a.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: despesa de saúde com fonte sem classe ASPS mapeada faz o Anexo 12 PARAR", async () => {
    // fonte 777 sem classe no de-para.
    await prisma.fonteRecurso.create({ data: { id: "fnt-777", codigo: "777", descricao: "Salário-Educação", codigoTce: "777" } });
    await despesaSaude("nd-odc", "fnt-777", "10000.00", "10000.00");
    await expect(anexo12(prisma, { exercicio: 2026, bimestre: 1 })).rejects.toThrow(/fonte "777".*classe ASPS/s);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — IBS: parâmetro, não hardcode de ano.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: IBS entra na base só com incluirIBS=true (art. 125 §3º ADCT é parâmetro)", async () => {
    await montarOuro();
    // adiciona um IBS 50.000 e mapeia-o.
    await prisma.naturezaReceita.create({ data: { id: "nr-ibs", codigo: "17220151", descricao: "IBS" } });
    await prisma.deParaBaseImpostoAsps.create({ data: { naturezaCodigo: "17220151", chave: "IBS", criadoPor: "TESTE" } });
    await arrecadar("17220151", "50000.00", "G-IBS");

    const semIBS = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z") });
    const comIBS = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z"), incluirIBS: true });
    expect(semIBS.baseBruta).toBe("400000.00"); // IBS fora (default)
    expect(comIBS.baseBruta).toBe("450000.00"); // IBS dentro
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — LEITURA PURA (grep): motor de base e Anexo 12 sem escrita/soma bruta.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: base-impostos.ts e rreo-anexo12.ts são LEITURA PURA", () => {
    for (const arq of ["./base-impostos.ts", "./rreo-anexo12.ts"]) {
      const efetivo = readFileSync(fileURLToPath(new URL(arq, import.meta.url)), "utf8")
        .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(efetivo), `${arq} tem ESCRITA`).toBe(false);
      expect(/\.(aggregate|groupBy)\(|_sum/.test(efetivo), `${arq} tem SUM bruto`).toBe(false);
    }
  });
});
