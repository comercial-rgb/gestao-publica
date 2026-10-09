import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes } from "../../lib/portas/opcoes-referenciadas.js";
import { listarSetoresDoMolde, verSetor } from "../../lib/portas/recursos/setores-dados.js";
import { lotarUsuarioNoSetor } from "../../modules/m21-protocolo/cadastros.js";
import { lerConsulta } from "../../lib/molde/consulta.js";
import { SETORES } from "../../lib/portas/recursos/setores.js";
import { RECURSOS_DO_MOLDE } from "../../lib/portas/recursos/definicoes.js";

/**
 * V37 — O CADASTRO DE SETORES. O setor é exigido pela requisição de material e pela solicitação de compra, e não havia
 * tela que o cadastrasse. A unidade gestora do setor novo vem da busca, só entre as unidades onde a sessão pode criar
 * setor — o mesmo escopo que o caso de uso confere.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "seed-teste";

async function usuario(identificador: string, acoes: readonly AcaoDoSistema[], unidadeOrcId: string | null = null): Promise<Identidade> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: POR }, select: { id: true, identificador: true } });
  const perfil = await prisma.perfil.create({ data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: POR }, select: { id: true } });
  for (const acao of acoes) await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao, unidadeOrcId, criadoPor: POR } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
  return { usuarioId: u.id, identificador: u.identificador };
}

const unidades = (s: Identidade, q = "", valor?: string): Promise<string[]> =>
  buscarOpcoes(s, "unidades-para-setor", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: {} }).then((r) => r.opcoes.map((o) => o.valor));

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" }, { id: "uo-02", codigo: "02002", descricao: "Saúde", orgaoId: "org-01" }] });
});

describe("o cadastro de setores", () => {
  it("t1: a unidade do setor novo só entre as unidades onde a sessão cria setor, também quando o valor é pedido (N=2)", async () => {
    const ente = await usuario("v37.ente", ["CONSULTAR_PROTOCOLO", "CRIAR_SETOR"]);
    expect((await unidades(ente)).sort()).toEqual(["uo-01", "uo-02"]);
    expect(await unidades(ente, "saú")).toEqual(["uo-02"]);
    expect(await unidades(ente, "02001")).toEqual(["uo-01"]);

    // Quem cria setor só na Saúde: a Educação não aparece nem pedida pelo id.
    const saude = await usuario("v37.saude", ["CONSULTAR_PROTOCOLO"]);
    const perfil = await prisma.perfil.create({ data: { nome: "perfil-setor-saude", descricao: "teste", criadoPor: POR }, select: { id: true } });
    await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao: "CRIAR_SETOR", unidadeOrcId: "uo-02", criadoPor: POR } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: saude.usuarioId, perfilId: perfil.id, criadoPor: POR } });
    expect(await unidades(saude)).toEqual(["uo-02"]);
    expect(await unidades(saude, "", "uo-01")).toEqual([]);
    expect(await unidades(saude, "", "uo-02")).toEqual(["uo-02"]);

    // Quem só consulta o protocolo: nada a oferecer.
    const leitor = await usuario("v37.leitor", ["CONSULTAR_PROTOCOLO"]);
    expect(await unidades(leitor)).toEqual([]);
  });

  it("t2: sem a leitura do protocolo, a lista de unidades é recusada com o motivo", async () => {
    const outro = await usuario("v37.so-despesa", ["CONSULTAR_DESPESA", "CRIAR_SETOR"]);
    await expect(buscarOpcoes(outro, "unidades-para-setor", { q: "", pagina: 1, contexto: {} })).rejects.toThrow(/não está no seu acesso/);
  });

  it("t3: a listagem filtra por código ou nome e mostra a unidade e a situação; o cadastro entra no molde (busca global)", async () => {
    await prisma.setor.createMany({
      data: [
        { codigo: "SEC-EDU", nome: "Secretaria de Educação", unidadeOrcId: "uo-01", criadoPor: POR },
        { codigo: "SEC-SAU", nome: "Secretaria de Saúde", unidadeOrcId: "uo-02", criadoPor: POR, ativo: false },
      ],
    });
    const todos = await listarSetoresDoMolde(lerConsulta(SETORES, {}));
    expect(todos.total).toBe(2);
    expect(todos.linhas.map((l) => [l["codigo"], l["unidade"], l["situacao"]])).toEqual([
      ["SEC-EDU", "02001 — Educação", "Ativo"],
      ["SEC-SAU", "02002 — Saúde", "Desativado"],
    ]);
    const saude = await listarSetoresDoMolde(lerConsulta(SETORES, { q: "saúde" }));
    expect(saude.linhas.map((l) => l["codigo"])).toEqual(["SEC-SAU"]);
    expect(RECURSOS_DO_MOLDE.some((r) => r.rota === "/protocolo/setores" && r.permissoes.criar === "CRIAR_SETOR")).toBe(true);
  });

  it("t4: a busca de quem lotar mostra só usuários ativos, e só a quem lota; a lotação aparece no detalhe (N=2)", async () => {
    await prisma.setor.create({ data: { id: "set-edu", codigo: "SEC-EDU", nome: "Secretaria de Educação", unidadeOrcId: "uo-01", criadoPor: POR } });
    const lota = await usuario("v37.lota", ["CONSULTAR_PROTOCOLO", "LOTAR_USUARIO_NO_SETOR"]);
    await usuario("v37.ana", []);
    await usuario("v37.bia", []);
    await prisma.usuario.create({ data: { identificador: "v37.inativa", nome: "v37.inativa", ativo: false, criadoPor: POR } });
    const quem = (s: Identidade, q = "", valor?: string): Promise<string[]> =>
      buscarOpcoes(s, "usuarios-para-lotacao", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: {} }).then((r) => r.opcoes.map((o) => o.valor).filter((v) => v.startsWith("v37.")));

    // A base de teste mantém os usuários semeados; a busca e o recorte olham só os deste teste.
    expect(await quem(lota, "v37.")).toEqual(["v37.ana", "v37.bia", "v37.lota"]);
    expect(await quem(lota, "bia")).toEqual(["v37.bia"]);
    expect(await quem(lota, "", "v37.inativa")).toEqual([]);
    // Quem só consulta o protocolo não conhece a lista de contas.
    const leitor = await usuario("v37.leitor", ["CONSULTAR_PROTOCOLO"]);
    expect(await quem(leitor, "v37.")).toEqual([]);

    await lotarUsuarioNoSetor(prisma, { usuarioIdent: "v37.bia", setorId: "set-edu", criadoPor: lota.identificador });
    await lotarUsuarioNoSetor(prisma, { usuarioIdent: "v37.ana", setorId: "set-edu", criadoPor: lota.identificador });
    const lotados = (await verSetor("set-edu"))?.dados.find((d) => d.rotulo === "Usuários lotados")?.valor;
    expect(lotados).toBe("v37.ana, v37.bia");
    await expect(lotarUsuarioNoSetor(prisma, { usuarioIdent: "v37.inativa", setorId: "set-edu", criadoPor: lota.identificador })).rejects.toThrow(/USUÁRIO INATIVO/);
    expect(SETORES.acoes.find((a) => a.nome === "lotar")?.acaoDoCenso).toBe("LOTAR_USUARIO_NO_SETOR");
  });

  it("t5: a lotação a desfazer vem só dos lotados DAQUELE setor, e só para quem lota na unidade dele (N=2 setores)", async () => {
    await prisma.setor.createMany({ data: [
      { id: "set-edu", codigo: "SEC-EDU", nome: "Secretaria de Educação", unidadeOrcId: "uo-01", criadoPor: POR },
      { id: "set-sau", codigo: "SEC-SAU", nome: "Secretaria de Saúde", unidadeOrcId: "uo-02", criadoPor: POR },
    ] });
    for (const u of ["v37.ana", "v37.bia"]) await usuario(u, []);
    await prisma.usuarioDoSetor.createMany({ data: [
      { usuarioIdent: "v37.ana", setorId: "set-edu", criadoPor: POR },
      { usuarioIdent: "v37.bia", setorId: "set-edu", criadoPor: POR },
      { usuarioIdent: "v37.bia", setorId: "set-sau", criadoPor: POR },
    ] });
    const lotados = (s: Identidade, setorId: string, valor?: string): Promise<string[]> =>
      buscarOpcoes(s, "lotados-do-setor", { q: "", pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: { __id: setorId } }).then((r) => r.opcoes.map((o) => o.valor));
    const ente = await usuario("v37.ente", ["CONSULTAR_PROTOCOLO", "LOTAR_USUARIO_NO_SETOR"]);
    expect(await lotados(ente, "set-edu")).toEqual(["v37.ana", "v37.bia"]);
    expect(await lotados(ente, "set-sau")).toEqual(["v37.bia"]);
    expect(await lotados(ente, "set-sau", "v37.ana")).toEqual([]);
    // Quem lota só na Saúde não vê os lotados da Educação.
    const saude = await usuario("v37.lota-saude", ["CONSULTAR_PROTOCOLO", "LOTAR_USUARIO_NO_SETOR"], "uo-02");
    expect(await lotados(saude, "set-edu")).toEqual([]);
    expect(await lotados(saude, "set-sau")).toEqual(["v37.bia"]);
    expect(SETORES.acoes.find((a) => a.nome === "desfazer-lotacao")?.acaoDoCenso).toBe("LOTAR_USUARIO_NO_SETOR");
  });
});
