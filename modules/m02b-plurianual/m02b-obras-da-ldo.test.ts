import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexoObrasEConservacao, totalComoTexto } from "./anexos/ldo.js";
import { criarObraPrevistaLdo } from "./obras-da-ldo.js";

/**
 * V36 — AS OBRAS PREVISTAS NA LDO E O DEMONSTRATIVO DE OBRAS E CONSERVAÇÃO DO PATRIMÔNIO (TR 5.9.2.16-17). N=2 obras
 * de órgãos diferentes: cada uma grava os quatro valores; o demonstrativo soma as linhas, coluna a coluna. Recusas
 * com o motivo: valor no exercício acima do previsto, valor negativo, órgão inexistente, quem não cadastra a LDO.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "planejamento@cg.pb.gov.br";
const INICIO = new Date("2027-03-01T15:00:00.000Z");
let ldo = "";

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    // Erro do Prisma traz trecho do CÓDIGO-FONTE ("invocation in ... → linha"): casar com ele seria atestar pela papelada.
    const m = e instanceof Error ? e.message : String(e);
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
}

const base = () => ({ ldoId: ldo, orgaoId: "org-a", descricao: "Pavimentação do Centro", dataInicio: INICIO, valorPrevisto: "500000.00", valorConservacao: "20000.00", valorNovosProjetos: "0.00", valorNoExercicio: "250000.00", criadoPor: POR });

describe("M02b V36 — obras previstas na LDO", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.orgao.createMany({ data: [{ id: "org-a", codigo: "02", nome: "Secretaria de Obras" }, { id: "org-b", codigo: "03", nome: "Secretaria de Educação" }] });
    ldo = (await prisma.leiDiretrizesOrcamentarias.create({ data: { exercicio: 2027, inicioVigencia: new Date("2027-01-01T15:00:00.000Z"), fimVigencia: new Date("2027-12-31T15:00:00.000Z"), criadoPor: POR }, select: { id: true } })).id;
  }, 60000);

  it("t1: duas obras de órgãos diferentes gravam os quatro valores; o demonstrativo soma coluna a coluna", async () => {
    await criarObraPrevistaLdo(prisma, base());
    await criarObraPrevistaLdo(prisma, { ...base(), orgaoId: "org-b", descricao: "Reforma da escola", valorPrevisto: "120000.50", valorConservacao: "5000.25", valorNovosProjetos: "30000.00", valorNoExercicio: "120000.50" });
    const linhas = await prisma.obraPrevistaLdo.findMany({ where: { ldoId: ldo }, orderBy: { descricao: "asc" }, select: { descricao: true, valorNoExercicio: true, orgaoId: true } });
    expect(linhas.map((l) => [l.descricao, l.orgaoId, l.valorNoExercicio.toFixed(2)])).toEqual([
      ["Pavimentação do Centro", "org-a", "250000.00"],
      ["Reforma da escola", "org-b", "120000.50"],
    ]);
    const anexo = anexoObrasEConservacao(2027, [
      { orgao: "02", descricao: "A", dataInicio: "01/03/2027", valorPrevisto: toMoney("500000.00"), valorConservacao: toMoney("20000.00"), valorNovosProjetos: toMoney("0.00"), valorNoExercicio: toMoney("250000.00") },
      { orgao: "03", descricao: "B", dataInicio: "01/03/2027", valorPrevisto: toMoney("120000.50"), valorConservacao: toMoney("5000.25"), valorNovosProjetos: toMoney("30000.00"), valorNoExercicio: toMoney("120000.50") },
    ]);
    expect(["valorPrevisto", "valorConservacao", "valorNovosProjetos", "valorNoExercicio"].map((k) => totalComoTexto(anexo, k))).toEqual(["620000.50", "25000.25", "30000.00", "370000.50"]);
    expect(anexo.titulo).toBe("Demonstrativo de Obras e Conservação do Patrimônio");
  });

  it("t2: recusas com o motivo e nada gravado", async () => {
    expect(await recusa(() => criarObraPrevistaLdo(prisma, { ...base(), valorNoExercicio: "500000.01" }))).toMatch(/excede o valor previsto/);
    expect(await recusa(() => criarObraPrevistaLdo(prisma, { ...base(), valorConservacao: "-1.00" }))).toMatch(/não pode ser negativo/);
    expect(await recusa(() => criarObraPrevistaLdo(prisma, { ...base(), orgaoId: "nao-existe" }))).toMatch(/entidade responsável não existe/);
    expect(await recusa(() => criarObraPrevistaLdo(prisma, { ...base(), obraId: "nao-existe" }))).toMatch(/obra cadastrada escolhida não existe/);
    expect(await prisma.obraPrevistaLdo.count()).toBe(0);
  });

  it("t3: quem só consulta o planejamento não prevê obra", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.ldo@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_LDO", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => criarObraPrevistaLdo(prisma, { ...base(), criadoPor: "so.le.ldo@cg.pb.gov.br" }))).toMatch(/CADASTRAR_LDO/);
    expect(await prisma.obraPrevistaLdo.count()).toBe(0);
  });
});
