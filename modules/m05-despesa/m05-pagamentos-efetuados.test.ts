import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { anularPagamento } from "./servico-bloco2.js";
import { agruparPagamentos, pagamentosEfetuados, totaisDosPagamentos } from "./pagamentos-efetuados.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { empenharDe2026, liquidarDe2026, pagarDe2026, semearM08, FONTE, POR } from "../m08-restos-a-pagar/fixture-m08.js";
import { inicioDoDiaCivil, fimDoDiaCivil } from "../../packages/datas/index.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import type { M05Deps } from "./ports.js";

/**
 * V36 — PAGAMENTOS EFETUADOS NUM PERÍODO (TR 5.10.2.71 e 5.10.2.2). Contas à mão:
 *
 *   NE1 1.000 liquidado; NP-1 paga 1.000,00 em 01/09/2026 (inteiro: a ordem cronológica não deixa pagar o próximo
 *   antes), com retenção viva de 40,00 e outra de 10,00 estornada.
 *       → exercício · pago vivo 1.000,00 · retido 40,00 · líquido 960,00
 *   NE2 500 liquidado; NP-2 paga 500,00 e é anulado POR INTEIRO.
 *       → exercício · anulado · pago vivo 0,00 · retido 0,00 · líquido 0,00 (continua na lista)
 *   Encerrado 2026: a NL2, com o pagamento anulado, vira resto processado de 500,00; NP-RP paga 300,00 dele em
 *   01/02/2027. → RESTOS (dotação de 2026) · pago vivo 300,00 · líquido 300,00
 *
 *   Período 2026–2027: 3 linhas; totais pago 1.300,00, retido 40,00, líquido 1.260,00.
 *   Só 2027: só o NP-RP — o pagamento de resto que a lista da execução (recorte pela ficha) não mostrava.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.2.00.00" });
const periodo = (de: string, ate: string) => ({ de: inicioDoDiaCivil(de), ate: fimDoDiaCivil(ate) });

describe("M05 — pagamentos efetuados num período", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
    await prisma.tipoConsignacao.create({ data: { id: "tc-inss", codigo: "INSS-T", descricao: "INSS retido (teste)", criadoPor: POR } });

    const ne1 = await empenharDe2026(deps, "NE1", "1000.00");
    const l1 = await liquidarDe2026(deps, ne1, "NL1", "1000.00");
    const p1 = await pagarDe2026(deps, l1, "NP-1", "1000.00");
    const lanc = await prisma.pagamento.findUniqueOrThrow({ where: { id: p1 }, select: { lancamentoId: true } });
    const extra = { tipoConsignacaoId: "tc-inss", credorConsignatario: "INSS", contaBancariaId: "cb1", data: new Date("2026-09-01T12:00:00Z"), pagamentoId: p1, lancamentoId: lanc.lancamentoId, historico: "retenção", criadoPor: POR };
    await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-viva", tipo: "INGRESSO", valor: "40.00" } });
    await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-morta", tipo: "INGRESSO", valor: "10.00" } });
    await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-estorno", tipo: "ESTORNO_INGRESSO", valor: "10.00", estornoDeId: "ret-morta" } });

    const ne2 = await empenharDe2026(deps, "NE2", "500.00");
    const l2 = await liquidarDe2026(deps, ne2, "NL2", "500.00");
    const p2 = await pagarDe2026(deps, l2, "NP-2", "500.00");
    await anularPagamento({ pagamentoId: p2, numero: "NP-2-A", data: new Date("2026-09-10T12:00:00Z"), historico: "pagamento em duplicidade", criadoPor: POR }, deps);

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await pagarRestosAPagar(
      prisma,
      { liquidacaoId: l2, numero: "NP-RP", valor: "300.00", data: new Date("2027-02-01T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "resto", criadoPor: POR },
      R_PAG_RP
    );
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: exercício e restos, com o retido vivo e o anulado na lista", async () => {
    const ls = await pagamentosEfetuados(prisma, periodo("2026-01-01", "2027-12-31"));
    const por = new Map(ls.map((l) => [l.numero, l]));
    expect(ls.map((l) => l.numero)).toEqual(["NP-1", "NP-2", "NP-RP"]);
    const np1 = por.get("NP-1");
    expect([np1?.origem, np1?.pagoVivo.toFixed(2), np1?.retido.toFixed(2), np1?.liquido.toFixed(2)]).toEqual(["EXERCICIO", "1000.00", "40.00", "960.00"]);
    const np2 = por.get("NP-2");
    expect([np2?.anulado, np2?.pagoVivo.toFixed(2), np2?.retido.toFixed(2), np2?.liquido.toFixed(2)]).toEqual([true, "0.00", "0.00", "0.00"]);
    const rp = por.get("NP-RP");
    expect([rp?.origem, rp?.exercicioDaDotacao, rp?.pagoVivo.toFixed(2), rp?.liquido.toFixed(2)]).toEqual(["RESTOS", 2026, "300.00", "300.00"]);
    const t = totaisDosPagamentos(ls);
    expect([t.pagoVivo.toFixed(2), t.retido.toFixed(2), t.liquido.toFixed(2)]).toEqual(["1300.00", "40.00", "1260.00"]);
  });

  it("t2: o período recorta pela data do pagamento — 2027 traz só o resto", async () => {
    const ls = await pagamentosEfetuados(prisma, periodo("2027-01-01", "2027-12-31"));
    expect(ls.map((l) => [l.numero, l.origem])).toEqual([["NP-RP", "RESTOS"]]);
    // E o limite final vale: só 2026 deixa o pagamento de 2027 de fora.
    expect((await pagamentosEfetuados(prisma, periodo("2026-01-01", "2026-12-31"))).map((l) => l.numero)).toEqual(["NP-1", "NP-2"]);
  });

  it("t3: filtros por conta, fonte e credor; e o agrupamento subtotaliza", async () => {
    const todo = periodo("2026-01-01", "2027-12-31");
    expect(await pagamentosEfetuados(prisma, { ...todo, contaBancaria: "CC-002" })).toEqual([]);
    expect(await pagamentosEfetuados(prisma, { ...todo, fonteCodigo: "540" })).toEqual([]);
    expect((await pagamentosEfetuados(prisma, { ...todo, credorCpfCnpj: "12345678000195" })).length).toBe(3);
    expect(await pagamentosEfetuados(prisma, { ...todo, credorCpfCnpj: "00000000000000" })).toEqual([]);
    const grupos = agruparPagamentos(await pagamentosEfetuados(prisma, todo), "conta");
    expect(grupos.map((g) => [g.chave, g.linhas.length, g.liquido.toFixed(2)])).toEqual([["CC-001", 3, "1260.00"]]);
  });

  it("t4 (V36, TR 5.10.2.4): com ou sem documento anexado, assinado ou não — a assinatura vale no documento do pagamento ou da ordem dele", async () => {
    const todo = periodo("2026-01-01", "2027-12-31");
    const pags = new Map((await prisma.pagamento.findMany({ where: { numero: { in: ["NP-1", "NP-2", "NP-RP"] } }, select: { id: true, numero: true, liquidacaoId: true, fonteId: true } })).map((p) => [p.numero, p]));
    // O documento entra por `anexarArquivo` (o M22 proíbe anexo criado fora dele); a assinatura é gravada direto, que
    // é o que o filtro lê.
    const doc = async (nome: string, dono: { pagamentoId: string } | { ordemDePagamentoId: string }): Promise<string> =>
      (await anexarArquivo(prisma, { nomeOriginal: `${nome}.pdf`, mimeType: "application/pdf", conteudo: new TextEncoder().encode(`%PDF-1.4
% ${nome}
`), ...dono, criadoPor: POR })).anexoId;
    // NP-1: documento próprio, assinado. NP-2: documento próprio, sem assinatura. NP-RP: sem documento próprio, mas a
    // ORDEM de pagamento dele tem documento assinado.
    const np1 = await doc("np1", { pagamentoId: pags.get("NP-1")!.id });
    await prisma.assinaturaDeDocumento.create({ data: { modo: "SIMPLES", assinadoPor: POR, hashConteudo: "a".repeat(64), anexoId: np1 } });
    await doc("np2", { pagamentoId: pags.get("NP-2")!.id });
    const rp = pags.get("NP-RP")!;
    const ordem = await prisma.ordemDePagamento.create({ data: { numero: "OP-RP", liquidacaoId: rp.liquidacaoId, valor: "300.00", dataPrevista: new Date("2027-02-01T12:00:00Z"), contaBancaria: "CC-001", fonteId: rp.fonteId, historico: "ordem", criadoPor: POR }, select: { id: true } });
    const op = await doc("op", { ordemDePagamentoId: ordem.id });
    await prisma.assinaturaDeDocumento.create({ data: { modo: "SIMPLES", assinadoPor: POR, hashConteudo: "b".repeat(64), anexoId: op } });
    await prisma.pagamento.update({ where: { id: rp.id }, data: { ordemDePagamentoId: ordem.id } });

    const nums = async (r: { comAnexo?: boolean; assinado?: boolean }) => (await pagamentosEfetuados(prisma, { ...todo, ...r })).map((l) => l.numero);
    expect(await nums({ comAnexo: true })).toEqual(["NP-1", "NP-2"]);
    expect(await nums({ comAnexo: false })).toEqual(["NP-RP"]);
    expect(await nums({ assinado: true })).toEqual(["NP-1", "NP-RP"]);
    expect(await nums({ assinado: false })).toEqual(["NP-2"]);
    expect(await nums({ comAnexo: true, assinado: false })).toEqual(["NP-2"]);
    expect((await pagamentosEfetuados(prisma, todo)).map((l) => [l.numero, l.comAnexo, l.assinado])).toEqual([
      ["NP-1", true, true],
      ["NP-2", true, false],
      ["NP-RP", false, true],
    ]);
  });
});
