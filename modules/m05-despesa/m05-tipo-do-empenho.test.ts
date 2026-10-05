import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao } from "./dominio.js";
import { empenhar } from "./servico.js";
import { anularLiquidacao, liquidar } from "./servico-bloco2.js";

/**
 * V35 B6 — O TIPO DO EMPENHO TEM REGRA (MCASP 11ª ed., Parte I, 4.4.2.1).
 *   Ordinário: "valor fixo e previamente determinado, cujo pagamento deva ocorrer de uma só vez" → uma liquidação viva.
 *   Global: "despesas contratuais ou outras de valor determinado, sujeitas a parcelamento" → várias.
 *   Estimativo: "montante não se pode determinar previamente" → várias.
 * Fixture N=2: duas liquidações de 300 sobre empenhos de 1.000, um de cada tipo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-1";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const D = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C_EMPENHADO, nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C_LIQUIDADO, nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: VPD, nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
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
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "100000.00",
  });
}

const deps = () => criarM05DepsComContratos(prisma);
const novoEmpenho = async (numero: string, tipo: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO") =>
  (await empenhar({ fichaId: FICHA, numero, tipo, valor: "1000.00", data: D("2026-02-01"), credorCpfCnpj: "11144477735", historico: "fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;
const liquidacao = (empenhoId: string, numero: string) =>
  liquidar({ empenhoId, numero, valor: "300.00", data: D("2026-02-10"), responsavelAtesto: "Fulano", historico: "parcela", criadoPor: POR }, R_LIQUIDACAO, deps());

describe("M05 — a regra do tipo do empenho", () => {
  beforeEach(semear);

  it("t1: o ordinário recusa a segunda liquidação, nomeando o motivo; global e estimativo aceitam parcelas", async () => {
    const ord = await novoEmpenho("NE-ORD", "ORDINARIO");
    await liquidacao(ord, "NL-1");
    await expect(liquidacao(ord, "NL-2")).rejects.toThrow(/NE-ORD é ORDINÁRIO e já tem liquidação de 300\.00.*pago de uma só vez \(MCASP, Parte I, 4\.4\.2\.1\).*GLOBAL.*ESTIMATIVO/);
    expect(await prisma.liquidacao.count({ where: { empenhoId: ord } })).toBe(1);

    for (const tipo of ["GLOBAL", "ESTIMATIVO"] as const) {
      const e = await novoEmpenho(`NE-${tipo}`, tipo);
      await liquidacao(e, `NL-${tipo}-1`);
      await liquidacao(e, `NL-${tipo}-2`);
      expect(await prisma.liquidacao.count({ where: { empenhoId: e } })).toBe(2);
    }
  });

  it("t2: estornada a liquidação do ordinário, ele se liquida de novo", async () => {
    const ord = await novoEmpenho("NE-ORD", "ORDINARIO");
    const { liquidacaoId } = await liquidacao(ord, "NL-1");
    await anularLiquidacao({ liquidacaoId, numero: "NL-1-ANUL", data: D("2026-02-11"), historico: "Atesto com valor errado, refeito", criadoPor: POR }, deps());
    await liquidacao(ord, "NL-2");
    expect(await prisma.liquidacao.count({ where: { empenhoId: ord, estornoDeId: null } })).toBe(2);
  });
});
