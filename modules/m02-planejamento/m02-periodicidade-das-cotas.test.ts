import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { mesesDoPeriodo } from "../m05-despesa/guard-cmd.js";
import { empenhar } from "../m05-despesa/servico.js";
import { acompanhamentoDasCotasCmd, declararPeriodicidadeDasCotas, registrarEventoLimitacao, registrarVersaoCmd } from "./programacao.js";

/**
 * V36 — A PERIODICIDADE DO CONTROLE DAS COTAS (TR 5.9.3.33). Contas à mão, N=2 fontes (A e B), cota de 1.000,00 por
 * mês em cada uma, limitação ligada:
 *   bimestral: em janeiro, A empenha 1.500,00 (no mensal seria recusado: teto 1.000,00); o bimestre jan–fev tem teto
 *   2.000,00, então fevereiro aceita 500,00 e recusa 500,01. A fonte B não sente o consumo de A. Março abre outro
 *   bimestre.
 *   versionada: bimestral desde 01/03 deixa janeiro no mensal.
 *   corrida: dois empenhos de 1.200,00 em janeiro e em fevereiro, ao mesmo tempo, no bimestre de 2.000,00 — um passa.
 *   relatório: o saldo do período é o que o guard deixa empenhar.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "orcamento@cg.pb.gov.br";
const A = "fnt-500";
const B = "fnt-540";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const deps = () => criarM05Deps(prisma);

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.createMany({ data: [{ id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" }, { id: "aca2", codigo: "2002", descricao: "N", tipo: "ATIVIDADE" }] });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: A, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: B, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  for (const [id, numero, fonteId, acaoId] of [["ficha-a", 1, A, "aca"], ["ficha-a2", 3, A, "aca2"], ["ficha-b", 2, B, "aca"]] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: 2026, numero, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
      programaId: "prg", acaoId, naturezaDespesaId: "nd", fonteId, valorDotado: "100000.00",
    });
  }
  const cotas = [A, B].flatMap((fonteId) => [1, 2, 3, 4].map((mes) => ({ fonteId, mes, valor: "1000.00" })));
  await registrarVersaoCmd(prisma, { exercicio: 2026, atoRef: "DEC-1", vigenteDesde: new Date("2026-01-01T03:00:00Z"), criadoPor: POR, cotas });
  await registrarEventoLimitacao(prisma, { exercicio: 2026, ativo: true, atoRef: "DEC-LIM", motivo: "contingenciamento art. 9 LRF", criadoPor: POR });
}

const emp = async (fichaId: string, numero: string, valor: string, data: string): Promise<string> =>
  (await empenhar({ fichaId, numero, tipo: "ORDINARIO", valor, data: new Date(data), credorCpfCnpj: "12345678000195", historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;

const bimestral = (desde = "2026-01-01T03:00:00Z") =>
  declararPeriodicidadeDasCotas(prisma, { exercicio: 2026, periodicidade: "BIMESTRAL", vigenteDesde: new Date(desde), atoRef: "DEC-PER", criadoPor: POR });

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M02 V36 — periodicidade do controle das cotas", () => {
  beforeEach(semear, 60000);

  it("t1: o período do ano civil que contém o mês", () => {
    expect([1, 2, 3, 12].map((m) => mesesDoPeriodo("MENSAL", m))).toEqual([{ primeiro: 1, quantidade: 1 }, { primeiro: 2, quantidade: 1 }, { primeiro: 3, quantidade: 1 }, { primeiro: 12, quantidade: 1 }]);
    expect([1, 2, 3, 4, 12].map((m) => mesesDoPeriodo("BIMESTRAL", m).primeiro)).toEqual([1, 1, 3, 3, 11]);
    expect([3, 4, 9, 10].map((m) => mesesDoPeriodo("TRIMESTRAL", m).primeiro)).toEqual([1, 4, 7, 10]);
    expect([6, 7].map((m) => mesesDoPeriodo("SEMESTRAL", m))).toEqual([{ primeiro: 1, quantidade: 6 }, { primeiro: 7, quantidade: 6 }]);
  });

  it("t2: bimestral — a cota de fevereiro cobre janeiro no mesmo bimestre, nunca fora dele; a outra fonte não sente", async () => {
    expect(await recusa(() => emp("ficha-a", "NE-0", "1500.00", "2026-01-10T15:00:00Z"))).toMatch(/ESTOURADA na fonte 500, mês 1\/2026/);
    await bimestral();
    await emp("ficha-a", "NE-1", "1500.00", "2026-01-10T15:00:00Z");
    expect(await recusa(() => emp("ficha-a", "NE-2", "500.01", "2026-02-10T15:00:00Z"))).toMatch(/ESTOURADA na fonte 500, bimestre de 1\/2026 a 2\/2026[\s\S]*teto do período \.* 2000\.00[\s\S]*já empenhado \(líquido\) \.* 1500\.00/);
    await emp("ficha-a", "NE-3", "500.00", "2026-02-10T15:00:00Z");
    await emp("ficha-b", "NE-4", "2000.00", "2026-02-11T15:00:00Z");
    expect(await recusa(() => emp("ficha-a", "NE-5", "2000.01", "2026-03-02T15:00:00Z"))).toMatch(/bimestre de 3\/2026 a 4\/2026/);
    await emp("ficha-a", "NE-6", "2000.00", "2026-03-02T15:00:00Z");
  });

  it("t3: versionada — bimestral desde 01/03 deixa janeiro no mensal; repetir e sair do exercício são recusados", async () => {
    await bimestral("2026-03-01T15:00:00Z");
    expect(await recusa(() => emp("ficha-a", "NE-1", "1000.01", "2026-01-10T15:00:00Z"))).toMatch(/mês 1\/2026/);
    await emp("ficha-a", "NE-2", "1500.00", "2026-03-10T15:00:00Z");
    expect(await recusa(() => bimestral("2026-04-01T15:00:00Z"))).toMatch(/já é bimestral nessa data/);
    expect(await recusa(() => declararPeriodicidadeDasCotas(prisma, { exercicio: 2026, periodicidade: "TRIMESTRAL", vigenteDesde: new Date("2027-01-05T15:00:00Z"), atoRef: "X", criadoPor: POR }))).toMatch(/não é do exercício 2026/);
    expect(await prisma.periodicidadeDasCotasCmd.count()).toBe(1);
  });

  it("t4: quem não fixa o cronograma não declara a periodicidade", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.cmd@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_CMD", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => declararPeriodicidadeDasCotas(prisma, { exercicio: 2026, periodicidade: "SEMESTRAL", vigenteDesde: new Date("2026-01-01T15:00:00Z"), atoRef: "X", criadoPor: "so.le.cmd@cg.pb.gov.br" }))).toMatch(/CRIAR_VERSAO_CMD/);
    expect(await prisma.periodicidadeDasCotasCmd.count()).toBe(0);
  });

  it("t5: o saldo do período no relatório é o que o guard deixa empenhar", async () => {
    await bimestral();
    await emp("ficha-a", "NE-1", "1500.00", "2026-01-10T15:00:00Z");
    const ls = await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 });
    const jan = ls.find((l) => l.fonteId === A && l.mes === 1);
    const fev = ls.find((l) => l.fonteId === A && l.mes === 2);
    expect([jan?.periodo, jan?.saldo, jan?.saldoDoPeriodo, fev?.saldoDoPeriodo]).toEqual(["1 a 2", "-500.00", "500.00", "500.00"]);
    expect(await recusa(() => emp("ficha-a", "NE-X", "500.01", "2026-02-20T15:00:00Z"))).toMatch(/ESTOURADA/);
    await emp("ficha-a", "NE-Y", fev?.saldoDoPeriodo ?? "0", "2026-02-20T15:00:00Z");
  });

  it("t6: corrida — 1.200,00 em janeiro e 1.200,00 em fevereiro, ao mesmo tempo, no bimestre de 2.000,00: um só passa (5 rodadas)", async () => {
    await bimestral();
    for (let r = 0; r < 5; r++) {
      if (r > 0) {
        await semear();
        await bimestral();
      }
      const rs = await Promise.allSettled([
        emp("ficha-a", `NE-J${String(r)}`, "1200.00", "2026-01-12T15:00:00Z"),
        emp("ficha-a2", `NE-F${String(r)}`, "1200.00", "2026-02-12T15:00:00Z"),
      ]);
      expect(rs.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const motivo = rs.find((x) => x.status === "rejected");
      expect(motivo?.status === "rejected" ? String(motivo.reason) : "").toMatch(/ESTOURADA na fonte 500, bimestre de 1\/2026 a 2\/2026/);
    }
  }, 180000);
});
