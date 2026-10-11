import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { registrarPesquisaDePrecos } from "./compras.js";
import { estimativaPeloFixado, fixarPrecoEstimado, precoPeloMetodo } from "./preco-estimado.js";
import { regraDoTextoDaIn65 } from "./fontes-da-pesquisa.js";
import { cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida } from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";

/**
 * V39-R3 (R3-020, V39-040) — O PREÇO ESTIMADO COM MÉTODO, FONTES E MEMÓRIA.
 *
 * A regra do mínimo vem do TEXTO OFICIAL guardado (a mesma leitura da carga). Aritmética à mão:
 *   preços 10, 12, 14, 40 ........ média 19, mediana 13 (12 + 14) / 2, menor 10
 *   descartado o 40 (excessivo) ... 10, 12, 14: média 12, mediana 12, menor 10
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
const FORNECEDORES = ["11222333000181", "11444777000161", "45723174000110", "12345678000195"];
let fornecedores: string[] = [];
let materialId = "";

async function semear(comRegra = true): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  const classe = await cadastrarClasseDeMaterial(prisma, { codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR });
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: POR });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, { codigo: "01", descricao: "Expediente", criadoPor: POR });
  materialId = (await cadastrarMaterial(prisma, { codigo: "M001", descricaoSucinta: "Resma de papel A4", descricaoDetalhada: "Papel A4", grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL", classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false, unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
  fornecedores = [];
  for (const [i, documento] of FORNECEDORES.entries()) {
    const id = (await prisma.pessoa.create({ data: { documento, tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;
    await prisma.versaoDePessoa.create({ data: { pessoaId: id, nome: `Fornecedor ${String(i + 1)} Ltda`, criadoPor: POR } });
    fornecedores.push(id);
  }
  const perfilVazio = await prisma.perfil.create({ data: { nome: "SEM_PODERES", descricao: "sem permissão", criadoPor: POR }, select: { id: true } });
  const estagiario = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR } });
  if (comRegra) {
    const r = regraDoTextoDaIn65(readFileSync(join(process.cwd(), "docs", "oficial", "compras", "in-seges-me-65-2021.txt"), "utf8"));
    await prisma.regraDaPesquisaDePrecos.create({ data: { minimoDePrecos: r.minimoDePrecos, vigenteDesde: r.vigenteDesde, fonte: "IN SEGES/ME nº 65/2021, art. 6º (texto oficial guardado)", criadoPor: "TESTE" } });
  }
}

type Origem = { parametro?: "FORNECEDORES"; dataDoPreco?: Date; documento?: string };
const cotacao = (i: number, valor: string, comOrigem = true) => ({
  fornecedorId: fornecedores[i] as string, valorUnitario: valor, origem: "proposta formal",
  ...(comOrigem ? { parametro: "FORNECEDORES" as const, dataDoPreco: new Date("2026-03-02T12:00:00Z"), documento: `Ofício de cotação ${String(i + 1)}/2026` } : {}),
});
async function pesquisa(valores: readonly string[], semOrigemNo = -1): Promise<string> {
  const { pesquisaId } = await registrarPesquisaDePrecos(prisma, {
    numero: "PP-001", objeto: "Aquisição de papel A4 para o exercício", data: new Date("2026-03-01T12:00:00Z"),
    itens: [{ materialId, quantidade: "500", cotacoes: valores.map((v, i) => cotacao(i, v, i !== semOrigemNo)) }], criadoPor: POR,
  });
  return (await prisma.itemDePesquisaDePrecos.findFirstOrThrow({ where: { pesquisaId }, select: { id: true } })).id;
}
/** Uma pesquisa com as cotações dadas e a data dada (para a vigência da regra). */
async function pesquisaCom(numero: string, data: Date, cotacoes: readonly (Origem & { valor: string })[]): Promise<string> {
  const { pesquisaId } = await registrarPesquisaDePrecos(prisma, {
    numero, objeto: "Aquisição de papel A4 para o exercício", data,
    itens: [{ materialId, quantidade: "500", cotacoes: cotacoes.map((c, i) => ({ fornecedorId: fornecedores[i] as string, valorUnitario: c.valor, origem: "proposta formal", ...(c.parametro === undefined ? {} : { parametro: c.parametro }), ...(c.dataDoPreco === undefined ? {} : { dataDoPreco: c.dataDoPreco }), ...(c.documento === undefined ? {} : { documento: c.documento }) })) }], criadoPor: POR,
  });
  return (await prisma.itemDePesquisaDePrecos.findFirstOrThrow({ where: { pesquisaId }, select: { id: true } })).id;
}
const DIA = new Date("2026-03-02T12:00:00Z");
const COMPLETA: Origem = { parametro: "FORNECEDORES", dataDoPreco: DIA, documento: "Ofício de cotação" };
const idDaCotacao = async (itemId: string, valor: string) => (await prisma.cotacaoDePreco.findFirstOrThrow({ where: { itemId, valorUnitario: valor }, select: { id: true } })).id;

describe("V39-R3 — preço estimado: método declarado, origem verificável, descartes com motivo, memória", { timeout: 60000 }, () => {
  beforeEach(async () => semear(), 60000);

  it("a regra lida do texto oficial guardado: três ou mais preços, vigente no dia civil da publicação (IN 65, arts. 6º e 11)", () => {
    const r = regraDoTextoDaIn65(readFileSync(join(process.cwd(), "docs", "oficial", "compras", "in-seges-me-65-2021.txt"), "utf8"));
    // à mão: a página diz "Publicado em 08/07/2021"; o início do dia civil do ente é 03:00 UTC (UTC-3 em 2021).
    expect([r.minimoDePrecos, diaCivil(r.vigenteDesde), r.vigenteDesde.toISOString()]).toEqual([3, "2021-07-08", "2021-07-08T03:00:00.000Z"]);
    // cada ausência recusa pelo SEU motivo
    const TITULO = "INSTRUÇÃO NORMATIVA SEGES/ME Nº 65, DE 7 DE JULHO DE 2021";
    const PUBLICADO = " Publicado em\n 08/07/2021 09h55";
    const FRASE = "Art. 6º Serão utilizados, como métodos, desde que o cálculo incida sobre um conjunto de três ou mais preços.";
    expect(() => regraDoTextoDaIn65([PUBLICADO, FRASE].join("\n"))).toThrow(/título da IN 65 não foi achado/);
    expect(() => regraDoTextoDaIn65([TITULO, FRASE].join("\n"))).toThrow(/data de publicação da IN 65 não foi achada/);
    expect(() => regraDoTextoDaIn65([TITULO, PUBLICADO].join("\n"))).toThrow(/frase do art\. 6º/);
    expect(regraDoTextoDaIn65([TITULO, PUBLICADO, FRASE].join("\n")).minimoDePrecos).toBe(3);
  });

  it("a estimativa da pesquisa: preço de 6 casas × quantidade, UM arredondamento no fim; item sem preço fixado não estima (N=2)", () => {
    const D = (x: string) => new Decimal(x);
    // à mão: 10,333333 × 500 = 5.166,6665 → 5.166,67 (e não 10,33 × 500 = 5.165,00); + 12 × 100 = 1.200 → 6.366,67
    const r = estimativaPeloFixado([{ quantidade: D("500"), fixado: D("10.333333") }, { quantidade: D("100"), fixado: D("12") }]);
    expect([r.total?.toFixed(2), r.semFixar]).toEqual(["6366.67", 0]);
    // à mão: 0,0049 × 100.000 = 490,00 (arredondar o preço a 2 casas daria zero)
    expect(estimativaPeloFixado([{ quantidade: D("100000"), fixado: D("0.0049") }]).total?.toFixed(2)).toBe("490.00");
    expect(estimativaPeloFixado([{ quantidade: D("500"), fixado: D("10") }, { quantidade: D("100"), fixado: null }])).toEqual({ total: null, semFixar: 1 });
  });

  it("o cálculo é um só, por método (N=4 e N=3)", () => {
    const d = (xs: string[]) => xs.map((x) => new Decimal(x));
    expect(["MEDIA", "MEDIANA", "MENOR"].map((m) => precoPeloMetodo(d(["40", "10", "14", "12"]), m as "MEDIA").toString())).toEqual(["19", "13", "10"]);
    expect(["MEDIA", "MEDIANA", "MENOR"].map((m) => precoPeloMetodo(d(["14", "10", "12"]), m as "MEDIA").toString())).toEqual(["12", "12", "10"]);
    // à mão: (10 + 10 + 11) / 3 = 10,3333...; 6 casas, meio para cima: 10,333333. (2,000001 + 2,000002) / 2 = 2,0000015 → 2,000002.
    expect(precoPeloMetodo(d(["10", "10", "11"]), "MEDIA").toString()).toBe("10.333333");
    expect(precoPeloMetodo(d(["2.000001", "2.000002"]), "MEDIANA").toString()).toBe("2.000002");
  });

  it("fixa pela mediana com o 40 descartado: guarda o método, os preços com parâmetro, dia e documento, e o descarte com o motivo", async () => {
    const itemId = await pesquisa(["10", "12", "14", "40"]);
    const c40 = await idDaCotacao(itemId, "40");
    const r = await fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIANA", descartes: [{ cotacaoId: c40, motivo: "Excessivamente elevado: quase o triplo dos demais preços" }], criadoPor: POR });
    expect([r.valorEstimado, r.precosUsados]).toEqual(["12.000000", 3]);
    const p = await prisma.precoEstimadoDoItem.findUniqueOrThrow({ where: { id: r.precoId }, select: { metodo: true, memoria: true, descartes: true, justificativaMenosPrecos: true, regra: { select: { minimoDePrecos: true } } } });
    const memoria = p.memoria as { valor: string; parametro: string; dataDoPreco: string; documento: string }[];
    expect(memoria.map((m) => [m.valor, m.parametro, m.dataDoPreco]).sort()).toEqual([["10", "FORNECEDORES", "2026-03-02"], ["12", "FORNECEDORES", "2026-03-02"], ["14", "FORNECEDORES", "2026-03-02"]]);
    expect(memoria.every((m) => m.documento.startsWith("Ofício de cotação"))).toBe(true);
    expect((p.descartes as { valor: string; motivo: string }[]).map((x) => [x.valor, x.motivo.slice(0, 22)])).toEqual([["40", "Excessivamente elevado"]]);
    expect([p.metodo, p.justificativaMenosPrecos, p.regra.minimoDePrecos]).toEqual(["MEDIANA", null, 3]);
    // fixar de novo, pela média sem descarte: vale o mais recente, e o anterior fica
    await fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", criadoPor: POR });
    const todos = await prisma.precoEstimadoDoItem.findMany({ where: { itemId }, orderBy: { criadoEm: "asc" }, select: { metodo: true, valorEstimado: true } });
    expect(todos.map((x) => [x.metodo, x.valorEstimado.toString()])).toEqual([["MEDIANA", "12"], ["MEDIA", "19"]]);
  });

  it("recusas com o motivo, sem gravar: preço sem origem verificável, menos de três sem justificativa, descarte sem motivo, sem permissão, sem regra", async () => {
    const itemId = await pesquisa(["10", "12", "14"], 1);
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", criadoPor: POR })).rejects.toThrow(/1 preço\(s\) do item M001 sem a origem verificável .*: Fornecedor 2 Ltda\. Complete-os/);
    const c12 = await idDaCotacao(itemId, "12");
    // descartado o sem origem, sobram dois: abaixo do mínimo da regra
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", descartes: [{ cotacaoId: c12, motivo: "Sem documento que o prove" }], criadoPor: POR })).rejects.toThrow(/usaria 2 preço\(s\), e a regra pede 3 ou mais/);
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", descartes: [{ cotacaoId: c12, motivo: "curto" }], criadoPor: POR })).rejects.toThrow(/precisa do motivo/);
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", descartes: [{ cotacaoId: c12, motivo: "Sem documento que o prove" }], criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para REGISTRAR_PESQUISA_DE_PRECOS/);
    expect(await prisma.precoEstimadoDoItem.count()).toBe(0);
    // justificativa curta: o motivo diz quantos caracteres faltam
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", descartes: [{ cotacaoId: c12, motivo: "Sem documento que o prove" }], justificativaMenosPrecos: "mercado pequeno", criadoPor: POR })).rejects.toThrow(/A justificativa tem 15 caractere\(s\); precisa de ao menos 20/);
    expect(await prisma.precoEstimadoDoItem.count()).toBe(0);
    // com a justificativa do gestor, dois preços passam, e ela fica gravada (a aprovação da autoridade, que o art. 6º,
    // § 5º também pede, NÃO é registrada pelo sistema: pendência nomeada no MODULO.md)
    const r = await fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", descartes: [{ cotacaoId: c12, motivo: "Sem documento que o prove" }], justificativaMenosPrecos: "Mercado local com dois fornecedores do item, conforme consulta registrada", criadoPor: POR });
    expect([r.valorEstimado, r.precosUsados]).toEqual(["12.000000", 2]);
  });

  it("sem a regra carregada, não se fixa (fail-closed)", async () => {
    await semear(false);
    const itemId = await pesquisa(["10", "12", "14"]);
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", criadoPor: POR })).rejects.toThrow(/Não há regra do número mínimo de preços vigente na data desta pesquisa/);
    expect(await prisma.precoEstimadoDoItem.count()).toBe(0);
  });

  it("a regra vale pela DATA DA PESQUISA: a de 07/07/2021 é anterior à publicação e não tem regra; a de 08/07/2021 tem", async () => {
    const antes = await pesquisaCom("PP-ANTES", new Date("2021-07-07T15:00:00Z"), [{ valor: "10", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }, { valor: "12", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }, { valor: "14", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }]);
    const no = await pesquisaCom("PP-NO-DIA", new Date("2021-07-08T15:00:00Z"), [{ valor: "10", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }, { valor: "12", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }, { valor: "14", ...COMPLETA, dataDoPreco: new Date("2021-07-01T12:00:00Z") }]);
    await expect(fixarPrecoEstimado(prisma, { itemId: antes, metodo: "MEDIA", criadoPor: POR })).rejects.toThrow(/vigente na data desta pesquisa/);
    expect((await fixarPrecoEstimado(prisma, { itemId: no, metodo: "MEDIA", criadoPor: POR })).valorEstimado).toBe("12.000000");
  });

  it("origem verificável é CADA um dos três: falta só o parâmetro, só o dia ou só o documento — cada caso recusa; dia futuro recusa", async () => {
    const casos: [string, Origem][] = [
      ["PP-SEM-PARAMETRO", { dataDoPreco: DIA, documento: "Ofício de cotação" }],
      ["PP-SEM-DIA", { parametro: "FORNECEDORES", documento: "Ofício de cotação" }],
      ["PP-SEM-DOCUMENTO", { parametro: "FORNECEDORES", dataDoPreco: DIA }],
    ];
    for (const [numero, falha] of casos) {
      const itemId = await pesquisaCom(numero, new Date("2026-03-01T12:00:00Z"), [{ valor: "10", ...COMPLETA }, { valor: "12", ...falha }, { valor: "14", ...COMPLETA }]);
      await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", criadoPor: POR }), numero).rejects.toThrow(/1 preço\(s\) do item M001 sem a origem verificável/);
    }
    // dia do preço 10/03; fixar em 05/03 recusa nomeando o dia; em 20/03 passa
    const itemId = await pesquisaCom("PP-FUTURO", new Date("2026-03-01T12:00:00Z"), [{ valor: "10", ...COMPLETA }, { valor: "12", ...COMPLETA, dataDoPreco: new Date("2026-03-10T12:00:00Z") }, { valor: "14", ...COMPLETA }]);
    await expect(fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", agora: new Date("2026-03-05T12:00:00Z"), criadoPor: POR })).rejects.toThrow(/1 preço\(s\) do item M001 com o dia do preço depois de hoje \(10\/03\/2026\)/);
    expect(await prisma.precoEstimadoDoItem.count()).toBe(0);
    expect((await fixarPrecoEstimado(prisma, { itemId, metodo: "MEDIA", agora: new Date("2026-03-20T12:00:00Z"), criadoPor: POR })).valorEstimado).toBe("12.000000");
  });
});
