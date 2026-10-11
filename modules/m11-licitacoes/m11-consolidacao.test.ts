import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { emitirOrdemDeCompra, movimentarSolicitacaoDeCompra, registrarSolicitacaoDeCompra } from "./compras.js";
import { vincularSolicitacaoAOrdem } from "./compras-alocacao.js";
import { consolidarSolicitacoesNoProcesso, origemDosItensDoProcesso, solicitacoesConsolidaveis } from "./consolidacao.js";
import { cadastrarItemDoProcesso } from "./resultado-da-licitacao.js";
import { cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida } from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";
import { reservarDotacao } from "../m05-despesa/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";

/**
 * V39-R3 (R3-019, V39-039) — AS SOLICITAÇÕES CONSOLIDADAS NO PROCESSO.
 *
 * N=2 solicitações de DOIS setores, com materiais em comum (aritmética à mão):
 *   SC-001 (Protocolo): papel 10, toner 4      SC-002 (Saúde): papel 6, toner 3
 *   item 1 do processo: papel 16 = 10 + 6       item 2: toner 7 = 4 + 3
 * Cada parcela guarda a solicitação e o setor. A reserva do processo não muda.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
let papel = "";
let toner = "";
let processoId = "";
let fornecedor = "";
let unidadeUN = "";
let base = {} as Omit<Parameters<typeof cadastrarMaterial>[1], "codigo" | "descricaoSucinta" | "descricaoDetalhada">;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.setor.createMany({ data: [{ id: "set-01", codigo: "S01", nome: "Protocolo", unidadeOrcId: "uo-01", criadoPor: POR }, { id: "set-02", codigo: "S02", nome: "Saúde", unidadeOrcId: "uo-01", criadoPor: POR }] });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, { id: "ficha-30", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fnt-500", valorDotado: "500000.00" });
  const perfilVazio = await prisma.perfil.create({ data: { nome: "SEM_PODERES", descricao: "sem permissão", criadoPor: POR }, select: { id: true } });
  const estagiario = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR } });
  const classe = await cadastrarClasseDeMaterial(prisma, { codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR });
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: POR });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, { codigo: "01", descricao: "Expediente", criadoPor: POR });
  unidadeUN = unidadeDeMedidaId;
  base = { grupoId, classificacao: "CONSUMO" as const, categoria: "ESTOCAVEL" as const, classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false, unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR };
  papel = (await cadastrarMaterial(prisma, { codigo: "M001", descricaoSucinta: "Resma de papel A4", descricaoDetalhada: "Papel A4", ...base })).materialId;
  toner = (await cadastrarMaterial(prisma, { codigo: "M002", descricaoSucinta: "Toner preto", descricaoDetalhada: "Toner", ...base })).materialId;
  fornecedor = (await prisma.pessoa.create({ data: { documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;
  processoId = (await prisma.processoLicitatorio.create({ data: { numeroProcesso: "PE-7/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Material de expediente", valorLicitado: "10000.00", criadoPor: POR }, select: { id: true } })).id;
}

async function solicitacao(numero: string, setorId: string, qPapel: string, qToner: string, autorizar = true): Promise<string> {
  const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, {
    numero, setorId, data: new Date("2026-03-01T12:00:00Z"), justificativa: "reposição do estoque do setor", solicitante: "Chefia do setor",
    itens: [{ materialId: papel, quantidade: qPapel }, { materialId: toner, quantidade: qToner }], criadoPor: POR,
  });
  if (autorizar) await movimentarSolicitacaoDeCompra(prisma, { solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-02T12:00:00Z"), motivo: "autorizada pela chefia", criadoPor: POR });
  return solicitacaoId;
}

beforeEach(semear, 60000);

describe("V39-R3 — solicitações consolidadas no processo licitatório", { timeout: 60000 }, () => {
  it("N=2 solicitações de dois setores viram um item por material, com a quantidade somada e cada parcela com a solicitação e o setor", async () => {
    const a = await solicitacao("SC-001", "set-01", "10", "4");
    const b = await solicitacao("SC-002", "set-02", "6", "3");
    expect((await solicitacoesConsolidaveis(prisma)).map((s) => `${s.numero} ${s.setor} ${String(s.itens)}`)).toEqual(["SC-001 Protocolo 2", "SC-002 Saúde 2"]);
    const r = await consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a, b], criadoPor: POR });
    expect([r.itens, r.parcelas]).toEqual([2, 4]);
    const itens = await prisma.itemDoProcesso.findMany({ where: { processoId }, orderBy: { numero: "asc" }, select: { id: true, numero: true, descricao: true, unidade: true, quantidade: true, materialId: true } });
    expect(itens.map((i) => [i.numero, i.descricao, i.unidade, i.quantidade.toString(), i.materialId])).toEqual([
      [1, "Resma de papel A4", "UN", "16", papel],
      [2, "Toner preto", "UN", "7", toner],
    ]);
    const origem = await origemDosItensDoProcesso(prisma, processoId);
    expect(origem.get(itens[0]!.id)?.map((x) => `${x.solicitacao} ${x.setor} ${x.quantidade}`).sort()).toEqual(["SC-001 Protocolo 10", "SC-002 Saúde 6"]);
    expect(origem.get(itens[1]!.id)?.map((x) => `${x.solicitacao} ${x.setor} ${x.quantidade}`).sort()).toEqual(["SC-001 Protocolo 4", "SC-002 Saúde 3"]);
    // consolidadas inteiras: não aparecem mais para consolidar
    expect(await solicitacoesConsolidaveis(prisma)).toEqual([]);
  });

  it("consolidar não toca a reserva: a do processo continua uma só, com o mesmo valor", async () => {
    await reservarDotacao({ fichaId: "ficha-30", valor: "5000.00", historico: "Reserva do pregão PE-7/2026", processoId, criadoPor: POR }, criarM05Deps(prisma));
    const antes = await prisma.reservaDotacao.findMany({ select: { id: true, valor: true, processoId: true } });
    const a = await solicitacao("SC-001", "set-01", "10", "4");
    await consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: POR });
    const depois = await prisma.reservaDotacao.findMany({ select: { id: true, valor: true, processoId: true } });
    expect(depois.map((x) => [x.id, x.valor.toFixed(2), x.processoId])).toEqual(antes.map((x) => [x.id, x.valor.toFixed(2), x.processoId]));
  });

  it("recusas com o motivo, sem gravar: solicitação pendente, processo já com itens, solicitação já consolidada, sem permissão", async () => {
    const pendente = await solicitacao("SC-009", "set-01", "1", "1", false);
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [pendente], criadoPor: POR })).rejects.toThrow(/SC-009 está pendente de autorização/);
    const a = await solicitacao("SC-001", "set-01", "10", "4");
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para CADASTRAR_PROCESSO/);
    expect(await prisma.itemDoProcesso.count()).toBe(0);
    await consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: POR });
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: POR })).rejects.toThrow(/já tem itens/);
    const outro = (await prisma.processoLicitatorio.create({ data: { numeroProcesso: "PE-8/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Outro", valorLicitado: "1000.00", criadoPor: POR }, select: { id: true } })).id;
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId: outro, solicitacaoIds: [a], criadoPor: POR })).rejects.toThrow(/não têm o que consolidar: já estão inteiras em processo ou em ordem de compra/);
    // o processo com item digitado também não recebe consolidação
    const terceiro = (await prisma.processoLicitatorio.create({ data: { numeroProcesso: "PE-9/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Terceiro", valorLicitado: "1000.00", criadoPor: POR }, select: { id: true } })).id;
    await cadastrarItemDoProcesso(prisma, { processoId: terceiro, numero: 1, descricao: "Item digitado", unidade: "UN", quantidade: "1", criadoPor: POR });
    const b = await solicitacao("SC-002", "set-02", "6", "3");
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId: terceiro, solicitacaoIds: [b], criadoPor: POR })).rejects.toThrow(/PE-9\/2026 já tem itens/);
    expect(await prisma.alocacaoDeSolicitacaoNoProcesso.count()).toBe(2);
  });

  it("a mesma necessidade não se compra pelos dois caminhos: o que está em ordem não vai ao processo, e o que foi ao processo não vai à ordem", async () => {
    const a = await solicitacao("SC-001", "set-01", "10", "4");
    const itens = await prisma.itemDeSolicitacaoDeCompra.findMany({ where: { solicitacaoId: a }, select: { id: true, materialId: true } });
    const itemPapel = itens.find((i) => i.materialId === papel)!.id;
    const itemToner = itens.find((i) => i.materialId === toner)!.id;
    // ordem antes: 4 do papel já em ordem viva — no processo vão os 6 que restam (e o toner inteiro)
    await emitirOrdemDeCompra(prisma, {
      numero: "OC-1", tipo: "ORDINARIA", fornecedorId: fornecedor, dataEmissao: new Date("2026-03-10T12:00:00Z"), finalidade: "Parte do papel", fichaId: "ficha-30",
      itens: [{ materialId: papel, quantidade: "4", valorUnitario: "11.00" }], origem: [{ itemIndex: 0, itemDeSolicitacaoId: itemPapel, quantidade: "4" }], criadoPor: POR,
    });
    await consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: POR });
    const q = await prisma.itemDoProcesso.findMany({ where: { processoId }, orderBy: { numero: "asc" }, select: { quantidade: true, materialId: true } });
    expect(q.map((x) => [x.materialId, x.quantidade.toString()])).toEqual([[papel, "6"], [toner, "4"]]);
    // processo depois: o que foi ao processo não vai mais à ordem
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-2", tipo: "ORDINARIA", fornecedorId: fornecedor, dataEmissao: new Date("2026-03-11T12:00:00Z"), finalidade: "Toner", fichaId: "ficha-30",
      itens: [{ materialId: toner, quantidade: "1", valorUnitario: "50.00" }], criadoPor: POR,
    });
    const itemDaOrdem = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({ where: { ordemId }, select: { id: true } });
    await expect(vincularSolicitacaoAOrdem(prisma, { ordemId, alocacoes: [{ itemDeSolicitacaoId: itemToner, itemDeOrdemId: itemDaOrdem.id, quantidade: "1" }], criadoPor: POR }))
      .rejects.toThrow(/já tem 4\.0000 consolidado\(s\) em processo licitatório; restam 0\.0000 para ordem/);
    // e a solicitação inteira já comprometida não volta a ser consolidável
    expect(await solicitacoesConsolidaveis(prisma)).toEqual([]);
  });

  it("solicitação consolidada não se anula: o processo licitaria o que ninguém pede", async () => {
    const a = await solicitacao("SC-001", "set-01", "10", "4");
    await consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [a], criadoPor: POR });
    await expect(movimentarSolicitacaoDeCompra(prisma, { solicitacaoId: a, tipo: "ANULACAO", data: new Date("2026-03-05T12:00:00Z"), motivo: "desistência do setor", criadoPor: POR }))
      .rejects.toThrow(/já foi consolidada no processo PE-7\/2026/);
    expect(await prisma.movimentoDaSolicitacao.count({ where: { solicitacaoId: a, tipo: "ANULACAO" } })).toBe(0);
  });

  it("material com mais de uma unidade: a solicitação não diz em qual pediu, e a consolidação recusa em vez de presumir", async () => {
    const { unidadeDeMedidaId: cx } = await cadastrarUnidadeDeMedida(prisma, { sigla: "CX", descricao: "Caixa", criadoPor: POR });
    const caneta = (await cadastrarMaterial(prisma, { ...base, codigo: "M003", descricaoSucinta: "Caneta azul", descricaoDetalhada: "Caneta", unidades: [{ unidadeDeMedidaId: unidadeUN, fatorParaEstoque: "1", ehDeEstoque: true }, { unidadeDeMedidaId: cx, fatorParaEstoque: "12", ehDeEstoque: false }] })).materialId;
    const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, { numero: "SC-CX", setorId: "set-01", data: new Date("2026-03-01T12:00:00Z"), justificativa: "canetas para o setor", solicitante: "Chefia", itens: [{ materialId: caneta, quantidade: "5" }], criadoPor: POR });
    await movimentarSolicitacaoDeCompra(prisma, { solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-02T12:00:00Z"), motivo: "autorizada pela chefia", criadoPor: POR });
    await expect(consolidarSolicitacoesNoProcesso(prisma, { processoId, solicitacaoIds: [solicitacaoId], criadoPor: POR })).rejects.toThrow(/M003 tem mais de uma unidade cadastrada/);
    expect(await prisma.itemDoProcesso.count()).toBe(0);
  });
});
