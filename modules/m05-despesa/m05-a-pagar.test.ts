import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { listarLiquidacoes } from "./consultas.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "./dominio.js";
import { anularEmpenho, empenhar } from "./servico.js";
import { liquidar, pagar } from "./servico-bloco2.js";
import { anularEmpenhoParcial } from "./anulacao-parcial.js";
import { criarM05Deps } from "./adapter-prisma.js";
import type { M05Deps } from "./ports.js";
import { porCredor, posicaoAPagar, type ObrigacaoAPagar } from "./a-pagar.js";
import { saldoDaInscricao } from "../m08-restos-a-pagar/dominio.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * V33 — A PAGAR, POR CREDOR E POR OBRIGAÇÃO.
 *
 * N=2 credores, e em cada um os casos que mudam a resposta: pagamento parcial com retenção viva e retenção estornada,
 * anulação parcial e total, ordem de pagamento como vencimento, resto processado com pagamento, cancelamento e
 * estorno do cancelamento, resto não processado liquidado no ano novo, e um empenho de ano fechado sem inscrição.
 * As somas esperadas estão escritas à mão — não pela função testada.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FONTE = "fnt-500";
const A = "12345678000195";
const B = "11222333000181";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });

let deps: M05Deps;
const D = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

async function empenha(ficha: string, numero: string, valor: string, credor: string, data: string): Promise<string> {
  const e = await empenhar(
    { fichaId: ficha, numero, tipo: "ORDINARIO", valor, data: D(data), credorCpfCnpj: credor, historico: `empenho ${numero}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}
async function liquida(empenhoId: string, numero: string, valor: string, data: string): Promise<string> {
  return (await liquidar({ empenhoId, numero, valor, data: D(data), responsavelAtesto: "Fiscal", historico: "liquidação", criadoPor: POR }, R_LIQUIDACAO, deps)).liquidacaoId;
}

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE } });
  await prisma.tipoConsignacao.create({ data: { id: "tc-inss", codigo: "INSS-T", descricao: "INSS retido (teste)", criadoPor: POR } });
  const comum = { orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "500000.00" };
  await criarFichaDeTeste(prisma, { ...comum, id: "f26", numero: 1, exercicio: 2026 });
  await criarFichaDeTeste(prisma, { ...comum, id: "f25", numero: 1, exercicio: 2025 });

  // ── 2026, credor A: liquidado em parte, pago em parte, com uma retenção viva e outra estornada; ordem prevista ──
  const ne1 = await empenha("f26", "NE-1", "10000.00", A, "2026-02-01");
  const l1 = await liquida(ne1, "NL-1", "6000.00", "2026-03-01");
  const p1 = await pagar({ liquidacaoId: l1, numero: "NP-1", valor: "2500.00", data: D("2026-04-01"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento", criadoPor: POR }, R_PAGAMENTO, deps);
  const extra = { tipoConsignacaoId: "tc-inss", credorConsignatario: "INSS", contaBancariaId: "cb1", data: D("2026-04-01"), pagamentoId: p1.pagamentoId, lancamentoId: p1.lancamentoId, historico: "retenção", criadoPor: POR };
  await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-viva", tipo: "INGRESSO", valor: "300.00" } });
  await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-morta", tipo: "INGRESSO", valor: "100.00" } });
  await prisma.movimentoExtraorcamentario.create({ data: { ...extra, id: "ret-estorno", tipo: "ESTORNO_INGRESSO", valor: "100.00", estornoDeId: "ret-morta" } });
  await prisma.ordemDePagamento.create({ data: { numero: "OP-1", liquidacaoId: l1, valor: "3500.00", dataPrevista: D("2026-06-30"), contaBancaria: "CC-001", fonteId: FONTE, historico: "ordem", criadoPor: POR } });

  // ── 2026, credor B: anulação parcial (fica 5000 a liquidar) e um anulado total (some) ──
  const ne2 = await empenha("f26", "NE-2", "8000.00", B, "2026-02-02");
  await anularEmpenhoParcial({ originalId: ne2, numero: "NEA-2", valor: "3000.00", data: D("2026-05-01"), motivo: "redução do objeto contratado por acordo entre as partes", criadoPor: POR }, deps);
  const ne3 = await empenha("f26", "NE-3", "2000.00", B, "2026-02-03");
  await anularEmpenho({ empenhoId: ne3, numero: "NEA-3", data: D("2026-05-02"), historico: "anulação total", criadoPor: POR }, deps);

  // ── restos (2025) ──
  // B: processado 4000; pago 1000, cancelado 500 e o cancelamento estornado em 200 -> saldo 2700.
  const ne25a = await empenha("f25", "NE-25A", "4000.00", B, "2025-06-01");
  await liquida(ne25a, "NL-25A", "4000.00", "2025-07-01");
  const rpp = await prisma.inscricaoRestosAPagar.create({ data: { empenhoId: ne25a, exercicioOrigem: 2025, tipo: "PROCESSADO", valorInscrito: "4000.00", criadoPor: POR } });
  await prisma.movimentoRestosAPagar.createMany({
    data: [
      { inscricaoId: rpp.id, tipo: "PAGAMENTO", valor: "1000.00", criadoPor: POR },
      { id: "canc-1", inscricaoId: rpp.id, tipo: "CANCELAMENTO", valor: "500.00", criadoPor: POR },
      { inscricaoId: rpp.id, tipo: "ESTORNO_CANCELAMENTO", valor: "200.00", estornoDeId: "canc-1", criadoPor: POR },
    ],
  });
  // A: não processado 3000; cancelado 500; liquidado 1000 em 2026 -> 1500 a liquidar e 1000 a pagar.
  const ne25b = await empenha("f25", "NE-25B", "3000.00", A, "2025-06-02");
  const rpn = await prisma.inscricaoRestosAPagar.create({ data: { empenhoId: ne25b, exercicioOrigem: 2025, tipo: "NAO_PROCESSADO", valorInscrito: "3000.00", criadoPor: POR } });
  await prisma.movimentoRestosAPagar.create({ data: { inscricaoId: rpn.id, tipo: "CANCELAMENTO", valor: "500.00", criadoPor: POR } });
  const lancNe25b = await prisma.empenho.findUniqueOrThrow({ where: { id: ne25b }, select: { lancamentoId: true } });
  await prisma.liquidacao.create({ data: { empenhoId: ne25b, numero: "NL-RP-1", valor: "1000.00", data: D("2026-03-10"), responsavelAtesto: "Fiscal", lancamentoId: lancNe25b.lancamentoId, criadoPor: POR } });
  // A: 2025 sem inscrição e com saldo -> pendência do encerramento, fora da soma.
  await empenha("f25", "NE-25C", "500.00", A, "2025-06-03");
}, 180000);

const so = (os: readonly ObrigacaoAPagar[], f: Partial<ObrigacaoAPagar>): ObrigacaoAPagar[] =>
  os.filter((o) => Object.entries(f).every(([k, v]) => (o as unknown as Record<string, unknown>)[k] === v));
const s = (x: { toFixed(n: number): string } | undefined): string | undefined => x?.toFixed(2);

describe("M05 — a pagar, por credor e por obrigação", () => {
  it("t1: o exercício separa a liquidar de liquidado a pagar, com bruto, retido vivo, líquido e vencimento", async () => {
    const p = await posicaoAPagar(prisma, { exercicio: 2026 });
    const [alA] = so(p.obrigacoes, { credorCpfCnpj: A, fase: "A_LIQUIDAR", situacao: "EXERCICIO" });
    expect(s(alA?.saldo)).toBe("4000.00");
    const [lpA] = so(p.obrigacoes, { credorCpfCnpj: A, fase: "LIQUIDADO_A_PAGAR", situacao: "EXERCICIO" });
    expect([s(lpA?.base), s(lpA?.pagoBruto), s(lpA?.retido), s(lpA?.pagoLiquido), s(lpA?.saldo)]).toEqual(["6000.00", "2500.00", "300.00", "2200.00", "3500.00"]);
    expect(lpA?.vencimento?.toISOString().slice(0, 10)).toBe("2026-06-30");
    // B: a anulação parcial reduz, a total some.
    const doB = so(p.obrigacoes, { credorCpfCnpj: B, situacao: "EXERCICIO" });
    expect(doB.map((o) => `${o.empenhoNumero}:${o.fase}:${s(o.saldo)}`)).toEqual(["NE-2:A_LIQUIDAR:5000.00"]);
  });

  it("t2: restos — processado pelo saldo da inscrição (pago, cancelado e estorno do cancelamento); não processado em duas fases", async () => {
    const p = await posicaoAPagar(prisma, { exercicio: 2026 });
    const [rpp] = so(p.obrigacoes, { situacao: "RP_PROCESSADO" });
    expect([rpp?.credorCpfCnpj, s(rpp?.base), s(rpp?.pagoBruto), s(rpp?.cancelado), s(rpp?.saldo), rpp?.exercicioOrigem]).toEqual([B, "4000.00", "1000.00", "300.00", "2700.00", 2025]);
    const rpn = so(p.obrigacoes, { situacao: "RP_NAO_PROCESSADO" });
    expect(rpn.map((o) => `${o.fase}:${s(o.saldo)}`).sort()).toEqual(["A_LIQUIDAR:1500.00", "LIQUIDADO_A_PAGAR:1000.00"]);
    // As duas fases do não processado somam o saldo da inscrição — a mesma régua do M08.
    const total = rpn.reduce((x, o) => x.plus(o.saldo), toMoney("0"));
    expect(total.toFixed(2)).toBe(saldoDaInscricao(toMoney("3000.00"), [{ tipo: "CANCELAMENTO", valor: toMoney("500.00") }]).toFixed(2));
  });

  it("t3: o empenho de ano fechado sem inscrição fica numa lista à parte, fora das obrigações", async () => {
    const p = await posicaoAPagar(prisma, { exercicio: 2026 });
    expect(p.semInscricao.map((e) => `${e.empenhoNumero}:${e.exercicio}:${s(e.saldoALiquidar)}`)).toEqual(["NE-25C:2025:500.00"]);
    expect(p.obrigacoes.some((o) => o.empenhoNumero === "NE-25C")).toBe(false);
  });

  it("t4: por credor, as fases não se misturam; o filtro por credor traz só o dele", async () => {
    const p = await posicaoAPagar(prisma, { exercicio: 2026 });
    const g = new Map(porCredor(p.obrigacoes).map((c) => [c.credorCpfCnpj, `${s(c.aLiquidar)}|${s(c.liquidadoAPagar)}`]));
    expect(g.get(A)).toBe("5500.00|4500.00");
    expect(g.get(B)).toBe("5000.00|2700.00");
    const soB = await posicaoAPagar(prisma, { exercicio: 2026, credorCpfCnpj: B });
    expect(new Set(soB.obrigacoes.map((o) => o.credorCpfCnpj))).toEqual(new Set([B]));
    expect(soB.semInscricao).toEqual([]);
  });

  it("t5: o liquidado a pagar do exercício reconcilia com o saldo a pagar das liquidações do M05", async () => {
    const p = await posicaoAPagar(prisma, { exercicio: 2026 });
    const daConsulta = so(p.obrigacoes, { situacao: "EXERCICIO", fase: "LIQUIDADO_A_PAGAR" }).reduce((x, o) => x.plus(o.saldo), toMoney("0"));
    const doM05 = (await listarLiquidacoes(prisma, { exercicio: 2026 })).filter((l) => !l.anulado).reduce((x, l) => x.plus(l.saldoAPagar), toMoney("0"));
    expect(daConsulta.toFixed(2)).toBe(doM05.toFixed(2));
  });
});
