import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { atualizarDividaAtiva, cadastrarDividaAtiva, cancelarDividaAtiva, debitosInscritosDosDocumentos, inscreverDividaAtiva } from "./divida-ativa.js";

/**
 * V36 — OS DÉBITOS INSCRITOS DO CREDOR (TR 5.10.1.38). Fixture de contas e roteiros do m10-divida-ativa. N=2 devedores
 * com saldo e um sem:
 *   A: CDA-1 1.000 inscrita; CDA-2 500 inscrita e cancelada inteira  → 1 inscrição, 1.000,00
 *   B: CDA-3 200 + 50 de atualização; CDA-4 100                     → 2 inscrições, 350,00
 *   C: CDA-5 300 inscrita e cancelada inteira                        → não aparece
 *   D: documento sem dívida                                          → não aparece
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "tributos@cg.pb.gov.br";
const FONTE = "fnt-500";
const NAT_DIVIDA_ATIVA = "11130113"; // tipo 3 — o crédito inscrito
const NAT_JUROS_DA = "11130114"; // tipo 4 — juros e multa DA dívida ativa
const NAT_PRINCIPAL = "11130111"; // tipo 1 — o tributo corrente. NÃO quita inscrição.

const CAIXA = "1.1.1.1.2.00.00";
const ATIVO_DA = "1.2.1.1.1.00.00"; // dívida ativa — longo prazo
const VPA_DA = "4.1.1.1.1.00.00"; // VPA — inscrição em dívida ativa
const VPD_CANCEL = "3.6.1.1.1.00.00"; // VPD — desvalorização/perda de créditos
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      // ⚠️ P — ver a nota do t6 no cabeçalho. O indicador é PARÂMETRO.
      { id: "c-ativo-da", codigo: ATIVO_DA, nome: "Dívida ativa a longo prazo", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpa-da", codigo: VPA_DA, nome: "VPA — inscrição em dívida ativa", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-cancel", codigo: VPD_CANCEL, nome: "VPD — perda de créditos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-da", codigo: NAT_DIVIDA_ATIVA, descricao: "IPTU — dívida ativa" },
      { id: "nr-juros-da", codigo: NAT_JUROS_DA, descricao: "IPTU — juros e multa da dívida ativa" },
      { id: "nr-principal", codigo: NAT_PRINCIPAL, descricao: "IPTU — principal" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  // OS ROTEIROS — por TABELA. O RECEBIMENTO NÃO tem, e é de propósito.
  await prisma.roteiroDividaAtiva.createMany({
    data: [
      { tipo: "INSCRICAO", contaDebitoId: "c-ativo-da", contaCreditoId: "c-vpa-da", criadoPor: POR },
      { tipo: "ATUALIZACAO", contaDebitoId: "c-ativo-da", contaCreditoId: "c-vpa-da", criadoPor: POR },
      { tipo: "CANCELAMENTO", contaDebitoId: "c-vpd-cancel", contaCreditoId: "c-ativo-da", criadoPor: POR },
    ],
  });
}

const D = (iso: string) => new Date(`${iso}T12:00:00Z`);
async function divida(identificador: string, documento: string, inscrito: string): Promise<string> {
  const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, { identificador, devedorNome: `Devedor ${documento}`, devedorDocumento: documento, origem: "TRIBUTARIA", contaContabilId: "c-ativo-da", criadoPor: POR });
  await inscreverDividaAtiva(prisma, { dividaAtivaId, valor: inscrito, dataMovimento: D("2026-01-15"), motivo: "inscrição do IPTU 2025 não pago", criadoPor: POR });
  return dividaAtivaId;
}
const cancelar = (dividaAtivaId: string, valor: string) =>
  cancelarDividaAtiva(prisma, { dividaAtivaId, valor, dataMovimento: D("2026-03-01"), motivo: "remissão por decisão judicial transitada em julgado", criadoPor: POR });

describe("M10 V36 — débitos inscritos do credor", () => {
  beforeEach(semear, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: por documento, as inscrições com saldo e o saldo somado; quitada ou cancelada não conta", async () => {
    await divida("CDA-1", "12345678909", "1000.00");
    await cancelar(await divida("CDA-2", "12345678909", "500.00"), "500.00");
    const cda3 = await divida("CDA-3", "11144477735", "200.00");
    await atualizarDividaAtiva(prisma, { dividaAtivaId: cda3, valor: "50.00", competencia: "2026-02", dataMovimento: D("2026-02-28"), motivo: "juros e correção de fevereiro", criadoPor: POR });
    await divida("CDA-4", "11144477735", "100.00");
    await cancelar(await divida("CDA-5", "98765432100", "300.00"), "300.00");

    const r = await debitosInscritosDosDocumentos(prisma, ["12345678909", "11144477735", "98765432100", "52998224725", ""]);
    expect([...r.entries()].map(([doc, d]) => [doc, d.inscricoes, d.saldo.toFixed(2)]).sort()).toEqual([
      ["11144477735", 2, "350.00"],
      ["12345678909", 1, "1000.00"],
    ]);
    expect((await debitosInscritosDosDocumentos(prisma, [])).size).toBe(0);
  });
});
