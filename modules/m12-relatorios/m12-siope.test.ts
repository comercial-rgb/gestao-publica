import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anexo8 } from "./rreo-anexo8.js";
import { conferirTranscricao, grupoDaSecao, previaDoSiope, TRANSCRICAO_DO_MANUAL } from "./siope.js";

/**
 * V39-R3 (R3-023) — A CORRESPONDÊNCIA DO SIOPE MUNICIPAL E A PRÉVIA.
 *
 * A transcrição é conferida contra o TEXTO do manual guardado (não contra si mesma), e cada adulteração recusa pelo seu
 * motivo — inclusive a OMISSÃO de um código que está no texto. A prévia, no 6º bimestre (base empenhada):
 *   361 fonte 500 (impostos) 1.000,00 e fonte 540 (FUNDEB) 800,00 · 122 (apoio) 300,00 · 306 (merenda) 200,00
 *   782 (transporte) 150,00 · 999 (FIXTURE, fora da correspondência) 50,00 · Saúde 301 700,00 (fora da função 12).
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "contabilidade@cg.pb.gov.br";
const MANUAL = readFileSync(join(process.cwd(), "docs", "oficial", "fnde-siope", "Manual_SIOPE_2026.txt"), "utf8");
const R_EMP = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const t = (codigo: string) => TRANSCRICAO_DO_MANUAL.find((x) => x.codigo === codigo)!;

async function carregarCorrespondencia(): Promise<void> {
  await prisma.correspondenciaSiope.create({
    data: {
      exercicio: 2026, versao: 1, fonte: "Manual do SIOPE (fixture do teste: a mesma transcrição da carga)", shaDoTexto: "0".repeat(64), shaDaTranscricao: "1".repeat(64), criadoPor: "TESTE",
      itens: { create: TRANSCRICAO_DO_MANUAL.map((x) => ({ subfuncaoCodigo: x.codigo, nome: x.nome, grupo: grupoDaSecao(x.secao), tratamento: x.tratamento, secao: x.secao, linhaNoManual: x.linha })) },
    },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.createMany({ data: [{ id: "fun-12", codigo: "12", nome: "Educação" }, { id: "fun-10", codigo: "10", nome: "Saúde" }] });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" }, { id: "sub-122", codigo: "122", nome: "Administração Geral" },
      { id: "sub-306", codigo: "306", nome: "Alimentação e Nutrição" }, { id: "sub-782", codigo: "782", nome: "Transporte Escolar" },
      { id: "sub-999", codigo: "999", nome: "Subfunção de fixture" }, { id: "sub-301", codigo: "301", nome: "Atenção Básica" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2012", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC" } });
  await prisma.fonteRecurso.createMany({ data: [{ id: "fnt-500", codigo: "500", descricao: "Impostos", codigoTce: "500" }, { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" }] });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  // A classe de cada fonte na educação (o Anexo 8 a exige, fail-closed): fixture.
  await prisma.deParaFonteClasseEducacao.createMany({ data: [{ fonteCodigo: "500", classe: "IMPOSTOS_MDE", criadoPor: "TESTE" }, { fonteCodigo: "540", classe: "FUNDEB", criadoPor: "TESTE" }] });
  const deps = criarM05Deps(prisma);
  const casos = [
    ["sub-361", "fun-12", "fnt-500", "1000.00"], ["sub-361", "fun-12", "fnt-540", "800.00"], ["sub-122", "fun-12", "fnt-500", "300.00"],
    ["sub-306", "fun-12", "fnt-500", "200.00"], ["sub-782", "fun-12", "fnt-500", "150.00"], ["sub-999", "fun-12", "fnt-500", "50.00"],
    ["sub-301", "fun-10", "fnt-500", "700.00"],
  ] as const;
  for (const [k, [subfuncaoId, funcaoId, fonteId, valor]] of casos.entries()) {
    const id = `ficha-${String(k + 1)}`;
    await criarFichaDeTeste(prisma, { id, exercicio: 2026, numero: k + 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId, subfuncaoId, programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId, valorDotado: "100000.00" });
    await empenhar({ fichaId: id, numero: `NE-${String(k + 1)}`, tipo: "ORDINARIO", valor, data: new Date("2026-03-10T15:00:00Z"), credorCpfCnpj: "12345678000195", historico: "despesa de fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMP, deps);
  }
}, 120000);

describe("V39-R3 (R3-023) — a correspondência do SIOPE municipal, conferida contra o texto do manual", () => {
  it("a transcrição confere com o texto; 4 típicas municipais, 7 de apoio, 8 consideradas e 11 não consideradas (contadas à mão na unidade municipal)", () => {
    expect(conferirTranscricao(MANUAL)).toEqual([]);
    const porSecao = (["TIPICAS_MUNICIPAIS", "QUADRO_18", "QUADRO_19", "QUADRO_20"] as const).map((s) => TRANSCRICAO_DO_MANUAL.filter((x) => x.secao === s).length);
    expect(porSecao).toEqual([4, 7, 8, 11]);
    // à mão, do texto: 362 a 364 NÃO são típicas no município; 242 e 695 são não consideradas; 061, 181 e 422 não estão
    const codigos = new Set(TRANSCRICAO_DO_MANUAL.map((x) => x.codigo));
    expect(["362", "363", "364", "061", "181", "422"].filter((c) => codigos.has(c))).toEqual([]);
    expect([t("242").tratamento, t("695").tratamento, t("366").tratamento, t("782").tratamento, t("122").tratamento]).toEqual(["NAO_CONSIDERADA", "NAO_CONSIDERADA", "CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL", "CONSIDERADA_SE_RECURSOS_PROPRIOS", "CONSIDERADA"]);
  });

  it("cada adulteração recusa pelo SEU motivo: omissão, linha errada, seção errada, nome fora do texto, condição fora da seção, repetição", () => {
    const sem695 = TRANSCRICAO_DO_MANUAL.filter((x) => x.codigo !== "695");
    expect(conferirTranscricao(MANUAL, sem695)).toEqual([expect.stringMatching(/Quadro 20 \(não consideradas\)" tem no texto 695, que a transcrição não traz/)]);
    const troca = (codigo: string, mudanca: object) => TRANSCRICAO_DO_MANUAL.map((x) => (x.codigo === codigo ? { ...x, ...mudanca } : x));
    expect(conferirTranscricao(MANUAL, troca("782", { linha: 4664 }))).toEqual([expect.stringMatching(/^782: a linha 4664 não começa com o código/)]);
    expect(conferirTranscricao(MANUAL, troca("782", { nome: "Transporte Escolar Rural" }))).toEqual([expect.stringMatching(/^782: "Rural" não aparece na seção "Quadro 19/)]);
    expect(conferirTranscricao(MANUAL, troca("366", { tratamento: "CONSIDERADA_SE_RECURSOS_PROPRIOS" }))).toEqual([expect.stringMatching(/^366: a condição "OBS: despesas realizadas com recursos próprios" não está na seção/)]);
    expect(conferirTranscricao(MANUAL, troca("306", { tratamento: "CONSIDERADA" }))).toEqual([expect.stringMatching(/^306: considerada numa seção de não consideradas/)]);
    expect(conferirTranscricao(MANUAL, troca("695", { secao: "QUADRO_19" }))).toEqual(expect.arrayContaining([
      expect.stringMatching(/Quadro 20 \(não consideradas\)" tem no texto 695, que a transcrição não traz/),
      expect.stringMatching(/^695: a linha 4699 não está na seção "Quadro 19/),
    ]));
    expect(conferirTranscricao(MANUAL, [...TRANSCRICAO_DO_MANUAL, t("782")])).toEqual([expect.stringMatching(/Código transcrito duas vezes: 782/)]);
  });
});

describe("V39-R3 (R3-023) — a prévia do SIOPE", { timeout: 120000 }, () => {
  it("sem a correspondência do exercício, não há prévia (fail-closed, com o motivo)", async () => {
    await expect(previaDoSiope(prisma, { exercicio: 2026, bimestre: 6 })).rejects.toThrow(/A correspondência do SIOPE para 2026 não está carregada/);
  });

  it("subfunções da Educação pelo tratamento do manual; o total soma só a parte de impostos (o FUNDEB fica fora); a Saúde não entra; a fora da correspondência aparece; indicadores = os do Anexo 8", async () => {
    await carregarCorrespondencia();
    const p = await previaDoSiope(prisma, { exercicio: 2026, bimestre: 6 });
    expect(p.base).toBe("empenhada");
    expect(p.linhas.map((l) => [l.subfuncao, l.tratamento, l.despesa.acompanhamento, l.deImpostos.acompanhamento])).toEqual([
      ["122", "CONSIDERADA", "300.00", "300.00"],
      ["306", "NAO_CONSIDERADA", "200.00", "200.00"],
      ["361", "CONSIDERADA", "1800.00", "1000.00"],
      ["782", "CONSIDERADA_SE_RECURSOS_PROPRIOS", "150.00", "150.00"],
      ["999", null, "50.00", "50.00"],
    ]);
    // à mão: considerada = 1.000 (361, só impostos) + 300 (122); transporte 150; merenda 200; sem correspondência 50
    expect(Object.fromEntries(Object.entries(p.totaisDeImpostos).map(([k, v]) => [k, v.toFixed(2)]))).toEqual({
      CONSIDERADA: "1300.00", CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL: "0.00", CONSIDERADA_SE_RECURSOS_PROPRIOS: "150.00", NAO_CONSIDERADA: "200.00", SEM_CORRESPONDENCIA: "50.00",
    });
    const a8 = await anexo8(prisma, { exercicio: 2026, bimestre: 6 });
    expect(p.indicadores).toEqual({ receitaDeImpostosRealizada: a8.totalReceitas.realizada, minimoAlemDoFundeb: a8.minimoAlemFundeb, recebidoDoFundeb: a8.totalRecebidoFundeb, indicadorProfissionais: a8.indicadorProfissionais, limiteProfissionais: a8.limiteProfissionais, atingiuProfissionais: a8.atingiuProfissionais });
    expect(p.bloqueios.map((b) => b.motivo)).toEqual([expect.stringMatching(/Tabela 2 - Código de Identificação das Planilhas de Administração Consolidada" \(citada na linha 2642/), expect.stringMatching(/365 vai em duas planilhas, creche e pré-escola/)]);
  });

  it("no 2º bimestre a base é a liquidada: sem liquidação, acompanhamento zero — o bimestre e a base vêm do medidor do Anexo 8", async () => {
    await carregarCorrespondencia();
    const p = await previaDoSiope(prisma, { exercicio: 2026, bimestre: 2 });
    expect([p.base, p.linhas.map((l) => [l.subfuncao, l.despesa.empenhada, l.despesa.acompanhamento])]).toEqual(["liquidada", [["122", "300.00", "0.00"], ["306", "200.00", "0.00"], ["361", "1800.00", "0.00"], ["782", "150.00", "0.00"], ["999", "50.00", "0.00"]]]);
  });
});
