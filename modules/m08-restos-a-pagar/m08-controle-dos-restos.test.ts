import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { declararContasDoControleDosRestos, PAPEIS_DO_CONTROLE, PAPEL_NO_MANUAL, type PapelDoControle } from "./controle-dos-restos.js";
import { roteiroCancelamentoRestos, roteiroLiquidacaoRestos, roteiroPagamentoRestos } from "./dominio.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import { empenharDe2026, FONTE, liquidarDe2026, POR, semearM08 } from "./fixture-m08.js";
import { classificarContaNaVirada, contasDaVirada } from "./classificacao-da-virada.js";
import { encerrarControlesOrcamentarios } from "./encerramento-controles.js";
import { resolverDimensoes } from "../m14-exports-federais/msc/resolver.js";
import { anularPagamentoRestosAPagar, cancelarRestosAPagar, liquidarRestosAPagar, pagarRestosAPagar, saldoDosRestos } from "./restos.js";

/**
 * V35 A3 — OS RESTOS A PAGAR NO CONTROLE 5.3/6.3 (MCASP 11ª ed., Parte I, 4.7.4 a 4.7.6). Profundidade: razão.
 *
 * ⚠️ CONTAS À MÃO. 2026: E1 empenhado 1.000 sem liquidar (RPNP 1.000); E2 empenhado e liquidado 500 sem pagar (RPP 500).
 * Encerramento de 2026 (inscrição) e abertura de 2027:
 *   6.2.2.1.3.05 C 1.000 · 6.2.2.1.3.07 C 500 · 6.2.2.1.3.01 e .03 zeram · 5.3.1.1 D 1.000 · 6.3.1.1 C 1.000 · 5.3.2.1 D 500 ·
 *   6.3.2.1 C 500 (as contas "inscrição no exercício" passam por D e C e zeram)
 * 2027: E1 liquida 600 (6.3.1.1 → 6.3.1.2 → 6.3.1.3), paga 400 (6.3.1.3 → 6.3.1.4), cancela 100 (a liquidar → 6.3.1.9.9);
 *   E2 paga 500 (6.3.2.1 → 6.3.2.2).
 * Encerramento de 2027 (4.7.6 a/b) e abertura de 2028:
 *   E1: pagos 400 + cancelados 100 → C 5.3.1.1 500; liquidado não pago 200: D 6.3.1.3 / C 5.3.1.1 e D 5.3.2.1 / C 6.3.2.1;
 *       abertura: 5.3.1.1 300 → 5.3.1.2; 5.3.2.1 200 → 5.3.2.2.   E2: pagos 500 → C 5.3.2.1 500.
 *   Saldos em 1º/1/2028: 5.3.1.2 D 300 · 5.3.2.2 D 200 · 6.3.1.1 C 300 · 6.3.2.1 C 200 · o resto zero.
 *   Oráculo independente: o saldo de E1 no cadastro dos restos é 1.000 − 400 − 100 = 500 = 300 + 200.
 * 2028: o pagamento dos 200 de E1 sai de RPP a pagar (o que virou RPP), não de RPNP liquidados.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const R_LIQ_RP = roteiroLiquidacaoRestos({ variacaoDiminutiva: "3.3.2.1.1.01.00", restosAPagarProcessados: "2.1.3.1.1.00.00" });
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.2.00.00" });
const R_CANC_RP = roteiroCancelamentoRestos({ restosAPagar: "2.1.3.1.1.00.00", variacaoAumentativa: "4.6.4.1.1.00.00" });

const CONTAS_DO_CONTROLE: Readonly<Record<PapelDoControle, string>> = Object.fromEntries(
  PAPEIS_DO_CONTROLE.map((p) => [p, PAPEL_NO_MANUAL[p].sugestao ?? (p === "RPNP_CANCELADOS" ? "6.3.1.9.9.00.00" : "6.3.2.9.9.00.00")])
) as Record<PapelDoControle, string>;

async function semear(): Promise<void> {
  await semearM08();
  const novas = PAPEIS_DO_CONTROLE.map((p) => CONTAS_DO_CONTROLE[p]).filter((c) => !["6.2.2.1.3.01.00", "6.2.2.1.3.03.00"].includes(c));
  await prisma.contaPcasp.createMany({ data: novas.map((codigo) => ({ codigo, nome: `controle ${codigo}`, naturezaSaldo: codigo.startsWith("5") ? "DEVEDORA" : "CREDORA", nivel: 7, analitica: true })) });
  for (const ano of [2027, 2028]) await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
}

const declarar = (over: Partial<Record<PapelDoControle, string>> = {}, por = POR) =>
  declararContasDoControleDosRestos(prisma, { contas: { ...CONTAS_DO_CONTROLE, ...over }, fundamento: "MCASP 11ª ed., Parte I, 4.7.4 a 4.7.6; plano do TCE-PB", criadoPor: por });

/** Saldo por código, somado à mão das partidas (independente do motor): devedor positivo nas 5, credor positivo nas 6. */
async function saldo(codigo: string, ate = "2099-12-31T23:59:59Z"): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo }, lancamento: { dataTransacao: { lte: new Date(ate) } } }, select: { tipo: true, valor: true } });
  let c = 0n;
  for (const p of ps) c += (p.tipo === "DEBITO" ? 1n : -1n) * BigInt(p.valor.toFixed(2).replace(".", ""));
  if (!codigo.startsWith("5")) c = -c;
  const t = (c < 0n ? -c : c).toString().padStart(3, "0");
  return `${c < 0n ? "-" : ""}${t.slice(0, -2)}.${t.slice(-2)}`;
}

describe("M08 — restos a pagar no controle 5.3/6.3 (MCASP, Parte I, 4.7)", () => {
  let deps: M05Deps;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  }, 120_000);

  it("t1: três exercícios — inscrição, execução, encerramento com a transferência RPNP → RPP, abertura e o pagamento do transferido", async () => {
    await declarar();
    const e1 = await empenharDe2026(deps, "NE1", "1000.00", "GLOBAL");
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    const liq2 = await liquidarDe2026(deps, e2, "NL2", "500.00");

    const enc26 = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(enc26.controleOrcamentario).toEqual({ ligado: true });
    const i1 = enc26.inscricoes.find((i) => i.empenhoId === e1)!;
    const i2 = enc26.inscricoes.find((i) => i.empenhoId === e2)!;
    expect([i1.tipo, i2.tipo]).toEqual(["NAO_PROCESSADO", "PROCESSADO"]);
    const fim26 = "2026-12-31T23:00:00Z";
    expect([await saldo("6.2.2.1.3.05.00", fim26), await saldo("6.2.2.1.3.07.00", fim26), await saldo("6.2.2.1.3.01.00", fim26), await saldo("6.2.2.1.3.03.00", fim26)]).toEqual(["1000.00", "500.00", "0.00", "0.00"]);
    expect([await saldo("5.3.1.7.0.00.00", fim26), await saldo("6.3.1.7.1.00.00", fim26), await saldo("5.3.2.7.0.00.00", fim26), await saldo("6.3.2.7.0.00.00", fim26)]).toEqual(["1000.00", "1000.00", "500.00", "500.00"]);
    expect([await saldo("5.3.1.7.0.00.00"), await saldo("5.3.1.1.0.00.00"), await saldo("6.3.1.1.0.00.00"), await saldo("5.3.2.1.0.00.00"), await saldo("6.3.2.1.0.00.00")]).toEqual(["0.00", "1000.00", "1000.00", "500.00", "500.00"]);

    // 2027
    const l = await liquidarRestosAPagar(prisma, { empenhoId: e1, numero: "NL-RP1", valor: "600.00", data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação de RP", criadoPor: POR }, R_LIQ_RP);
    // a ordem cronológica (art. 141): a liquidação de 2026 (E2) é a cabeça da fila e paga primeiro
    await pagarRestosAPagar(prisma, { liquidacaoId: liq2, numero: "NP-RP2", valor: "500.00", data: new Date("2027-04-01T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de RPP", criadoPor: POR }, R_PAG_RP);
    await pagarRestosAPagar(prisma, { liquidacaoId: l.liquidacaoId, numero: "NP-RP1", valor: "400.00", data: new Date("2027-04-02T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de RP", criadoPor: POR }, R_PAG_RP);
    await cancelarRestosAPagar(prisma, { inscricaoId: i1.id, valor: "100.00", motivo: "obra reduzida por aditivo", data: new Date("2027-05-01T12:00:00Z"), criadoPor: POR }, R_CANC_RP);
    const fim27 = "2027-12-31T00:00:00Z";
    expect([await saldo("6.3.1.1.0.00.00", fim27), await saldo("6.3.1.2.0.00.00", fim27), await saldo("6.3.1.3.0.00.00", fim27), await saldo("6.3.1.4.0.00.00", fim27), await saldo("6.3.1.9.9.00.00", fim27), await saldo("6.3.2.2.0.00.00", fim27)]).toEqual(["300.00", "0.00", "200.00", "400.00", "100.00", "500.00"]);

    const enc27 = await encerrarExercicioComRestos(prisma, { ano: 2027, encerradoPor: POR });
    expect(enc27.inscricoes).toEqual([]);
    const tudo = ["5.3.1.1.0.00.00", "5.3.1.2.0.00.00", "5.3.2.1.0.00.00", "5.3.2.2.0.00.00", "6.3.1.1.0.00.00", "6.3.1.3.0.00.00", "6.3.1.4.0.00.00", "6.3.1.9.9.00.00", "6.3.2.1.0.00.00", "6.3.2.2.0.00.00"];
    expect(Object.fromEntries(await Promise.all(tudo.map(async (c) => [c, await saldo(c)])))).toEqual({
      "5.3.1.1.0.00.00": "0.00", "5.3.1.2.0.00.00": "300.00", "5.3.2.1.0.00.00": "0.00", "5.3.2.2.0.00.00": "200.00",
      "6.3.1.1.0.00.00": "300.00", "6.3.1.3.0.00.00": "0.00", "6.3.1.4.0.00.00": "0.00", "6.3.1.9.9.00.00": "0.00", "6.3.2.1.0.00.00": "200.00", "6.3.2.2.0.00.00": "0.00",
    });
    expect((await saldoDosRestos(prisma, i1.id)).saldo.toFixed(2)).toBe("500.00"); // = 300 + 200 (oráculo do cadastro)

    // 2028: os 200 liquidados em 2027 viraram RPP; o pagamento sai de RPP a pagar
    await pagarRestosAPagar(prisma, { liquidacaoId: l.liquidacaoId, numero: "NP-RP3", valor: "200.00", data: new Date("2028-02-01T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento do RP transferido", criadoPor: POR }, R_PAG_RP);
    expect([await saldo("6.3.2.1.0.00.00"), await saldo("6.3.2.2.0.00.00"), await saldo("6.3.1.4.0.00.00")]).toEqual(["0.00", "200.00", "0.00"]);
    // todo controle é de UMA inscrição — é por aí que a MSC acha a fonte e o ano
    const semDono = await prisma.lancamentoContabil.count({ where: { origemTipo: "CONTROLE_DOS_RESTOS", controleDoResto: null } });
    expect(semDono).toBe(0);
    // e a MSC resolve cada um: a fonte da ficha do empenho e o ano de inscrição (IC "AI")
    const controles = await prisma.lancamentoContabil.findMany({ where: { origemTipo: "CONTROLE_DOS_RESTOS" }, select: { id: true } });
    const res = await resolverDimensoes(prisma, controles.map((c) => c.id));
    const vistas = new Set([...res.values()].map((r) => (r.tipo === "RESOLVIDO" ? `${r.dimensoes.fonte ?? "?"}/${r.dimensoes.anoInscricaoRp ?? "?"}` : `NAO_RESOLVIDO`)));
    expect([...vistas]).toEqual(["500/2026"]);
  });

  it("t2: sem declaração o controle não liga e o encerramento diz por quê; inscrição de antes da declaração não é movida depois", async () => {
    const e1 = await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(enc.controleOrcamentario).toMatchObject({ ligado: false });
    expect(enc.controleOrcamentario.ligado === false ? enc.controleOrcamentario.aviso : "").toMatch(/não está ligado: declare as contas/);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: "CONTROLE_DOS_RESTOS" } })).toBe(0);
    await declarar();
    await liquidarRestosAPagar(prisma, { empenhoId: e1, numero: "NL-RP1", valor: "600.00", data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação de RP", criadoPor: POR }, R_LIQ_RP);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: "CONTROLE_DOS_RESTOS" } })).toBe(0);
  });

  it("t3: a anulação do pagamento inverte o controle que ele gerou", async () => {
    await declarar();
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    const liq2 = await liquidarDe2026(deps, e2, "NL2", "500.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const p = await pagarRestosAPagar(prisma, { liquidacaoId: liq2, numero: "NP-RP2", valor: "300.00", data: new Date("2027-04-02T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de RPP", criadoPor: POR }, R_PAG_RP);
    expect([await saldo("6.3.2.1.0.00.00"), await saldo("6.3.2.2.0.00.00")]).toEqual(["200.00", "300.00"]);
    await anularPagamentoRestosAPagar(prisma, { pagamentoId: p.pagamentoId, numero: "NP-RP2-A", data: new Date("2027-04-10T12:00:00Z"), motivo: "pagamento em duplicidade, devolvido", criadoPor: POR });
    expect([await saldo("6.3.2.1.0.00.00"), await saldo("6.3.2.2.0.00.00")]).toEqual(["500.00", "0.00"]);
  });

  it("t4: a declaração recusa com o motivo — papel faltando, conta de outro título, sem poder, e a troca de conta com restos controlados", async () => {
    await expect(declarar({ RPNP_PAGOS: "" })).rejects.toThrow(/faltam: RP não processados pagos/);
    await expect(declarar({ RPNP_PAGOS: "6.3.2.2.0.00.00" })).rejects.toThrow(/6\.3\.2\.2\.0\.00\.00 não é do título 6\.3\.1\.4 \(RP não processados pagos/);
    await expect(declarar({}, SEM_PODER)).rejects.toThrow(/PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR/);
    expect(await prisma.declaracaoDoControleDosRestos.count()).toBe(0);
    expect(await declarar()).toEqual({ versao: 1 });
    await empenharDe2026(deps, "NE1", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await prisma.contaPcasp.create({ data: { codigo: "6.3.1.9.1.00.00", nome: "insuficiência", naturezaSaldo: "CREDORA", nivel: 7, analitica: true } });
    await expect(declarar({ RPNP_CANCELADOS: "6.3.1.9.1.00.00" })).rejects.toThrow(/Já há restos a pagar controlados.*RP não processados cancelados/);
    expect(await declarar()).toEqual({ versao: 2 }); // a mesma, sem troca, passa
  });

  /**
   * t5 — A VIRADA COM O CONTROLE LIGADO: o encerramento das classes 5/6 (Parte IV) zera 6.2.2.1.3.05/.07 (ENCERRA, pela
   * sugestão) e deixa 5.3/6.3 atravessar (TRANSFERE); a soma das pernas fecha, e a abertura de 2027 fica intacta.
   */
  it("t5: o encerramento dos controles fecha com a inscrição nos controles, sem tocar 5.3/6.3", async () => {
    await declarar();
    await empenharDe2026(deps, "NE1", "1000.00");
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    await liquidarDe2026(deps, e2, "NL2", "500.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const v = await contasDaVirada(prisma, { ano: 2026 });
    expect(v.contas.find((c) => c.codigo === "6.2.2.1.3.05.00")?.sugestao.destino).toBe("ENCERRA");
    expect(v.contas.find((c) => c.codigo === "5.3.1.7.0.00.00")?.sugestao.destino).toBe("TRANSFERE");
    for (const c of v.contas) await classificarContaNaVirada(prisma, { contaCodigo: c.codigo, destino: c.sugestao.destino, justificativa: "destino sugerido pelo manual para a virada", criadoPor: POR });
    const ex = await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2026 }, select: { id: true } });
    const enc = await encerrarControlesOrcamentarios(prisma, { exercicioId: ex.id, criadoPor: POR });
    expect(enc.encerradas.map((c) => c.codigo)).toEqual(expect.arrayContaining(["6.2.2.1.3.05.00", "6.2.2.1.3.07.00"]));
    expect(enc.transferidas.map((c) => c.codigo).sort()).toEqual(["5.3.1.7.0.00.00", "5.3.2.7.0.00.00", "6.3.1.7.1.00.00", "6.3.2.7.0.00.00"]);
    const fim26 = "2026-12-31T23:59:58Z";
    expect([await saldo("6.2.2.1.3.05.00", "2027-01-01T03:00:00Z"), await saldo("5.3.1.7.0.00.00", fim26), await saldo("5.3.1.1.0.00.00"), await saldo("6.3.2.1.0.00.00")]).toEqual(["0.00", "1000.00", "1000.00", "500.00"]);
  });

  // ═══ Os achados da auditoria, cada um reproduzido ═══

  /** Ato de RP datado em Y com Y−1 aberto cairia num estágio que o encerramento de Y−1 ainda vai mover (4.7.6). */
  it("t6: liquidar, pagar ou cancelar RP controlado em 2028 antes de encerrar 2027 é recusado com o motivo; depois do encerramento, passa", async () => {
    await declarar();
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    const liq2 = await liquidarDe2026(deps, e2, "NL2", "500.00");
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const i2 = enc.inscricoes[0]!;
    const pagar28 = () => pagarRestosAPagar(prisma, { liquidacaoId: liq2, numero: "NP-28", valor: "100.00", data: new Date("2028-01-15T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento em janeiro", criadoPor: POR }, R_PAG_RP);
    await expect(pagar28()).rejects.toThrow(/exercício de 2027 ainda não foi encerrado.*Encerre 2027 primeiro/);
    await expect(cancelarRestosAPagar(prisma, { inscricaoId: i2.id, valor: "10.00", motivo: "cancelamento em janeiro", data: new Date("2028-01-20T12:00:00Z"), criadoPor: POR }, R_CANC_RP)).rejects.toThrow(/2027 ainda não foi encerrado/);
    expect(await prisma.pagamento.count({ where: { valor: "100.00" } })).toBe(0);
    await encerrarExercicioComRestos(prisma, { ano: 2027, encerradoPor: POR });
    await pagar28();
    // a RPP de 2026 foi a "exercícios anteriores" na abertura de 2028; o pagamento sai de RPP a pagar
    expect([await saldo("5.3.2.2.0.00.00"), await saldo("6.3.2.1.0.00.00"), await saldo("6.3.2.2.0.00.00")]).toEqual(["500.00", "400.00", "100.00"]);
  });

  /** A anulação TOTAL da liquidação pelo M05 desfaz o controle da liquidação de RP. */
  it("t7: anular pelo M05 a liquidação de um RP controlado devolve o controle ao estágio a liquidar", async () => {
    await declarar();
    const e1 = await empenharDe2026(deps, "NE1", "1000.00", "GLOBAL");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const l = await liquidarRestosAPagar(prisma, { empenhoId: e1, numero: "NL-RP1", valor: "600.00", data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação de RP", criadoPor: POR }, R_LIQ_RP);
    expect([await saldo("6.3.1.1.0.00.00"), await saldo("6.3.1.3.0.00.00")]).toEqual(["400.00", "600.00"]);
    const { anularLiquidacao } = await import("../m05-despesa/servico-bloco2.js");
    await anularLiquidacao({ liquidacaoId: l.liquidacaoId, numero: "NL-RP1-A", data: new Date("2027-03-10T12:00:00Z"), historico: "Nota fiscal cancelada pelo fornecedor", criadoPor: POR }, deps);
    expect([await saldo("6.3.1.1.0.00.00"), await saldo("6.3.1.2.0.00.00"), await saldo("6.3.1.3.0.00.00")]).toEqual(["1000.00", "0.00", "0.00"]);
    // e o RP volta a ser liquidável por inteiro, no cadastro e no controle
    await liquidarRestosAPagar(prisma, { empenhoId: e1, numero: "NL-RP2", valor: "1000.00", data: new Date("2027-04-01T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação de RP", criadoPor: POR }, R_LIQ_RP);
    expect(await saldo("6.3.1.3.0.00.00")).toBe("1000.00");
  });

  /** Depois do encerramento do ano do ato, inverter as partidas deixaria estágios negativos: recusa com o motivo. */
  it("t8: anular em 2028 um pagamento de RP feito em 2027, já encerrado, é recusado com o motivo", async () => {
    await declarar();
    const e2 = await empenharDe2026(deps, "NE2", "500.00");
    const liq2 = await liquidarDe2026(deps, e2, "NL2", "500.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const p = await pagarRestosAPagar(prisma, { liquidacaoId: liq2, numero: "NP-RP2", valor: "300.00", data: new Date("2027-04-02T12:00:00Z"), contaBancaria: "CC-001", fonteId: FONTE, historico: "pagamento de RPP", criadoPor: POR }, R_PAG_RP);
    await encerrarExercicioComRestos(prisma, { ano: 2027, encerradoPor: POR });
    const antes = await prisma.lancamentoContabil.count();
    await expect(anularPagamentoRestosAPagar(prisma, { pagamentoId: p.pagamentoId, numero: "NP-RP2-A", data: new Date("2028-02-10T12:00:00Z"), motivo: "pagamento em duplicidade, devolvido", criadoPor: POR })).rejects.toThrow(/O ato é de 2027, exercício já encerrado.*Nada foi gravado/);
    expect(await prisma.lancamentoContabil.count()).toBe(antes);
  });

  /** O guard do saldo invertido: uma divergência entre o razão 5.3/6.3 e o cadastro para o encerramento, em vez de sumir. */
  it("t10: com o controle divergente (pagos negativo, gravado por fora), o encerramento recusa nomeando o estágio", async () => {
    await declarar();
    await empenharDe2026(deps, "NE1", "1000.00");
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const id = async (codigo: string) => (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
    const l = await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "DIVERGENCIA", dataTransacao: new Date("2027-06-01T15:00:00Z"), historico: "gravado por fora (fixture)", origemTipo: "CONTROLE_DOS_RESTOS", criadoPor: POR,
        partidas: { create: [{ contaId: await id("6.3.1.4.0.00.00"), tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "50.00" }, { contaId: await id("6.3.1.1.0.00.00"), tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "50.00" }] },
      },
      select: { id: true },
    });
    await prisma.controleDoRestoAPagar.create({ data: { inscricaoId: enc.inscricoes[0]!.id, lancamentoId: l.id, evento: "PAGAMENTO", exercicio: 2027, criadoPor: POR } });
    await expect(encerrarExercicioComRestos(prisma, { ano: 2027, encerradoPor: POR })).rejects.toThrow(/saldo invertido em RP não processados pagos .*\(-50\.00\) no evento ENCERRAMENTO/);
  });

  /** A virada dos restos é ENCERRAMENTO: com dezembro travado, o encerramento do exercício passa como passava. */
  it("t9: com dezembro e janeiro travados, o encerramento com o controle ligado passa", async () => {
    const { travar: travarCompetencia } = await import("../m16-travamento/servico.js");
    await declarar();
    await empenharDe2026(deps, "NE1", "1000.00");
    await travarCompetencia(prisma, { competencia: "2026-12", criadoPor: POR });
    await travarCompetencia(prisma, { competencia: "2027-01", criadoPor: POR });
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(enc.controleOrcamentario).toEqual({ ligado: true });
    expect([await saldo("5.3.1.1.0.00.00"), await saldo("6.3.1.1.0.00.00")]).toEqual(["1000.00", "1000.00"]);
    const naturezas = await prisma.lancamentoContabil.findMany({ where: { origemTipo: "CONTROLE_DOS_RESTOS" }, select: { natureza: true } });
    expect(new Set(naturezas.map((n) => n.natureza))).toEqual(new Set(["ENCERRAMENTO"]));
  });
});
