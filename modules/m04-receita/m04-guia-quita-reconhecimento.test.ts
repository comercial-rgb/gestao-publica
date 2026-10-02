import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { arrecadarQuitandoReconhecimento } from "./arrecadacao-vinculada.js";
import { estornarReconhecimento, reconhecerReceita, saldoReconhecidoDe } from "./reconhecimento.js";

/**
 * V28 — A GUIA DA TELA QUITANDO UM CRÉDITO JÁ RECONHECIDO.
 *
 * O defeito: a guia da tela creditava sempre a VPA. Constituído o IPTU (D crédito a receber ×
 * C VPA), pagar a guia lançava a VPA de novo e o crédito a receber ficava aberto para sempre.
 *
 * Contas do plano de produção (seed): crédito a receber 1.1.2.1.1.99.00, VPA 4.1.1.2.1.01.00,
 * bancos 1.1.1.1.1.00.00.
 *
 * À mão, N=2 créditos (A 1.000,00 e B 600,00), duas guias quitando A (400,00 e 600,00):
 *   depois dos reconhecimentos  →  crédito a receber 1.600 · VPA 1.600
 *   depois das duas guias       →  crédito a receber   600 · VPA 1.600 (não muda) · bancos 1.000
 *   saldo de A = 0 · saldo de B = 600
 * Pelo caminho antigo (VPA na guia), a VPA terminaria em 2.600 e o crédito a receber em 1.600.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "tesouraria@cg.pb.gov.br";
const LEITOR = "so.consulta.receita@cg.pb.gov.br";
const NAT_IPTU = "11180111";
const NAT_ITBI = "11180141";
const CR = "1.1.2.1.1.99.00";
const VPA = "4.1.1.2.1.01.00";
const BANCOS = "1.1.1.1.1.00.00";
const DATA = new Date("2026-03-10T15:00:00Z");

let guias = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU - Principal" },
      { id: "nr-itbi", codigo: NAT_ITBI, descricao: "ITBI - Principal" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "f500", codigo: "500", descricao: "Recursos nao vinculados", codigoTce: "500" },
      { id: "f540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.deParaFonteNaturezaDdr.createMany({
    data: [
      { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "Recurso ordinario do tesouro, fixture.", versao: 1, criadoPor: POR },
      { fonteCodigo: "540", natureza: "VINCULADOS", fundamento: "Vinculacao constitucional, fixture.", versao: 1, criadoPor: POR },
    ],
  });
  const bancos = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: BANCOS }, select: { id: true } });
  await prisma.contaBancaria.create({ data: { id: "cb-1", codigo: "CC-001", descricao: "Conta unica", fonteId: "f500", contaContabilId: bancos.id } });
  await prisma.fonteDaContaBancaria.createMany({
    data: [
      { contaBancariaId: "cb-1", fonteId: "f500", criadoPor: POR },
      { contaBancariaId: "cb-1", fonteId: "f540", criadoPor: POR },
    ],
  });
  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "f500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "f540", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-itbi", fonteId: "f500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00" },
    ],
  });
  const cr = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: CR }, select: { id: true } });
  const vpa = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: VPA }, select: { id: true } });
  await prisma.roteiroReconhecimento.create({
    data: { origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA", contaCreditoAReceberId: cr.id, contaVpaId: vpa.id, criadoPor: POR },
  });
  const leitor = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_RECEITA", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_RECEITA", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

async function reconhecer(valor: string, historico: string, fonteId = "f500"): Promise<string> {
  const r = await reconhecerReceita(prisma, {
    naturezaCodigo: NAT_IPTU, fonteId, dataFatoGerador: new Date("2026-01-02T15:00:00Z"),
    valor, historico, criadoPor: POR,
  });
  return r.reconhecimentoId;
}

function quitar(reconhecimentoId: string, valor: string, o: { natureza?: string; fonte?: string; criadoPor?: string } = {}) {
  guias += 1;
  return arrecadarQuitandoReconhecimento(prisma, {
    arrecadacao: {
      exercicio: 2026, naturezaReceita: o.natureza ?? NAT_IPTU, fonte: o.fonte ?? "500", exercicioFonte: 1,
      valor, dataArrecadacao: DATA, numeroReceita: `G-${guias}`, contaBancaria: "CC-001", criadoPor: o.criadoPor ?? POR,
    },
    disponibilidade: BANCOS,
    naturezaDaFonte: "ORDINARIOS",
    reconhecimentoId,
  });
}

/** Saldo natural: devedora ΣD−ΣC, credora ΣC−ΣD. */
async function saldo(codigo: string, credora = false): Promise<string> {
  const s = await saldoDasContas(prisma, [codigo], null);
  return (credora ? s.negated() : s).toFixed(2);
}

describe("V28 — a guia da tela quita o crédito reconhecido sem repetir a VPA", () => {
  beforeEach(semear);

  it("t1: N=2 créditos, duas guias sobre A — a VPA não dobra, o crédito a receber baixa e B fica intacto", async () => {
    const a = await reconhecer("1000.00", "IPTU 2026 do imovel 01");
    const b = await reconhecer("600.00", "IPTU 2026 do imovel 02");
    expect(await saldo(CR)).toBe("1600.00");
    expect(await saldo(VPA, true)).toBe("1600.00");

    await quitar(a, "400.00");
    await quitar(a, "600.00");

    expect(await saldo(VPA, true)).toBe("1600.00");
    expect(await saldo(CR)).toBe("600.00");
    expect(await saldo(BANCOS)).toBe("1000.00");
    expect((await saldoReconhecidoDe(prisma, a)).toFixed(2)).toBe("0.00");
    expect((await saldoReconhecidoDe(prisma, b)).toFixed(2)).toBe("600.00");
    expect(await prisma.vinculoArrecadacaoReconhecimento.count({ where: { reconhecimentoId: a } })).toBe(2);
  });

  it("t2: guia acima do saldo do crédito recusa dentro da trava, e nem a guia nem o lançamento ficam", async () => {
    const a = await reconhecer("1000.00", "IPTU 2026 do imovel 01");
    await quitar(a, "1000.00");
    const guiasAntes = await prisma.receitaArrecadada.count();
    const lancsAntes = await prisma.lancamentoContabil.count();
    await expect(quitar(a, "0.01")).rejects.toThrow(/VÍNCULO ACIMA DO SALDO RECONHECIDO/);
    expect(await prisma.receitaArrecadada.count()).toBe(guiasAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
  });

  it("t3: natureza diferente, fonte diferente, crédito estornado e origem sem roteiro recusam ANTES de gravar, nomeando o motivo", async () => {
    const a = await reconhecer("1000.00", "IPTU 2026 do imovel 01");
    const c540 = await reconhecer("300.00", "IPTU 2026 do imovel 03", "f540");
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(quitar(a, "100.00", { natureza: NAT_ITBI })).rejects.toThrow(/só quita crédito da mesma natureza/);
    await expect(quitar(c540, "100.00")).rejects.toThrow(/só quita crédito da mesma fonte/);
    await estornarReconhecimento(prisma, { reconhecimentoId: a, motivo: "Lancado em duplicidade, fixture.", criadoPor: POR });
    await expect(quitar(a, "100.00")).rejects.toThrow(/foi estornado e não pode ser quitado/);

    const lancsDepoisDoEstorno = await prisma.lancamentoContabil.count();
    expect(lancsDepoisDoEstorno).toBe(lancsAntes + 1); // só o estorno do reconhecimento
    await prisma.roteiroReconhecimento.deleteMany({});
    await expect(quitar(c540, "100.00", { fonte: "540" })).rejects.toThrow(/não tem roteiro de reconhecimento/);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsDepoisDoEstorno);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("t4: quem só consulta a receita não arrecada — recusa nomeando a ação, e nada nasce", async () => {
    const a = await reconhecer("1000.00", "IPTU 2026 do imovel 01");
    await expect(quitar(a, "100.00", { criadoPor: LEITOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_ARRECADACAO/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });
});
