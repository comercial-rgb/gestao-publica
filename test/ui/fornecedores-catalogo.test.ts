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
  // Todos credores vigentes: o fornecedor da ordem é quem o empenho aceita como credor.
  await prisma.movimentoDePapelDaPessoa.createMany({ data: ns.map((n) => ({ pessoaId: `pes-${String(n)}`, papel: "CREDOR", movimento: "CONCEDIDO", data: new Date("2026-01-02T15:00:00Z"), criadoPor: "seed-teste" })) });
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

  it("t1b: o fornecedor da ordem é só credor vigente; a cotação aceita qualquer pessoa (N=2 fora do papel)", async () => {
    const compras = await usuario("v37.compras-credor", ["CONSULTAR_LICITACOES"]);
    await prisma.pessoa.createMany({ data: [{ id: "pes-sem", documento: "09000000001", tipo: "FISICA", criadoPor: "seed-teste" }, { id: "pes-enc", documento: "99000000002", tipo: "FISICA", criadoPor: "seed-teste" }] });
    await prisma.versaoDePessoa.createMany({ data: [{ pessoaId: "pes-sem", nome: "Papelaria Sem Papel", criadoPor: "seed-teste" }, { pessoaId: "pes-enc", nome: "Papelaria Encerrada", criadoPor: "seed-teste" }] });
    await prisma.movimentoDePapelDaPessoa.createMany({
      data: [
        { pessoaId: "pes-enc", papel: "CREDOR", movimento: "CONCEDIDO", data: new Date("2026-01-02T15:00:00Z"), criadoPor: "seed-teste" },
        { pessoaId: "pes-enc", papel: "CREDOR", movimento: "ENCERRADO", data: new Date("2026-03-02T15:00:00Z"), criadoPor: "seed-teste" },
        // Outro papel vigente não faz credor.
        { pessoaId: "pes-sem", papel: "CONSIGNATARIO", movimento: "CONCEDIDO", data: new Date("2026-01-02T15:00:00Z"), criadoPor: "seed-teste" },
      ],
    });
    const valores = (catalogo: string, q: string, valor?: string) => buscarOpcoes(compras, catalogo, { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: {} }).then((r) => r.opcoes.map((o) => o.valor).sort());
    expect(await valores("fornecedores", "papelaria")).toEqual(["pes-24"]);
    // O id de quem não é credor também não se resolve (a volta de um formulário antigo não o escolhe).
    expect(await valores("fornecedores", "", "pes-enc")).toEqual([]);
    expect(await valores("fornecedores", "", "pes-sem")).toEqual([]);
    expect(await valores("pessoas-para-cotacao", "papelaria")).toEqual(["pes-24", "pes-enc", "pes-sem"]);
    // O recorte vai na CONSULTA, não só no filtro depois dela: quem nunca foi credor vem primeiro por documento e,
    // filtrado depois da página, a primeira página da lista sem texto viria com 19 em vez de 20. (O credor ENCERRADO
    // só sai no filtro — a consulta não diz "o último movimento" —, como no catálogo de credores do empenho: por isso
    // ele fica no fim da ordem aqui, e uma página pode vir mais curta, com "há mais".)
    const primeira = await buscarOpcoes(compras, "fornecedores", { q: "", pagina: 1, contexto: {} });
    expect([primeira.opcoes.length, primeira.temMais]).toEqual([20, true]);
  });

  it("t3: a ficha e o processo da ordem de compra pela busca (N=2): número, natureza, objeto; o valor é o id", async () => {
    const compras = await usuario("v37.compras-fichas", ["CONSULTAR_LICITACOES"]);
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
    await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino fundamental" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.createMany({
      data: [
        { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
        { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços de terceiros" },
      ],
    });
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
    const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", fonteId: "fnt-500", exercicioFonte: 1, valorDotado: "0.00" };
    await prisma.fichaOrcamentaria.createMany({ data: [{ ...base, id: "fic-a", numero: 41, naturezaDespesaId: "nd-30" }, { ...base, id: "fic-b", numero: 42, naturezaDespesaId: "nd-39" }] });
    const fichas = (q: string) => buscarOpcoes(compras, "fichas-para-ordem", { q, pagina: 1, contexto: {} }).then((r) => r.opcoes.map((o) => o.valor));
    expect(await fichas("42")).toEqual(["fic-b"]);
    expect(await fichas("339030")).toEqual(["fic-a"]);
    // O prefixo comum às duas naturezas traz as duas (N=2), em ordem de número.
    expect(await fichas("33903")).toEqual(["fic-a", "fic-b"]);
    expect(await fichas("serviços")).toEqual(["fic-b"]);
    expect((await buscarOpcoes(compras, "fichas-para-ordem", { q: "", pagina: 1, valor: "fic-a", contexto: {} })).opcoes[0]?.rotulo).toBe("2026 · ficha 41 · UO 02001 · 339030 · fonte 500");

    await prisma.processoLicitatorio.createMany({
      data: [
        { id: "proc-1", numeroProcesso: "PL-001/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Merenda escolar", valorLicitado: "1000.00", criadoPor: "seed-teste" },
        { id: "proc-2", numeroProcesso: "PL-002/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Transporte escolar", valorLicitado: "2000.00", criadoPor: "seed-teste" },
      ],
    });
    const processos = (q: string) => buscarOpcoes(compras, "processos-para-ordem", { q, pagina: 1, contexto: {} }).then((r) => r.opcoes.map((o) => o.valor));
    expect(await processos("transporte")).toEqual(["proc-2"]);
    expect(await processos("PL-001")).toEqual(["proc-1"]);
  });

  it("t4: o material dos itens de compra pela busca (N=2): código, CATMAT, descrição; o desabilitado não se oferece", async () => {
    const compras = await usuario("v37.compras-materiais", ["CONSULTAR_LICITACOES"]);
    // A mesma conta de estoque do teste de compras do M11 (1.1.5.6.1.01.00, material de consumo, do PCASP).
    await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
    await prisma.classeDeMaterial.create({ data: { id: "cls", codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: "seed-teste" } });
    await prisma.grupoDeMaterial.create({ data: { id: "grp", codigo: "01", descricao: "Expediente", criadoPor: "seed-teste" } });
    const base = { grupoId: "grp", classeDeMaterialId: "cls", classificacao: "CONSUMO", categoria: "ESTOCAVEL", descricaoDetalhada: "-", criadoPor: "seed-teste" } as const;
    await prisma.material.createMany({
      data: [
        { ...base, id: "mat-1", codigo: "M001", descricaoSucinta: "Resma de papel A4", catmat: "461230" },
        { ...base, id: "mat-2", codigo: "M002", descricaoSucinta: "Papel ofício", catmat: null },
        { ...base, id: "mat-3", codigo: "M003", descricaoSucinta: "Papel carbono", catmat: null, ativo: false },
      ],
    });
    const materiais = (q: string, valor?: string) => buscarOpcoes(compras, "materiais-para-compra", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: {} }).then((r) => r.opcoes.map((o) => o.valor));
    // "papel" casa os três; o desabilitado fica de fora (N=2 ativos, em ordem de código).
    expect(await materiais("papel")).toEqual(["mat-1", "mat-2"]);
    expect(await materiais("M002")).toEqual(["mat-2"]);
    expect(await materiais("4612")).toEqual(["mat-1"]);
    expect(await materiais("")).toEqual(["mat-1", "mat-2"]);
    // O desabilitado também não se resolve pelo id (a volta de um formulário antigo não o escolhe).
    expect(await materiais("", "mat-3")).toEqual([]);
    expect(await materiais("", "mat-1")).toEqual(["mat-1"]);
  });

  it("t2: sem a leitura de licitações, a lista é recusada com o motivo", async () => {
    const semLeitura = await usuario("v37.sem-licitacoes", ["CONSULTAR_DESPESA"]);
    await expect(buscarOpcoes(semLeitura, "fornecedores", { q: "papelaria", pagina: 1, contexto: {} })).rejects.toThrow(LeituraDoCatalogoNegadaError);
    await expect(buscarOpcoes(semLeitura, "fornecedores", { q: "papelaria", pagina: 1, contexto: {} })).rejects.toThrow(/não está no seu acesso/);
    await expect(buscarOpcoes(semLeitura, "materiais-para-compra", { q: "papel", pagina: 1, contexto: {} })).rejects.toThrow(/não está no seu acesso/);
  });
});
