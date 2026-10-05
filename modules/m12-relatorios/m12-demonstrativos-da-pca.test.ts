import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { CONTA_DIVIDA_FUNDADA, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anexo16, anexo17, termoDeConferenciaDeCaixa } from "./demonstrativos-da-pca.js";

/**
 * V35 — ANEXO 16, ANEXO 17 E TERMO DE CONFERÊNCIA DE CAIXA (Lei 4.320, arts. 92 e 98; RN-TC 03/2010).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO. Exercício de referência: 2026.
 *
 * ═══ ANEXO 16 ═══
 *   dv-int (conta "Outros Contratos — Empréstimos Internos"):
 *     ingresso 500.000 em 10/03/2025
 *     amortização 5.000 em 2026-01-01T02:00Z = 31/12/2025 23h no fuso do ente → é de 2025
 *     amortização 50.000 em 10/06/2026
 *     amortização 20.000 em 10/08/2026 e o estorno dela em 20/08/2026 → líquido zero
 *     atualização 10.000 em 15/12/2026
 *     ⇒ anterior 495.000 · contratação 0 · atualização 10.000 · amortização 50.000 · seguinte 455.000
 *   dv-ext (conta "EMPRÉSTIMOS EXTERNOS - EM CONTRATOS"):
 *     ingresso 300.000 em 01/02/2026; amortização 30.000 em 10/01/2027 (fora)
 *     ⇒ anterior 0 · contratação 300.000 · seguinte 300.000
 *   dv-quitada: ingresso 100.000 em 2024, amortização 100.000 em 2025 ⇒ não aparece
 *   TOTAL: anterior 495.000 · contratação 300.000 · atualização 10.000 · amortização 50.000 · seguinte 755.000
 *
 * ═══ ANEXO 17 ═══
 *   RP (quatro empenhos; grupo 3 = demais, grupo 2 = serviço da dívida):
 *     A25 grupo 3, inscrito PROCESSADO em 2025, 10.000; cancelamento 1.000 em 10/03/2026
 *     B25 grupo 2, inscrito NÃO PROCESSADO em 2025, 3.000; cancelamento 3.000 em 05/01/2027 (fora)
 *     A26 grupo 3, inscrito NÃO PROCESSADO em 2026, 2.000
 *     B26 grupo 2, inscrito PROCESSADO em 2026, 700
 *     RPP  10.000 | 0     | 1.000 | 9.000
 *     RPNP 0      | 2.000 | 0     | 2.000
 *     SDP  0      | 700   | 0     | 700
 *     SDNP 3.000  | 0     | 0     | 3.000
 *   Consignações (2.1.8.8.1.01.00):
 *     C 800 em 10/11/2025; C 50 em 2026-01-01T02:00Z (= 31/12/2025); C 1.200 em 10/02/2026; D 800 em 20/02/2026
 *     ⇒ 850 | 1.200 | 800 | 1.250
 *   ARO (2.1.2.1.1.02.05): C 5.000 em 01/04/2026; D 5.000 em 30/11/2026 ⇒ 0 | 5.000 | 5.000 | 0
 *   TOTAL: 13.850 | 8.900 | 6.800 | 15.950
 *
 * ═══ TERMO DE CAIXA (31/12/2026) ═══
 *   A contrapartida dos depósitos, da ARO e do CX-1 é o Caixa (1.1.1.1.1.00.00), que não é de conta bancária:
 *     800 + 50 + 1.200 − 800 + 5.000 − 5.000 + 300 = 1.550 ⇒ "outras" 1.550
 *   Bancos (1.1.1.1.1.19.00), conta bancária CC-001, sem movimento e sem extrato ⇒ 0
 *   totalNoRazao 1.550 · totalContabil 0 · totalExtrato 0 · naoAtribuido 0
 *   Um lançamento manual na conta do banco, que não é fato de conta bancária, faz a conciliação não fechar:
 *   o termo recusa nomeando a conta (não certifica saldo sem conferência).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const D = (iso: string) => new Date(iso);

async function conta(codigo: string): Promise<string> {
  return (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
}

/** Conta do plano oficial que o plano mínimo não traz — código e nome transcritos do PCASP 2025. */
async function contaOficial(codigo: string, nome: string, natureza: "DEVEDORA" | "CREDORA"): Promise<string> {
  const c = await prisma.contaPcasp.upsert({
    where: { codigo },
    update: {},
    create: { codigo, nome, naturezaSaldo: natureza, nivel: 7, analitica: true },
    select: { id: true },
  });
  return c.id;
}

async function lancar(numero: string, data: string, debito: string, credito: string, valor: string): Promise<string> {
  return prisma.$transaction((tx) =>
    lancarNoRazao(tx, {
      numeroControle: numero,
      dataTransacao: D(data),
      historico: `fixture ${numero}`,
      origemTipo: "MANUAL",
      criadoPor: POR,
      partidas: [
        { contaId: debito, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
        { contaId: credito, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
      ],
    })
  );
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  for (const ano of [2024, 2025, 2026, 2027]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }
}

async function dividas(): Promise<void> {
  const interna = await conta(CONTA_DIVIDA_FUNDADA);
  const externa = await contaOficial("2.2.2.2.1.02.00", "EMPRÉSTIMOS EXTERNOS - EM CONTRATOS", "CREDORA");
  const nova = (id: string, contaId: string) =>
    prisma.dividaConsolidada.create({
      data: { id, identificador: id.toUpperCase(), credorNome: "Credor", credorDocumento: "00000000000191", tipo: "CONTRATUAL", leiAutorizativa: "Lei 1/2024", objeto: "operação de crédito", contaContabilId: contaId, criadoPor: POR },
    });
  const mov = (dividaId: string, tipo: "INGRESSO_OPERACAO_CREDITO" | "AMORTIZACAO" | "ATUALIZACAO_MONETARIA" | "ESTORNO_AMORTIZACAO", valor: string, data: string, estornoDeId?: string) =>
    prisma.movimentoDivida.create({
      data: { dividaId, tipo, valor, dataMovimento: D(data), motivo: "fixture do anexo 16", criadoPor: POR, ...(estornoDeId ? { estornoDeId } : {}) },
      select: { id: true },
    });

  await nova("dv-int", interna);
  await mov("dv-int", "INGRESSO_OPERACAO_CREDITO", "500000.00", "2025-03-10T12:00:00Z");
  await mov("dv-int", "AMORTIZACAO", "5000.00", "2026-01-01T02:00:00Z");
  await mov("dv-int", "AMORTIZACAO", "50000.00", "2026-06-10T12:00:00Z");
  const errada = await mov("dv-int", "AMORTIZACAO", "20000.00", "2026-08-10T12:00:00Z");
  await mov("dv-int", "ESTORNO_AMORTIZACAO", "20000.00", "2026-08-20T12:00:00Z", errada.id);
  await mov("dv-int", "ATUALIZACAO_MONETARIA", "10000.00", "2026-12-15T12:00:00Z");

  await nova("dv-ext", externa);
  await mov("dv-ext", "INGRESSO_OPERACAO_CREDITO", "300000.00", "2026-02-01T12:00:00Z");
  await mov("dv-ext", "AMORTIZACAO", "30000.00", "2027-01-10T12:00:00Z");

  await nova("dv-quitada", interna);
  await mov("dv-quitada", "INGRESSO_OPERACAO_CREDITO", "100000.00", "2024-05-10T12:00:00Z");
  await mov("dv-quitada", "AMORTIZACAO", "100000.00", "2025-05-10T12:00:00Z");
}

async function restos(): Promise<void> {
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Finanças", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-3", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços de terceiros" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-2", codCategoria: "3", codNatureza: "2", codModalidade: "90", codElemento: "21", codigoCompleto: "329021", descricao: "Juros sobre a dívida por contrato" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" } });

  const deps = criarM05Deps(prisma);
  const R_EMP = roteiroEmpenho();
  const empenhos: Record<string, string> = {};
  let n = 0;
  for (const [nome, ano, nd] of [["A25", 2025, "nd-3"], ["B25", 2025, "nd-2"], ["A26", 2026, "nd-3"], ["B26", 2026, "nd-2"]] as const) {
    n += 1;
    await criarFichaDeTeste(prisma, {
      id: `ficha-${nome}`, exercicio: ano, numero: n, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: nd, fonteId: "fnt-500", valorDotado: "100000.00",
    });
    const e = await empenhar(
      { fichaId: `ficha-${nome}`, numero: `NE-${nome}`, tipo: "ORDINARIO", valor: "20000.00", data: D(`${ano}-03-01T12:00:00Z`), credorCpfCnpj: "12345678000195", historico: "fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR },
      R_EMP,
      deps
    );
    empenhos[nome] = e.empenhoId;
  }
  const insc = (nome: string, exercicioOrigem: number, tipo: "PROCESSADO" | "NAO_PROCESSADO", valor: string) =>
    prisma.inscricaoRestosAPagar.create({ data: { empenhoId: empenhos[nome]!, exercicioOrigem, tipo, valorInscrito: valor, criadoPor: POR }, select: { id: true } });
  const a25 = await insc("A25", 2025, "PROCESSADO", "10000.00");
  const b25 = await insc("B25", 2025, "NAO_PROCESSADO", "3000.00");
  await insc("A26", 2026, "NAO_PROCESSADO", "2000.00");
  await insc("B26", 2026, "PROCESSADO", "700.00");

  const fornecedores = await conta("2.1.3.1.1.00.00");
  // o cancelamento de RP baixa o passivo contra a variação aumentativa — não toca a disponibilidade
  const vpa = await conta("4.1.1.2.1.01.00");
  const cancelar = async (inscricaoId: string, valor: string, data: string, numero: string) => {
    const lancamentoId = await lancar(numero, data, fornecedores, vpa, valor);
    await prisma.movimentoRestosAPagar.create({ data: { inscricaoId, tipo: "CANCELAMENTO", valor, lancamentoId, motivo: "fixture do anexo 17", criadoPor: POR } });
  };
  await cancelar(a25.id, "1000.00", "2026-03-10T12:00:00Z", "RP-1");
  await cancelar(b25.id, "3000.00", "2027-01-05T12:00:00Z", "RP-2");
}

async function depositosECaixa(): Promise<void> {
  const consignacoes = await conta("2.1.8.8.1.01.00");
  const aro = await contaOficial("2.1.2.1.1.02.05", "ANTECIPAÇÃO DA RECEITA ORÇAMENTÁRIA", "CREDORA");
  const bancos = await conta("1.1.1.1.1.19.00");
  const caixa = await conta("1.1.1.1.1.00.00");
  const vpa = await conta("4.1.1.2.1.01.00");
  await lancar("DP-1", "2025-11-10T12:00:00Z", caixa, consignacoes, "800.00");
  await lancar("DP-2", "2026-01-01T02:00:00Z", caixa, consignacoes, "50.00");
  await lancar("DP-3", "2026-02-10T12:00:00Z", caixa, consignacoes, "1200.00");
  await lancar("DP-4", "2026-02-20T12:00:00Z", consignacoes, caixa, "800.00");
  await lancar("ARO-1", "2026-04-01T12:00:00Z", caixa, aro, "5000.00");
  await lancar("ARO-2", "2026-11-30T12:00:00Z", aro, caixa, "5000.00");
  await lancar("CX-1", "2026-05-05T12:00:00Z", caixa, vpa, "300.00");
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: "fnt-500", contaContabilId: bancos, banco: "001", agencia: "1234", digitoAgencia: "5", conta: "67890", digitoConta: "1" } });
}

describe("M12 — demonstrativos da prestação de contas anual (Anexos 16 e 17, termo de caixa)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Anexo 16: separa interna e externa pela conta, recorta pelo dia civil e líquida o estorno", async () => {
    await dividas();
    const a = await anexo16(prisma, { exercicio: 2026 });

    expect(a.interna.map((l) => l.identificador)).toEqual(["DV-INT"]);
    expect(a.interna[0]).toMatchObject({ saldoAnterior: "495000.00", contratacao: "0.00", atualizacao: "10000.00", amortizacao: "50000.00", saldoSeguinte: "455000.00" });
    expect(a.externa.map((l) => l.identificador)).toEqual(["DV-EXT"]);
    expect(a.externa[0]).toMatchObject({ saldoAnterior: "0.00", contratacao: "300000.00", atualizacao: "0.00", amortizacao: "0.00", saldoSeguinte: "300000.00" });
    expect(a.total).toEqual({ saldoAnterior: "495000.00", contratacao: "300000.00", atualizacao: "10000.00", amortizacao: "50000.00", saldoSeguinte: "755000.00" });
  });

  it("Anexo 16: dívida numa conta que não diz interna nem externa é recusada, nomeando a dívida", async () => {
    await dividas();
    await prisma.dividaConsolidada.create({
      data: { id: "dv-x", identificador: "DV-SEM-ORIGEM", credorNome: "Credor", credorDocumento: "00000000000191", tipo: "CONTRATUAL", leiAutorizativa: "Lei 2/2026", objeto: "operação de crédito", contaContabilId: await conta("2.1.3.1.1.00.00"), criadoPor: POR },
    });
    await prisma.movimentoDivida.create({ data: { dividaId: "dv-x", tipo: "INGRESSO_OPERACAO_CREDITO", valor: "1.00", dataMovimento: D("2026-05-01T12:00:00Z"), motivo: "fixture do anexo 16", criadoPor: POR } });
    await expect(anexo16(prisma, { exercicio: 2026 })).rejects.toThrow(/DV-SEM-ORIGEM.*não diz se é interna ou externa/);
  });

  it("Anexo 17: restos separados do serviço da dívida, depósitos e débitos de tesouraria pelo razão", async () => {
    await restos();
    await depositosECaixa();
    const a = await anexo17(prisma, { exercicio: 2026 });
    const por = (codigo: string) => a.linhas.find((l) => l.codigo === codigo);

    expect(por("RPP")).toMatchObject({ saldoAnterior: "10000.00", inscricao: "0.00", baixa: "1000.00", saldoSeguinte: "9000.00" });
    expect(por("RPNP")).toMatchObject({ saldoAnterior: "0.00", inscricao: "2000.00", baixa: "0.00", saldoSeguinte: "2000.00" });
    expect(por("SDP")).toMatchObject({ saldoAnterior: "0.00", inscricao: "700.00", baixa: "0.00", saldoSeguinte: "700.00" });
    expect(por("SDNP")).toMatchObject({ saldoAnterior: "3000.00", inscricao: "0.00", baixa: "0.00", saldoSeguinte: "3000.00" });
    expect(por("2.1.8.8.1.01.00")).toMatchObject({ grupo: "DEPOSITOS", saldoAnterior: "850.00", inscricao: "1200.00", baixa: "800.00", saldoSeguinte: "1250.00" });
    expect(por("2.1.2.1.1.02.05")).toMatchObject({ grupo: "DEBITOS_DE_TESOURARIA", saldoAnterior: "0.00", inscricao: "5000.00", baixa: "5000.00", saldoSeguinte: "0.00" });
    expect(a.total).toEqual({ saldoAnterior: "13850.00", inscricao: "8900.00", baixa: "6800.00", saldoSeguinte: "15950.00" });
  });

  it("Termo de caixa: conta bancária sem conta contábil é recusada, nomeando a conta", async () => {
    await restos();
    await depositosECaixa();
    await prisma.contaBancaria.create({ data: { id: "cb2", codigo: "CC-SEM-RAZAO", descricao: "Arrecadação", fonteId: "fnt-500" } });
    await expect(termoDeConferenciaDeCaixa(prisma, { exercicio: 2026 })).rejects.toThrow(/CC-SEM-RAZAO não tem conta contábil vinculada/);
  });

  it("Termo de caixa: saldo de cada banco em 31/12, o caixa sem conta bancária à parte, e o total do razão fechando", async () => {
    await restos();
    await depositosECaixa();
    const t = await termoDeConferenciaDeCaixa(prisma, { exercicio: 2026 });

    expect(t.contas).toHaveLength(1);
    expect(t.contas[0]).toMatchObject({ codigo: "CC-001", identificacao: "banco 001, ag. 1234-5, c/c 67890-1", contaContabil: "1.1.1.1.1.19.00", saldoContabil: "0.00", saldoExtrato: "0.00", diferenca: "0.00", linhasDeExtrato: 0 });
    expect(t.outras).toEqual([{ contaContabil: "1.1.1.1.1.00.00", nome: "Caixa", saldo: "1550.00" }]);
    expect(t).toMatchObject({ totalContabil: "0.00", totalExtrato: "0.00", totalNoRazao: "1550.00", naoAtribuido: "0.00" });
  });

  it("Termo de caixa: lançamento na conta do banco que não é fato de conta bancária impede o termo, nomeando a conta", async () => {
    await restos();
    await depositosECaixa();
    await lancar("AJ-1", "2026-06-01T12:00:00Z", await conta("1.1.1.1.1.19.00"), await conta("4.1.1.2.1.01.00"), "70.00");
    await expect(termoDeConferenciaDeCaixa(prisma, { exercicio: 2026 })).rejects.toThrow(/conta bancária CC-001 não fecha a conciliação em 31.12.2026/);
  });
});
