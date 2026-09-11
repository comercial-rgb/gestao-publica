import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  cadastrarPrecatorio,
  filaDePrecatorios,
  inscreverPrecatorio,
  registrarAtualizacaoDePrecatorio,
} from "./servico.js";

/**
 * M29 — PRECATÓRIOS (CF art. 100). REGIME: **PROFUNDIDADE**.
 *
 * ⚠️ O GUARD DA ORDEM CONSTITUCIONAL MORA NA TRANSAÇÃO DO `pagar()`, e é isso que os testes
 * provam: pagar fora da ordem sem justificativa aborta o PAGAMENTO INTEIRO. Não existe
 * "pagou mas furou a fila".
 *
 * ⚠️ FIXTURE N=2 SEMPRE — a ordem só se manifesta em conjunto. Com um precatório só, qualquer
 * implementação responde "pode pagar", inclusive uma que ignore natureza e preferência.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-prec";

const CAIXA = "1.1.1.1.2.00.00";
const PASSIVO_PREC = "2.1.9.2.1.00.00";
const VPD = "3.5.1.1.1.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
/** A liquidação do precatório DEBITA o passivo: quitar é permutativo. */
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: PASSIVO_PREC, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-prec", codigo: PASSIVO_PREC, nome: "Precatórios a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD, nome: "VPD — precatórios", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Encargos", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-28", codigo: "28", nome: "Encargos especiais" } });
  await prisma.subfuncao.create({ data: { id: "sub-846", codigo: "846", nome: "Outros encargos" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0028", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "0001", descricao: "A", tipo: "OPERACAO_ESPECIAL" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-91", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "91", codigoCompleto: "339091", descricao: "Sentenças judiciais" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-28", subfuncaoId: "sub-846", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, naturezaDespesaId: "nd-91", valorDotado: "1000000.00",
  });

  await prisma.roteiroPrecatorio.createMany({
    data: [
      { tipo: "INSCRICAO", contaDebitoId: "c-vpd", contaCreditoId: "c-prec", historicoPadrao: "Inscrição de precatório" },
      { tipo: "ATUALIZACAO", contaDebitoId: "c-vpd", contaCreditoId: "c-prec", historicoPadrao: "Atualização de precatório" },
      { tipo: "CANCELAMENTO", contaDebitoId: "c-prec", contaCreditoId: "c-vpd", historicoPadrao: "Cancelamento de precatório" },
    ],
  });
}

async function precatorio(p: {
  readonly numero: string;
  readonly natureza: "ALIMENTAR" | "COMUM";
  readonly preferencia?: "NENHUMA" | "IDOSO" | "DOENCA_GRAVE" | "DEFICIENCIA";
  readonly diaApresentacao: string;
  readonly valor: string;
}): Promise<string> {
  const { precatorioId } = await cadastrarPrecatorio(prisma, {
    numeroProcesso: p.numero,
    tribunal: "TJSC",
    beneficiarioNome: `Beneficiário ${p.numero}`,
    beneficiarioDocumento: "12345678901",
    natureza: p.natureza,
    preferencia: p.preferencia ?? "NENHUMA",
    diaApresentacao: p.diaApresentacao,
    exercicioDePagamento: 2026,
    valorOriginal: p.valor,
    contaContabilId: "c-prec",
    criadoPor: POR,
  });
  await inscreverPrecatorio(prisma, {
    precatorioId, valor: p.valor, diaMovimento: p.diaApresentacao,
    motivo: `Reconhecimento do passivo do precatório ${p.numero}.`, criadoPor: POR,
  });
  return precatorioId;
}

/** Empenha, liquida e tenta PAGAR o precatório. Devolve a promessa do `pagar`. */
async function pagarPrecatorio(
  precatorioId: string,
  n: string,
  valor: string,
  justificativaConstitucional?: string
): Promise<{ readonly pagamentoId: string }> {
  const { empenhoId } = await empenhar(
    {
      fichaId: FICHA, numero: `2026NE${n}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-03-10T12:00:00Z"), credorCpfCnpj: "12345678901",
      historico: "Precatório judicial", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await prisma.empenho.update({ where: { id: empenhoId }, data: { precatorioId } });

  const { liquidacaoId } = await liquidar(
    {
      empenhoId, numero: `2026NL${n}`, valor,
      data: new Date("2026-03-15T12:00:00Z"),
      responsavelAtesto: "Procuradoria", historico: "Requisitório do TJSC",
      criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );

  return pagar(
    {
      liquidacaoId, numero: `2026NP${n}`, valor,
      data: new Date("2026-03-20T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE,
      historico: "Pagamento de precatório",
      // ⚠️ É A JUSTIFICATIVA DO ART. 100, e ela é SÓ TEXTO — separada da do art. 141, que
      // exige uma hipótese de um rol fechado da Lei 14.133 em que nenhuma das cinco cobre
      // acordo homologado nem sequestro de verba. Ver `PagarParams`.
      ...(justificativaConstitucional !== undefined
        ? { justificativaOrdemConstitucional: justificativaConstitucional }
        : {}),
      criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("M29 — o precatório e a ordem do art. 100", () => {
  it("t1: a fila do banco respeita natureza, preferência e apresentação", async () => {
    await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    await precatorio({ numero: "0002-A", natureza: "ALIMENTAR", diaApresentacao: "2025-06-01", valor: "20000.00" });
    await precatorio({ numero: "0003-AI", natureza: "ALIMENTAR", preferencia: "IDOSO", diaApresentacao: "2025-12-01", valor: "5000.00" });

    const fila = await filaDePrecatorios(prisma, 2026);
    const { ordenarFilaDePrecatorios } = await import("./dominio.js");
    expect(ordenarFilaDePrecatorios(fila).map((p) => p.numeroProcesso)).toEqual([
      "0003-AI",
      "0002-A",
      "0001-C",
    ]);
  });

  it("t2: pagar FORA DA ORDEM sem justificativa aborta o PAGAMENTO INTEIRO", async () => {
    const alimentar = await precatorio({ numero: "0002-A", natureza: "ALIMENTAR", diaApresentacao: "2025-06-01", valor: "20000.00" });
    const comum = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    void alimentar;

    await expect(pagarPrecatorio(comum, "000001", "10000.00")).rejects.toThrow(
      /QUEBRA DA ORDEM DO ART\. 100[\s\S]*0002-A[\s\S]*Nada foi gravado/
    );

    // ⚠️ NEM PAGAMENTO, NEM BAIXA DO PASSIVO. "Não completou" é compatível com o banco fora
    // do ar; o que se prende aqui é que nada ficou.
    expect(await prisma.pagamento.count()).toBe(0);
    expect(
      await prisma.movimentoPrecatorio.count({ where: { precatorioId: comum, tipo: "PAGAMENTO" } })
    ).toBe(0);
  });

  it("t3: COM justificativa, o pagamento passa — e ela fica gravada no movimento", async () => {
    await precatorio({ numero: "0002-A", natureza: "ALIMENTAR", diaApresentacao: "2025-06-01", valor: "20000.00" });
    const comum = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });

    const { pagamentoId } = await pagarPrecatorio(
      comum,
      "000002",
      "10000.00",
      "Acordo homologado nos autos 0001-C, com deságio de 40% e quitação imediata."
    );
    expect(pagamentoId).toBeTruthy();

    const mov = await prisma.movimentoPrecatorio.findFirstOrThrow({
      where: { precatorioId: comum, tipo: "PAGAMENTO" },
      select: { valor: true, pagamentoId: true, justificativaQuebraDeOrdem: true },
    });
    expect(mov.valor.toFixed(2)).toBe("10000.00");
    expect(mov.pagamentoId).toBe(pagamentoId);
    expect(mov.justificativaQuebraDeOrdem).toContain("Acordo homologado");
  });

  it("t4: pagar O PRIMEIRO da fila não exige justificativa nenhuma", async () => {
    const alimentar = await precatorio({ numero: "0002-A", natureza: "ALIMENTAR", diaApresentacao: "2025-06-01", valor: "20000.00" });
    await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });

    const { pagamentoId } = await pagarPrecatorio(alimentar, "000003", "20000.00");
    expect(pagamentoId).toBeTruthy();
  });

  it("t5: quitado o primeiro, o segundo deixa de furar a fila", async () => {
    // ⚠️ SEM ISTO O GUARD SEMPRE ACUSARIA depois do primeiro pagamento — e guard que sempre
    // acusa é guard que alguém desliga.
    const alimentar = await precatorio({ numero: "0002-A", natureza: "ALIMENTAR", diaApresentacao: "2025-06-01", valor: "20000.00" });
    const comum = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });

    await pagarPrecatorio(alimentar, "000004", "20000.00");
    const segundo = await pagarPrecatorio(comum, "000005", "10000.00");
    expect(segundo.pagamentoId).toBeTruthy();
  });

  it("t6: a ATUALIZAÇÃO é idempotente pela competência", async () => {
    const p = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    await registrarAtualizacaoDePrecatorio(prisma, {
      precatorioId: p, valor: "500.00", diaMovimento: "2026-02-28", competencia: "2026-02",
      motivo: "Correção monetária de fevereiro, índice IPCA-E.", criadoPor: POR,
    });
    await expect(
      registrarAtualizacaoDePrecatorio(prisma, {
        precatorioId: p, valor: "500.00", diaMovimento: "2026-02-28", competencia: "2026-02",
        motivo: "Correção monetária de fevereiro, lançada de novo.", criadoPor: POR,
      })
    ).rejects.toThrow(/COMPETÊNCIA 2026-02 JÁ ATUALIZADA[\s\S]*Nada foi gravado/);
  });

  it("t7: INSCREVER duas vezes é recusado — dobraria o passivo", async () => {
    const p = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    await expect(
      inscreverPrecatorio(prisma, {
        precatorioId: p, valor: "10000.00", diaMovimento: "2026-01-10",
        motivo: "Reconhecimento do passivo, de novo.", criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI INSCRITO[\s\S]*Nada foi gravado/);
  });

  it("t8: a baixa pelo pagamento NÃO se estorna sozinha — anula-se o pagamento", async () => {
    const p = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    await pagarPrecatorio(p, "000006", "10000.00");
    const mov = await prisma.movimentoPrecatorio.findFirstOrThrow({
      where: { precatorioId: p, tipo: "PAGAMENTO" }, select: { id: true },
    });
    const { estornarMovimentoPrecatorio } = await import("./servico.js");
    await expect(
      estornarMovimentoPrecatorio(prisma, {
        movimentoId: mov.id, diaMovimento: "2026-03-25",
        motivo: "Tentativa de estornar a baixa por fora do pagamento.", criadoPor: POR,
      })
    ).rejects.toThrow(/nasceu DENTRO de um pagamento[\s\S]*ANULE O PAGAMENTO[\s\S]*Nada foi gravado/);
  });

  it("t9: a DATA DE APRESENTAÇÃO é o dia civil do ente — e é ela que ordena", async () => {
    const p = await precatorio({ numero: "0001-C", natureza: "COMUM", diaApresentacao: "2023-01-10", valor: "10000.00" });
    const lido = await prisma.precatorio.findUniqueOrThrow({
      where: { id: p }, select: { dataApresentacao: true },
    });
    expect(lido.dataApresentacao.toISOString()).toBe("2023-01-10T03:00:00.000Z");
  });
});
