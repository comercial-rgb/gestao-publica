import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { buscarOpcoes } from "../../lib/portas/opcoes-referenciadas.js";

/**
 * V38 — DOIS CATÁLOGOS QUE A CONTADORA SENTIU FALTA: o documento fiscal da liquidação (só os do credor do empenho
 * escolhido, conferidos, não cancelados nem substituídos; N=2 emitentes, N=2 documentos) e a conta do plano no
 * lançamento manual (`contas-analiticas`, que já existia: pelo código ou pelo nome; o valor é o código; só analíticas).
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

async function lancamento(id: string): Promise<string> {
  return (await prisma.lancamentoContabil.create({ data: { numeroControle: `T-${id}`, dataTransacao: new Date("2026-03-10T15:00:00Z"), historico: "fixture", origemTipo: "TESTE", criadoPor: POR }, select: { id: true } })).id;
}

async function documento(id: string, emitenteId: string, numero: string, movimentos: readonly ("CONFERENCIA" | "CANCELAMENTO" | "SUBSTITUICAO")[], chave: string | null = null): Promise<void> {
  await prisma.documentoFiscalRecebido.create({
    data: {
      id, emitenteId, modelo: "NFE", serie: "1", numero, dataEmissao: new Date("2026-03-05T15:00:00Z"), dataRecebimento: new Date("2026-03-06T15:00:00Z"),
      chaveAcesso: chave, valorBruto: "1234.50", valorTotal: "1234.50", origem: "DIGITACAO", criadoPor: POR,
      movimentos: { create: movimentos.map((tipo) => ({ tipo, data: new Date("2026-03-07T15:00:00Z"), motivo: "fixture", criadoPor: POR })) },
    },
  });
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
  await prisma.fichaOrcamentaria.create({ data: { id: "fic-01", numero: 1, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fnt-500", exercicioFonte: 1, valorDotado: "0.00" } });
  // Dois emitentes; o empenho E-A é da Papelaria, o E-B é da Gráfica.
  await prisma.pessoa.createMany({ data: [{ id: "pes-a", documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR }, { id: "pes-b", documento: "44555666000199", tipo: "JURIDICA", criadoPor: POR }] });
  await prisma.versaoDePessoa.createMany({ data: [{ pessoaId: "pes-a", nome: "Papelaria Esperança", criadoPor: POR }, { pessoaId: "pes-b", nome: "Gráfica do Centro", criadoPor: POR }] });
  for (const [id, credor] of [["E-A", "11.222.333/0001-81"], ["E-B", "44555666000199"]] as const) {
    await prisma.empenho.create({ data: { id, fichaId: "fic-01", numero: id, tipo: "ORDINARIO", valor: "5000.00", data: new Date("2026-03-10T15:00:00Z"), credorCpfCnpj: credor, historico: "fixture", categoriaOrdemCronologica: "FORNECIMENTO_BENS", lancamentoId: await lancamento(id), criadoPor: POR } });
  }
  await documento("doc-a1", "pes-a", "1001", ["CONFERENCIA"], "35260311222333000181550010000010011000010019");
  await documento("doc-a2", "pes-a", "1002", ["CONFERENCIA"]);
  await documento("doc-a3", "pes-a", "1003", []); // recebido, ainda não conferido
  await documento("doc-a4", "pes-a", "1004", ["CONFERENCIA", "CANCELAMENTO"]);
  await documento("doc-b1", "pes-b", "2001", ["CONFERENCIA"]);
  await prisma.contaPcasp.createMany({ data: [
    { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" },
    { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos conta movimento", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" },
    { id: "c-sint", codigo: "1.1.1.1.0.00.00", nome: "Caixa e equivalentes (sintética)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false, indicadorSuperavit: "F" },
    { id: "c-vpd", codigo: "3.3.1.1.1.01.00", nome: "Consumo de material", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
  ] });
});

describe("os catálogos da liquidação e do lançamento manual", () => {
  it("t1: o documento fiscal é só do credor do empenho escolhido, conferido e vivo; por número ou chave; sem empenho, nada", async () => {
    const despesa = await usuario("v38.despesa", ["CONSULTAR_DESPESA"]);
    const docs = (ctx: Record<string, string>, q = "", valor?: string) =>
      buscarOpcoes(despesa, "documentos-fiscais-para-liquidar", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: ctx }).then((r) => r.opcoes.map((o) => o.valor).sort());
    expect(await docs({ empenhoId: "E-A" })).toEqual(["doc-a1", "doc-a2"]);
    expect(await docs({ empenhoId: "E-B" })).toEqual(["doc-b1"]);
    expect(await docs({})).toEqual([]);
    expect(await docs({ empenhoId: "nao-existe" })).toEqual([]);
    expect(await docs({ empenhoId: "E-A" }, "1002")).toEqual(["doc-a2"]);
    expect(await docs({ empenhoId: "E-A" }, "0010019")).toEqual(["doc-a1"]);
    // O valor já escolhido se resolve pelo id, dentro do mesmo recorte: o documento da Gráfica não vira escolha no empenho da Papelaria.
    expect(await docs({ empenhoId: "E-A" }, "", "doc-a1")).toEqual(["doc-a1"]);
    expect(await docs({ empenhoId: "E-A" }, "", "doc-b1")).toEqual([]);
    const r = await buscarOpcoes(despesa, "documentos-fiscais-para-liquidar", { q: "1001", pagina: 1, contexto: { empenhoId: "E-A" } });
    expect(r.opcoes[0]?.rotulo).toBe("NF-e 1001/1 — Papelaria Esperança");
    expect(r.opcoes[0]?.detalhe).toBe("R$ 1.234,50 · emitida em 05/03/2026 · chave …00010019");
  });

  it("t2: a conta do plano pelo código ou pelo nome, só analíticas; o valor é o código", async () => {
    const contador = await usuario("v38.contador", ["CONSULTAR_CONTABILIDADE"]);
    const contas = (q: string, valor?: string) =>
      buscarOpcoes(contador, "contas-analiticas", { q, pagina: 1, ...(valor !== undefined ? { valor } : {}), contexto: {} }).then((r) => r.opcoes.map((o) => o.valor));
    expect(await contas("1.1.1")).toEqual(["1.1.1.1.1.00.00", "1.1.1.1.2.00.00"]);
    expect(await contas("bancos")).toEqual(["1.1.1.1.2.00.00"]);
    expect(await contas("", "3.3.1.1.1.01.00")).toEqual(["3.3.1.1.1.01.00"]);
    expect(await contas("", "1.1.1.1.0.00.00")).toEqual([]);
  });

  it("t3: sem a leitura da despesa, a lista de documentos é recusada com o motivo", async () => {
    const outro = await usuario("v38.so-planejamento", ["CONSULTAR_PLANEJAMENTO"]);
    await expect(buscarOpcoes(outro, "documentos-fiscais-para-liquidar", { q: "", pagina: 1, contexto: { empenhoId: "E-A" } })).rejects.toThrow(/não está no seu acesso/);
  });
});
