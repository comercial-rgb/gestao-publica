import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { anularEmpenhoParcial } from "./anulacao-parcial.js";
import { roteiroEmpenho } from "./dominio.js";
import { disponivelDaFichaNaData } from "./saldo-na-data.js";
import { empenhar } from "./servico.js";

/**
 * V36 (TR 5.10.1.10) — O SALDO DA DOTAÇÃO NA DATA DE EMISSÃO DO EMPENHO, além do de agora.
 *
 * ═══ AS CONTAS, À MÃO ═══ ficha dotada com 1.000,00 em 01/01.
 *   NE-A, 1.000,00 em 01/03 → disponível 0,00 desde 01/03.
 *   NE-A anulado parcialmente em 300,00 em 10/05 e em 700,00 em 20/05 → hoje o disponível é 1.000,00;
 *   mas em 15/04 era 0,00, em 10/05 era 300,00 e de 20/05 em diante 1.000,00.
 *   Empenho de 1,00 datado de 15/04: cabe hoje, não cabe na data → recusado com o motivo, nada gravado.
 *   Empenho de 300,01 datado de 10/05: recusado (na data, 300,00). De 300,00 em 10/05: passa (N=2 nas anulações:
 *   a parcial de 10/05 conta no próprio dia, a de 20/05 não).
 *   Depois, 700,00 em 25/05 passa (na data: 1.000 − 300 = 700) e 0,01 em 26/05 é recusado pela guarda de AGORA.
 * Todas as datas em hora de borda (22:00 civis): um corte em UTC tiraria do dia a anulação de 10/05.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-1";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const dia = (mes: number, d: number): Date => DIA_DE_BORDA(2026, mes, d);

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 7, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "1000.00",
  });
});

const deps = () => criarM05DepsComContratos(prisma);
const empenha = (numero: string, valor: string, data: Date) =>
  empenhar({ fichaId: FICHA, numero, tipo: "ORDINARIO", valor, data, credorCpfCnpj: "11144477735", historico: "fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps());
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "(não recusou)";
};
const naData = async (d: string) => {
  const s = await disponivelDaFichaNaData(prisma, FICHA, d);
  return `${s.naData.toFixed(2)}/${s.atual.toFixed(2)}`;
};

describe("M05 — o saldo da dotação na data de emissão do empenho", () => {
  it("t1: o crédito devolvido por anulação posterior não serve ao empenho anterior; na data dela, serve (N=2 anulações)", async () => {
    const a = await empenha("NE-A", "1000.00", dia(3, 1));
    await anularEmpenhoParcial({ originalId: a.empenhoId, numero: "NE-A-AP", valor: "300.00", data: dia(5, 10), motivo: "Saldo não utilizado do empenho", criadoPor: POR }, deps());
    await anularEmpenhoParcial({ originalId: a.empenhoId, numero: "NE-A-AP2", valor: "700.00", data: dia(5, 20), motivo: "Saldo não utilizado do empenho", criadoPor: POR }, deps());

    // A leitura das duas datas (o que a tela mostra).
    expect(await naData("2026-04-15")).toBe("0.00/1000.00");
    expect(await naData("2026-05-10")).toBe("300.00/1000.00");
    expect(await naData("2026-05-19")).toBe("300.00/1000.00");
    expect(await naData("2026-05-20")).toBe("1000.00/1000.00");

    const antes = await prisma.empenho.count();
    expect(await recusa(() => empenha("NE-B", "1.00", dia(4, 15)))).toMatch(
      /Saldo insuficiente na ficha 7 na data do empenho \(15\/04\/2026\): disponível naquela data R\$ 0,00, solicitado R\$ 1,00\. Crédito, anulação ou empenho com data posterior não conta.*Nada foi gravado\./
    );
    expect(await recusa(() => empenha("NE-B", "300.01", dia(5, 10)))).toMatch(/na data do empenho \(10\/05\/2026\): disponível naquela data R\$ 300,00, solicitado R\$ 300,01/);
    expect(await prisma.empenho.count()).toBe(antes);
    expect((await prisma.movimentoDotacao.count({ where: { fichaId: FICHA, tipo: "EMPENHO" } }))).toBe(1);

    await empenha("NE-B", "300.00", dia(5, 10));
    expect(await naData("2026-05-25")).toBe("700.00/700.00");
    await empenha("NE-C", "700.00", dia(5, 25));
    // Agora a guarda que recusa é a de hoje (e a da data concordaria): nada mais cabe.
    expect(await recusa(() => empenha("NE-D", "0.01", dia(5, 26)))).toMatch(/Saldo insuficiente na ficha ficha-1: disponível 0\.00, solicitado 0\.01/);
    expect(await naData("2026-05-10")).toBe("0.00/0.00");
  });

  it("t2: empenho com data anterior não consome o disponível que um empenho anterior a ele já consumiu, ainda que gravado depois", async () => {
    // Dois empenhos gravados fora de ordem: o de 20/03 primeiro (600), depois um de 10/03 (400) — os dois cabem na data
    // deles. Um terceiro de 15/03 já não cabe: em 15/03 o de 10/03 consumiu 400 e a dotação é 1.000 → 600 livres,
    // mas hoje só restam 0,00 — e a guarda de hoje é quem recusa primeiro.
    await empenha("NE-1", "600.00", dia(3, 20));
    await empenha("NE-2", "400.00", dia(3, 10));
    expect(await naData("2026-03-15")).toBe("600.00/0.00");
    expect(await naData("2026-03-10")).toBe("600.00/0.00");
    expect(await naData("2026-03-09")).toBe("1000.00/0.00");
    expect(await recusa(() => empenha("NE-3", "0.01", dia(3, 15)))).toMatch(/disponível 0\.00, solicitado 0\.01/);
  });
});
