import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { cadastrarDividaAtiva, inscreverDividaAtiva, saldoDaDividaAtivaEm } from "./divida-ativa.js";
import { cadastrarDivida, saldoDaDividaEm } from "./divida.js";
import { arrecadarIngressoDaOperacaoDeCredito, arrecadarRecebendoDividaAtiva } from "./adapter-m04.js";

/**
 * V32 — A GUIA DA TELA RECEBENDO DÍVIDA ATIVA E INGRESSANDO OPERAÇÃO DE CRÉDITO.
 *
 * O defeito: as duas compostas (M04 × M10) só tinham chamador em teste. Pela tela, o operador registrava
 * a guia como receita comum (D bancos × C VPA): a dívida ativa ficava com o saldo inteiro e a receita era
 * reconhecida duas vezes (na inscrição e na guia); o empréstimo virava ganho em vez de passivo.
 *
 * À mão, N=2 dívidas ativas (A 1.000,00 e B 700,00), duas guias sobre A (300,00 e 700,00):
 *   depois das inscrições    →  dívida ativa 1.700 · VPA da inscrição 1.700
 *   depois das duas guias    →  dívida ativa   700 · VPA 1.700 (não muda) · bancos 1.000
 *   saldo de A = 0 · saldo de B = 700
 * Pelo caminho antigo (VPA na guia), a VPA terminaria em 2.700 e a dívida ativa em 1.700.
 *
 * Operação de crédito: guia de 50.000,00 → passivo 50.000 (credor), bancos 50.000, nenhuma VPA.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "tesouraria@cg.pb.gov.br";
const LEITOR = "so.consulta.receita.divida@cg.pb.gov.br";
const NAT_DA = "11180113"; // IPTU — dívida ativa (tipo 3)
const NAT_IPTU = "11180111"; // IPTU — principal (tipo 1): NÃO recebe inscrição
const NAT_OC = "21110000"; // operação de crédito interna
const BANCOS = "1.1.1.1.1.00.00";
const DA = "1.1.2.5.1.01.99";
const VPA_INSCRICAO = "4.1.1.2.1.01.00";
const PASSIVO = "2.2.2.1.1.02.98";
const DATA = new Date("2026-03-10T15:00:00Z");

let guias = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.contaPcasp.create({
    data: { id: "c-da", codigo: DA, nome: "Dívida ativa tributária de outros impostos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
  });
  await prisma.contaPcasp.upsert({
    where: { codigo: "1.1.2.5.0.00.00" },
    update: {},
    create: { id: "c-da-sint", codigo: "1.1.2.5.0.00.00", nome: "Dívida ativa (sintética)", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false },
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-da", codigo: NAT_DA, descricao: "IPTU - Dívida ativa" },
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU - Principal" },
      { id: "nr-oc", codigo: NAT_OC, descricao: "Operação de crédito interna" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Recursos nao vinculados", codigoTce: "500" } });
  await prisma.deParaFonteNaturezaDdr.create({
    data: { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "Recurso ordinario do tesouro, fixture.", versao: 1, criadoPor: POR },
  });
  const bancos = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: BANCOS }, select: { id: true } });
  await prisma.contaBancaria.create({ data: { id: "cb-1", codigo: "CC-001", descricao: "Conta unica", fonteId: "f500", contaContabilId: bancos.id } });
  await prisma.fonteDaContaBancaria.create({ data: { contaBancariaId: "cb-1", fonteId: "f500", criadoPor: POR } });
  await prisma.receitaPrevista.createMany({
    data: [NAT_DA, NAT_IPTU, NAT_OC].map((n, i) => ({
      exercicio: 2026, naturezaReceitaId: ["nr-da", "nr-iptu", "nr-oc"][i]!, fonteId: "f500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA" as const, valorPrevisto: "100000.00",
    })),
  });
  const vpa = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: VPA_INSCRICAO }, select: { id: true } });
  await prisma.roteiroDividaAtiva.create({ data: { tipo: "INSCRICAO", contaDebitoId: "c-da", contaCreditoId: vpa.id, criadoPor: POR } });
  const leitor = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_RECEITA_DIVIDA", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_RECEITA", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

async function inscrita(id: string, valor: string, contaContabilId = "c-da"): Promise<string> {
  const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
    identificador: id, devedorNome: `Contribuinte ${id}`, devedorDocumento: "12345678909", origem: "TRIBUTARIA", contaContabilId, criadoPor: POR,
  });
  await inscreverDividaAtiva(prisma, { dividaAtivaId, valor, dataMovimento: new Date("2026-02-01T15:00:00Z"), motivo: "Inscrição do IPTU 2025 não pago", criadoPor: POR });
  return dividaAtivaId;
}

function guia(valor: string, natureza: string, criadoPor = POR) {
  guias += 1;
  return {
    arrecadacao: { exercicio: 2026, naturezaReceita: natureza, fonte: "500", exercicioFonte: 1 as const, valor, dataArrecadacao: DATA, numeroReceita: `G-${guias}`, contaBancaria: "CC-001", criadoPor },
    disponibilidade: BANCOS,
    naturezaDaFonte: "ORDINARIOS" as const,
  };
}

async function saldo(codigo: string, credora = false): Promise<string> {
  const s = await saldoDasContas(prisma, [codigo], null);
  return (credora ? s.negated() : s).toFixed(2);
}

describe("V32 — a guia da tela recebe dívida ativa sem repetir a VPA", () => {
  beforeEach(semear);

  it("t1: N=2 dívidas, duas guias sobre A — a VPA não dobra, a dívida ativa baixa e B fica intacta", async () => {
    const a = await inscrita("CDA-A", "1000.00");
    const b = await inscrita("CDA-B", "700.00");
    expect(await saldo(DA)).toBe("1700.00");
    expect(await saldo(VPA_INSCRICAO, true)).toBe("1700.00");

    await arrecadarRecebendoDividaAtiva(prisma, { ...guia("300.00", NAT_DA), dividaAtivaId: a });
    await arrecadarRecebendoDividaAtiva(prisma, { ...guia("700.00", NAT_DA), dividaAtivaId: a });

    expect(await saldo(VPA_INSCRICAO, true)).toBe("1700.00");
    expect(await saldo(DA)).toBe("700.00");
    expect(await saldo(BANCOS)).toBe("1000.00");
    expect((await saldoDaDividaAtivaEm(prisma, a)).toFixed(2)).toBe("0.00");
    expect((await saldoDaDividaAtivaEm(prisma, b)).toFixed(2)).toBe("700.00");
    expect(await prisma.receitaArrecadada.count()).toBe(2);
  });

  it("t2: guia acima do saldo, natureza do principal e conta sintética recusam — e nada fica gravado", async () => {
    const a = await inscrita("CDA-A", "1000.00");
    const antes = await prisma.lancamentoContabil.count();
    await expect(arrecadarRecebendoDividaAtiva(prisma, { ...guia("1000.01", NAT_DA), dividaAtivaId: a })).rejects.toThrow(/saldo|maior|acima/i);
    await expect(arrecadarRecebendoDividaAtiva(prisma, { ...guia("100.00", NAT_IPTU), dividaAtivaId: a })).rejects.toThrow(/tipo 3/);
    const sint = await inscritaSintetica();
    await expect(arrecadarRecebendoDividaAtiva(prisma, { ...guia("100.00", NAT_DA), dividaAtivaId: sint })).rejects.toThrow(/é sintética/);
    await expect(arrecadarRecebendoDividaAtiva(prisma, { ...guia("100.00", NAT_DA), dividaAtivaId: "nao-existe" })).rejects.toThrow(/não existe/);
    expect(await prisma.lancamentoContabil.count()).toBe(antes);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect((await saldoDaDividaAtivaEm(prisma, a)).toFixed(2)).toBe("1000.00");
  });

  it("t3: quem só consulta a receita não recebe — recusa nomeando a ação, e nada nasce", async () => {
    const a = await inscrita("CDA-A", "1000.00");
    await expect(arrecadarRecebendoDividaAtiva(prisma, { ...guia("100.00", NAT_DA, LEITOR), dividaAtivaId: a })).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_ARRECADACAO/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });
});

/** Dívida cadastrada numa conta sintética (cadastro aceita; o recebimento recusa antes de gravar). */
async function inscritaSintetica(): Promise<string> {
  const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
    identificador: "CDA-SINT", devedorNome: "Contribuinte sintético", devedorDocumento: "12345678909", origem: "TRIBUTARIA", contaContabilId: "c-da-sint", criadoPor: POR,
  });
  return dividaAtivaId;
}

describe("V32 — a guia da tela registra o ingresso da operação de crédito no passivo", () => {
  beforeEach(semear);

  async function divida(id: string): Promise<string> {
    const passivo = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: PASSIVO }, select: { id: true } });
    const r = await cadastrarDivida(prisma, {
      identificador: id, credorNome: "Banco de fomento", credorDocumento: "00000000000191", tipo: "CONTRATUAL",
      leiAutorizativa: "Lei 1.234/2026", objeto: "Financiamento de pavimentação urbana", contaContabilId: passivo.id, criadoPor: POR,
    });
    return r.dividaId;
  }

  it("t4: N=2 operações, duas liberações na primeira — passivo e movimentos concordam, nenhuma VPA", async () => {
    const x = await divida("OC-1");
    const y = await divida("OC-2");
    const vpaAntes = await saldo(VPA_INSCRICAO, true);
    await arrecadarIngressoDaOperacaoDeCredito(prisma, { ...guia("30000.00", NAT_OC), dividaId: x, motivo: "Primeira parcela liberada" });
    await arrecadarIngressoDaOperacaoDeCredito(prisma, { ...guia("20000.00", NAT_OC), dividaId: x, motivo: "Segunda parcela liberada" });
    expect(await saldo(PASSIVO, true)).toBe("50000.00");
    expect(await saldo(BANCOS)).toBe("50000.00");
    expect(await saldo(VPA_INSCRICAO, true)).toBe(vpaAntes);
    expect((await saldoDaDividaEm(prisma, x)).toFixed(2)).toBe("50000.00");
    expect((await saldoDaDividaEm(prisma, y)).toFixed(2)).toBe("0.00");
  });

  it("t5: receita que não é operação de crédito e histórico vazio recusam, sem gravar", async () => {
    const x = await divida("OC-1");
    await expect(arrecadarIngressoDaOperacaoDeCredito(prisma, { ...guia("100.00", NAT_IPTU), dividaId: x, motivo: "Parcela liberada do contrato" })).rejects.toThrow(/NÃO OPERACOES_DE_CREDITO/);
    await expect(arrecadarIngressoDaOperacaoDeCredito(prisma, { ...guia("100.00", NAT_OC), dividaId: x, motivo: "  " })).rejects.toThrow(/histórico do ingresso/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect((await saldoDaDividaEm(prisma, x)).toFixed(2)).toBe("0.00");
  });
});
