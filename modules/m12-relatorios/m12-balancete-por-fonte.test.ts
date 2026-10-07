import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_RECEITA_A_REALIZAR,
  CONTA_RECEITA_REALIZADA,
} from "../m01-core-contabil/roteiros.js";
import { criarM01Deps } from "../m01-core-contabil/adapter-prisma.js";
import { registrarLancamento } from "../m01-core-contabil/servico.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { balancete } from "./livros.js";
import { balancetePorFonte, FONTE_NAO_IDENTIFICADA, type LinhaPorFonte } from "./balancete-por-fonte.js";

/**
 * M12 — BALANCETE POR FONTE DE RECURSOS.
 *
 * ═══ OS FATOS, E AS CONTAS FEITAS À MÃO ═══
 *   01/01  dotação da ficha (fonte 500) 100.000   C CRED_DISPONIVEL 100.000 (pela ficha)
 *   10/06  arrecadação fonte 500    1.000   D CAIXA / C VPA ; D R_A_REALIZAR / C R_REALIZADA
 *   10/07  arrecadação fonte 500   10.000   idem
 *   12/07  arrecadação fonte 540    3.000   idem
 *   15/07  empenho fonte 500        6.000   D CRED_DISPONIVEL / C CRED_EMPENHADO
 *   20/07  lançamento avulso          250   D CAIXA / C ATIVO  (sem fato: fonte não identificada)
 *
 * Período: julho/2026.
 *   CAIXA × 500 ....... anterior D 1.000 · débito 10.000 · final D 11.000
 *   CAIXA × 540 ....... anterior 0       · débito  3.000 · final D  3.000
 *   CAIXA × não ident.  anterior 0       · débito    250 · final D    250
 *   VPA × 500 ......... anterior C 1.000 · crédito 10.000 · final C 11.000
 *   VPA × 540 ......... crédito 3.000 · final C 3.000
 *   CRED_DISPONIVEL × 500  anterior C 100.000 · débito 6.000 · final C 94.000
 *   Resumo da fonte 540 (todas as contas): débito 3.000+3.000 = 6.000, crédito 6.000.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "siconfi@cg.pb.gov.br";
const CAIXA = "1.1.1.1.2.00.00";
const ATIVO = "1.1.2.1.1.00.00";
const VPA = "4.1.1.2.1.01.00";

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: CONTA_RECEITA_A_REALIZAR, receitaRealizada: CONTA_RECEITA_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
});

const dia = (d: string): Date => new Date(`${d}T15:00:00.000Z`);
const JULHO = { desde: new Date("2026-07-01T03:00:00.000Z"), ate: new Date("2026-08-01T02:59:59.999Z") };

async function arrecadar(fonte: string, valor: string, data: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: "11180111", fonte, valor, dataArrecadacao: dia(data), numeroReceita: guia, criadoPor: POR },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { codigo: ATIVO, nome: "Créditos a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: CONTA_RECEITA_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: CONTA_RECEITA_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: CONTA_CREDITO_DISPONIVEL, nome: "Crédito disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR, nome: "Crédito empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: "11180111", descricao: "IPTU" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await criarFichaDeTeste(prisma, {
    id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "100000.00",
  });

  await arrecadar("500", "1000.00", "2026-06-10", "G-1");
  await arrecadar("500", "10000.00", "2026-07-10", "G-2");
  await arrecadar("540", "3000.00", "2026-07-12", "G-3");
  await empenhar(
    {
      fichaId: "ficha-1", numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00", data: dia("2026-07-15"),
      credorCpfCnpj: "12345678000195", historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    criarM05Deps(prisma)
  );
  await registrarLancamento(
    {
      numeroControle: "2026AV000001", dataTransacao: dia("2026-07-20"), historico: "Ajuste avulso", origemTipo: "AJUSTE", criadoPor: POR,
      partidas: [
        { conta: CAIXA, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "250.00" },
        { conta: ATIVO, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "250.00" },
      ],
    },
    criarM01Deps(prisma)
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

const linha = (ls: readonly LinhaPorFonte[], conta: string, fonte: string): LinhaPorFonte | undefined =>
  ls.find((l) => l.conta === conta && l.fonte === fonte);
const resumida = (l: LinhaPorFonte | undefined): string[] =>
  l === undefined ? [] : [l.saldoAnteriorDevedor, l.saldoAnteriorCredor, l.movimentoDebito, l.movimentoCredito, l.saldoFinalDevedor, l.saldoFinalCredor];

describe("M12 — balancete por fonte de recursos", () => {
  it("t1: cada conta se parte pelas fontes dos fatos, com saldo anterior, movimento e final", async () => {
    const b = await balancetePorFonte(prisma, JULHO);
    expect(resumida(linha(b.linhas, CAIXA, "500"))).toEqual(["1000.00", "0.00", "10000.00", "0.00", "11000.00", "0.00"]);
    expect(resumida(linha(b.linhas, CAIXA, "540"))).toEqual(["0.00", "0.00", "3000.00", "0.00", "3000.00", "0.00"]);
    expect(resumida(linha(b.linhas, VPA, "500"))).toEqual(["0.00", "1000.00", "0.00", "10000.00", "0.00", "11000.00"]);
    expect(resumida(linha(b.linhas, VPA, "540"))).toEqual(["0.00", "0.00", "0.00", "3000.00", "0.00", "3000.00"]);
    expect(resumida(linha(b.linhas, CONTA_CREDITO_DISPONIVEL, "500"))).toEqual(["0.00", "100000.00", "6000.00", "0.00", "0.00", "94000.00"]);
    expect(linha(b.linhas, CONTA_CREDITO_DISPONIVEL, "540")).toBeUndefined();
  });

  it("t2: o lançamento sem fato aparece como fonte não identificada, e é contado", async () => {
    const b = await balancetePorFonte(prisma, JULHO);
    expect(resumida(linha(b.linhas, CAIXA, FONTE_NAO_IDENTIFICADA))).toEqual(["0.00", "0.00", "250.00", "0.00", "250.00", "0.00"]);
    expect(resumida(linha(b.linhas, ATIVO, FONTE_NAO_IDENTIFICADA))).toEqual(["0.00", "0.00", "0.00", "250.00", "0.00", "250.00"]);
    expect(b.lancamentosSemFonteIdentificada).toBe(1);
  });

  it("t3 (B1): somadas as fontes, cada conta reconstitui a linha do balancete comum", async () => {
    const [porFonte, comum] = await Promise.all([
      balancetePorFonte(prisma, JULHO),
      balancete(prisma, { ...JULHO, modo: "ANALITICO" }),
    ]);
    expect(comum.linhas.length).toBeGreaterThanOrEqual(5);
    for (const c of comum.linhas) {
      const das = porFonte.linhas.filter((l) => l.conta === c.conta);
      const liq = (ls: readonly LinhaPorFonte[], d: (l: LinhaPorFonte) => string, cr: (l: LinhaPorFonte) => string): string =>
        ls.reduce((t, l) => toMoney(t.plus(d(l)).minus(cr(l))), toMoney("0.00")).toFixed(2);
      expect(liq(das, (l) => l.saldoFinalDevedor, (l) => l.saldoFinalCredor), c.conta).toBe(toMoney(toMoney(c.saldoFinalDevedor).minus(c.saldoFinalCredor)).toFixed(2));
      expect(liq(das, (l) => l.saldoAnteriorDevedor, (l) => l.saldoAnteriorCredor), c.conta).toBe(toMoney(toMoney(c.saldoAnteriorDevedor).minus(c.saldoAnteriorCredor)).toFixed(2));
      expect(liq(das, (l) => l.movimentoDebito, () => "0"), c.conta).toBe(toMoney(c.movimentoDebito).toFixed(2));
      expect(liq(das, () => "0", (l) => l.movimentoCredito), c.conta).toBe(toMoney(toMoney(c.movimentoCredito).negated()).toFixed(2));
    }
  });

  it("t4: o filtro por fonte e por conta recorta, e o resumo soma a fonte", async () => {
    const so540 = await balancetePorFonte(prisma, { ...JULHO, fontes: ["540"] });
    expect(new Set(so540.linhas.map((l) => l.fonte))).toEqual(new Set(["540"]));
    expect(so540.linhas.map((l) => l.conta).sort()).toEqual([CAIXA, CONTA_RECEITA_A_REALIZAR, CONTA_RECEITA_REALIZADA, VPA].sort());
    expect(so540.resumo).toEqual([
      { fonte: "540", saldoAnteriorDevedor: "0.00", saldoAnteriorCredor: "0.00", movimentoDebito: "6000.00", movimentoCredito: "6000.00", saldoFinalDevedor: "6000.00", saldoFinalCredor: "6000.00" },
    ]);

    const caixaEDuas = await balancetePorFonte(prisma, { ...JULHO, contas: [CAIXA, VPA], fontes: ["500", "540"] });
    expect(caixaEDuas.linhas.map((l) => `${l.conta}/${l.fonte}`)).toEqual([`${CAIXA}/500`, `${CAIXA}/540`, `${VPA}/500`, `${VPA}/540`]);
    expect(caixaEDuas.lancamentosSemFonteIdentificada).toBe(1);

    // Com a fonte inteira, débito e crédito de uma fonte fecham iguais (todo lançamento fecha);
    // recortado o caixa, o resumo da fonte 500 mostra os dois lados diferentes.
    const soCaixa = await balancetePorFonte(prisma, { ...JULHO, contas: [CAIXA] });
    expect(soCaixa.resumo.map((r) => [r.fonte, r.saldoAnteriorDevedor, r.movimentoDebito, r.movimentoCredito, r.saldoFinalDevedor])).toEqual([
      ["500", "1000.00", "10000.00", "0.00", "11000.00"],
      ["540", "0.00", "3000.00", "0.00", "3000.00"],
      [FONTE_NAO_IDENTIFICADA, "0.00", "250.00", "0.00", "250.00"],
    ]);
  });
});
