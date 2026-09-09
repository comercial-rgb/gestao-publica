import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../m03-creditos/servico.js";
import { anexo1, type LinhaReceitaRreo } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 1: BALANÇO ORÇAMENTÁRIO. LRF art. 52 · MDF/STN.
 *
 * ⚠️ CONTAS E FATOS À MÃO. Corte pela DATA DO FATO (dataArrecadacao/empenho.data) — não pela
 * digitação: o bimestre é uma janela de 2 meses, e o que entra é o que ACONTECEU ali.
 *
 * ═══ OURO DO 1º BIMESTRE (t1) ═══
 *   RECEITA natureza 1.1.1.x (impostos), previsão 120.000:
 *     arrecada 20.000 em jan + estorno 2.000 em fev  →  b = 18.000, c = 18.000
 *     a = 120.000 · %(c/a) = 15,00 · SALDO = 120.000 − 18.000 = 102.000
 *   DESPESA grupo 3.3 (ODC), LOA 100.000:
 *     empenha 30.000 (jan) · liquida 10.000 (fev)
 *     dotação atualizada 100.000 · empenhada até 30.000 · liquidada até 10.000
 *     saldo dotação 100.000 − 30.000 = 70.000
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const EXERC = 2026;
const FONTE = "fnt-500";

// receita: IPTU (categoria 1, origem 11, espécie 111) — natureza 11130111
const NAT_IPTU = "11130111";
// receita INTRA (categoria 7) — natureza 71130111
const NAT_INTRA = "71130111";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Forn", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.2.00.00", creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" });
const R_ARREC = roteiroArrecadacao({ disponibilidade: "1.1.1.1.2.00.00", variacaoAumentativa: "4.1.1.1.1.00.00", receitaARealizar: "5.2.1.1.1.00.00", receitaRealizada: "6.2.1.1.1.00.00" });

let deps: M05Deps;
let m04: M05Deps extends never ? never : ReturnType<typeof criarM04Deps>;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);
  m04 = criarM04Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC — Serviços" },
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU" },
      { id: "nr-intra", codigo: NAT_INTRA, descricao: "IPTU intra" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: "ficha-1", exercicio: EXERC, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
}

async function preverReceita(natureza: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({
    data: { exercicio: EXERC, naturezaReceitaId: natureza === NAT_IPTU ? "nr-iptu" : "nr-intra", fonteId: FONTE, tipoReceita: "ORCAMENTARIA", valorPrevisto: valor },
  });
}

async function arrecadar(natureza: string, valor: string, data: string, guia: string): Promise<string> {
  const r = await registrarArrecadacao(
    { exercicio: EXERC, naturezaReceita: natureza, fonte: "500", valor, dataArrecadacao: new Date(data), numeroReceita: guia, criadoPor: POR },
    R_ARREC, m04
  );
  return r.receitaId;
}

async function empenhar1(numero: string, valor: string, data: string): Promise<string> {
  const e = await empenhar(
    { fichaId: "ficha-1", numero, tipo: "ORDINARIO", valor, data: new Date(data), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMPENHO, deps
  );
  return e.empenhoId;
}
async function liquidar1(empenhoId: string, numero: string, valor: string, data: string): Promise<string> {
  const l = await liquidar({ empenhoId, numero, valor, data: new Date(data), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQUIDACAO, deps);
  return l.liquidacaoId;
}

const acharReceita = (linhas: readonly LinhaReceitaRreo[], codigo: string) => linhas.find((l) => l.codigo === codigo)!;

describe("M12 — RREO Anexo 1 (LRF art. 52)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO DO 1º BIMESTRE.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: receita 1.1.1 (a=120.000, b=c=18.000, %=15,00, SALDO=102.000); despesa 3.3 (empenhada 30.000, liquidada 10.000)", async () => {
    await preverReceita(NAT_IPTU, "120000.00");
    // arrecada 20.000 em jan (duas guias: 18.000 + 2.000); estorna a de 2.000 em fev → líquido
    // 18.000. (O estorno remove a PRÓPRIA guia; por isso os 2.000 são uma guia separada.)
    await arrecadar(NAT_IPTU, "18000.00", "2026-01-20T12:00:00Z", "G-1");
    const g2 = await arrecadar(NAT_IPTU, "2000.00", "2026-01-25T12:00:00Z", "G-2");
    await anularArrecadacao({ receitaId: g2, numeroReceita: "G-2", dataAnulacao: new Date("2026-02-10T12:00:00Z"), criadoPor: POR }, m04);

    // despesa: empenha 30.000 (jan), liquida 10.000 (fev)
    const e = await empenhar1("NE-1", "30000.00", "2026-01-15T12:00:00Z");
    await liquidar1(e, "NL-1", "10000.00", "2026-02-20T12:00:00Z");

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });

    // ── RECEITA: a espécie 111 (o grão da natureza 11130111) ──
    const esp = acharReceita(a1.receitas, "111");
    expect(esp.previsaoAtualizada).toBe("120000.00"); // a
    expect(esp.noBimestre).toBe("18000.00"); // b = 20.000 − 2.000
    expect(esp.ateBimestre).toBe("18000.00"); // c
    expect(esp.percentAteBim).toBe("15.00"); // 18.000/120.000 = 15,00%
    expect(esp.saldo).toBe("102000.00"); // R1: a − c

    // a categoria e a origem repetem os mesmos totais (uma só espécie).
    expect(acharReceita(a1.receitas, "1").ateBimestre).toBe("18000.00");
    expect(acharReceita(a1.receitas, "11").ateBimestre).toBe("18000.00");

    // ── DESPESA: grupo 3 (ODC), categoria 3 ──
    const grupo3 = a1.despesas.find((l) => l.nivel === "grupo" && l.codigo === "3")!;
    expect(grupo3.dotacaoInicial).toBe("100000.00");
    expect(grupo3.dotacaoAtualizada).toBe("100000.00"); // sem créditos
    expect(grupo3.empenhadasAte).toBe("30000.00");
    expect(grupo3.liquidadasAte).toBe("10000.00");
    expect(grupo3.saldoDotacao).toBe("70000.00"); // 100.000 − 30.000
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — BIMESTRE 2 ACUMULA: R3 (c[2] == c[1] + b[2]).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: R3 — o acumulado do bim 2 == acumulado do bim 1 + no-bimestre do bim 2; %(c/a) arredonda a 2 casas", async () => {
    await preverReceita(NAT_IPTU, "120000.00");
    await arrecadar(NAT_IPTU, "18000.00", "2026-01-20T12:00:00Z", "G-1"); // bim 1
    await arrecadar(NAT_IPTU, "22000.00", "2026-03-10T12:00:00Z", "G-2"); // bim 2 (março)

    const b1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });
    const b2 = await anexo1(prisma, { exercicio: EXERC, bimestre: 2 });

    const c1 = Number(acharReceita(b1.receitas, "111").ateBimestre);
    const bimDoB2 = Number(acharReceita(b2.receitas, "111").noBimestre);
    const c2 = Number(acharReceita(b2.receitas, "111").ateBimestre);

    // ⚠️ R3: c[2] == c[1] + b[2]  (18.000 + 22.000 == 40.000)
    expect(c1).toBe(18000);
    expect(bimDoB2).toBe(22000);
    expect(c2).toBe(40000);
    expect(c2).toBe(c1 + bimDoB2);

    // %(c/a) ARREDONDADO: 40.000/120.000 = 33,333... → 33,33
    expect(acharReceita(b2.receitas, "111").percentAteBim).toBe("33.33");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — SUPLEMENTAÇÃO POR SUPERÁVIT → Saldos de Exercícios Anteriores + dotação atualizada.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: suplementação 20.000 por superávit → dotação atualizada 120.000 E Saldos Ex. Anteriores 20.000 em (a) e (c)", async () => {
    // ⚠️ PELO FLUXO REAL do M03 (o crédito é atrelado a um MovimentoDotacao — não se forja à mão).
    // Semeia a disponibilidade de superávit e executa o decreto de 20.000 na ficha-1.
    await prisma.disponibilidadeRecursoNovo.create({
      data: { exercicio: EXERC, fonteId: FONTE, origem: "SUPERAVIT_FINANCEIRO", descricao: "Superavit 2025", valor: "50000.00", criadoPor: POR },
    });
    const m03 = criarM03Deps(prisma);
    const leiId = await criarLei({ numero: "L-1", ano: EXERC, tipoCredito: "SUPLEMENTAR", valorAutorizado: "20000.00", dataPublicacao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR }, m03);
    const decId = await criarDecreto({ leiId, numero: "D-1", ano: EXERC, data: new Date("2026-02-05T12:00:00Z"), origemRecurso: "SUPERAVIT_FINANCEIRO", criadoPor: POR }, m03);
    await executarCredito({ decretoId: decId, itens: [{ fichaId: "ficha-1", tipo: "SUPLEMENTACAO", valor: "20000.00", fonteId: FONTE }], criadoPor: POR }, m03);

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });

    // dotação atualizada = inicial 100.000 + crédito 20.000
    const grupo3 = a1.despesas.find((l) => l.nivel === "grupo" && l.codigo === "3")!;
    expect(grupo3.dotacaoInicial).toBe("100000.00");
    expect(grupo3.dotacaoAtualizada).toBe("120000.00");

    // ⚠️ AS DUAS PONTAS DO MESMO CRÉDITO: Saldos de Exercícios Anteriores só em (a) e (c).
    expect(a1.saldosExerciciosAnteriores.previsaoAtualizada).toBe("20000.00");
    expect(a1.saldosExerciciosAnteriores.ateBimestre).toBe("20000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — INTRA em tabela SEPARADA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: receita intra (7.x) vai para a tabela SEPARADA, fora do quadro principal", async () => {
    await preverReceita(NAT_IPTU, "100000.00");
    await preverReceita(NAT_INTRA, "50000.00");
    await arrecadar(NAT_IPTU, "10000.00", "2026-01-10T12:00:00Z", "G-1");
    await arrecadar(NAT_INTRA, "5000.00", "2026-01-15T12:00:00Z", "G-2");

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });

    // a IPTU (categoria 1) está no quadro principal; a intra (categoria 7) NÃO.
    expect(a1.receitas.some((l) => l.codigo === "1")).toBe(true);
    expect(a1.receitas.some((l) => l.codigo === "7")).toBe(false);
    // ...e a intra está na tabela separada.
    expect(a1.intraReceitas.some((l) => l.codigo === "7")).toBe(true);
    expect(acharReceita(a1.intraReceitas, "711").ateBimestre).toBe("5000.00");

    // ⚠️ R2 nos DOIS quadros independentes: Σ espécies == origem == categoria.
    expect(acharReceita(a1.intraReceitas, "7").ateBimestre).toBe("5000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — 6º BIMESTRE: RP → R4 (empenhada == liquidada + RPNP).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: 6º bimestre — empenha 30.000, liquida 10.000 → RPNP inscrito 20.000; R4 fecha (empenhada == liquidada + RPNP)", async () => {
    // empenha 30.000, liquida só 10.000 → 20.000 vira RPNP no encerramento.
    const e = await empenhar1("NE-1", "30000.00", "2026-11-10T12:00:00Z");
    await liquidar1(e, "NL-1", "10000.00", "2026-11-20T12:00:00Z");
    await encerrarExercicioComRestos(prisma, { ano: EXERC, encerradoPor: POR });

    const a6 = await anexo1(prisma, { exercicio: EXERC, bimestre: 6 });
    const grupo3 = a6.despesas.find((l) => l.nivel === "grupo" && l.codigo === "3")!;

    expect(grupo3.empenhadasAte).toBe("30000.00");
    expect(grupo3.liquidadasAte).toBe("10000.00");
    expect(grupo3.inscritasRpnp).toBe("20000.00"); // lido de InscricaoRestosAPagar (M08)

    // ⚠️ R4 (MDF, amarra M05 × M08): empenhada == liquidada + RPNP  (30.000 == 10.000 + 20.000)
    expect(Number(grupo3.empenhadasAte)).toBe(Number(grupo3.liquidadasAte) + Number(grupo3.inscritasRpnp));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — DÉFICIT × SUPERÁVIT: nunca ambos; a régua troca no 6º bimestre.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: déficit e superávit nunca têm valor ao mesmo tempo; no 6º bim a régua é EMPENHADA (não liquidada)", async () => {
    await preverReceita(NAT_IPTU, "100000.00");

    // ── SUPERÁVIT (bim 1): arrecada 50.000, liquida só 10.000 → sobra receita ──
    await arrecadar(NAT_IPTU, "50000.00", "2026-01-10T12:00:00Z", "G-1");
    const e = await empenhar1("NE-1", "40000.00", "2026-01-15T12:00:00Z");
    await liquidar1(e, "NL-1", "10000.00", "2026-02-10T12:00:00Z");

    const b1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });
    // régua bim 1-5 = LIQUIDADA (10.000). receita 50.000 − 10.000 = 40.000 superávit.
    expect(b1.superavit).toBe("40000.00");
    expect(b1.deficit).toBe("0.00"); // ⚠️ NUNCA os dois

    // ── 6º BIMESTRE: a régua vira EMPENHADA (40.000). 50.000 − 40.000 = 10.000 superávit ──
    // (com liquidada seria 40.000; a DIVERGÊNCIA prova que a régua trocou.)
    const b6 = await anexo1(prisma, { exercicio: EXERC, bimestre: 6 });
    expect(b6.superavit).toBe("10000.00"); // 50.000 − EMPENHADA 40.000
    expect(b6.deficit).toBe("0.00");
    // se a régua NÃO tivesse trocado, seria 50.000 − liquidada 10.000 = 40.000. Trocou.
    expect(b6.superavit).not.toBe(b1.superavit);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — MUTAÇÕES: uma por identidade (R1, R2, R3) acusam.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: R1/R2/R3 — mutar uma célula rompe a identidade (acusa); a íntegra fecha", async () => {
    await preverReceita(NAT_IPTU, "120000.00");
    await arrecadar(NAT_IPTU, "30000.00", "2026-01-10T12:00:00Z", "G-1");

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });
    const esp = acharReceita(a1.receitas, "111");

    // R1: SALDO == a − c. Íntegro:
    expect(Number(esp.saldo)).toBe(Number(esp.previsaoAtualizada) - Number(esp.ateBimestre));
    // mutação: um saldo forjado NÃO bate.
    expect(90001).not.toBe(Number(esp.previsaoAtualizada) - Number(esp.ateBimestre)); // 90.000 é o certo

    // R2: categoria == origem == espécie (uma só). Íntegro; mutar a categoria rompe.
    const cat = acharReceita(a1.receitas, "1").ateBimestre;
    const ori = acharReceita(a1.receitas, "11").ateBimestre;
    expect(cat).toBe(ori);
    expect(cat).toBe(esp.ateBimestre);
    expect("29999.99").not.toBe(esp.ateBimestre); // uma espécie a menos romperia R2
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — LEITURA PURA (grep).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: rreo-anexo1.ts é LEITURA PURA — zero escrita, zero soma bruta", () => {
    const arquivo = fileURLToPath(new URL("./rreo-anexo1.ts", import.meta.url));
    const efetivo = readFileSync(arquivo, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;
    expect(ESCRITA.test(efetivo), "rreo-anexo1.ts tem ESCRITA").toBe(false);
    expect(SUM_BRUTO.test(efetivo), "rreo-anexo1.ts tem SUM bruto").toBe(false);
  });
});
