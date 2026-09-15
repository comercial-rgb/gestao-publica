import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { xlsDeTeste, xlsxDeTeste, type CelulaDeTeste } from "./fixtures/planilhas.js";
import { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, planilhaOrcamentaria, previaDePlanilha, revogarVinculoDaPlanilha, vincularItemDaPlanilhaAoContrato } from "../modules/m11-licitacoes/planilha-orcamentaria.js";

/**
 * ═══ A PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U6) ═══
 *
 * Planilha SINTÉTICA (nenhuma composição, preço ou tabela real), com as contas feitas à mão:
 *   1   SERVIÇOS PRELIMINARES                           (arquivo: 1.305,00)
 *   1.1 placa de obra      m²   6    × 180,50 = 1.083,00 (fórmula no arquivo, valor gravado 1.083)
 *   1.2 locação da obra    m    100  ×   2,22 =   222,00
 *   2   ALVENARIA
 *   2.1 alvenaria          m²   45,5 ×  71,33 = 3.245,515 → 3.245,52 (meio para cima)
 *   2.2 chapisco           m²   91   ×   6,07 =   552,37 (arquivo truncou: 552,36 → divergência)
 *   TOTAL GERAL                                 arquivo 5.102,88; soma = 1.083 + 222 + 3.245,52 + 552,37 = 5.102,89 → divergência
 * Grupo 2 = 3.245,52 + 552,37 = 3.797,89.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => { await prisma.$disconnect(); });

const ENG = "engenharia.planilha@teste.local";
const OUTRO = "outro.planilha@teste.local";

const CABECALHO: CelulaDeTeste[] = ["Item", "Código", "Descrição", "Unid.", "Quant.", "Custo unitário sem BDI", "Preço unitário com BDI", "Preço total"];
const REFERENCIA: CelulaDeTeste[][] = [
  ["PLANILHA ORÇAMENTÁRIA — OBRA SINTÉTICA DE TESTE"],
  [],
  CABECALHO,
  ["1", null, "SERVIÇOS PRELIMINARES", null, null, null, null, 1305],
  ["1.1", "COMP-PLACA", "Placa de obra em chapa galvanizada", "m²", 6, 150, 180.5, { f: "E5*G5", v: 1083 }],
  ["1.2", "COMP-LOCACAO", "Locação da obra", "m", 100, 1.8, "2,22", 222],
  ["2", null, "ALVENARIA", null, null, null, null, null],
  ["2.1", null, "Alvenaria de vedação em bloco cerâmico", "m²", "45,5", 60, 71.33, 3245.52],
  ["2.2", null, "Chapisco em parede", "m²", 91, 5, 6.07, 552.36],
  [null, null, "TOTAL GERAL", null, null, null, null, 5102.88],
];

async function conta(identificador: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ENG, ["GERIR_PLANILHA_DA_OBRA"]);
  await conta(OUTRO, ["CONSULTAR_LICITACOES"]);
  await prisma.obra.create({ data: { id: "obra", identificador: "OBRA-PLAN-01", descricao: "Unidade de saúde sintética", tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "SEED" } as never });
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0900", modalidade: "CONCORRENCIA", objeto: "Obra sintética", valorLicitado: "6000.00", criadoPor: "SEED" } as never });
  for (const [id, numero] of [["ctr", "CT-OBRA-1"], ["ctr2", "CT-OBRA-2"]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Construtora Sintética", valorInicial: "6000.00", vigenciaInicio: new Date("2026-01-01T15:00:00Z"), vigenciaFimInicial: new Date("2026-12-31T15:00:00Z"), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } as never });
    await prisma.itemDoContrato.create({ data: { id: `${id}-item`, contratoId: id, numero: 1, descricao: "Execução da obra conforme planilha", unidade: "serviço", quantidade: "1", valorUnitario: "6000", criadoPor: "SEED" } });
  }
}, 120_000);

const previa = (conteudo: Buffer, extra: Record<string, unknown> = {}) => gerarPreviaDePlanilha(prisma, { obraId: "obra", nomeDoArquivo: "orcamento.xlsx", conteudo, criadoPor: ENG, ...extra } as never);
const confirmar = (previaId: string, extra: Record<string, unknown> = {}) =>
  confirmarPreviaDePlanilha(prisma, { previaId, descricao: "Orçamento base da licitação", dataBaseDosPrecos: "2026-07-01", referenciaDePrecos: "Tabela sintética de teste, 07/2026", vigenciaInicio: "2026-08-01", motivo: "Planilha do projeto básico aprovado", cienteDasDivergencias: false, criadoPor: ENG, ...extra } as never);

describe("a planilha orçamentária da obra", () => {
  it("PL01: .xlsx e .xls do mesmo orçamento dão a mesma análise — grupos, serviços, fórmula sem execução, divergências e totais", async () => {
    const a = await previa(xlsxDeTeste("Orçamento", REFERENCIA));
    const b = await previa(xlsDeTeste("Orçamento", REFERENCIA), { nomeDoArquivo: "orcamento.xls" });
    for (const r of [a, b]) expect(r).toMatchObject({ erros: 0, divergencias: 2, servicos: 4, totalCalculado: "5102.89" });
    const pa = (await previaDePlanilha(prisma, a.previaId))!;
    const pb = (await previaDePlanilha(prisma, b.previaId))!;
    expect([pa.formato, pb.formato]).toEqual(["XLSX", "XLS"]);
    expect(pa.analise.itens).toEqual(pb.analise.itens);
    expect(pa.analise.itens.map((i) => [i.codigo, i.tipo, i.valor])).toEqual([["1", "GRUPO", "1305.00"], ["1.1", "SERVICO", "1083.00"], ["1.2", "SERVICO", "222.00"], ["2", "GRUPO", "3797.89"], ["2.1", "SERVICO", "3245.52"], ["2.2", "SERVICO", "552.37"]]);
    expect(pa.analise.itens[1]).toMatchObject({ referencia: "COMP-PLACA", unidade: "m²", quantidade: "6.0000", precoUnitario: "180.5000", comFormula: true });
    expect(pa.analise.divergencias.map((d) => d.linha)).toEqual([9, 0]);
    expect(pa.analise.divergencias[0]!.mensagem).toMatch(/552\.36.*552\.37/);
    expect(pa.analise.totalDeclarado).toBe("5102.88");
    // O preço COM BDI foi o escolhido entre as duas colunas de unitário.
    expect(pa.analise.mapeamento.precoUnitario).toBe(6);
    expect(pa.analise.celulasComFormula).toBe(1);
  });

  it("PL02: erros por linha bloqueiam a confirmação; fórmula sem valor, macro e arquivo que não é planilha", async () => {
    const ruim = xlsxDeTeste("Orçamento", [
      CABECALHO,
      ["1", null, "SERVIÇOS", null, null, null, null, null],
      ["1.1", null, "Serviço sem unidade", null, 2, 1, 1, 2],
      ["1.1", null, "Código repetido", "un", 1, 1, 1, 1],
      ["3.1", null, "Pai inexistente", "un", 1, 1, 1, 1],
      ["1.2", null, "Quantidade texto", "un", "muitos", 1, 1, 1],
      ["1.3", null, "Fórmula sem valor gravado", "un", 1, 1, { f: "F7*2" }, null],
    ], { macros: true });
    const r = await previa(ruim);
    const p = (await previaDePlanilha(prisma, r.previaId))!;
    expect(p.analise.macros).toBe(true);
    expect(p.analise.erros.map((e) => [e.linha, e.mensagem.replace(/ \(.*$/, "")])).toEqual([
      [3, "serviço sem unidade"],
      [4, "código repetido"],
      [5, "o grupo 3 não aparece antes deste item"],
      [6, "quantidade inválida"],
      [7, "fórmula sem valor gravado no arquivo"],
      [7, "preço unitário inválido"],
    ]);
    await expect(confirmar(r.previaId, { cienteDasDivergencias: true })).rejects.toThrow(/PREVIA-COM-ERROS: 6 linha\(s\) com erro, a primeira na linha 3: serviço sem unidade/);
    expect(await prisma.planilhaOrcamentariaDaObra.count()).toBe(0);
    await expect(previa(Buffer.from("%PDF-1.7 não é planilha"))).rejects.toThrow(/ARQUIVO-NAO-E-PLANILHA/);
    await expect(previa(xlsxDeTeste("Dados", [["a", "b"], ["1", "2"]]))).rejects.toThrow(/CABECALHO-NAO-RECONHECIDO/);
    await expect(gerarPreviaDePlanilha(prisma, { obraId: "obra", nomeDoArquivo: "x.xlsx", conteudo: xlsxDeTeste("Orçamento", REFERENCIA), criadoPor: OUTRO })).rejects.toThrow(/ACESSO NEGADO[\s\S]*GERIR_PLANILHA_DA_OBRA/);
    expect(await prisma.previaDePlanilhaOrcamentaria.count()).toBe(1);
  });

  it("PL03: cabeçalho com outros nomes — as colunas informadas substituem a detecção", async () => {
    const semNomes = xlsxDeTeste("Plan1", [["Nº", "Serviço", "Medida", "Qtd prevista", "R$ unit"], ["1", "GRUPO ÚNICO", null, null, null], ["1.1", "Pintura", "m²", 10, 12.5]]);
    await expect(previa(semNomes)).rejects.toThrow(/CABECALHO-NAO-RECONHECIDO/);
    const r = await previa(semNomes, { linhaDoCabecalho: 1, colunas: { codigo: "A", descricao: "B", unidade: "C", quantidade: "D", precoUnitario: "E" } });
    expect(r).toMatchObject({ erros: 0, divergencias: 0, servicos: 1, totalCalculado: "125.00" });
    await expect(previa(semNomes, { linhaDoCabecalho: 1 })).rejects.toThrow(/CABECALHO-INCOMPLETO/);
  });

  it("PL04: confirmação — divergência exige ciência; a versão guarda itens e contrato; a segunda versão aponta a primeira e não vale antes dela", async () => {
    const r = await previa(xlsxDeTeste("Orçamento", REFERENCIA));
    await expect(confirmar(r.previaId)).rejects.toThrow(/DIVERGENCIAS-SEM-CIENCIA: a prévia tem 2 divergência/);
    const v1 = await confirmar(r.previaId, { cienteDasDivergencias: true, numeroDoContrato: "CT-OBRA-1" });
    expect(v1).toMatchObject({ versao: 1, valorTotal: "5102.89", itens: 6 });
    await expect(confirmar(r.previaId, { cienteDasDivergencias: true })).rejects.toThrow(/PREVIA-JA-CONFIRMADA: esta prévia já virou a versão 1/);
    const p1 = (await planilhaOrcamentaria(prisma, v1.planilhaId))!;
    expect(p1).toMatchObject({ versao: 1, divergenciasCientes: 2, contrato: { numero: "CT-OBRA-1" }, versaoAnterior: null });
    expect(p1.itens.find((i) => i.codigo === "2.1")).toMatchObject({ quantidade: "45.5000", precoUnitario: "71.3300", valor: "3245.52", valorNoArquivo: "3245.52", linhaDoArquivo: 8 });

    const segunda = REFERENCIA.map((l) => (l[0] === "2.2" ? ["2.2", null, "Chapisco em parede", "m²", 120, 5, 6.07, 728.4] : l[2] === "TOTAL GERAL" ? [null, null, "TOTAL GERAL", null, null, null, null, 5278.92] : l));
    const r2 = await previa(xlsxDeTeste("Orçamento", segunda));
    await expect(confirmar(r2.previaId, { cienteDasDivergencias: true, vigenciaInicio: "2026-07-15" })).rejects.toThrow(/VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão 1 vale desde 01\/08\/2026/);
    // 120 × 6,07 = 728,40 (igual ao arquivo); total = 1.083 + 222 + 3.245,52 + 728,40 = 5.278,92 (igual ao arquivo): nenhuma divergência.
    const v2 = await confirmar(r2.previaId, { cienteDasDivergencias: true, vigenciaInicio: "2026-09-01", motivo: "Revisão do quantitativo de chapisco" });
    expect(v2).toMatchObject({ versao: 2, valorTotal: "5278.92" });
    expect((await planilhaOrcamentaria(prisma, v2.planilhaId))?.versaoAnterior?.versao).toBe(1);
    expect((await planilhaOrcamentaria(prisma, v1.planilhaId))?.versaoSeguinte?.versao).toBe(2);
    // A versão 1 não foi reescrita.
    expect((await planilhaOrcamentaria(prisma, v1.planilhaId))?.valorTotal).toBe("5102.89");
  });

  it("PL05: prévia cuja análise mudou é recusada — a confirmação reanalisa os bytes guardados", async () => {
    const r = await previa(xlsxDeTeste("Orçamento", REFERENCIA));
    const bruto = await prisma.previaDePlanilhaOrcamentaria.findUniqueOrThrow({ where: { id: r.previaId }, select: { analise: true } });
    await prisma.previaDePlanilhaOrcamentaria.update({ where: { id: r.previaId }, data: { analise: { ...(bruto.analise as object), totalCalculado: "1.00" } } });
    await expect(confirmar(r.previaId, { cienteDasDivergencias: true })).rejects.toThrow(/PREVIA-DESATUALIZADA/);
  });

  it("PL06: duas confirmações concorrentes de prévias diferentes — uma só vira a versão 1", async () => {
    const a = await previa(xlsxDeTeste("Orçamento", REFERENCIA));
    const b = await previa(xlsDeTeste("Orçamento", REFERENCIA));
    const corrida = await Promise.allSettled([confirmar(a.previaId, { cienteDasDivergencias: true }), confirmar(b.previaId, { cienteDasDivergencias: true })]);
    const ok = corrida.filter((c) => c.status === "fulfilled") as PromiseFulfilledResult<{ versao: number }>[];
    const recusas = corrida.filter((c) => c.status === "rejected") as PromiseRejectedResult[];
    // Serializadas pelo banco: ou uma recusa por concorrência, ou as duas em sequência (1 e 2) — nunca duas versões 1.
    expect(ok.map((x) => x.value.versao).sort()).toEqual(recusas.length === 1 ? [1] : [1, 2]);
    if (recusas.length === 1) expect(String(recusas[0]!.reason)).toMatch(/VERSAO-CONCORRENTE/);
    expect(await prisma.planilhaOrcamentariaDaObra.count({ where: { versao: 1 } })).toBe(1);
  });

  it("PL07: vínculo explícito do serviço com o item do contrato — grupo, outro contrato, repetido e revogação", async () => {
    const r = await previa(xlsxDeTeste("Orçamento", REFERENCIA));
    const v = await confirmar(r.previaId, { cienteDasDivergencias: true, numeroDoContrato: "CT-OBRA-1" });
    const itens = await prisma.itemDaPlanilhaOrcamentaria.findMany({ where: { planilhaId: v.planilhaId }, select: { id: true, codigo: true } });
    const de = (codigo: string): string => itens.find((i) => i.codigo === codigo)!.id;
    const motivo = "Serviço medido dentro do item único do contrato";
    await expect(vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: de("1"), itemDoContratoId: "ctr-item", motivo, criadoPor: ENG })).rejects.toThrow(/VINCULO-DE-GRUPO/);
    await expect(vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: de("1.1"), itemDoContratoId: "ctr2-item", motivo, criadoPor: ENG })).rejects.toThrow(/ITEM-DE-OUTRO-CONTRATO: .*CT-OBRA-1/);
    const { vinculoId } = await vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: de("1.1"), itemDoContratoId: "ctr-item", motivo, criadoPor: ENG });
    await expect(vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: de("1.1"), itemDoContratoId: "ctr-item", motivo, criadoPor: ENG })).rejects.toThrow(/VINCULO-JA-EXISTE/);
    await revogarVinculoDaPlanilha(prisma, { vinculoId, motivo: "Vínculo registrado no serviço errado", criadoPor: ENG });
    await expect(revogarVinculoDaPlanilha(prisma, { vinculoId, motivo: "Segunda revogação do mesmo vínculo", criadoPor: ENG })).rejects.toThrow(/VINCULO-JA-REVOGADO/);
    await vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: de("1.1"), itemDoContratoId: "ctr-item", motivo, criadoPor: ENG });
    const p = (await planilhaOrcamentaria(prisma, v.planilhaId))!;
    expect(p.itens.find((i) => i.codigo === "1.1")?.vinculos.map((x) => x.revogado)).toEqual([true, false]);
    // O item do contrato não mudou.
    expect((await prisma.itemDoContrato.findUniqueOrThrow({ where: { id: "ctr-item" }, select: { quantidade: true, valorUnitario: true } })).valorUnitario.toFixed(2)).toBe("6000.00");
  });
});
