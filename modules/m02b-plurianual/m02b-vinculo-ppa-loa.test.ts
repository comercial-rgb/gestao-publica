import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { vinculoPpaLoa } from "./vinculo-ppa-loa.js";

/**
 * V37 — O VÍNCULO PPA → LOA, derivado dos classificadores. N=2 ações do plano (uma que declara unidade, função e
 * subfunção; outra que não declara), N=2 fichas numa delas, uma ficha da mesma ação noutra unidade, uma ação fora do
 * plano, um exercício sem plano e dois planos sobrepostos.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "planejamento@cg.pb.gov.br";

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.createMany({ data: [{ id: "o2", codigo: "02", nome: "Educação" }, { id: "o3", codigo: "03", nome: "Saúde" }] });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "u2", codigo: "02001", descricao: "Secretaria de Educação", orgaoId: "o2" }, { id: "u3", codigo: "03001", descricao: "Fundo de Saúde", orgaoId: "o3" }] });
  await prisma.funcao.createMany({ data: [{ id: "f10", codigo: "10", nome: "Saúde" }, { id: "f12", codigo: "12", nome: "Educação" }] });
  await prisma.subfuncao.createMany({ data: [{ id: "s301", codigo: "301", nome: "Atenção básica" }, { id: "s361", codigo: "361", nome: "Ensino fundamental" }] });
  await prisma.programa.createMany({ data: [{ id: "p12", codigo: "0012", descricao: "Educação de qualidade" }, { id: "p20", codigo: "0020", descricao: "Saúde em dia" }] });
  await prisma.acao.createMany({ data: [{ id: "a2001", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE" }, { id: "a1001", codigo: "1001", descricao: "Construção de escola", tipo: "PROJETO" }, { id: "a2010", codigo: "2010", descricao: "Atenção básica", tipo: "ATIVIDADE" }] });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.planoPlurianual.create({ data: { id: "ppa", anoInicio: 2026, anoFim: 2029, leiRef: "Lei 1/2025", dataPublicacao: new Date("2025-12-20T15:00:00Z"), criadoPor: POR } });
  await prisma.eixoEstruturante.create({ data: { id: "eixo", codigo: "E1", descricao: "Eixo", criadoPor: POR } });
  await prisma.areaTematica.create({ data: { id: "area", codigo: "A1", descricao: "Área", eixoId: "eixo", criadoPor: POR } });
  await prisma.programaPpa.createMany({ data: [
    { id: "pp12", planoId: "ppa", programaId: "p12", areaTematicaId: "area", valorPrevisto: "1000.00", criadoPor: POR },
    { id: "pp20", planoId: "ppa", programaId: "p20", areaTematicaId: "area", valorPrevisto: "1000.00", criadoPor: POR },
  ] });
  await prisma.acaoPpa.createMany({ data: [
    // Declara a classificação: só a ficha da Educação, função 12, subfunção 361, casa.
    { id: "ap-ens", programaPpaId: "pp12", acaoId: "a2001", unidadeExecutoraId: "u2", funcaoId: "f12", subfuncaoId: "s361", produto: "Aluno atendido", unidadeMedida: "un", metaFisica: "1000", metaFinanceira: "100000.00", criadoPor: POR },
    // Não declara: qualquer unidade, função e subfunção casam.
    { id: "ap-sau", programaPpaId: "pp20", acaoId: "a2010", produto: "Consulta", unidadeMedida: "un", metaFisica: "5000", metaFinanceira: "40000.00", criadoPor: POR },
  ] });
}, 120000);

let numero = 0;
const ficha = (exercicio: number, unidadeOrcId: string, funcaoId: string, subfuncaoId: string, programaId: string, acaoId: string, valorDotado: string) => {
  numero += 1;
  return criarFichaDeTeste(prisma, { id: `fi-${String(numero)}`, exercicio, numero, orgaoId: unidadeOrcId === "u2" ? "o2" : "o3", unidadeOrcId, funcaoId, subfuncaoId, programaId, acaoId, naturezaDespesaId: "nd", fonteId: "fnt", valorDotado });
};

describe("V37 — o vínculo PPA → LOA", () => {
  it("t1: cada ação do plano com as fichas que a executam; a meta vigente leva os atos; a ficha sem ação, com o motivo", async () => {
    await ficha(2026, "u2", "f12", "s361", "p12", "a2001", "30000.00"); // ap-ens
    await ficha(2027, "u2", "f12", "s361", "p12", "a2001", "20000.00"); // ap-ens, outro exercício do plano
    await ficha(2030, "u2", "f12", "s361", "p12", "a2001", "99000.00"); // fora do plano: não soma
    await ficha(2026, "u3", "f10", "s301", "p20", "a2010", "10000.00"); // ap-sau
    await ficha(2026, "u2", "f12", "s361", "p20", "a2010", "5000.00"); // ap-sau (não declara classificação)
    await ficha(2026, "u3", "f12", "s361", "p12", "a2001", "7000.00"); // a ação do ensino noutra unidade
    await ficha(2026, "u2", "f12", "s361", "p12", "a1001", "3000.00"); // ação fora do plano
    // Um ato de alteração soma 5.000 à meta financeira da ação do ensino.
    await prisma.atoDeAlteracaoDoPlanejamento.create({ data: { id: "ato", planoId: "ppa", numero: "10", ano: 2026, data: new Date("2026-03-01T15:00:00Z"), dataPublicacao: new Date("2026-03-02T15:00:00Z"), fundamento: "Lei 10/2026", criadoPor: POR } });
    await prisma.alteracaoDeValorPlanejado.create({ data: { atoId: "ato", acaoPpaId: "ap-ens", grandeza: "metaFinanceira", valorAjuste: "5000.00", criadoPor: POR } });

    const v = await vinculoPpaLoa(prisma, { exercicio: 2026 });
    expect(v.plano?.leiRef).toBe("Lei 1/2025");
    expect(v.acoes.map((a) => [a.acao, a.recorte, a.metaFinanceiraVigente, a.dotacaoNoExercicio, a.dotacaoNoPlano, a.fichas.map((f) => f.valorDotado)])).toEqual([
      ["2001 — Manutenção do ensino", "unidade 02001, função 12, subfunção 361", "105000.00", "30000.00", "50000.00", ["30000.00"]],
      ["2010 — Atenção básica", null, "40000.00", "15000.00", "15000.00", ["10000.00", "5000.00"]],
    ]);
    expect(v.fichasSemAcao.map((f) => [f.valorDotado, f.motivo])).toEqual([
      ["7000.00", "A ação 2001 do programa 0012 está no plano com outra unidade executora, função ou subfunção."],
      ["3000.00", "O programa 0012 com a ação 1001 não está no plano Lei 1/2025."],
    ]);
    expect([v.totalDotadoNoExercicio, v.totalDotadoComAcao]).toEqual(["55000.00", "45000.00"]);
  });

  it("t2: exercício sem plano lista todas as fichas com o motivo; dois planos sobrepostos são recusados nomeando-os", async () => {
    await ficha(2031, "u2", "f12", "s361", "p12", "a2001", "1000.00");
    await ficha(2031, "u3", "f10", "s301", "p20", "a2010", "2000.00");
    const sem = await vinculoPpaLoa(prisma, { exercicio: 2031 });
    expect([sem.plano, sem.acoes.length, sem.fichasSemAcao.map((f) => f.motivo)]).toEqual([null, 0, ["Nenhum plano plurianual cobre 2031.", "Nenhum plano plurianual cobre 2031."]]);

    await prisma.planoPlurianual.create({ data: { id: "ppa2", anoInicio: 2028, anoFim: 2031, leiRef: "Lei 2/2027", dataPublicacao: new Date("2027-12-20T15:00:00Z"), criadoPor: POR } });
    await expect(vinculoPpaLoa(prisma, { exercicio: 2028 })).rejects.toThrow(/Há 2 planos plurianuais cobrindo 2028 \(2026-2029, 2028-2031\)/);
  });
});
