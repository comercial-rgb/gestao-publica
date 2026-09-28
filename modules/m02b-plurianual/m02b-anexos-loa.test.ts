import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { toMoney } from "../../packages/contracts/index.js";
import { lerDadosDaLoa, loaDoExercicio } from "./consultas-loa.js";
import {
  ConferenciaDaLoaError,
  conferirLoa,
  montarLoa,
  type AnexoDaLoa,
  type LoaMontada,
  type QuadroDoAnexo,
} from "./anexos/loa.js";

/**
 * M02b — A LOA CONSOLIDADA E OS ANEXOS DA LEI 4.320/64. Contas à mão, ANTES do código:
 *
 * ═══ DESPESA FIXADA (6 fichas, 2026) ═══                                 Σ 300.000,00
 *   #1 UO 02001 · 04.122.0004.2001 (atividade)  3.1.90.11 · fonte 500 · 100.000
 *   #2 UO 02001 · 04.122.0004.2001 (atividade)  3.3.90.39 · fonte 500 ·  50.000
 *   #3 UO 02002 · 12.361.0012.1001 (projeto)    4.4.90.52 · fonte 600 ·  80.000
 *   #4 UO 02002 · 12.365.0012.2002 (atividade)  3.3.90.30 · fonte 600 ·  30.000
 *   #5 UO 03001 · 04.122.0004.0001 (op. esp.)   3.3.90.39 · fonte 500 ·  20.000
 *   #6 UO 03001 · 99.999.9999.9999 (op. esp.)   9.9.99.99 · fonte 500 ·  20.000  (reserva)
 *
 * ═══ RECEITA PREVISTA ═══                                                 Σ 300.000,00
 *   1.1.1.8.01.1.1 IPTU  150.000 · 1.1.1.3.03.1.1 IRRF 30.000 · 1.7.1.1.51.1.1 FPM 100.000
 *   (−) dedução FPM 20.000 · 2.4.1.1.50.1.1 transferência de capital 40.000
 *
 * ═══ O QUE CADA ANEXO TEM DE DAR ═══
 *   A1 receita: correntes 280.000 (1.1 = 180.000; 1.7 = 100.000) · capital 40.000 · deduções −20.000
 *   A1 despesa: correntes 200.000 (3.1 = 100.000; 3.3 = 100.000) · capital 80.000 · reserva 20.000
 *   A1 resultado corrente: 260.000 − 200.000 = superávit 60.000
 *   A6 por unidade: 02001 = 150.000 · 02002 = 110.000 (proj 80.000, ativ 30.000) · 03001 = 40.000 (op. esp.)
 *   A7: projetos 80.000 · atividades 180.000 · op. especiais 40.000 · total 300.000;
 *       programa 04.122.0004 = 170.000 (DUAS ações: 2001 = 150.000, 0001 = 20.000)
 *   A8: ordinários (500) 190.000 · vinculados (600) 110.000
 *   A9: órgão 02 = 260.000 (04 = 150.000; 12 = 110.000) · órgão 03 = 40.000 (04 = 20.000; 99 = 20.000)
 *       por função: 04 = 170.000 · 12 = 110.000 · 99 = 20.000
 *
 * N=2 em todo agrupamento: 2 órgãos, 2 unidades no órgão 02, 2 subfunções na função 12, 2 ações
 * no programa 04.122.0004, 2 grupos na despesa corrente, 2 origens na receita corrente, 2 fontes.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const EX = 2026;

async function semearBase(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.orgao.createMany({ data: [{ id: "org02", codigo: "02", nome: "Gabinete" }, { id: "org03", codigo: "03", nome: "Secretaria de Finanças" }] });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo1", codigo: "02001", descricao: "Gabinete do Prefeito", orgaoId: "org02" },
      { id: "uo2", codigo: "02002", descricao: "Fundo Municipal de Educação", orgaoId: "org02" },
      { id: "uo3", codigo: "03001", descricao: "Secretaria de Finanças", orgaoId: "org03" },
    ],
  });
  await prisma.funcao.createMany({
    data: [
      { id: "f04", codigo: "04", nome: "Administração" },
      { id: "f12", codigo: "12", nome: "Educação" },
      { id: "f99", codigo: "99", nome: "Reserva de Contingência" },
    ],
  });
  await prisma.subfuncao.createMany({
    data: [
      { id: "s122", codigo: "122", nome: "Administração Geral" },
      { id: "s361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "s365", codigo: "365", nome: "Educação Infantil" },
      { id: "s999", codigo: "999", nome: "Reserva de Contingência" },
    ],
  });
  await prisma.programa.createMany({
    data: [
      { id: "p0004", codigo: "0004", descricao: "Gestão Administrativa" },
      { id: "p0012", codigo: "0012", descricao: "Educação Básica" },
      { id: "p9999", codigo: "9999", descricao: "Reserva de Contingência" },
    ],
  });
  await prisma.acao.createMany({
    data: [
      { id: "a2001", codigo: "2001", descricao: "Manutenção do Gabinete", tipo: "ATIVIDADE" },
      { id: "a0001", codigo: "0001", descricao: "Encargos Especiais", tipo: "OPERACAO_ESPECIAL" },
      { id: "a1001", codigo: "1001", descricao: "Construção de Escola", tipo: "PROJETO" },
      { id: "a2002", codigo: "2002", descricao: "Manutenção das Creches", tipo: "ATIVIDADE" },
      { id: "a9999", codigo: "9999", descricao: "Reserva de Contingência", tipo: "OPERACAO_ESPECIAL" },
    ],
  });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e Vantagens Fixas" },
      { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros Serviços de Terceiros" },
      { id: "nd30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de Consumo" },
      { id: "nd52", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos e Material Permanente" },
      { id: "nd99", codCategoria: "9", codNatureza: "9", codModalidade: "99", codElemento: "99", codigoCompleto: "999999", descricao: "Reserva de Contingência" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "r-iptu", codigo: "11180111", descricao: "IPTU" },
      { id: "r-irrf", codigo: "11130311", descricao: "IRRF" },
      { id: "r-fpm", codigo: "17115111", descricao: "FPM" },
      { id: "r-cap", codigo: "24115011", descricao: "Transferência de capital" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fo500", codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: "fo600", codigo: "600", descricao: "Vinculada", codigoTce: "600" },
    ],
  });
  await prisma.deParaFonteNaturezaDdr.createMany({
    data: [
      { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "teste", versao: 1, criadoPor: "T" },
      { fonteCodigo: "600", natureza: "VINCULADOS", fundamento: "teste", versao: 1, criadoPor: "T" },
    ],
  });
  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: EX, naturezaReceitaId: "r-iptu", fonteId: "fo500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "150000.00" },
      { exercicio: EX, naturezaReceitaId: "r-irrf", fonteId: "fo500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "30000.00" },
      { exercicio: EX, naturezaReceitaId: "r-fpm", fonteId: "fo500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" },
      { exercicio: EX, naturezaReceitaId: "r-fpm", fonteId: "fo500", tipoReceita: "DEDUCAO", valorPrevisto: "20000.00" },
      { exercicio: EX, naturezaReceitaId: "r-cap", fonteId: "fo600", tipoReceita: "ORCAMENTARIA", valorPrevisto: "40000.00" },
    ],
  });
  const ficha = (id: string, numero: number, uo: string, org: string, fu: string, sf: string, pr: string, ac: string, nd: string, fo: string, valor: string) =>
    criarFichaDeTeste(prisma, {
      id, exercicio: EX, numero, orgaoId: org, unidadeOrcId: uo, funcaoId: fu, subfuncaoId: sf,
      programaId: pr, acaoId: ac, naturezaDespesaId: nd, fonteId: fo, valorDotado: valor,
    });
  await ficha("fi1", 1, "uo1", "org02", "f04", "s122", "p0004", "a2001", "nd11", "fo500", "100000.00");
  await ficha("fi2", 2, "uo1", "org02", "f04", "s122", "p0004", "a2001", "nd39", "fo500", "50000.00");
  await ficha("fi3", 3, "uo2", "org02", "f12", "s361", "p0012", "a1001", "nd52", "fo600", "80000.00");
  await ficha("fi4", 4, "uo2", "org02", "f12", "s365", "p0012", "a2002", "nd30", "fo600", "30000.00");
  await ficha("fi5", 5, "uo3", "org03", "f04", "s122", "p0004", "a0001", "nd39", "fo500", "20000.00");
  await ficha("fi6", 6, "uo3", "org03", "f99", "s999", "p9999", "a9999", "nd99", "fo500", "20000.00");
}

const anexo = (l: LoaMontada, n: string): AnexoDaLoa => {
  const a = l.anexos.find((x) => x.numero === n);
  if (a === undefined) throw new Error(`Anexo ${n} ausente`);
  return a;
};
const quadro = (a: AnexoDaLoa, titulo: string): QuadroDoAnexo => {
  const q = a.quadros.find((x) => x.titulo.includes(titulo));
  if (q === undefined) throw new Error(`Quadro "${titulo}" ausente no Anexo ${a.numero}`);
  return q;
};
/** Os valores da linha de código `c` (ou do total, com c = ""), em texto. */
const linha = (q: QuadroDoAnexo, c: string): string[] => {
  const l = c === "" ? q.linhas.find((x) => x.nivel === "total") : q.linhas.find((x) => x.codigo === c);
  if (l === undefined) throw new Error(`Linha "${c}" ausente em ${q.titulo}`);
  return l.valores.map((v) => v.toFixed(2));
};

describe("M02b — LOA consolidada: os anexos da Lei 4.320/64", () => {
  beforeEach(async () => {
    await semearBase();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 resumo: receita prevista × despesa fixada, e o equilíbrio", async () => {
    const l = await loaDoExercicio(prisma, { exercicio: EX });
    expect(l.resumo.receitaPrevista.toFixed(2)).toBe("300000.00");
    expect(l.resumo.despesaFixada.toFixed(2)).toBe("300000.00");
    expect(l.resumo.situacao).toBe("EQUILIBRADA");
    expect(l.resumo.fichas).toBe(6);
    expect(l.anexos.map((a) => a.numero)).toEqual(["1", "2", "6", "7", "8", "9"]);
  });

  it("t2 Anexo 1: categorias econômicas da receita e da despesa, e o resultado corrente", async () => {
    const a1 = anexo(await loaDoExercicio(prisma, { exercicio: EX }), "1");
    const rec = quadro(a1, "Receita");
    expect(linha(rec, "1")).toEqual(["280000.00"]);
    expect(linha(rec, "1.1")).toEqual(["180000.00"]);
    expect(linha(rec, "1.7")).toEqual(["100000.00"]);
    expect(linha(rec, "2")).toEqual(["40000.00"]);
    expect(linha(rec, "D")).toEqual(["-20000.00"]);
    expect(linha(rec, "")).toEqual(["300000.00"]);
    expect(rec.linhas.find((x) => x.codigo === "1.1")?.especificacao).toBe("Impostos, Taxas e Contribuições de Melhoria");

    const desp = quadro(a1, "Despesa");
    expect(linha(desp, "3")).toEqual(["200000.00"]);
    expect(linha(desp, "3.1")).toEqual(["100000.00"]);
    expect(linha(desp, "3.3")).toEqual(["100000.00"]);
    expect(linha(desp, "4")).toEqual(["80000.00"]);
    expect(linha(desp, "9")).toEqual(["20000.00"]);
    expect(linha(desp, "")).toEqual(["300000.00"]);

    const res = quadro(a1, "Resultado do orçamento corrente");
    expect(res.linhas.map((x) => x.valores[0]!.toFixed(2))).toEqual(["260000.00", "200000.00", "60000.00"]);
    expect(res.linhas[2]!.especificacao).toBe("Superávit do orçamento corrente");
  });

  it("t3 Anexo 2: receita por natureza e despesa por natureza, consolidada e por unidade", async () => {
    const a2 = anexo(await loaDoExercicio(prisma, { exercicio: EX }), "2");
    const rec = quadro(a2, "Receita segundo");
    expect(linha(rec, "1.1.1.8.01.1.1")).toEqual(["150000.00"]);
    expect(linha(rec, "1.7.1.1.51.1.1")).toEqual(["100000.00"]);
    expect(linha(rec, "")).toEqual(["300000.00"]);
    const cons = quadro(a2, "consolidação geral");
    // 3.3.90.39 aparece em duas fichas (#2 e #5, unidades diferentes): 50.000 + 20.000.
    expect(linha(cons, "3.3.90.39")).toEqual(["70000.00"]);
    expect(linha(cons, "")).toEqual(["300000.00"]);
    const u02001 = quadro(a2, "Unidade orçamentária 02001");
    expect(linha(u02001, "")).toEqual(["150000.00"]);
    const u03001 = quadro(a2, "Unidade orçamentária 03001");
    expect(linha(u03001, "3.3.90.39")).toEqual(["20000.00"]);
    expect(linha(u03001, "")).toEqual(["40000.00"]);
  });

  it("t4 Anexos 6 e 7: programa de trabalho por projetos, atividades e operações especiais", async () => {
    const l = await loaDoExercicio(prisma, { exercicio: EX });
    const a6 = anexo(l, "6");
    expect(a6.quadros).toHaveLength(3);
    const u2 = quadro(a6, "Unidade orçamentária 02002");
    expect(linha(u2, "12")).toEqual(["80000.00", "30000.00", "0.00", "110000.00"]);
    expect(linha(u2, "12.361")).toEqual(["80000.00", "0.00", "0.00", "80000.00"]);
    expect(linha(u2, "12.365")).toEqual(["0.00", "30000.00", "0.00", "30000.00"]);
    expect(linha(quadro(a6, "Unidade orçamentária 03001"), "")).toEqual(["0.00", "0.00", "40000.00", "40000.00"]);

    const a7 = quadro(anexo(l, "7"), "Consolidação geral");
    expect(linha(a7, "04.122.0004")).toEqual(["0.00", "150000.00", "20000.00", "170000.00"]);
    expect(linha(a7, "04.122.0004.2001")).toEqual(["0.00", "150000.00", "0.00", "150000.00"]);
    expect(linha(a7, "04.122.0004.0001")).toEqual(["0.00", "0.00", "20000.00", "20000.00"]);
    expect(linha(a7, "")).toEqual(["80000.00", "180000.00", "40000.00", "300000.00"]);
  });

  it("t5 Anexo 8: vínculo com os recursos pela natureza DECLARADA da fonte", async () => {
    const a8 = quadro(anexo(await loaDoExercicio(prisma, { exercicio: EX }), "8"), "Consolidação geral");
    expect(linha(a8, "04")).toEqual(["170000.00", "0.00", "170000.00"]);
    expect(linha(a8, "12")).toEqual(["0.00", "110000.00", "110000.00"]);
    expect(linha(a8, "99")).toEqual(["20000.00", "0.00", "20000.00"]);
    expect(linha(a8, "")).toEqual(["190000.00", "110000.00", "300000.00"]);
  });

  it("t6 Anexo 8 sem a natureza de uma fonte: indisponível, e o motivo nomeia a fonte", async () => {
    await prisma.deParaFonteNaturezaDdr.deleteMany({ where: { fonteCodigo: "600" } });
    const l = await loaDoExercicio(prisma, { exercicio: EX });
    expect(l.anexos.map((a) => a.numero)).toEqual(["1", "2", "6", "7", "9"]);
    const ind = l.indisponiveis.find((i) => i.numero === "8");
    expect(ind?.motivo).toContain("fonte(s) 600 ainda não têm a natureza declarada");
    // os fixos continuam declarados, cada um com motivo
    expect(l.indisponiveis.filter((i) => i.numero === null).every((i) => i.motivo.length > 40)).toBe(true);
  });

  it("t7 Anexo 9: despesa por órgão e função", async () => {
    const a9 = anexo(await loaDoExercicio(prisma, { exercicio: EX }), "9");
    const q = quadro(a9, "órgão e função");
    expect(linha(q, "02")).toEqual(["260000.00"]);
    expect(linha(q, "02.04")).toEqual(["150000.00"]);
    expect(linha(q, "02.12")).toEqual(["110000.00"]);
    expect(linha(q, "03")).toEqual(["40000.00"]);
    expect(linha(q, "03.99")).toEqual(["20000.00"]);
    const f = quadro(a9, "Total por função");
    expect(linha(f, "04")).toEqual(["170000.00"]);
    expect(linha(f, "")).toEqual(["300000.00"]);
  });

  it("t8 desequilíbrio: uma ficha a mais deixa a despesa maior, e a diferença é dita", async () => {
    await criarFichaDeTeste(prisma, {
      id: "fi7", exercicio: EX, numero: 7, orgaoId: "org03", unidadeOrcId: "uo3", funcaoId: "f04", subfuncaoId: "s122",
      programaId: "p0004", acaoId: "a0001", naturezaDespesaId: "nd30", fonteId: "fo500", valorDotado: "5000.00",
    });
    const l = await loaDoExercicio(prisma, { exercicio: EX });
    expect(l.resumo.situacao).toBe("DESPESA_MAIOR");
    expect(l.resumo.diferenca.toFixed(2)).toBe("-5000.00");
    // e todos os anexos de despesa acompanham a ficha nova
    expect(linha(quadro(anexo(l, "7"), "Consolidação geral"), "")[3]).toBe("305000.00");
  });

  it("t9 a conferência ACUSA: quadro com folha perdida, total de referência divergente, parte faltando", async () => {
    const dados = await lerDadosDaLoa(prisma, { exercicio: EX });
    const l = montarLoa(dados);
    expect(conferirLoa(l.anexos, dados.referencia)).toEqual([]);

    // (a) uma folha some do Anexo 7: Σ das folhas deixa de bater com a linha de total.
    const a7 = anexo(l, "7");
    const q7 = a7.quadros[0]!;
    const semFolha: AnexoDaLoa = { ...a7, quadros: [{ ...q7, linhas: q7.linhas.filter((x) => x.codigo !== "04.122.0004.0001") }] };
    const d1 = conferirLoa([semFolha], dados.referencia);
    expect(d1.some((m) => m.includes("Anexo 7") && m.includes("Operações especiais") && m.includes("20000.00 nas linhas"))).toBe(true);

    // (b) a referência da receita não é a do Anexo 1: acusa com os dois números.
    const d2 = conferirLoa([anexo(l, "1")], { ...dados.referencia, receitaPrevista: toMoney("299999.99") });
    expect(d2).toEqual(["Anexo 1 (Receita): total 300000.00 difere da receita prevista 299999.99"]);

    // (c) uma unidade inteira some do Anexo 6: a soma das partes deixa de ser a despesa.
    const a6 = anexo(l, "6");
    const d3 = conferirLoa([{ ...a6, quadros: a6.quadros.slice(1) }], dados.referencia);
    expect(d3).toEqual(["Anexo 6: a soma das unidades orçamentárias é 150000.00 e a despesa fixada é 300000.00"]);

    // (d) e montarLoa não emite quando a referência diverge: lança, com o motivo.
    expect(() => montarLoa({ ...dados, referencia: { ...dados.referencia, despesaFixada: toMoney("1.00") } })).toThrow(ConferenciaDaLoaError);
    expect(() => montarLoa({ ...dados, referencia: { ...dados.referencia, despesaFixada: toMoney("1.00") } })).toThrow(/difere da despesa fixada 1\.00/);
  });

  it("t10 exercício sem LOA: tudo zero e equilibrado, sem inventar linhas", async () => {
    const l = await loaDoExercicio(prisma, { exercicio: 2031 });
    expect(l.resumo.fichas).toBe(0);
    expect(l.resumo.receitaPrevista.toFixed(2)).toBe("0.00");
    expect(anexo(l, "6").quadros).toHaveLength(0);
    expect(linha(quadro(anexo(l, "7"), "Consolidação geral"), "")).toEqual(["0.00", "0.00", "0.00", "0.00"]);
  });
});
