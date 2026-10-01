import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { criarM05Deps } from "../../../../modules/m05-despesa/adapter-prisma.js";
import { encerrarExercicioComRestos } from "../../../../modules/m08-restos-a-pagar/encerramento.js";
import { roteiroCancelamentoRestos, roteiroLiquidacaoRestos, roteiroPagamentoRestos } from "../../../../modules/m08-restos-a-pagar/dominio.js";
import {
  anularCancelamentoRestosAPagar,
  anularPagamentoRestosAPagar,
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
} from "../../../../modules/m08-restos-a-pagar/restos.js";
import { empenharDe2026, liquidarDe2026, semearM08, FONTE, POR } from "../../../../modules/m08-restos-a-pagar/m08-encerramento.test.js";
import {
  gerarCancelamentoRestos,
  gerarEstornoPagamento,
  gerarEstornoPagamentoRestos,
  gerarEstornoRetencao,
  gerarEstornoRetencaoRestos,
  gerarLiquidacao,
  gerarLiquidacaoRestos,
  gerarPagamentos,
  gerarPagamentosRestos,
  gerarRestosInscritos,
  gerarRetencao,
  gerarRetencaoRestos,
} from "./gerador.js";

/**
 * V24 — OS RESTOS A PAGAR NO SAGRES (§4.28 a §4.34, §4.40). O cenário: um RP processado (empenhado e
 * liquidado em 2026) e um RP não processado (só empenhado), inscritos na virada; em 2027 o não processado é
 * liquidado, o processado é pago retendo INSS e o pagamento é anulado, e o saldo não processado é
 * cancelado. Cada fato sai no arquivo de restos, nas posições do leiaute — e NÃO no arquivo do exercício.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001";
const CNPJ = "12345678000195";
const RP = "2.1.3.1.1.00.00";
const CAIXA = "1.1.1.1.2.00.00";
const P_INSS = "2.1.8.8.1.01.02";
const R_LIQ_RP = roteiroLiquidacaoRestos({ variacaoDiminutiva: "3.3.2.1.1.01.00", restosAPagarProcessados: RP });
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: RP, disponibilidade: CAIXA });
const R_CANC_RP = roteiroCancelamentoRestos({ restosAPagar: RP, variacaoAumentativa: "4.6.4.1.1.00.00" });
const dia = (m: number, d: number): Date => new Date(Date.UTC(2027, m - 1, d));
const D = (m: number, d: number): Date => new Date(Date.UTC(2027, m - 1, d, 12, 0, 0));
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");

let rppLiquidacao = "";
let rppInscricao = "";
let rpnpInscricao = "";
let rpnpEmpenho = "";
let tipoInss = "";

beforeEach(async () => {
  await semearM08();
  // A tripla bancária que os arquivos de pagamento exigem (CadastroContaBancaria §4.23).
  await prisma.contaBancaria.update({ where: { codigo: "CC-001" }, data: { banco: "001", agencia: "1234", digitoAgencia: "0", conta: "5555", digitoConta: "1" } });
  await prisma.contaPcasp.create({ data: { id: "c-inss-rp", codigo: P_INSS, nome: "Contribuição ao RGPS", naturezaSaldo: "CREDORA", nivel: 7, analitica: true } });
  tipoInss = (await prisma.tipoConsignacao.create({ data: { codigo: "INSS", descricao: "INSS retido", contaPassivoId: "c-inss-rp", criadoPor: "TESTE" } })).id;
  const deps = criarM05Deps(prisma);
  const e1 = await empenharDe2026(deps, "11", "1000.00");
  rppLiquidacao = await liquidarDe2026(deps, e1, "11", "1000.00");
  rpnpEmpenho = await empenharDe2026(deps, "12", "600.00");
  const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
  rppInscricao = enc.inscricoes.find((i) => i.tipo === "PROCESSADO")!.id;
  rpnpInscricao = enc.inscricoes.find((i) => i.tipo === "NAO_PROCESSADO")!.id;
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("V24 — restos a pagar no SAGRES", { timeout: 120000 }, () => {
  it("§4.40 RestosInscritos (dezembro de 2026): um registro por empenho, processado e não processado separados (N=2)", async () => {
    const a = await gerarRestosInscritos(prisma, { codUnidadeGestora: UG, competencia: new Date(Date.UTC(2026, 11, 1)) });
    const l = linhas(a.conteudo);
    expect(l).toHaveLength(2);
    expect(l.every((x) => x.length === 76)).toBe(true);
    const por = new Map(l.map((x) => [x.slice(15, 22).trim(), x]));
    // 1000,00 processado (empenho 11) e 600,00 não processado (empenho 12)
    expect(por.get("11")?.slice(28, 44)).toBe("0000000001000,00");
    expect(por.get("11")?.slice(44, 60)).toBe("0000000001000,00");
    expect(por.get("11")?.slice(60, 76)).toBe("0000000000000,00");
    expect(por.get("12")?.slice(28, 44)).toBe("0000000000600,00");
    expect(por.get("12")?.slice(60, 76)).toBe("0000000000600,00");
    expect(l[0]!.slice(22, 28)).toBe(UG);
  });

  it("§4.31 a liquidação do não processado sai em LiquidacaoRestos e NÃO em Liquidacao", async () => {
    await liquidarRestosAPagar(prisma, { empenhoId: rpnpEmpenho, numero: "21", valor: "400.00", data: D(2, 10), responsavelAtesto: "Fiscal", historico: "Liquidacao de RPNP", criadoPor: POR }, R_LIQ_RP);
    const r = linhas((await gerarLiquidacaoRestos(prisma, { codUnidadeGestora: UG, dia: dia(2, 10) })).conteudo);
    expect(r).toHaveLength(1);
    expect(r[0]!).toHaveLength(156);
    expect(r[0]!.slice(6, 10)).toBe("2026"); //                ano do empenho
    expect(r[0]!.slice(15, 22)).toBe("0000012"); //            empenho
    expect(r[0]!.slice(22, 29)).toBe("0000021"); //            liquidação
    expect(r[0]!.slice(134, 150)).toBe("0000000000400,00"); // valor
    expect(r[0]!.slice(150, 156)).toBe(UG); //                 UG de origem
    expect((await gerarLiquidacao(prisma, { codUnidadeGestora: UG, dia: dia(2, 10) })).registros).toBe(0);
  });

  it("§4.28 e §4.33 o pagamento do processado com INSS retido sai nos arquivos de restos e NÃO nos do exercício", async () => {
    await pagarRestosAPagar(prisma, { liquidacaoId: rppLiquidacao, numero: "31", valor: "1000.00", data: D(2, 15), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento de RP", criadoPor: POR }, R_PAG_RP, { contaDisponibilidade: CAIXA, retencoes: [{ tipoConsignacaoId: tipoInss, credorConsignatario: "Previdência Social", valor: "110.00", contaConsignacaoAPagar: P_INSS }] });
    const p = linhas((await gerarPagamentosRestos(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: dia(2, 15) })).conteudo);
    expect(p).toHaveLength(1);
    expect(p[0]!).toHaveLength(143);
    expect(p[0]!.slice(15, 22)).toBe("0000011");
    expect(p[0]!.slice(22, 29)).toBe("0000031");
    expect(p[0]!.slice(37, 53)).toBe("0000000001000,00");
    expect(p[0]!.slice(114, 115)).toBe("2"); //              exercício da fonte: anterior
    expect(p[0]!.slice(115, 118)).toBe("500");
    expect(p[0]!.slice(123, 137)).toBe(CNPJ);
    const ret = linhas((await gerarRetencaoRestos(prisma, { codUnidadeGestora: UG, dia: dia(2, 15) })).conteudo);
    expect(ret).toHaveLength(1);
    expect(ret[0]!).toHaveLength(52);
    expect(ret[0]!.slice(29, 45)).toBe("0000000000110,00");
    expect((await gerarPagamentos(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: dia(2, 15) })).registros).toBe(0);
    expect((await gerarRetencao(prisma, { codUnidadeGestora: UG, dia: dia(2, 15) })).registros).toBe(0);
  });

  it("§4.29 e §4.34 a anulação do pagamento de restos sai com o motivo, e NÃO nos estornos do exercício", async () => {
    const pg = await pagarRestosAPagar(prisma, { liquidacaoId: rppLiquidacao, numero: "31", valor: "1000.00", data: D(2, 15), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento de RP", criadoPor: POR }, R_PAG_RP, { contaDisponibilidade: CAIXA, retencoes: [{ tipoConsignacaoId: tipoInss, credorConsignatario: "Previdência Social", valor: "110.00", contaConsignacaoAPagar: P_INSS }] });
    await anularPagamentoRestosAPagar(prisma, { pagamentoId: pg.pagamentoId, numero: "32", data: D(3, 1), motivo: "Pagamento de RP feito ao credor errado", criadoPor: POR });
    const e = linhas((await gerarEstornoPagamentoRestos(prisma, { codUnidadeGestora: UG, dia: dia(3, 1) })).conteudo);
    expect(e).toHaveLength(1);
    expect(e[0]!).toHaveLength(187);
    expect(e[0]!.slice(22, 29)).toBe("0000031"); //  pagamento estornado
    expect(e[0]!.slice(29, 36)).toBe("0000032"); //  estorno
    expect(e[0]!.slice(44, 164).trim()).toBe("Pagamento de RP feito ao credor errado");
    expect(e[0]!.slice(164, 165)).toBe("S");
    const er = linhas((await gerarEstornoRetencaoRestos(prisma, { codUnidadeGestora: UG, dia: dia(3, 1) })).conteudo);
    expect(er).toHaveLength(1);
    expect(er[0]!).toHaveLength(187);
    expect(er[0]!.slice(45, 165).trim()).toBe("Pagamento de RP feito ao credor errado");
    expect(er[0]!.slice(165, 181)).toBe("0000000000110,00");
    expect((await gerarEstornoPagamento(prisma, { codUnidadeGestora: UG, dia: dia(3, 1) })).registros).toBe(0);
    expect((await gerarEstornoRetencao(prisma, { codUnidadeGestora: UG, dia: dia(3, 1) })).registros).toBe(0);
  });

  it("§4.30 o cancelamento sai com S para o processado e N para o não processado (N=2); desfazer um cancelamento recusa o dia nomeando", async () => {
    await cancelarRestosAPagar(prisma, { inscricaoId: rpnpInscricao, valor: "600.00", motivo: "Fornecedor não entregou o objeto", data: D(3, 5), criadoPor: POR }, R_CANC_RP);
    await cancelarRestosAPagar(prisma, { inscricaoId: rppInscricao, valor: "100.00", motivo: "Glosa do serviço prestado a menor", data: D(3, 5), criadoPor: POR }, R_CANC_RP);
    const c = linhas((await gerarCancelamentoRestos(prisma, { codUnidadeGestora: UG, dia: dia(3, 5) })).conteudo);
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.length === 180)).toBe(true);
    const por = new Map(c.map((x) => [x.slice(15, 22), x]));
    expect(por.get("0000012")?.slice(173, 174)).toBe("N");
    expect(por.get("0000011")?.slice(173, 174)).toBe("S");
    expect(por.get("0000012")?.slice(37, 53)).toBe("0000000000600,00");
    expect(new Set(c.map((x) => x.slice(22, 29)))).toEqual(new Set(["0000001", "0000002"]));

    const mov = await prisma.movimentoRestosAPagar.findFirstOrThrow({ where: { tipo: "CANCELAMENTO", inscricaoId: rppInscricao } });
    await anularCancelamentoRestosAPagar(prisma, { movimentoId: mov.id, numero: "41", data: D(3, 9), motivo: "Cancelamento feito sobre o empenho errado", criadoPor: POR } as never);
    await expect(gerarCancelamentoRestos(prisma, { codUnidadeGestora: UG, dia: dia(3, 9) })).rejects.toThrow(/DESFEITO.*não tem registro para desfazer um cancelamento/);
  });
});
