import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { acompanhamentoDasCotasCmd, liberarProgramacao, registrarEventoLimitacao, registrarVersaoCmd } from "./programacao.js";

/**
 * V36 — ACOMPANHAMENTO DAS COTAS DE DESPESA (TR 5.9.3.35): previsto (cota + liberações) × realizado (empenhado
 * líquido) por fonte e mês. N=2 fontes, N=2 meses, N=2 versões do cronograma (a de fevereiro troca a cota no meio
 * do mês). O t2 amarra o relatório ao guard: o saldo que o relatório mostra é exatamente o que o guard deixa empenhar.
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
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: A, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: B, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  for (const [id, numero, fonteId] of [["ficha-a", 1, A], ["ficha-b", 2, B]] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: 2026, numero, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId, valorDotado: "100000.00",
    });
  }
}

const emp = async (fichaId: string, numero: string, valor: string, data: string): Promise<string> =>
  (await empenhar({ fichaId, numero, tipo: "ORDINARIO", valor, data: new Date(data), credorCpfCnpj: "12345678000195", historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;

/** Duas versões: a 1 vale desde janeiro (jan 10.000, fev 10.000 nas duas fontes); a 2, desde 15/02, baixa fevereiro da fonte A para 8.000 (e janeiro para 9.000, que já passou: janeiro fica com a 1). */
async function programar(): Promise<void> {
  await registrarVersaoCmd(prisma, {
    exercicio: 2026, atoRef: "DEC-1", vigenteDesde: new Date("2026-01-01T03:00:00Z"), criadoPor: POR,
    cotas: [
      { fonteId: A, mes: 1, valor: "10000.00" }, { fonteId: A, mes: 2, valor: "10000.00" },
      { fonteId: B, mes: 1, valor: "1000.00" }, { fonteId: B, mes: 2, valor: "1000.00" },
    ],
  });
  await registrarVersaoCmd(prisma, {
    exercicio: 2026, atoRef: "DEC-2", vigenteDesde: new Date("2026-02-15T12:00:00Z"), criadoPor: POR,
    cotas: [
      { fonteId: A, mes: 1, valor: "9000.00" }, { fonteId: A, mes: 2, valor: "8000.00" },
      { fonteId: B, mes: 1, valor: "1000.00" }, { fonteId: B, mes: 2, valor: "1000.00" },
    ],
  });
  await liberarProgramacao(prisma, { exercicio: 2026, fonteId: A, mes: 2, valor: "500.00", atoRef: "DEC-LIB", motivo: "receita restabelecida no bimestre", criadoPor: POR });
}

const linha = (ls: Awaited<ReturnType<typeof acompanhamentoDasCotasCmd>>, fonteId: string, mes: number) => {
  const l = ls.find((x) => x.fonteId === fonteId && x.mes === mes);
  if (l === undefined) throw new Error(`sem linha ${fonteId}/${String(mes)}`);
  return { cota: l.cota, liberado: l.liberado, previsto: l.previsto, realizado: l.realizado, saldo: l.saldo };
};

describe("M02 V36 — acompanhamento das cotas de despesa", () => {
  beforeEach(semear, 60000);

  it("t1: por fonte e mês, a cota da versão vigente no fim do mês, as liberações e o empenhado líquido", async () => {
    await programar();
    const j1 = await emp("ficha-a", "NE-1", "3000.00", "2026-01-10T12:00:00Z");
    await emp("ficha-a", "NE-2", "2000.00", "2026-01-20T12:00:00Z");
    await emp("ficha-a", "NE-3", "7000.00", "2026-02-05T12:00:00Z");
    await emp("ficha-b", "NE-4", "400.00", "2026-01-15T12:00:00Z");
    const b2 = await emp("ficha-b", "NE-5", "1200.00", "2026-02-10T12:00:00Z");
    // anulação no MESMO mês devolve a cota; no mês seguinte não devolve a do mês do empenho (a régua do guard)
    await anularEmpenho({ empenhoId: b2, numero: "AN-5", data: new Date("2026-02-11T12:00:00Z"), historico: "anula", criadoPor: POR }, deps());
    await anularEmpenho({ empenhoId: j1, numero: "AN-1", data: new Date("2026-02-02T12:00:00Z"), historico: "anula", criadoPor: POR }, deps());

    const ls = await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 });
    expect(linha(ls, A, 1)).toEqual({ cota: "10000.00", liberado: "0.00", previsto: "10000.00", realizado: "5000.00", saldo: "5000.00" });
    expect(linha(ls, A, 2)).toEqual({ cota: "8000.00", liberado: "500.00", previsto: "8500.00", realizado: "7000.00", saldo: "1500.00" });
    expect(linha(ls, B, 1)).toEqual({ cota: "1000.00", liberado: "0.00", previsto: "1000.00", realizado: "400.00", saldo: "600.00" });
    expect(linha(ls, B, 2)).toEqual({ cota: "1000.00", liberado: "0.00", previsto: "1000.00", realizado: "0.00", saldo: "1000.00" });
    expect(linha(ls, A, 3)).toEqual({ cota: "0.00", liberado: "0.00", previsto: "0.00", realizado: "0.00", saldo: "0.00" });
    expect(ls).toHaveLength(24);
  });

  it("t2: o saldo do relatório é o que o guard deixa empenhar — um centavo a mais é recusado, o saldo exato passa", async () => {
    await programar();
    await emp("ficha-a", "NE-3", "7000.00", "2026-02-05T12:00:00Z");
    await registrarEventoLimitacao(prisma, { exercicio: 2026, ativo: true, atoRef: "DEC-LIM", motivo: "contingenciamento art. 9 LRF", criadoPor: POR });
    const saldo = linha(await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 }), A, 2).saldo;
    expect(saldo).toBe("1500.00");
    await expect(emp("ficha-a", "NE-X", "1500.01", "2026-02-25T12:00:00Z")).rejects.toThrow(/LIMITAÇÃO DE EMPENHO ESTOURADA na fonte 500, mês 2\/2026/);
    await emp("ficha-a", "NE-Y", saldo, "2026-02-25T12:00:00Z");
    expect(linha(await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 }), A, 2).saldo).toBe("0.00");
  });

  it("t3: empenho além do previsto (limitação desligada) aparece com saldo negativo; exercício sem cronograma lista só o realizado", async () => {
    await emp("ficha-b", "NE-1", "250.00", "2026-03-03T12:00:00Z");
    const ls = await acompanhamentoDasCotasCmd(prisma, { exercicio: 2026 });
    expect(linha(ls, B, 3)).toEqual({ cota: "0.00", liberado: "0.00", previsto: "0.00", realizado: "250.00", saldo: "-250.00" });
    expect(new Set(ls.map((l) => l.fonteId))).toEqual(new Set([B]));
  });
});
