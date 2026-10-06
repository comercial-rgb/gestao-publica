import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { registrarDeducoesEmLote } from "./deducao-da-receita.js";
import { roteiroArrecadacao } from "./dominio.js";
import { registrarArrecadacao } from "./servico.js";

/**
 * V36 — VÁRIAS DEDUÇÕES DE UMA VEZ COM UMA SÓ CONTA (TR 5.10.2.11). Fixture do m04-deducao-da-receita, com N=2
 * naturezas arrecadadas (FPM 1.500,00 e ICMS 800,00, códigos do ementário carregado na base fictícia). Um lote de três
 * linhas (duas do FPM, uma do ICMS) grava três deduções e baixa o banco pela soma; uma linha que não cabe recusa o
 * lote inteiro nomeando a linha; as duas linhas da mesma natureza somam no teto.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m04@cg.pb.gov.br";
const SO_EMPENHA = "so.empenha.lote@cg.pb.gov.br";
const BANCO = "1.1.1.1.1.00.00";
const DOC = "Demonstrativo de distribuição da arrecadação BB — decêndio de março/2026";
const CONTAS = [
  { id: "c-banco", codigo: BANCO, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "4.5.2.1.1.00.00", nome: "VPA - Transferências", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "6.2.1.3.1.01.00", nome: "(-) FUNDEB", naturezaSaldo: "DEVEDORA" as const, nivel: 7, analitica: true },
  { codigo: "3.5.2.2.4.00.00", nome: "Transferências ao Fundeb - Inter OFSS - Estado", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { codigo: "8.2.1.1.1.01.00", nome: "Recursos disponíveis para o exercício", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
  { codigo: "8.2.1.1.4.04.00", nome: "Utilizada por dedução da receita orçamentária", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
];
const ROTEIRO = roteiroArrecadacao({ disponibilidade: BANCO, variacaoAumentativa: "4.5.2.1.1.00.00", receitaARealizar: "6.2.1.1.0.00.00", receitaRealizada: "6.2.1.2.0.00.00" });
const saldo = async (c: string): Promise<string> => (await saldoDasContas(prisma, [c], null)).toFixed(2);

describe("M04 V36 — deduções da receita em lote, com uma só conta", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
    await prisma.naturezaReceita.createMany({
      data: [
        { id: "nr-fpm", codigo: "17115111", descricao: "Cota-Parte do FPM - Cota Mensal - Principal" },
        { id: "nr-icms", codigo: "17215001", descricao: "Cota-Parte do ICMS - Principal" },
      ],
    });
    await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Recursos não Vinculados de Impostos", codigoTce: "500" } });
    await prisma.codigoAcompanhamento.create({ data: { codigo: "0001", descricao: "Execução direta" } });
    await prisma.contaBancaria.create({ data: { codigo: "CC-FPM", descricao: "FPM", fonteId: "f500", contaContabilId: "c-banco", banco: "001", agencia: "1234", conta: "56789", digitoConta: "0" } });
    const deps = criarM04Deps(prisma);
    for (const [natureza, valor, numero] of [["17115111", "1500.00", "0000001"], ["17215001", "800.00", "0000002"]] as const) {
      await registrarArrecadacao(
        { exercicio: 2026, naturezaReceita: natureza, fonte: "500", co: "0001", exercicioFonte: 1, valor, dataArrecadacao: new Date("2026-03-10T12:00:00Z"), numeroReceita: numero, criadoPor: POR },
        ROTEIRO,
        deps
      );
    }
    const p = await prisma.perfil.create({ data: { nome: "SO_EMPENHA_LOTE", descricao: "x", criadoPor: "SEED", permissoes: { create: [{ acao: "EMPENHAR" as never, criadoPor: "SEED" }] } }, select: { id: true } });
    const u = await prisma.usuario.create({ data: { identificador: SO_EMPENHA, nome: SO_EMPENHA, criadoPor: "SEED" }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const lote = (itens: readonly { naturezaReceita: string; valor: string }[], por = POR) =>
    registrarDeducoesEmLote(prisma, { dia: "2026-03-10", contaBancaria: "CC-FPM", documento: DOC, itens: itens.map((i) => ({ ...i, fonte: "500" })), criadoPor: por });

  it("t1: três linhas gravam três deduções na mesma conta, e o banco baixa pela soma", async () => {
    const r = await lote([{ naturezaReceita: "17115111", valor: "200.00" }, { naturezaReceita: "17115111", valor: "100.00" }, { naturezaReceita: "17215001", valor: "160.00" }]);
    expect(r).toHaveLength(3);
    const ds = await prisma.deducaoDaReceitaRealizada.findMany({ orderBy: { valor: "asc" }, select: { valor: true, documento: true, naturezaReceita: { select: { codigo: true } }, contaBancaria: { select: { codigo: true } } } });
    expect(ds.map((d) => [d.naturezaReceita.codigo, d.valor.toFixed(2), d.contaBancaria.codigo, d.documento])).toEqual([
      ["17115111", "100.00", "CC-FPM", DOC],
      ["17215001", "160.00", "CC-FPM", DOC],
      ["17115111", "200.00", "CC-FPM", DOC],
    ]);
    expect((await saldoDasContas(prisma, [BANCO], null)).toFixed(2)).toBe("1840.00");
  });

  it("t2: a linha que não cabe recusa o lote inteiro, nomeando a linha — e duas linhas da mesma natureza somam no teto", async () => {
    await expect(lote([{ naturezaReceita: "17215001", valor: "100.00" }, { naturezaReceita: "17115111", valor: "1000.00" }, { naturezaReceita: "17115111", valor: "500.01" }])).rejects.toThrow(
      /Linha 3 do lote \(natureza 17115111, fonte 500\):[\s\S]*1500\.00 arrecadados e 1000\.00 já deduzidos[\s\S]*cabem 500\.00/
    );
    expect(await prisma.deducaoDaReceitaRealizada.count()).toBe(0);
    expect((await saldoDasContas(prisma, [BANCO], null)).toFixed(2)).toBe("2300.00");
  });

  it("t3: quem não arrecada é recusado com o nome da ação; linha com valor zero é recusada antes de abrir a transação", async () => {
    await expect(lote([{ naturezaReceita: "17115111", valor: "10.00" }], SO_EMPENHA)).rejects.toThrow(/REGISTRAR_ARRECADACAO/);
    await expect(lote([{ naturezaReceita: "17115111", valor: "10.00" }, { naturezaReceita: "17215001", valor: "0.00" }])).rejects.toThrow(/Linha 2 do lote: o valor tem de ser maior que zero/);
    expect(await prisma.deducaoDaReceitaRealizada.count()).toBe(0);
  });
});
