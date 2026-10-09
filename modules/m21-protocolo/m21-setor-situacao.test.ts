import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { registrarRequisicaoDeMaterial } from "../m10-patrimonial/estoque-fisico.js";
import { registrarSolicitacaoDeCompra } from "../m11-licitacoes/compras.js";
import { alterarSituacaoDoSetor, criarSetor } from "./cadastros.js";

/**
 * V37 — DESATIVAR E REATIVAR O SETOR. A coluna `ativo` é a única de `Setor` que o papel de runtime atualiza. O setor
 * desativado não faz requisição de material nem solicitação de compra nova (o domínio recusa com o motivo; a tela já
 * não o oferece), e reativado volta a fazer. N=2 setores em duas unidades: a autorização é na unidade do setor.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "protocolo@cg.pb.gov.br";
const SO_SAUDE = "v37.setores.saude@cg.pb.gov.br";

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "uo-adm", codigo: "01001", descricao: "Administração", orgaoId: "org" }, { id: "uo-sau", codigo: "01002", descricao: "Saúde", orgaoId: "org" }] });
  await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  await prisma.classeDeMaterial.create({ data: { id: "cls", codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: ADMIN } });
  await prisma.grupoDeMaterial.create({ data: { id: "grp", codigo: "01", descricao: "Expediente", criadoPor: ADMIN } });
  await prisma.material.create({ data: { id: "mat", codigo: "M001", descricaoSucinta: "Resma", descricaoDetalhada: "-", grupoId: "grp", classeDeMaterialId: "cls", classificacao: "CONSUMO", categoria: "ESTOCAVEL", criadoPor: ADMIN } });
  await prisma.deposito.create({ data: { id: "dep", codigo: "ALM-01", nome: "Almoxarifado", unidadeOrcId: "uo-adm", criadoPor: ADMIN } });
  // Quem cria setor só na Saúde.
  const u = await prisma.usuario.create({ data: { identificador: SO_SAUDE, nome: SO_SAUDE, criadoPor: ADMIN }, select: { id: true } });
  const p = await prisma.perfil.create({ data: { nome: "setores-saude", descricao: "teste", criadoPor: ADMIN }, select: { id: true } });
  await prisma.permissaoDePerfil.create({ data: { perfilId: p.id, acao: "CRIAR_SETOR", unidadeOrcId: "uo-sau", criadoPor: ADMIN } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: ADMIN } });
});

const requisicao = (numero: string, setorId: string) =>
  registrarRequisicaoDeMaterial(prisma, { numero, depositoId: "dep", setorId, dataRequisicao: new Date("2026-03-10T15:00:00Z"), solicitante: "Servidora", itens: [{ materialId: "mat", quantidadeSolicitada: "2" }], criadoPor: ADMIN });
const solicitacao = (numero: string, setorId: string) =>
  registrarSolicitacaoDeCompra(prisma, { numero, setorId, data: new Date("2026-03-10T15:00:00Z"), justificativa: "Reposição do estoque de papel", solicitante: "Servidora", itens: [{ materialId: "mat", quantidade: "10" }], criadoPor: ADMIN });

describe("V37 — a situação do setor", () => {
  it("t1: desativado, o setor não faz requisição nem solicitação nova; reativado, volta (N=2 setores)", async () => {
    const adm = (await criarSetor(prisma, { codigo: "SEC-ADM", nome: "Secretaria de Administração", unidadeOrcId: "uo-adm", criadoPor: ADMIN })).setorId;
    const sau = (await criarSetor(prisma, { codigo: "SEC-SAU", nome: "Secretaria de Saúde", unidadeOrcId: "uo-sau", criadoPor: ADMIN })).setorId;

    await alterarSituacaoDoSetor(prisma, { setorId: adm, ativo: false, criadoPor: ADMIN });
    expect((await prisma.setor.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, ativo: true } }))).toEqual([{ codigo: "SEC-ADM", ativo: false }, { codigo: "SEC-SAU", ativo: true }]);

    await expect(requisicao("REQ-1", adm)).rejects.toThrow(/O setor SEC-ADM está desativado e não faz requisição nova\. Nada foi gravado\./);
    await expect(solicitacao("SC-1", adm)).rejects.toThrow(/O setor SEC-ADM está desativado e não faz solicitação de compra nova\. Nada foi gravado\./);
    expect([await prisma.requisicaoDeMaterial.count(), await prisma.solicitacaoDeCompra.count()]).toEqual([0, 0]);
    // O outro setor segue fazendo.
    await requisicao("REQ-2", sau);
    await solicitacao("SC-2", sau);

    await alterarSituacaoDoSetor(prisma, { setorId: adm, ativo: true, criadoPor: ADMIN });
    await requisicao("REQ-3", adm);
    await solicitacao("SC-3", adm);
    expect([await prisma.requisicaoDeMaterial.count(), await prisma.solicitacaoDeCompra.count()]).toEqual([2, 2]);
  });

  it("t2: as recusas dizem o motivo — a mesma situação, e a unidade fora da permissão", async () => {
    const adm = (await criarSetor(prisma, { codigo: "SEC-ADM", nome: "Secretaria de Administração", unidadeOrcId: "uo-adm", criadoPor: ADMIN })).setorId;
    const sau = (await criarSetor(prisma, { codigo: "SEC-SAU", nome: "Secretaria de Saúde", unidadeOrcId: "uo-sau", criadoPor: ADMIN })).setorId;
    await expect(alterarSituacaoDoSetor(prisma, { setorId: adm, ativo: true, criadoPor: ADMIN })).rejects.toThrow(/O setor SEC-ADM já está ativo\. Nada foi gravado\./);
    // Quem cria setor só na Saúde desativa o da Saúde, e não o da Administração.
    await expect(alterarSituacaoDoSetor(prisma, { setorId: adm, ativo: false, criadoPor: SO_SAUDE })).rejects.toThrow(/não tem permissão para CRIAR_SETOR na unidade gestora uo-adm/);
    await alterarSituacaoDoSetor(prisma, { setorId: sau, ativo: false, criadoPor: SO_SAUDE });
    expect((await prisma.setor.findMany({ orderBy: { codigo: "asc" }, select: { ativo: true } })).map((s) => s.ativo)).toEqual([true, false]);
    await expect(alterarSituacaoDoSetor(prisma, { setorId: "nao-existe", ativo: false, criadoPor: ADMIN })).rejects.toThrow(/Setor não encontrado/);
  });
});
