import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  emitirOrdemDeCompra,
  estornarOrdemDeCompra,
  movimentarSolicitacaoDeCompra,
  registrarRecebimentoDeOrdem,
  registrarSolicitacaoDeCompra,
  situacaoDaSolicitacao,
} from "./compras.js";
import {
  atendimentoDaSolicitacao,
  desfazerVinculoDaSolicitacao,
  origemDaOrdem,
  vincularSolicitacaoAOrdem,
} from "./compras-alocacao.js";
import { cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida } from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";

/**
 * ═══ V6 P1.1 — O VÍNCULO SOLICITAÇÃO × ORDEM ═══
 * Solicitação atendida por mais de uma ordem; ordem atendendo mais de uma solicitação; ordenado ≠
 * recebido ≠ cancelado ≠ pendente, todos derivados; controles nomeados; N=2 na concorrência.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
let papel: string;
let toner: string;
let setorId: string;
let fornecedor: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.setor.create({ data: { id: "set-01", codigo: "S01", nome: "Compras", unidadeOrcId: "uo-01", criadoPor: POR } });
  setorId = "set-01";
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: "ficha-30", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-30", fonteId: "fnt-500", valorDotado: "500000.00",
  });
  const perfilVazio = await prisma.perfil.create({ data: { nome: "SEM_PODERES", descricao: "sem permissão", criadoPor: POR }, select: { id: true } });
  const estagiario = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR } });

  const classe = await cadastrarClasseDeMaterial(prisma, { codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR });
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: POR });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, { codigo: "01", descricao: "Expediente", criadoPor: POR });
  const base = { grupoId, classificacao: "CONSUMO" as const, categoria: "ESTOCAVEL" as const, classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false, unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR };
  papel = (await cadastrarMaterial(prisma, { codigo: "M001", descricaoSucinta: "Resma de papel A4", descricaoDetalhada: "Papel A4", ...base })).materialId;
  toner = (await cadastrarMaterial(prisma, { codigo: "M002", descricaoSucinta: "Toner preto", descricaoDetalhada: "Toner", ...base })).materialId;
  fornecedor = (await prisma.pessoa.create({ data: { documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;
}

async function solicitacaoAutorizada(numero = "SC-001"): Promise<{ readonly id: string; readonly itemPapel: string; readonly itemToner: string }> {
  const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, {
    numero, setorId, data: new Date("2026-03-01T12:00:00Z"), justificativa: "reposição do estoque do protocolo",
    solicitante: "Chefe do protocolo", itens: [{ materialId: papel, quantidade: "10" }, { materialId: toner, quantidade: "4" }], criadoPor: POR,
  });
  await movimentarSolicitacaoDeCompra(prisma, { solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-02T12:00:00Z"), motivo: "autorizada pela chefia", criadoPor: POR });
  const itens = await prisma.itemDeSolicitacaoDeCompra.findMany({ where: { solicitacaoId }, orderBy: { criadoEm: "asc" }, select: { id: true, materialId: true } });
  return { id: solicitacaoId, itemPapel: itens.find((i) => i.materialId === papel)?.id ?? "", itemToner: itens.find((i) => i.materialId === toner)?.id ?? "" };
}

async function ordemSimples(numero: string, quantidadePapel: string, fichaId: string | undefined = "ficha-30"): Promise<{ readonly ordemId: string; readonly itemId: string }> {
  const { ordemId } = await emitirOrdemDeCompra(prisma, {
    numero, tipo: "ORDINARIA", fornecedorId: fornecedor, dataEmissao: new Date("2026-03-10T12:00:00Z"), finalidade: "Aquisição de papel",
    ...(fichaId !== undefined ? { fichaId } : {}), itens: [{ materialId: papel, quantidade: quantidadePapel, valorUnitario: "11.00" }], criadoPor: POR,
  });
  const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({ where: { ordemId }, select: { id: true } });
  return { ordemId, itemId: item.id };
}

beforeEach(semear);

describe("V6 P1.1 · solicitação × ordem por item e quantidade", () => {
  it("t1: ordem FORMADA a partir da solicitação — atendimento parcial de um item e integral do outro; a origem da ordem aponta de volta", async () => {
    const s = await solicitacaoAutorizada();
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-001", tipo: "ORDINARIA", fornecedorId: fornecedor, dataEmissao: new Date("2026-03-10T12:00:00Z"), finalidade: "Atende a SC-001", fichaId: "ficha-30",
      itens: [{ materialId: papel, quantidade: "6", valorUnitario: "11.00" }, { materialId: toner, quantidade: "4", valorUnitario: "90.00" }],
      origem: [{ itemIndex: 0, itemDeSolicitacaoId: s.itemPapel, quantidade: "6" }, { itemIndex: 1, itemDeSolicitacaoId: s.itemToner, quantidade: "4" }],
      criadoPor: POR,
    });
    const at = await atendimentoDaSolicitacao(prisma, s.id);
    const p = at.find((x) => x.materialCodigo === "M001");
    const t = at.find((x) => x.materialCodigo === "M002");
    expect(p?.solicitado.toFixed(4)).toBe("10.0000");
    expect(p?.ordenado.toFixed(4)).toBe("6.0000");
    expect(p?.recebido.toFixed(4)).toBe("0.0000");
    expect(p?.pendente.toFixed(4)).toBe("4.0000");
    expect(t?.ordenado.toFixed(4)).toBe("4.0000");
    expect(t?.pendente.toFixed(4)).toBe("0.0000");
    expect(p?.parcelas.map((x) => [x.ordemNumero, x.quantidade.toFixed(4), x.situacao])).toEqual([["OC-001", "6.0000", "VIVA"]]);

    const origem = await origemDaOrdem(prisma, ordemId);
    expect(origem.map((o) => [o.materialCodigo, o.parcelas.map((x) => x.solicitacaoNumero), o.semOrigem.toFixed(4)])).toEqual([
      ["M001", ["SC-001"], "0.0000"],
      ["M002", ["SC-001"], "0.0000"],
    ]);
  });

  it("t2: solicitação PENDENTE não se liga — e como a origem vai na MESMA transação, a ordem também não nasce", async () => {
    const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, {
      numero: "SC-P", setorId, data: new Date("2026-03-01T12:00:00Z"), justificativa: "pedido ainda sem autorização", solicitante: "Chefe do protocolo",
      itens: [{ materialId: papel, quantidade: "10" }], criadoPor: POR,
    });
    const item = await prisma.itemDeSolicitacaoDeCompra.findFirstOrThrow({ where: { solicitacaoId }, select: { id: true } });
    await expect(
      emitirOrdemDeCompra(prisma, {
        numero: "OC-P", tipo: "ORDINARIA", fornecedorId: fornecedor, dataEmissao: new Date("2026-03-10T12:00:00Z"), finalidade: "Tenta atender pendente",
        itens: [{ materialId: papel, quantidade: "5", valorUnitario: "11.00" }], origem: [{ itemIndex: 0, itemDeSolicitacaoId: item.id, quantidade: "5" }], criadoPor: POR,
      })
    ).rejects.toThrow(/está PENDENTE: só a AUTORIZADA/);
    expect(await prisma.ordemDeCompra.count()).toBe(0);
    expect(await prisma.alocacaoDeSolicitacaoNaOrdem.count()).toBe(0);
  });

  it("t3: item incompatível (materiais diferentes) é recusado nomeando os dois lados", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-003", "6");
    await expect(
      vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemToner, itemDeOrdemId: o.itemId, quantidade: "1" }], criadoPor: POR })
    ).rejects.toThrow(/Item incompatível.*M002/);
    expect(await prisma.alocacaoDeSolicitacaoNaOrdem.count()).toBe(0);
  });

  it("t4: EXCESSO — alocar além do pedido (ou além da linha da ordem) é recusado dizendo quanto resta", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-004", "20");
    await expect(
      vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "11" }], criadoPor: POR })
    ).rejects.toThrow(/EXCESSO.*Restam 10\.0000/);
    // dentro do pedido, mas além da linha da ordem
    const pequena = await ordemSimples("OC-004b", "3");
    await expect(
      vincularSolicitacaoAOrdem(prisma, { ordemId: pequena.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: pequena.itemId, quantidade: "4" }], criadoPor: POR })
    ).rejects.toThrow(/passaria do que a ordem compra/);
    expect(await prisma.alocacaoDeSolicitacaoNaOrdem.count()).toBe(0);
  });

  it("t5 (N=2): DUAS ordens concorrentes disputando o mesmo saldo — exatamente uma passa", async () => {
    const s = await solicitacaoAutorizada();
    const a = await ordemSimples("OC-005a", "6");
    const b = await ordemSimples("OC-005b", "6");
    const r = await Promise.allSettled([
      vincularSolicitacaoAOrdem(prisma, { ordemId: a.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: a.itemId, quantidade: "6" }], criadoPor: POR }),
      vincularSolicitacaoAOrdem(prisma, { ordemId: b.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: b.itemId, quantidade: "6" }], criadoPor: POR }),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled");
    const falhas = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(String(falhas[0]?.reason)).toMatch(/EXCESSO/);
    const at = await atendimentoDaSolicitacao(prisma, s.id);
    expect(at.find((x) => x.materialCodigo === "M001")?.ordenado.toFixed(4)).toBe("6.0000");
  });

  it("t6: desfazer devolve o pendente; desfazer duas vezes recusa; desfazer parcela com recebimento atribuído recusa", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-006", "10");
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "10" }], criadoPor: POR });
    const alocacao = await prisma.alocacaoDeSolicitacaoNaOrdem.findFirstOrThrow({ select: { id: true } });
    await desfazerVinculoDaSolicitacao(prisma, { alocacaoId: alocacao.id, motivo: "ordem vai atender outro setor", criadoPor: POR });
    let at = await atendimentoDaSolicitacao(prisma, s.id);
    let p = at.find((x) => x.materialCodigo === "M001");
    expect(p?.ordenado.toFixed(4)).toBe("0.0000");
    expect(p?.cancelado.toFixed(4)).toBe("10.0000");
    expect(p?.pendente.toFixed(4)).toBe("10.0000");
    expect(p?.parcelas[0]?.situacao).toBe("DESFEITA");
    expect(p?.parcelas[0]?.motivo).toBe("ordem vai atender outro setor");
    await expect(desfazerVinculoDaSolicitacao(prisma, { alocacaoId: alocacao.id, motivo: "de novo", criadoPor: POR })).rejects.toThrow(/já foi desfeita/);

    // religa, recebe, e aí não desfaz mais
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "10" }], criadoPor: POR });
    await registrarRecebimentoDeOrdem(prisma, { ordemId: o.ordemId, data: new Date("2026-03-20T12:00:00Z"), responsavelRecebimento: "Almoxarife", itens: [{ itemDeOrdemId: o.itemId, quantidade: "3" }], criadoPor: POR });
    const viva = await prisma.alocacaoDeSolicitacaoNaOrdem.findFirstOrThrow({ where: { estornoDeId: null, estorno: null }, select: { id: true } });
    await expect(desfazerVinculoDaSolicitacao(prisma, { alocacaoId: viva.id, motivo: "tenta desfazer entregue", criadoPor: POR })).rejects.toThrow(/já tem 3\.0000 recebido/);
    at = await atendimentoDaSolicitacao(prisma, s.id);
    p = at.find((x) => x.materialCodigo === "M001");
    expect(p?.recebido.toFixed(4)).toBe("3.0000");
  });

  it("t7: uma ordem atende DUAS solicitações; o recebido é atribuído por ordem de alocação (a primeira alocada é a primeira servida)", async () => {
    const s1 = await solicitacaoAutorizada("SC-A");
    const s2 = await solicitacaoAutorizada("SC-B");
    const o = await ordemSimples("OC-007", "10");
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s1.itemPapel, itemDeOrdemId: o.itemId, quantidade: "6" }], criadoPor: POR });
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s2.itemPapel, itemDeOrdemId: o.itemId, quantidade: "4" }], criadoPor: POR });
    await registrarRecebimentoDeOrdem(prisma, { ordemId: o.ordemId, data: new Date("2026-03-20T12:00:00Z"), responsavelRecebimento: "Almoxarife", itens: [{ itemDeOrdemId: o.itemId, quantidade: "7" }], criadoPor: POR });
    const a1 = (await atendimentoDaSolicitacao(prisma, s1.id)).find((x) => x.materialCodigo === "M001");
    const a2 = (await atendimentoDaSolicitacao(prisma, s2.id)).find((x) => x.materialCodigo === "M001");
    expect(a1?.recebido.toFixed(4)).toBe("6.0000");
    expect(a2?.recebido.toFixed(4)).toBe("1.0000");
    expect(a2?.ordenado.toFixed(4)).toBe("4.0000");
    const origem = await origemDaOrdem(prisma, o.ordemId);
    expect(origem[0]?.parcelas.map((p) => [p.solicitacaoNumero, p.quantidade.toFixed(4), p.recebido.toFixed(4)])).toEqual([["SC-A", "6.0000", "6.0000"], ["SC-B", "4.0000", "1.0000"]]);
    expect(origem[0]?.semOrigem.toFixed(4)).toBe("0.0000");
  });

  it("t8: o ESTORNO da ordem é fato — as parcelas viram ORDEM_ESTORNADA (canceladas), o pendente volta, a solicitação continua AUTORIZADA e o histórico diz o que houve", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-008", "6");
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "6" }], criadoPor: POR });
    await estornarOrdemDeCompra(prisma, { ordemId: o.ordemId, motivo: "fornecedor desistiu", criadoPor: POR });
    const p = (await atendimentoDaSolicitacao(prisma, s.id)).find((x) => x.materialCodigo === "M001");
    expect(p?.ordenado.toFixed(4)).toBe("0.0000");
    expect(p?.cancelado.toFixed(4)).toBe("6.0000");
    expect(p?.pendente.toFixed(4)).toBe("10.0000");
    expect(p?.parcelas[0]?.situacao).toBe("ORDEM_ESTORNADA");
    expect(await situacaoDaSolicitacao(prisma, s.id)).toBe("AUTORIZADA");
    const mov = await prisma.movimentoDaSolicitacao.findMany({ where: { solicitacaoId: s.id, tipo: "ORDEM_ESTORNADA" }, select: { motivo: true } });
    expect(mov).toHaveLength(1);
    expect(mov[0]?.motivo).toMatch(/Ordem OC-008 estornada.*M001: 6\.0000/);
    // nenhuma linha foi apagada
    expect(await prisma.ordemDeCompra.count({ where: { id: o.ordemId } })).toBe(1);
    expect(await prisma.alocacaoDeSolicitacaoNaOrdem.count()).toBe(1);
    // e a ordem estornada não recebe vínculo novo
    await expect(
      vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "1" }], criadoPor: POR })
    ).rejects.toThrow(/ESTORNADA/);
  });

  it("t9: anular uma solicitação com parcelas VIVAS é recusado nomeando as ordens; depois de desfazer, anula", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-009", "6");
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "6" }], criadoPor: POR });
    await expect(
      movimentarSolicitacaoDeCompra(prisma, { solicitacaoId: s.id, tipo: "ANULACAO", data: new Date("2026-03-15T12:00:00Z"), motivo: "desistência", criadoPor: POR })
    ).rejects.toThrow(/ligada\(s\) a ordem\(ns\) viva\(s\) \(OC-009\)/);
    const a = await prisma.alocacaoDeSolicitacaoNaOrdem.findFirstOrThrow({ select: { id: true } });
    await desfazerVinculoDaSolicitacao(prisma, { alocacaoId: a.id, motivo: "vai ser anulada", criadoPor: POR });
    await movimentarSolicitacaoDeCompra(prisma, { solicitacaoId: s.id, tipo: "ANULACAO", data: new Date("2026-03-15T12:00:00Z"), motivo: "desistência", criadoPor: POR });
    expect(await situacaoDaSolicitacao(prisma, s.id)).toBe("ANULADA");
  });

  it("t10: a autorização é do servidor — sem EMITIR_ORDEM_DE_COMPRA não vincula; sem ESTORNAR não desfaz", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-010", "6");
    await expect(
      vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "6" }], criadoPor: SEM_PERMISSAO })
    ).rejects.toThrow(/EMITIR_ORDEM_DE_COMPRA/);
    await vincularSolicitacaoAOrdem(prisma, { ordemId: o.ordemId, alocacoes: [{ itemDeSolicitacaoId: s.itemPapel, itemDeOrdemId: o.itemId, quantidade: "6" }], criadoPor: POR });
    const a = await prisma.alocacaoDeSolicitacaoNaOrdem.findFirstOrThrow({ select: { id: true } });
    await expect(desfazerVinculoDaSolicitacao(prisma, { alocacaoId: a.id, motivo: "sem poder", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/ESTORNAR_ORDEM_DE_COMPRA/);
    expect(await prisma.alocacaoDeSolicitacaoNaOrdem.count()).toBe(1);
  });

  it("t11: LEGADO — ordem sem vínculo é 'sem origem' e NUNCA casa sozinha com a solicitação do mesmo material", async () => {
    const s = await solicitacaoAutorizada();
    const o = await ordemSimples("OC-011", "10");
    const origem = await origemDaOrdem(prisma, o.ordemId);
    expect(origem[0]?.parcelas).toHaveLength(0);
    expect(origem[0]?.semOrigem.toFixed(4)).toBe("10.0000");
    const p = (await atendimentoDaSolicitacao(prisma, s.id)).find((x) => x.materialCodigo === "M001");
    expect(p?.ordenado.toFixed(4)).toBe("0.0000");
    expect(p?.pendente.toFixed(4)).toBe("10.0000");
  });
});
