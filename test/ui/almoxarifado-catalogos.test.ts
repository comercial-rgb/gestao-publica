import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes } from "../../lib/portas/opcoes-referenciadas.js";
import { listarRoteirosDoAlmoxarifadoDoMolde } from "../../lib/portas/recursos/roteiros-dados.js";
import { ROTEIROS_DO_ALMOXARIFADO, ROTULO_DO_MOVIMENTO_DO_ALMOXARIFADO } from "../../lib/portas/recursos/roteiros.js";
import { lerConsulta } from "../../lib/molde/consulta.js";
import { TIPOS_DO_ROTEIRO_ALMOXARIFADO } from "../../modules/m10-patrimonial/roteiros.js";

/**
 * V37 — O MATERIAL E O LOTE NO ALMOXARIFADO, por busca. O material do bloqueio, da requisição e da contagem era um
 * `select` com os 1.000 primeiros por código; o lote da saída da requisição e o da contagem do inventário nasciam
 * VAZIOS (a página não sabia o material), e material controlado por lote não se atendia pela tela.
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

const valores = (s: Identidade, catalogo: string, contexto: Record<string, string>, q = "", valor?: string): Promise<string[]> =>
  buscarOpcoes(s, catalogo, { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto }).then((r) => r.opcoes.map((o) => o.valor));

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" } });
  // Conta de estoque do PCASP (1.1.5.6.1.01.00, material de consumo), a mesma dos testes do M11.
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  await prisma.classeDeMaterial.create({ data: { id: "cls", codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR } });
  await prisma.grupoDeMaterial.create({ data: { id: "grp", codigo: "01", descricao: "Expediente", criadoPor: POR } });
  const base = { grupoId: "grp", classeDeMaterialId: "cls", classificacao: "CONSUMO", categoria: "ESTOCAVEL", descricaoDetalhada: "-", criadoPor: POR } as const;
  await prisma.material.createMany({
    data: [
      { ...base, id: "mat-1", codigo: "M001", descricaoSucinta: "Vacina antigripal", controlaLote: true },
      { ...base, id: "mat-2", codigo: "M002", descricaoSucinta: "Seringa descartável", controlaLote: true },
      { ...base, id: "mat-3", codigo: "M003", descricaoSucinta: "Vacina antiga (desativada)", ativo: false },
    ],
  });
  await prisma.deposito.createMany({
    data: [
      { id: "dep-a", codigo: "ALM-A", nome: "Almoxarifado A", unidadeOrcId: "uo-01", criadoPor: POR },
      { id: "dep-b", codigo: "ALM-B", nome: "Almoxarifado B", unidadeOrcId: "uo-01", criadoPor: POR },
    ],
  });
  // A validade como o caminho real grava (meio-dia civil, `meioDiaCivil`). N=2 lotes da vacina no depósito A, um dela no B, um da seringa no A.
  await prisma.loteDeMaterial.createMany({
    data: [
      { id: "lot-a2", materialId: "mat-1", depositoId: "dep-a", identificacao: "L-200", validade: new Date("2027-06-30T15:00:00Z"), criadoPor: POR },
      { id: "lot-a1", materialId: "mat-1", depositoId: "dep-a", identificacao: "L-100", validade: new Date("2027-01-31T15:00:00Z"), criadoPor: POR },
      { id: "lot-b1", materialId: "mat-1", depositoId: "dep-b", identificacao: "L-900", validade: null, criadoPor: POR },
      { id: "lot-sa", materialId: "mat-2", depositoId: "dep-a", identificacao: "S-1", validade: null, criadoPor: POR },
    ],
  });
  await prisma.setor.create({ data: { id: "set", codigo: "S01", nome: "Posto de saúde", unidadeOrcId: "uo-01", criadoPor: POR } });
  await prisma.requisicaoDeMaterial.create({ data: { id: "req-a", numero: "REQ-1", depositoId: "dep-a", setorId: "set", dataRequisicao: new Date("2026-03-10T15:00:00Z"), solicitante: "Enfermeira", criadoPor: POR } });
  await prisma.itemDeRequisicaoDeMaterial.createMany({
    data: [
      { id: "it-vacina", requisicaoId: "req-a", materialId: "mat-1", quantidadeSolicitada: "10.0000", criadoPor: POR },
      { id: "it-seringa", requisicaoId: "req-a", materialId: "mat-2", quantidadeSolicitada: "10.0000", criadoPor: POR },
    ],
  });
  await prisma.inventarioDeEstoque.create({ data: { id: "inv-b", depositoId: "dep-b", dataAbertura: new Date("2026-03-01T00:00:00Z"), criadoPor: POR } });
});

describe("os catálogos do almoxarifado", () => {
  it("t1: material só ativo, por código ou descrição; o lote é o do material NO depósito do registro, o que vence primeiro primeiro (N=2)", async () => {
    const almox = await usuario("v37.almoxarife", ["CONSULTAR_PATRIMONIO"]);

    expect(await valores(almox, "materiais-do-almoxarifado", {})).toEqual(["mat-1", "mat-2"]);
    expect(await valores(almox, "materiais-do-almoxarifado", {}, "vacina")).toEqual(["mat-1"]);
    expect(await valores(almox, "materiais-do-almoxarifado", {}, "M002")).toEqual(["mat-2"]);
    expect(await valores(almox, "materiais-do-almoxarifado", {}, "", "mat-3")).toEqual([]);

    // Requisição no depósito A: o item da vacina oferece os DOIS lotes dela no A (não o do B); o da seringa, o dela.
    expect(await valores(almox, "lotes-da-requisicao", { itemDeRequisicaoId: "it-vacina" })).toEqual(["lot-a1", "lot-a2"]);
    expect(await valores(almox, "lotes-da-requisicao", { itemDeRequisicaoId: "it-seringa" })).toEqual(["lot-sa"]);
    expect(await valores(almox, "lotes-da-requisicao", { itemDeRequisicaoId: "it-vacina" }, "200")).toEqual(["lot-a2"]);
    expect(await valores(almox, "lotes-da-requisicao", { itemDeRequisicaoId: "it-vacina" }, "", "lot-b1")).toEqual([]);
    expect(await valores(almox, "lotes-da-requisicao", { itemDeRequisicaoId: "" })).toEqual([]);
    const rotulo = (await buscarOpcoes(almox, "lotes-da-requisicao", { q: "", pagina: 1, contexto: { itemDeRequisicaoId: "it-vacina" } })).opcoes[0]?.rotulo;
    expect(rotulo).toBe("L-100 — vence 31/01/2027");

    // Inventário no depósito B: a vacina oferece só o lote do B; sem material, nada.
    expect(await valores(almox, "lotes-do-inventario", { materialId: "mat-1", __id: "inv-b" })).toEqual(["lot-b1"]);
    expect(await valores(almox, "lotes-do-inventario", { materialId: "mat-2", __id: "inv-b" })).toEqual([]);
    expect(await valores(almox, "lotes-do-inventario", { materialId: "", __id: "inv-b" })).toEqual([]);
  });

  it("t2: sem a leitura do patrimônio, as listas são recusadas com o motivo", async () => {
    const despesa = await usuario("v37.so-despesa", ["CONSULTAR_DESPESA"]);
    for (const catalogo of ["materiais-do-almoxarifado", "lotes-da-requisicao", "lotes-do-inventario"]) {
      await expect(buscarOpcoes(despesa, catalogo, { q: "", pagina: 1, contexto: { itemDeRequisicaoId: "it-vacina", materialId: "mat-1", __id: "inv-b" } })).rejects.toThrow(/não está no seu acesso/);
    }
  });

  it("t3: o roteiro do almoxarifado — contas só analíticas patrimoniais, pelo id; a lista mostra os três movimentos, parametrizados ou não", async () => {
    await prisma.contaPcasp.createMany({
      data: [
        { id: "c-vpd", codigo: "3.3.1.1.1.01.00", nome: "Consumo de material", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
        { id: "c-sint", codigo: "3.3.1.1.1", nome: "Consumo (sintética)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false, indicadorSuperavit: "P" },
        { id: "c-orc", codigo: "5.2.2.1.1.01.00", nome: "Crédito disponível", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
      ],
    });
    const almox = await usuario("v37.contador-patrimonio", ["CONSULTAR_PATRIMONIO"]);
    expect((await valores(almox, "contas-patrimoniais", {})).sort()).toEqual(["c-estoque", "c-vpd"]);
    expect(await valores(almox, "contas-patrimoniais", {}, "3.3")).toEqual(["c-vpd"]);
    expect(await valores(almox, "contas-patrimoniais", {}, "", "c-orc")).toEqual([]);
    expect(await valores(almox, "contas-patrimoniais", {}, "", "c-estoque")).toEqual(["c-estoque"]);

    expect(Object.keys(ROTULO_DO_MOVIMENTO_DO_ALMOXARIFADO).sort()).toEqual([...TIPOS_DO_ROTEIRO_ALMOXARIFADO].sort());
    await prisma.roteiroAlmoxarifado.create({ data: { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR } });
    const lista = await listarRoteirosDoAlmoxarifadoDoMolde(lerConsulta(ROTEIROS_DO_ALMOXARIFADO, {}));
    expect(lista.linhas.map((l) => [l["id"], l["situacao"]]).sort()).toEqual([["AJUSTE_ENTRADA", "Sem roteiro"], ["AJUSTE_SAIDA", "Sem roteiro"], ["SAIDA_CONSUMO", "Parametrizado"]]);
    expect(lista.linhas.find((l) => l["id"] === "SAIDA_CONSUMO")?.["debito"]).toBe("3.3.1.1.1.01.00 — Consumo de material");
    const falta = await listarRoteirosDoAlmoxarifadoDoMolde(lerConsulta(ROTEIROS_DO_ALMOXARIFADO, { q: "falta" }));
    expect(falta.linhas.map((l) => l["id"])).toEqual(["AJUSTE_SAIDA"]);

    // V37 — trocadas as contas (N=2 versões), a lista mostra a versão vigente sobre a linha antiga, e quantas há.
    // A linha antiga debita c-vpd; a versão 1 também; a 2 (a vigente) debita c-estoque — a lista tem de mostrar a 2.
    for (const [numero, debito, publicadaEm] of [[1, "c-vpd", "2026-06-01T12:00:00Z"], [2, "c-estoque", "2026-06-02T12:00:00Z"]] as const) {
      await prisma.versaoDeRoteiro.create({ data: { familia: "ALMOXARIFADO", chave: "SAIDA_CONSUMO", numero, contaDebitoId: debito, contaCreditoId: debito === "c-vpd" ? "c-estoque" : "c-vpd", motivo: "teste", situacao: "PUBLICADA", publicadaEm: new Date(publicadaEm), publicadaPor: POR, criadoPor: POR } });
    }
    const trocado = (await listarRoteirosDoAlmoxarifadoDoMolde(lerConsulta(ROTEIROS_DO_ALMOXARIFADO, {}))).linhas.find((l) => l["id"] === "SAIDA_CONSUMO");
    expect([trocado?.["debito"], trocado?.["situacao"]]).toEqual(["1.1.5.6.1.01.00 — Material de Consumo", "Parametrizado (2 versões)"]);
    expect(ROTEIROS_DO_ALMOXARIFADO.campos.find((c) => c.nome === "substituir")?.tipo).toBe("booleano");
  });
});
