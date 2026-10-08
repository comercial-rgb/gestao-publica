import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes } from "../../lib/portas/opcoes-referenciadas.js";

/**
 * V37 — O EMPENHO DA LIQUIDAÇÃO POR BUSCA. Substitui o `select` com todos os liquidáveis do recorte. O catálogo só
 * oferece empenho com saldo a liquidar e não anulado, no exercício da página, e o RECORTE DE UNIDADE é do servidor:
 * unidade fora do escopo de leitura não devolve nada, e o consolidado só para quem lê o ente inteiro.
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

async function lancamento(id: string): Promise<string> {
  return (await prisma.lancamentoContabil.create({ data: { numeroControle: `T-${id}`, dataTransacao: new Date("2026-03-10T15:00:00Z"), historico: "fixture", origemTipo: "TESTE", criadoPor: POR }, select: { id: true } })).id;
}

/** Um empenho gravado direto (sem o caminho do M05): aqui só importam a ficha, o valor e o que pesa no saldo. */
async function empenho(id: string, fichaId: string, valor: string, extra: { readonly estornoDeId?: string; readonly credor?: string } = {}): Promise<void> {
  await prisma.empenho.create({
    data: {
      id, fichaId, numero: id, tipo: "ORDINARIO", valor, data: new Date("2026-03-10T15:00:00Z"), credorCpfCnpj: extra.credor ?? "11222333000181",
      historico: `fixture ${id}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", lancamentoId: await lancamento(id), estornoDeId: extra.estornoDeId ?? null, criadoPor: POR,
    },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" }, { id: "uo-02", codigo: "02002", descricao: "Saúde", orgaoId: "org-01" }] });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const base = { exercicio: 2026, orgaoId: "org-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fnt-500", exercicioFonte: 1, valorDotado: "0.00" };
  await prisma.fichaOrcamentaria.createMany({ data: [{ ...base, id: "fic-01", numero: 1, unidadeOrcId: "uo-01" }, { ...base, id: "fic-02", numero: 2, unidadeOrcId: "uo-02" }] });
  // E-1: liquidado por inteiro (saldo zero). E-2: 500 a liquidar. E-3: 300, da Saúde. E-4: anulado por inteiro.
  await empenho("E-1", "fic-01", "1000.00");
  await prisma.liquidacao.create({ data: { empenhoId: "E-1", numero: "0000001", valor: "1000.00", data: new Date("2026-03-11T15:00:00Z"), responsavelAtesto: "fixture", lancamentoId: await lancamento("L-1"), criadoPor: POR } });
  await empenho("E-2", "fic-01", "500.00");
  await empenho("E-3", "fic-02", "300.00");
  await empenho("E-4", "fic-01", "200.00");
  await empenho("E-4-AN", "fic-01", "200.00", { estornoDeId: "E-4", credor: "ANULACAO" });
});

describe("o catálogo do empenho da liquidação", () => {
  it("t1: só com saldo a liquidar e não anulado, no exercício; o recorte de unidade pelo escopo (N=2 unidades)", async () => {
    const ente = await usuario("v37.contador", ["CONSULTAR_DESPESA"]);
    const buscar = (s: Identidade, ctx: Record<string, string>, q = "", valor?: string) =>
      buscarOpcoes(s, "empenhos-para-liquidar", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: ctx }).then((r) => r.opcoes.map((o) => o.valor).sort());

    expect(await buscar(ente, { exercicio: "2026", ug: "02001" })).toEqual(["E-2"]);
    expect(await buscar(ente, { exercicio: "2026", ug: "" })).toEqual(["E-2", "E-3"]);
    expect(await buscar(ente, { exercicio: "2026", ug: "" }, "E-3")).toEqual(["E-3"]);
    // O liquidado por inteiro não se resolve nem pelo id; sem exercício, nada.
    expect(await buscar(ente, { exercicio: "2026", ug: "" }, "", "E-1")).toEqual([]);
    expect(await buscar(ente, { exercicio: "2026", ug: "" }, "", "E-4")).toEqual([]);
    expect(await buscar(ente, { ug: "02001" })).toEqual([]);
    const e2 = (await buscarOpcoes(ente, "empenhos-para-liquidar", { q: "", pagina: 1, valor: "E-2", contexto: { exercicio: "2026", ug: "02001" } })).opcoes[0];
    expect(e2?.dados).toEqual({ numero: "E-2", credorCpfCnpj: "11222333000181", saldoALiquidar: "500.00", naturezaCodigo: "339030", ehMaterial: "sim" });

    // Quem lê só a Saúde: a Saúde sim; a Educação e o consolidado, nada.
    const saude = await usuario("v37.saude", ["CONSULTAR_DESPESA"], "uo-02");
    expect(await buscar(saude, { exercicio: "2026", ug: "02002" })).toEqual(["E-3"]);
    expect(await buscar(saude, { exercicio: "2026", ug: "02001" })).toEqual([]);
    expect(await buscar(saude, { exercicio: "2026", ug: "" })).toEqual([]);
  });

  it("t2: sem a leitura da despesa, a lista é recusada com o motivo", async () => {
    const compras = await usuario("v37.so-compras", ["CONSULTAR_LICITACOES"]);
    await expect(buscarOpcoes(compras, "empenhos-para-liquidar", { q: "", pagina: 1, contexto: { exercicio: "2026", ug: "" } })).rejects.toThrow(/não está no seu acesso/);
  });
});
