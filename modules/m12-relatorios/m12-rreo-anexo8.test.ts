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
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { baseDeImpostos } from "./base-impostos.js";
import { anexo8, type LinhaReceitaMde } from "./rreo-anexo8.js";
import { anexo12 } from "./rreo-anexo12.js";

/**
 * RREO — ANEXO 8: MDE (Educação). LDB art. 72 · CF art. 212/212-A.
 *
 * ═══ CENÁRIO OURO (bimestre 1 de 2026) ═══
 * RECEITAS (jan/2026): IPTU 130.000 (principal 120 + multas 10, G25) · ISS 60.000 (G25) ·
 *   FPM 200.000 (2.1.1, G20) · ICMS 100.000 (G20) · IOF-Ouro 20.000 (G25) · Compensações 30.000 (G20)
 *   dedução FUNDEB registrada 66.000
 *   (1) impostos = 190.000 · (2) transf = 350.000 · (3) = 540.000
 *   G20 = 200+100+30 = 330.000 · G25 = 130+60+20 = 210.000
 *   (4) destinado ao FUNDEB = 20% × 330.000 = 66.000  → == dedução registrada (R4)
 *   (5) mínimo além = 5%×330.000 + 25%×210.000 = 16.500 + 52.500 = 69.000
 * FUNDEB: 6.1 retorno 250.000 · 6.2 VAAF 30.000 · 6.3 VAAT 15.000 · 6.4 rend. 5.000 → (6) 300.000
 *   despesa profissionais: empenha 300.000, liquida 240.000
 *   indicador (bim 1, LIQUIDADA) = 240.000 / 300.000 = 80,00% (≥70%)
 *   indicador (bim 6, EMPENHADA) = 300.000 / 300.000 = 100,00%  (R5: a troca)
 *
 * ═══ IDENTIDADES (mutação no t7) ═══
 *   R1 3=1+2 · 4=20%×G20 · 5=5%×G20+25%×G25 · 9=6+8 · indicador
 *   R2 Anexo 8 (1.1 IPTU Σtipos) == baseDeImpostos IPTU.total (dois consumos, uma partição)
 *   R3 cota-partes (2.x) == quadro II do Anexo 12 (mesmo razão)
 *   R4 dedução registrada (66.000) == linha 4 (identidade de fixture construído)
 *   R5 bim 1 liquidada / bim 6 empenhada — a troca do acompanhamento
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";
const FONTE = "500";
const FONTE_FUNDEB = "540";

// receita
const N_IPTU_P = "11121101";
const N_IPTU_M = "11121102";
const N_ISS = "11180011";
const N_FPM = "17210151";
const N_ICMS = "17210251";
const N_IOF = "17210351";
const N_COMP = "17210451";
const N_DED = "19229951";
const N_RETORNO = "17510151";
const N_VAAF = "17520151";
const N_VAAT = "17530151";
const N_REND = "13210051";

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
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2012", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-prof", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos" },
      { id: "nd-outros", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu-p", codigo: N_IPTU_P, descricao: "IPTU principal" },
      { id: "nr-iptu-m", codigo: N_IPTU_M, descricao: "IPTU multas" },
      { id: "nr-iss", codigo: N_ISS, descricao: "ISS" },
      { id: "nr-fpm", codigo: N_FPM, descricao: "FPM" },
      { id: "nr-icms", codigo: N_ICMS, descricao: "ICMS" },
      { id: "nr-iof", codigo: N_IOF, descricao: "IOF-Ouro" },
      { id: "nr-comp", codigo: N_COMP, descricao: "Compensações" },
      { id: "nr-ded", codigo: N_DED, descricao: "Dedução FUNDEB" },
      { id: "nr-retorno", codigo: N_RETORNO, descricao: "FUNDEB retorno" },
      { id: "nr-vaaf", codigo: N_VAAF, descricao: "VAAF" },
      { id: "nr-vaat", codigo: N_VAAT, descricao: "VAAT" },
      { id: "nr-rend", codigo: N_REND, descricao: "Rendimentos FUNDEB" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: FONTE, descricao: "Impostos", codigoTce: "500" },
      { id: "fnt-540", codigo: FONTE_FUNDEB, descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });

  // DE-PARA base de impostos → chave
  await prisma.deParaBaseImpostoAsps.createMany({
    data: [
      { naturezaCodigo: N_IPTU_P, chave: "IPTU", criadoPor: "T" },
      { naturezaCodigo: N_IPTU_M, chave: "IPTU", criadoPor: "T" },
      { naturezaCodigo: N_ISS, chave: "ISS", criadoPor: "T" },
      { naturezaCodigo: N_FPM, chave: "FPM", criadoPor: "T" },
      { naturezaCodigo: N_ICMS, chave: "ICMS", criadoPor: "T" },
      { naturezaCodigo: N_IOF, chave: "IOF_OURO", criadoPor: "T" },
      { naturezaCodigo: N_COMP, chave: "COMPENSACOES", criadoPor: "T" },
      { naturezaCodigo: N_DED, chave: "DED_FUNDEB", criadoPor: "T" },
    ],
  });
  // DE-PARA FUNDEB receita → papel
  await prisma.deParaFundebReceita.createMany({
    data: [
      { naturezaCodigo: N_RETORNO, papel: "RETORNO", criadoPor: "T" },
      { naturezaCodigo: N_VAAF, papel: "VAAF", criadoPor: "T" },
      { naturezaCodigo: N_VAAT, papel: "VAAT", criadoPor: "T" },
      { naturezaCodigo: N_REND, papel: "RENDIMENTOS", criadoPor: "T" },
    ],
  });
  // DE-PARA fonte → classe educação
  await prisma.deParaFonteClasseEducacao.create({ data: { fonteCodigo: FONTE_FUNDEB, classe: "FUNDEB", criadoPor: "T" } });
}

async function arrecadar(natureza: string, valor: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: natureza, fonte: FONTE, valor, dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: guia, criadoPor: POR },
    R_ARREC, m04
  );
}

let seqF = 0;
let seqD = 0;
async function despesaEducacao(naturezaDespesaId: string, empenhado: string, liquidado: string): Promise<void> {
  const fichaId = `ficha-${++seqF}`;
  await criarFichaDeTeste(prisma, {
    id: fichaId, exercicio: 2026, numero: seqF, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId, fonteId: "fnt-540", valorDotado: "1000000.00",
  });
  const e = await empenhar(
    { fichaId, numero: `NE-${++seqD}`, tipo: "ORDINARIO", valor: empenhado, data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMP, deps
  );
  if (liquidado !== "0.00") {
    await liquidar({ empenhoId: e.empenhoId, numero: `NL-${++seqD}`, valor: liquidado, data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
  }
}

async function montarOuro(): Promise<void> {
  await arrecadar(N_IPTU_P, "120000.00", "G1");
  await arrecadar(N_IPTU_M, "10000.00", "G2");
  await arrecadar(N_ISS, "60000.00", "G3");
  await arrecadar(N_FPM, "200000.00", "G4");
  await arrecadar(N_ICMS, "100000.00", "G5");
  await arrecadar(N_IOF, "20000.00", "G6");
  await arrecadar(N_COMP, "30000.00", "G7");
  await arrecadar(N_DED, "66000.00", "G8"); // dedução FUNDEB construída == 20% de G20
  await arrecadar(N_RETORNO, "250000.00", "G9");
  await arrecadar(N_VAAF, "30000.00", "G10");
  await arrecadar(N_VAAT, "15000.00", "G11");
  await arrecadar(N_REND, "5000.00", "G12");

  await despesaEducacao("nd-prof", "300000.00", "240000.00"); // profissionais
  await despesaEducacao("nd-outros", "50000.00", "40000.00"); // outros FUNDEB
}

const achar = (linhas: readonly LinhaReceitaMde[], numero: string) => linhas.find((l) => l.numero === numero)!;

describe("M12 — RREO Anexo 8 (MDE, CF art. 212)", () => {
  beforeEach(async () => {
    seqF = 0;
    seqD = 0;
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO: receitas 1-5 (R1).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: (3)=540.000, (4)=66.000, (5)=69.000; grupos G20/G25", async () => {
    await montarOuro();
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });

    expect(achar(a8.receitas, "1.1").realizada).toBe("130000.00"); // IPTU Σ tipos (120+10)
    expect(achar(a8.receitas, "1.3").realizada).toBe("60000.00"); // ISS
    expect(achar(a8.receitas, "1").realizada).toBe("190000.00"); // (1)
    expect(achar(a8.receitas, "2.1.1").realizada).toBe("200000.00"); // FPM parcela
    expect(achar(a8.receitas, "2.1.2").realizada).toBe("0.00"); // complementações 1% (sem natureza)
    expect(achar(a8.receitas, "2.2").realizada).toBe("100000.00"); // ICMS
    expect(achar(a8.receitas, "2.6").realizada).toBe("20000.00"); // IOF-Ouro
    expect(achar(a8.receitas, "2.7").realizada).toBe("30000.00"); // Compensações
    expect(achar(a8.receitas, "2").realizada).toBe("350000.00"); // (2)
    expect(a8.totalReceitas.realizada).toBe("540000.00"); // (3) = (1)+(2) — R1

    expect(a8.totalDestinadoFundeb).toBe("66000.00"); // (4) = 20% × 330.000
    expect(a8.minimoAlemFundeb).toBe("69000.00"); // (5) = 5%×330.000 + 25%×210.000

    // mutação: os literais errados NÃO batem.
    expect("66000.01").not.toBe(a8.totalDestinadoFundeb);
    expect("69000.01").not.toBe(a8.minimoAlemFundeb);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — FUNDEB e indicador de 70% (R1 do quadro FUNDEB).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: (6)=300.000, (9)=300.000; indicador profissionais 80,00% (bim 1, liquidada)", async () => {
    await montarOuro();
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });

    expect(a8.receitasFundeb.find((r) => r.papel === "RETORNO")!.valor).toBe("250000.00");
    expect(a8.receitasFundeb.find((r) => r.papel === "VAAT")!.valor).toBe("15000.00");
    expect(a8.totalRecebidoFundeb).toBe("300000.00"); // (6)
    expect(a8.totalDisponivelFundeb).toBe("300000.00"); // (9) = 6 + 8(0)

    expect(a8.despesaProfissionais.liquidada).toBe("240000.00");
    expect(a8.despesaFundebTotal.liquidada).toBe("280000.00"); // 240 + 40
    expect(a8.baseAcompanhamento).toBe("liquidada");
    expect(a8.indicadorProfissionais).toBe("80.00"); // 240.000/300.000
    expect(a8.atingiuProfissionais).toBe(true);
    expect("79.99").not.toBe(a8.indicadorProfissionais);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — R2: dois consumos do motor, uma partição.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: R2 — 1.1 IPTU (Σ tipos) == baseDeImpostos IPTU.total", async () => {
    await montarOuro();
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });
    const base = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z") });
    const iptuBase = base.impostos.find((l) => l.chave === "IPTU")!.total;
    expect(iptuBase).toBe("130000.00");
    expect(achar(a8.receitas, "1.1").realizada).toBe(iptuBase); // R2
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — R3: cota-partes do Anexo 8 == quadro II do Anexo 12.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: R3 — FPM e ICMS do Anexo 8 batem com o quadro II do Anexo 12", async () => {
    await montarOuro();
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });
    const a12 = await anexo12(prisma, { exercicio: 2026, bimestre: 1 });
    const fpm12 = a12.transferencias.find((l) => l.chave === "FPM")!.realizada;
    const icms12 = a12.transferencias.find((l) => l.chave === "ICMS")!.realizada;
    expect(achar(a8.receitas, "2.1.1").realizada).toBe(fpm12); // R3
    expect(achar(a8.receitas, "2.2").realizada).toBe(icms12);
    expect(fpm12).toBe("200000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — R4: dedução registrada == linha 4 (fixture construído exato).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: R4 — dedução FUNDEB registrada (66.000) == linha 4 (calculada)", async () => {
    await montarOuro();
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });
    const base = await baseDeImpostos(prisma, { exercicio: 2026, ate: new Date("2026-12-31T23:59:59Z") });
    expect(base.deducaoFundeb).toBe("66000.00");
    expect(a8.totalDestinadoFundeb).toBe("66000.00");
    expect(base.deducaoFundeb).toBe(a8.totalDestinadoFundeb); // R4 (identidade de fixture)
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — R5: bim 1 liquidada / bim 6 empenhada — a troca.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: R5 — o acompanhamento troca de liquidada (bim 1) p/ empenhada (bim 6)", async () => {
    await montarOuro();
    const b1 = await anexo8(prisma, { exercicio: 2026, bimestre: 1 });
    const b6 = await anexo8(prisma, { exercicio: 2026, bimestre: 6 });

    expect(b1.baseAcompanhamento).toBe("liquidada");
    expect(b1.indicadorProfissionais).toBe("80.00"); // 240.000/300.000
    expect(b6.baseAcompanhamento).toBe("empenhada");
    expect(b6.despesaProfissionais.empenhada).toBe("300000.00");
    expect(b6.indicadorProfissionais).toBe("100.00"); // 300.000/300.000
    expect(b1.indicadorProfissionais).not.toBe(b6.indicadorProfissionais); // a troca
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — FAIL-CLOSED: fonte de educação sem classe PARA o gerador.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: despesa de educação com fonte sem classe faz o Anexo 8 PARAR", async () => {
    await montarOuro();
    // fonte 500 (impostos) sem classe no de-para de educação, numa despesa da função 12.
    await despesaEducacao_fonte("nd-outros", "fnt-500", "10000.00");
    await expect(anexo8(prisma, { exercicio: 2026, bimestre: 1 })).rejects.toThrow(/fonte "500".*classe/s);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — LEITURA PURA (grep).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: rreo-anexo8.ts é LEITURA PURA — zero escrita, zero SUM bruto", () => {
    const efetivo = readFileSync(fileURLToPath(new URL("./rreo-anexo8.ts", import.meta.url)), "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(efetivo)).toBe(false);
    expect(/\.(aggregate|groupBy)\(|_sum/.test(efetivo)).toBe(false);
  });

  async function despesaEducacao_fonte(naturezaDespesaId: string, fonteId: string, empenhado: string): Promise<void> {
    const fichaId = `ficha-x-${++seqF}`;
    await criarFichaDeTeste(prisma, {
      id: fichaId, exercicio: 2026, numero: 100 + seqF, orgaoId: "org-01", unidadeOrcId: "uo-01",
      funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
      naturezaDespesaId, fonteId, valorDotado: "100000.00",
    });
    await empenhar(
      { fichaId, numero: `NEX-${++seqD}`, tipo: "ORDINARIO", valor: empenhado, data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "LOCACAO", criadoPor: POR },
      R_EMP, deps
    );
  }
});
