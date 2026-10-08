import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes, LeituraDoCatalogoNegadaError } from "../../lib/portas/opcoes-referenciadas.js";

/**
 * V37 — O CATÁLOGO DE FORNECEDORES da ordem de compra e da formação de ordem. Substitui o `select` com as 500
 * primeiras pessoas por documento: a busca acha qualquer uma, por documento ou nome, e o valor é o id da pessoa.
 * Fixture: 25 pessoas (a última, por documento, fica fora da primeira página de 20 — no select antigo, a 501ª ficava
 * fora da lista) e um leitor sem licitações.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

async function usuario(identificador: string, acoes: readonly AcaoDoSistema[]): Promise<Identidade> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "seed-teste" }, select: { id: true, identificador: true } });
  const perfil = await prisma.perfil.create({ data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: "seed-teste" }, select: { id: true } });
  for (const acao of acoes) await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao, unidadeOrcId: null, criadoPor: "seed-teste" } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "seed-teste" } });
  return { usuarioId: u.id, identificador: u.identificador };
}

const doc = (i: number): string => String(10000000000 + i).padStart(11, "0");

beforeEach(async () => {
  await limparBanco(prisma);
  const ns = Array.from({ length: 25 }, (_, n) => n);
  await prisma.pessoa.createMany({ data: ns.map((n) => ({ id: `pes-${String(n)}`, documento: doc(n), tipo: n % 2 === 0 ? "FISICA" : "JURIDICA", criadoPor: "seed-teste" })) });
  await prisma.versaoDePessoa.createMany({ data: ns.map((n) => ({ pessoaId: `pes-${String(n)}`, nome: n === 24 ? "Papelaria Esperança Ltda" : `Pessoa ${String(n)}`, criadoPor: "seed-teste" })) });
});

describe("o catálogo de fornecedores", () => {
  it("t1: acha a pessoa fora da primeira página, pelo nome e pelo documento; o valor é o id dela", async () => {
    const compras = await usuario("v37.compras", ["CONSULTAR_LICITACOES"]);
    const alvo = await prisma.pessoa.findUniqueOrThrow({ where: { documento: doc(24) }, select: { id: true } });
    const porNome = await buscarOpcoes(compras, "fornecedores", { q: "papelaria esp", pagina: 1, contexto: {} });
    expect(porNome.opcoes.map((o) => o.valor)).toEqual([alvo.id]);
    expect(porNome.opcoes[0]?.rotulo).toMatch(/Papelaria Esperança Ltda$/);
    const porDocumento = await buscarOpcoes(compras, "fornecedores", { q: doc(24), pagina: 1, contexto: {} });
    expect(porDocumento.opcoes.map((o) => o.valor)).toEqual([alvo.id]);
    // O valor já escolhido (a volta do atalho de cadastro) se resolve pelo id; outro id não vira escolha.
    expect((await buscarOpcoes(compras, "fornecedores", { q: "", pagina: 1, valor: alvo.id, contexto: {} })).opcoes.map((o) => o.valor)).toEqual([alvo.id]);
    expect((await buscarOpcoes(compras, "fornecedores", { q: "", pagina: 1, valor: "nao-existe", contexto: {} })).opcoes).toEqual([]);
    // Sem texto, a lista vem paginada (20 e "há mais"), não todas.
    const primeira = await buscarOpcoes(compras, "fornecedores", { q: "", pagina: 1, contexto: {} });
    expect([primeira.opcoes.length, primeira.temMais]).toEqual([20, true]);
  });

  it("t2: sem a leitura de licitações, a lista é recusada com o motivo", async () => {
    const semLeitura = await usuario("v37.sem-licitacoes", ["CONSULTAR_DESPESA"]);
    await expect(buscarOpcoes(semLeitura, "fornecedores", { q: "papelaria", pagina: 1, contexto: {} })).rejects.toThrow(LeituraDoCatalogoNegadaError);
    await expect(buscarOpcoes(semLeitura, "fornecedores", { q: "papelaria", pagina: 1, contexto: {} })).rejects.toThrow(/não está no seu acesso/);
  });
});
