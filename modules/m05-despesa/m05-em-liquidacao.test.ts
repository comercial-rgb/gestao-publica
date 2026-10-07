import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { liquidar } from "./servico-bloco2.js";
import { empenhosEmLiquidacao, totalEmLiquidacao } from "./em-liquidacao.js";
import { empenharDe2026, R_EMPENHO, R_LIQUIDACAO, semearM08, FONTE, POR } from "../m08-restos-a-pagar/fixture-m08.js";
import { empenhar } from "./servico.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { conferirDocumentoFiscal, registrarDocumentoFiscal } from "../m11-licitacoes/documento-fiscal.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import type { M05Deps } from "./ports.js";

/**
 * V36 — EMPENHOS E RESTOS EM LIQUIDAÇÃO (TR 5.10.1.42). Conta no EMPENHO, min(saldo, notas conferidas − liquidado). Contas à mão (credor da fixture, emitente das notas):
 *
 *   NE1 1.000 · notas conferidas de 400 e de 300; liquidado 300 (com a de 300)  → verificado 700 − liquidado 300 = 400
 *   NE2   500 · nota conferida de 800                                          → em liquidação 500 (o saldo é o teto)
 *   NE3   300 · nota só REGISTRADA (sem conferência)                          → fora
 *   NE4   600 · nota conferida de 600, já liquidada por inteiro com ela        → fora (saldo zero)
 *   NE5   200 · nota conferida de 150 SEM empenho, pela ordem de compra cujo empenho único é o NE5 → em liquidação 150
 *   NE6   100 · sem nota                                                       → fora
 *
 *   2026: NE1 400 + NE2 500 + NE5 150 = 1.050,00 no exercício.
 *   Encerrado 2026, os mesmos três em 2027 são RESTOS NÃO PROCESSADOS, com os mesmos valores.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const D = (s: string): Date => new Date(`${s}T12:00:00.000Z`);

describe("M05 — empenhos e restos em liquidação", () => {
  let deps: M05Deps;
  let emitenteId: string;
  let numeroDaNota = 0;

  const nota = async (valor: string, alvo: { empenhoId: string } | { ordemId: string }, conferir: boolean): Promise<string> => {
    numeroDaNota += 1;
    const { documentoId } = await registrarDocumentoFiscal(prisma, {
      emitenteId,
      modelo: "NFE",
      serie: "1",
      numero: String(numeroDaNota),
      dataEmissao: D("2026-07-01"),
      dataRecebimento: D("2026-07-02"),
      ...alvo,
      valorBruto: valor,
      valorTotal: valor,
      itens: [{ descricao: "Serviço", unidade: "UN", quantidade: "1", valorUnitario: valor, valorTotal: valor }],
      criadoPor: POR,
    });
    if (conferir) await conferirDocumentoFiscal(prisma, { documentoId, data: D("2026-07-03"), motivo: "Conferida com a entrega", criadoPor: POR });
    return documentoId;
  };

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
    emitenteId = (await prisma.pessoa.create({ data: { documento: "12345678000195", tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;
    numeroDaNota = 0;
    const ne = async (n: string, v: string) => empenharDe2026(deps, n, v);
    const ne1 = await ne("NE1", "1000.00");
    await nota("400.00", { empenhoId: ne1 }, true);
    const doc1b = await nota("300.00", { empenhoId: ne1 }, true);
    await liquidar({ empenhoId: ne1, numero: "NL1", valor: "300.00", data: D("2026-08-01"), responsavelAtesto: "Fulano", historico: "liq NL1", documentoFiscalId: doc1b, criadoPor: POR }, R_LIQUIDACAO, deps);
    await nota("800.00", { empenhoId: await ne("NE2", "500.00") }, true);
    await nota("300.00", { empenhoId: await ne("NE3", "300.00") }, false);
    const ne4 = await ne("NE4", "600.00");
    const doc4 = await nota("600.00", { empenhoId: ne4 }, true);
    await liquidar({ empenhoId: ne4, numero: "NL4", valor: "600.00", data: D("2026-08-01"), responsavelAtesto: "Fulano", historico: "liq NL4", documentoFiscalId: doc4, criadoPor: POR }, R_LIQUIDACAO, deps);
    const ne5 = await ne("NE5", "200.00");
    const ordem = await prisma.ordemDeCompra.create({ data: { numero: "OC-EL-1", tipo: "ORDINARIA", fornecedorId: emitenteId, dataEmissao: D("2026-06-01"), finalidade: "Serviço da ordem", criadoPor: POR }, select: { id: true } });
    await prisma.empenho.update({ where: { id: ne5 }, data: { ordemDeCompraId: ordem.id } });
    await nota("150.00", { ordemId: ordem.id }, true);
    await ne("NE6", "100.00");
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: no exercício, só os com nota conferida e saldo — o menor entre o saldo e o verificado", async () => {
    const r = await empenhosEmLiquidacao(prisma, { exercicio: 2026 });
    expect(r.empenhos.map((e) => [e.empenhoNumero, e.situacao, e.saldoALiquidar.toFixed(2), e.verificado.toFixed(2), e.emLiquidacao.toFixed(2)]).sort()).toEqual([
      ["NE1", "EXERCICIO", "700.00", "700.00", "400.00"],
      ["NE2", "EXERCICIO", "500.00", "800.00", "500.00"],
      ["NE5", "EXERCICIO", "200.00", "150.00", "150.00"],
    ]);
    const t = totalEmLiquidacao(r.empenhos);
    expect([t.exercicio.toFixed(2), t.restos.toFixed(2)]).toEqual(["1050.00", "0.00"]);
    expect(r.notasSemAtribuicao).toBe(0);
    const ne1 = r.empenhos.find((e) => e.empenhoNumero === "NE1");
    expect([ne1?.liquidado.toFixed(2), ne1?.notas.map((n) => n.valor.toFixed(2))]).toEqual(["300.00", ["400.00", "300.00"]]);
  });

  it("t2: encerrado o exercício, os mesmos viram restos não processados em liquidação", async () => {
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const r = await empenhosEmLiquidacao(prisma, { exercicio: 2027 });
    expect(r.empenhos.map((e) => [e.empenhoNumero, e.situacao, e.exercicioOrigem, e.emLiquidacao.toFixed(2)]).sort()).toEqual([
      ["NE1", "RP_NAO_PROCESSADO", 2026, "400.00"],
      ["NE2", "RP_NAO_PROCESSADO", 2026, "500.00"],
      ["NE5", "RP_NAO_PROCESSADO", 2026, "150.00"],
    ]);
    expect(totalEmLiquidacao(r.empenhos).restos.toFixed(2)).toBe("1050.00");
  });

  it("t3: ordem com dois empenhos não atribui a nota — fica contada à parte", async () => {
    const ne7 = await empenharDe2026(deps, "NE7", "50.00");
    const ne8 = await empenharDe2026(deps, "NE8", "50.00");
    const ordem = await prisma.ordemDeCompra.create({ data: { numero: "OC-EL-2", tipo: "ORDINARIA", fornecedorId: emitenteId, dataEmissao: D("2026-06-01"), finalidade: "Duas entregas", criadoPor: POR }, select: { id: true } });
    await prisma.empenho.updateMany({ where: { id: { in: [ne7, ne8] } }, data: { ordemDeCompraId: ordem.id } });
    await nota("40.00", { ordemId: ordem.id }, true);
    const r = await empenhosEmLiquidacao(prisma, { exercicio: 2026 });
    expect(r.empenhos.map((e) => e.empenhoNumero).sort()).toEqual(["NE1", "NE2", "NE5"]);
    expect(r.notasSemAtribuicao).toBe(1);
  });

  it("t4: a liquidação gravada SEM escolher a nota também conta — a entrega liquidada não fica em liquidação", async () => {
    const ne9 = await empenharDe2026(deps, "NE9", "1000.00");
    await nota("400.00", { empenhoId: ne9 }, true);
    await liquidar({ empenhoId: ne9, numero: "NL9", valor: "400.00", data: D("2026-08-01"), responsavelAtesto: "Fulano", historico: "liq sem a nota", criadoPor: POR }, R_LIQUIDACAO, deps);
    const ne10 = await empenharDe2026(deps, "NE10", "1000.00");
    await nota("400.00", { empenhoId: ne10 }, true);
    await liquidar({ empenhoId: ne10, numero: "NL10", valor: "100.00", data: D("2026-08-01"), responsavelAtesto: "Fulano", historico: "liq parcial sem a nota", criadoPor: POR }, R_LIQUIDACAO, deps);
    const r = await empenhosEmLiquidacao(prisma, { exercicio: 2026 });
    const por = new Map(r.empenhos.map((e) => [e.empenhoNumero, e.emLiquidacao.toFixed(2)]));
    expect([por.has("NE9"), por.get("NE10")]).toEqual([false, "300.00"]);
  });

  it("t5: o recorte por unidade — a outra unidade não aparece nem no contador de notas sem atribuição", async () => {
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Saúde", orgaoId: "org-01" } });
    await criarFichaDeTeste(prisma, { id: "ficha-02", exercicio: 2026, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00" });
    const daSaude = async (numero: string): Promise<string> =>
      (await empenhar({ fichaId: "ficha-02", numero, tipo: "ORDINARIO", valor: "100.00", data: D("2026-06-01"), credorCpfCnpj: "12345678000195", historico: `empenho ${numero}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps)).empenhoId;
    const ns1 = await daSaude("NS1");
    await nota("80.00", { empenhoId: ns1 }, true);
    // A ordem com um empenho de cada unidade: a nota dela não se atribui, e só quem vê as duas a conta.
    const ns2 = await daSaude("NS2");
    const ne11 = await empenharDe2026(deps, "NE11", "100.00");
    const ordem = await prisma.ordemDeCompra.create({ data: { numero: "OC-EL-3", tipo: "ORDINARIA", fornecedorId: emitenteId, dataEmissao: D("2026-06-01"), finalidade: "Entrega dividida", criadoPor: POR }, select: { id: true } });
    await prisma.empenho.updateMany({ where: { id: { in: [ns2, ne11] } }, data: { ordemDeCompraId: ordem.id } });
    await nota("30.00", { ordemId: ordem.id }, true);

    const educacao = await empenhosEmLiquidacao(prisma, { exercicio: 2026, unidadeCodigo: "01001" });
    expect([educacao.empenhos.map((e) => e.empenhoNumero).sort(), educacao.notasSemAtribuicao]).toEqual([["NE1", "NE2", "NE5"], 0]);
    const ente = await empenhosEmLiquidacao(prisma, { exercicio: 2026 });
    expect([ente.empenhos.map((e) => e.empenhoNumero).sort(), ente.notasSemAtribuicao]).toEqual([["NE1", "NE2", "NE5", "NS1"], 1]);
  });
});
