import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes } from "../../lib/portas/opcoes-referenciadas.js";

/**
 * V37 — O RECEBIMENTO DA ORDEM DE COMPRA na entrada da liquidação, por busca. Antes era um campo de texto que pedia o
 * identificador interno do recebimento. O catálogo oferece só os itens recebidos da ordem DO EMPENHO escolhido, sem
 * entrada física prévia pelo almoxarifado e com quantidade a dar entrada; os dados sugerem a linha.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "seed-teste";

async function usuario(identificador: string, acoes: readonly AcaoDoSistema[]): Promise<Identidade> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: POR }, select: { id: true, identificador: true } });
  const perfil = await prisma.perfil.create({ data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: POR }, select: { id: true } });
  for (const acao of acoes) await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao, unidadeOrcId: null, criadoPor: POR } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
  return { usuarioId: u.id, identificador: u.identificador };
}

/** Um empenho gravado direto (sem o caminho do M05): aqui só a ORDEM a que ele aponta importa. */
async function empenho(id: string, ordemDeCompraId: string | null): Promise<void> {
  const l = await prisma.lancamentoContabil.create({
    data: { numeroControle: `T-${id}`, dataTransacao: new Date("2026-03-10T15:00:00Z"), historico: "fixture", origemTipo: "TESTE", criadoPor: POR },
    select: { id: true },
  });
  await prisma.empenho.create({
    data: {
      id, fichaId: "fic", numero: id, tipo: "ORDINARIO", valor: "1000.00", data: new Date("2026-03-10T15:00:00Z"), credorCpfCnpj: "11222333000181",
      historico: "fixture", categoriaOrdemCronologica: "FORNECIMENTO_BENS", lancamentoId: l.id, ordemDeCompraId, criadoPor: POR,
    },
  });
}

/** Uma ordem com os itens dados e UM recebimento de cada item; devolve os ids dos itens recebidos, na ordem. */
async function ordemRecebida(id: string, itens: readonly { readonly materialId: string; readonly quantidade: string; readonly unitario: string }[]): Promise<string[]> {
  await prisma.ordemDeCompra.create({ data: { id, numero: id, tipo: "ORDINARIA", fornecedorId: "pes", dataEmissao: new Date("2026-02-01T12:00:00Z"), finalidade: "Material de expediente.", criadoPor: POR } });
  const rec = await prisma.recebimentoDeOrdem.create({ data: { ordemId: id, data: new Date("2026-03-01T12:00:00Z"), responsavelRecebimento: "Almoxarife", notaFiscal: "1234", criadoPor: POR }, select: { id: true } });
  const ids: string[] = [];
  for (const it of itens) {
    const item = await prisma.itemDeOrdemDeCompra.create({ data: { ordemId: id, materialId: it.materialId, quantidade: it.quantidade, valorUnitario: it.unitario, criadoPor: POR }, select: { id: true } });
    ids.push((await prisma.recebimentoDeItem.create({ data: { recebimentoId: rec.id, itemDeOrdemId: item.id, quantidade: it.quantidade, criadoPor: POR }, select: { id: true } })).id);
  }
  return ids;
}

/** Uma entrada física no depósito, presa (ou não) a um recebimento. */
async function entradaFisica(materialId: string, quantidade: string, recebimentoDeItemId: string | null): Promise<string> {
  return (
    await prisma.movimentoFisicoDeEstoque.create({
      data: { materialId, depositoId: "dep", tipo: "ENTRADA", quantidade, valorUnitario: "2.500000", valorTotal: "0.00", dataMovimento: new Date("2026-03-05T15:00:00Z"), recebimentoDeItemId, motivo: "fixture", criadoPor: POR },
      select: { id: true },
    })
  ).id;
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.fichaOrcamentaria.create({
    data: { id: "fic", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fnt-500", exercicioFonte: 1, valorDotado: "0.00" },
  });
  // A mesma conta de estoque do teste de compras do M11 (1.1.5.6.1.01.00, material de consumo, do PCASP).
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  await prisma.classeDeMaterial.create({ data: { id: "cls", codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR } });
  await prisma.grupoDeMaterial.create({ data: { id: "grp", codigo: "01", descricao: "Expediente", criadoPor: POR } });
  const base = { grupoId: "grp", classeDeMaterialId: "cls", classificacao: "CONSUMO", categoria: "ESTOCAVEL", descricaoDetalhada: "-", criadoPor: POR } as const;
  await prisma.material.createMany({
    data: [
      { ...base, id: "mat-1", codigo: "M001", descricaoSucinta: "Resma de papel A4" },
      { ...base, id: "mat-2", codigo: "M002", descricaoSucinta: "Caneta esferográfica azul" },
    ],
  });
  await prisma.deposito.create({ data: { id: "dep", codigo: "ALM-01", nome: "Almoxarifado central", unidadeOrcId: "uo-01", criadoPor: POR } });
  await prisma.pessoa.create({ data: { id: "pes", documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR } });
});

describe("o catálogo dos recebimentos para a liquidação", () => {
  it("t1: só os recebimentos da ordem DO EMPENHO, com saldo e sem entrada física prévia (N=2); os dados sugerem a linha", async () => {
    const despesa = await usuario("v37.liquidante", ["CONSULTAR_DESPESA"]);
    const [papel, caneta, jaEntrou, esgotado] = await ordemRecebida("OC-A", [
      { materialId: "mat-1", quantidade: "100.0000", unitario: "2.500000" },
      { materialId: "mat-2", quantidade: "10.0000", unitario: "3.000000" },
      { materialId: "mat-1", quantidade: "5.0000", unitario: "2.500000" },
      { materialId: "mat-2", quantidade: "4.0000", unitario: "3.000000" },
    ]);
    const [deOutraOrdem] = await ordemRecebida("OC-B", [{ materialId: "mat-1", quantidade: "7.0000", unitario: "2.500000" }]);
    await empenho("emp-a", "OC-A");
    await empenho("emp-sem-ordem", null);
    // 60 da resma já entraram por liquidação: restam 40. A caneta "esgotada" teve as 4 consumidas.
    await entradaFisica("mat-1", "60.0000", papel!);
    await entradaFisica("mat-2", "4.0000", esgotado!);
    // O recebimento que JÁ deu entrada física pelo almoxarifado (M11) não se consome de novo.
    const previa = await entradaFisica("mat-1", "5.0000", null);
    await prisma.recebimentoDeItem.update({ where: { id: jaEntrou! }, data: { movimentoFisicoId: previa } });

    const buscar = (empenhoId: string, q = "", valor?: string) =>
      buscarOpcoes(despesa, "recebimentos-para-liquidacao", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: empenhoId === "" ? {} : { empenhoId } });

    const todos = await buscar("emp-a");
    expect(todos.opcoes.map((o) => o.valor)).toEqual([papel, caneta]);
    expect(todos.opcoes[0]?.rotulo).toBe("M001 — Resma de papel A4 · recebido em 01/03/2026 · restam 40");
    expect(todos.opcoes[0]?.detalhe).toBe("Ordem OC-A · nota fiscal 1234");
    // A sugestão da linha: o restante, o unitário da ordem e o valor (40 × 2,50), em texto decimal.
    expect(todos.opcoes[0]?.dados).toEqual({ materialId: "mat-1", classeDeMaterialId: "cls", quantidade: "40", valorUnitario: "2.50", valor: "100.00" });
    expect(todos.opcoes[1]?.dados).toEqual({ materialId: "mat-2", classeDeMaterialId: "cls", quantidade: "10", valorUnitario: "3.00", valor: "30.00" });
    expect((await buscar("emp-a", "caneta")).opcoes.map((o) => o.valor)).toEqual([caneta]);
    expect((await buscar("emp-a", "M001")).opcoes.map((o) => o.valor)).toEqual([papel]);
    // Sem empenho, ou empenho sem ordem: nada a oferecer.
    expect((await buscar("")).opcoes).toEqual([]);
    expect((await buscar("emp-sem-ordem")).opcoes).toEqual([]);
    // O recebimento de OUTRA ordem não se resolve pelo id no empenho desta (a volta de outra aba não o escolhe).
    expect((await buscar("emp-a", "", deOutraOrdem)).opcoes).toEqual([]);
    expect((await buscar("emp-a", "", caneta)).opcoes.map((o) => o.valor)).toEqual([caneta]);
  });

  it("t2: sem a leitura da despesa, a lista é recusada com o motivo", async () => {
    const compras = await usuario("v37.so-compras", ["CONSULTAR_LICITACOES"]);
    await expect(buscarOpcoes(compras, "recebimentos-para-liquidacao", { q: "", pagina: 1, contexto: { empenhoId: "qualquer" } })).rejects.toThrow(/não está no seu acesso/);
  });
});
