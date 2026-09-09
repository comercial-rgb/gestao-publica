import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { apurarResultadoDoExercicio } from "../m08-restos-a-pagar/apuracao.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { inscreverDividaAtiva, cadastrarDividaAtiva } from "../m10-patrimonial/divida-ativa.js";
import { arrecadarRecebimentoDividaAtiva } from "../m10-patrimonial/adapter-m04.js";
import { anularArrecadacao } from "./servico.js";
import { criarM04DepsComDividas } from "../m10-patrimonial/adapter-m04.js";
import { roteiroArrecadacao } from "./dominio.js";
import {
  arrecadarComVinculo,
  cancelarReconhecimento,
  estornarReconhecimento,
  reconhecerReceita,
  saldoAArrecadar,
  saldoReconhecidoDe,
} from "./index.js";

/**
 * M04 — RECONHECIMENTO DA RECEITA PELO FATO GERADOR. TR 5.87/5.88 · 4.62 · NBC TSP.
 *
 * ⚠️ TODAS AS CONTAS E ROTEIROS À MÃO, ANTES DO CÓDIGO — e os literais de saldo aqui no
 * cabeçalho são o contrato que os testes cobram.
 *
 * ═══ O QUE MUDA, EM UMA FRASE ═══
 * Antes, a receita só existia quando o dinheiro entrava (D caixa × C VPA). Agora ela nasce no
 * FATO GERADOR (D crédito a receber × C VPA), e a arrecadação vira PERMUTATIVA (D caixa × C
 * crédito a receber) — a VPA não se repete.
 *
 * ═══ AS CONTAS ═══
 *   c-cr    1.1.2.1.1  crédito a receber (ativo, classe 1, DEVEDORA)
 *   c-caixa 1.1.1.1.2  bancos                              (DEVEDORA)
 *   c-vpa   4.1.1.1.1  VPA — impostos                      (CREDORA)
 *   c-vpd   3.6.1.1.1  VPD — perda de créditos             (DEVEDORA)
 *   c-da    1.2.1.1.1  dívida ativa                        (DEVEDORA)
 *   c-rar / c-rr       controle orçamentário
 *
 * ═══ t1 — O CICLO, E O LITERAL QUE PROVA QUE A VPA NÃO DOBRA ═══
 *   reconhecer IPTU 10.000 (fato gerador 01/01)  →  c-cr 10.000 · c-vpa 10.000
 *   arrecadar 6.000 vinculado                     →  c-caixa 6.000 · c-cr 4.000 · c-vpa AINDA 10.000
 *   saldo a arrecadar                             =  4.000
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";

// natureza de IPTU — 8 dígitos, tipo PRINCIPAL (8º = 1), origem IMPOSTOS (11)
const NAT_IPTU = "11130111";
// a natureza da DÍVIDA ATIVA (8º = 3) — é ela que quita a inscrição (o principal não pode).
const NAT_DA = "11130113";
const FONTE = "500";

const CR = "1.1.2.1.1.00.00";
const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.1.1.00.00";
const VPD = "3.6.1.1.1.00.00";
const DA = "1.2.1.1.1.00.00";
const R_A_REALIZAR = "5.2.1.1.1.00.00";
const R_REALIZADA = "6.2.1.1.1.00.00";
const RES_ACUM = "2.3.7.1.1.00.00"; // resultados acumulados (PL, CREDORA) — recebe a apuração

const R_ARREC = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: DA, // conta RESERVADA (dívida ativa) — para o recebimento composto
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-cr", codigo: CR, nome: "Crédito tributário a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA — impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD — perda de créditos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-da", codigo: DA, nome: "Dívida ativa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU — principal" },
      { id: "nr-da", codigo: NAT_DA, descricao: "IPTU — dívida ativa" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });

  // ⚠️ O ROTEIRO POR ORIGEM (fail-closed). IMPOSTOS... é a origem de código "11".
  await prisma.roteiroReconhecimento.create({
    data: {
      origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA",
      contaCreditoAReceberId: "c-cr",
      contaVpaId: "c-vpa",
      contaVpdId: "c-vpd", // cancelar precisa de VPD
      criadoPor: POR,
    },
  });
  // O roteiro da INSCRIÇÃO em dívida ativa (para a reclassificação do t3).
  await prisma.roteiroDividaAtiva.create({
    data: { tipo: "INSCRICAO", contaDebitoId: "c-da", contaCreditoId: "c-vpa", criadoPor: POR },
  });
}

/**
 * ⚠️ O SALDO **NATURAL** — e ele respeita a natureza da conta. `saldoDasContas` devolve ΣD−ΣC
 * (com sinal), o que sai POSITIVO nas devedoras e NEGATIVO nas credoras. Para ler a VPA (credora)
 * como "10.000" em vez de "−10.000", uma conta credora é lida como ΣC−ΣD. É a mesma leitura que
 * o balanço faz — o saldo de uma conta é sempre positivo na sua própria natureza.
 */
const CREDORAS = new Set([VPA, R_REALIZADA, RES_ACUM]);
const saldo = (codigo: string): Promise<string> =>
  saldoDasContas(prisma, [codigo], null).then((m) =>
    (CREDORAS.has(codigo) ? m.negated() : m).toFixed(2)
  );

async function reconhecer(valor: string, fatoGerador = "2026-01-01T12:00:00Z"): Promise<string> {
  const r = await reconhecerReceita(prisma, {
    naturezaCodigo: NAT_IPTU,
    fonteId: FONTE,
    dataFatoGerador: new Date(fatoGerador),
    valor,
    historico: "IPTU 2026 lançado",
    criadoPor: POR,
  });
  return r.reconhecimentoId;
}

describe("M04 — reconhecimento pelo fato gerador (TR 5.87/5.88)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — O CICLO. A VPA nasce UMA vez.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: reconhecer 10.000 → CR 10.000 / VPA 10.000; arrecadar 6.000 vinculado → caixa 6.000, CR 4.000, VPA AINDA 10.000", async () => {
    const rec = await reconhecer("10000.00");

    // ── o reconhecimento: D crédito a receber × C VPA ──
    expect(await saldo(CR)).toBe("10000.00");
    expect(await saldo(VPA)).toBe("10000.00");
    expect(await saldo(CAIXA)).toBe("0.00");

    // ── arrecadação VINCULADA de 6.000 — permutativa ──
    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "6000.00",
        dataArrecadacao: new Date("2026-07-01T12:00:00Z"),
        numeroReceita: "GUIA-1", criadoPor: POR,
      },
      contas: {
        disponibilidade: CAIXA,
        creditoAReceber: CR, // ⚠️ a perna de crédito é o CR, não a VPA
        receitaARealizar: R_A_REALIZAR,
        receitaRealizada: R_REALIZADA,
      },
      vinculos: [{ reconhecimentoId: rec, valor: "6000.00" }],
    });

    // ⚠️ OS LITERAIS QUE PROVAM A PERMUTAÇÃO:
    expect(await saldo(CAIXA)).toBe("6000.00"); // o dinheiro entrou
    expect(await saldo(CR)).toBe("4000.00"); //   o crédito baixou 6.000 (10.000 − 6.000)
    expect(await saldo(VPA)).toBe("10000.00"); // ⚠️ A VPA NÃO DOBROU — não virou 16.000

    // ── o saldo a arrecadar DERIVADO ──
    expect((await saldoReconhecidoDe(prisma, rec)).toFixed(2)).toBe("4000.00");
    const dem = await saldoAArrecadar(prisma, { naturezaCodigo: NAT_IPTU, ate: new Date("2026-12-31T23:59:59Z") });
    expect(dem.reconhecido).toBe("10000.00");
    expect(dem.arrecadado).toBe("6000.00");
    expect(dem.saldo).toBe("4000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — Σ VÍNCULOS: uma guia sobre DOIS reconhecimentos; 0,01 acima rejeita.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: guia de 5.000 sobre dois reconhecimentos (3.000 + 2.000) passa; 0,01 acima do saldo de um rejeita nomeando", async () => {
    const recA = await reconhecer("3000.00");
    const recB = await reconhecer("2000.00");

    // ── passa: 3.000 + 2.000 == 5.000 (a guia inteira) ──
    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "5000.00",
        dataArrecadacao: new Date("2026-07-01T12:00:00Z"), numeroReceita: "GUIA-AB", criadoPor: POR,
      },
      contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
      vinculos: [
        { reconhecimentoId: recA, valor: "3000.00" },
        { reconhecimentoId: recB, valor: "2000.00" },
      ],
    });
    expect((await saldoReconhecidoDe(prisma, recA)).toFixed(2)).toBe("0.00");
    expect((await saldoReconhecidoDe(prisma, recB)).toFixed(2)).toBe("0.00");

    // ── 0,01 acima do saldo de UM: rejeita nomeando o reconhecimento ──
    const recC = await reconhecer("1000.00");
    await expect(
      arrecadarComVinculo(prisma, {
        arrecadacao: {
          exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "1000.01",
          dataArrecadacao: new Date("2026-07-02T12:00:00Z"), numeroReceita: "GUIA-C", criadoPor: POR,
        },
        contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
        vinculos: [{ reconhecimentoId: recC, valor: "1000.01" }],
      })
    ).rejects.toThrow(/ACIMA DO SALDO RECONHECIDO/);

    // ⚠️ NADA foi gravado — nem a guia, nem o vínculo (a composta é atômica).
    expect(await prisma.receitaArrecadada.count({ where: { numeroReceita: "GUIA-C" } })).toBe(0);
    expect((await saldoReconhecidoDe(prisma, recC)).toFixed(2)).toBe("1000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — INSCRIÇÃO RECLASSIFICA (VPA inalterada); recebimento posterior segue.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: reconhecido restante 4.000 → inscrever em dívida ativa → CR 0, DA 4.000, VPA INALTERADA; saldo a arrecadar 0", async () => {
    const rec = await reconhecer("10000.00");
    // arrecada 6.000, sobram 4.000
    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "6000.00",
        dataArrecadacao: new Date("2026-07-01T12:00:00Z"), numeroReceita: "GUIA-1", criadoPor: POR,
      },
      contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
      vinculos: [{ reconhecimentoId: rec, valor: "6000.00" }],
    });
    expect(await saldo(VPA)).toBe("10000.00");

    // cadastra a dívida ativa e RECLASSIFICA os 4.000
    const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
      identificador: "CDA-2026-1", devedorNome: "Fulano", devedorDocumento: "12345678909",
      origem: "TRIBUTARIA", contaContabilId: "c-da", criadoPor: POR,
    });
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId, valor: "4000.00", dataMovimento: new Date("2027-01-05T12:00:00Z"),
      motivo: "inscricao em divida ativa do saldo nao arrecadado do IPTU",
      reconhecimentoId: rec,
      contaCreditoAReceberId: "c-cr",
      criadoPor: POR,
    });

    // ⚠️ OS LITERAIS DA RECLASSIFICAÇÃO: o ativo MUDA DE LUGAR, a VPA fica parada.
    expect(await saldo(CR)).toBe("0.00"); //  o crédito a receber esvaziou
    expect(await saldo(DA)).toBe("4000.00"); // virou dívida ativa
    expect(await saldo(VPA)).toBe("10000.00"); // ⚠️ INALTERADA — não reconheceu de novo
    expect((await saldoReconhecidoDe(prisma, rec)).toFixed(2)).toBe("0.00");

    // ── REGRESSÃO INTEGRADA: o recebimento da dívida ativa (composta do M10) segue funcionando ──
    await arrecadarRecebimentoDividaAtiva(prisma, {
      arrecadacao: {
        exercicio: 2027, naturezaReceita: NAT_DA, fonte: FONTE, valor: "4000.00",
        dataArrecadacao: new Date("2027-03-01T12:00:00Z"), numeroReceita: "GUIA-DA", criadoPor: POR,
      },
      roteiro: R_ARREC,
      vinculos: [{ dividaAtivaId, valor: "4000.00" }],
    });
    expect(await saldo(DA)).toBe("0.00"); //   a dívida ativa foi recebida
    expect(await saldo(CAIXA)).toBe("10000.00"); // 6.000 + 4.000 — tudo entrou
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — SEM RECONHECIMENTO: arrecadação e inscrição idênticas a hoje (regressão).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: sem reconhecimento, a inscrição segue VPA (D dívida ativa × C VPA) — o caminho do bloco 6, intacto", async () => {
    // inscrição COMUM: sem reconhecimentoId, o crédito nasce agora contra a VPA.
    const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
      identificador: "CDA-AVULSA", devedorNome: "Fulano", devedorDocumento: "12345678909",
      origem: "TRIBUTARIA", contaContabilId: "c-da", criadoPor: POR,
    });
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId, valor: "2500.00", dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "inscricao direta em divida ativa sem reconhecimento previo",
      criadoPor: POR,
    });

    // ⚠️ D dívida ativa × C VPA — exatamente como antes deste bloco. Zero crédito a receber.
    expect(await saldo(DA)).toBe("2500.00");
    expect(await saldo(VPA)).toBe("2500.00");
    expect(await saldo(CR)).toBe("0.00");
  });

  it("t4b: 'reconhecimentoId' sem 'contaCreditoAReceberId' (ou vice-versa) é malformado — recusa", async () => {
    const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
      identificador: "CDA-X", devedorNome: "Fulano", devedorDocumento: "12345678909",
      origem: "TRIBUTARIA", contaContabilId: "c-da", criadoPor: POR,
    });
    await expect(
      inscreverDividaAtiva(prisma, {
        dividaAtivaId, valor: "100.00", dataMovimento: new Date("2026-06-01T12:00:00Z"),
        motivo: "inscricao com reconhecimento mas sem a conta de credito",
        reconhecimentoId: "rec-qualquer",
        criadoPor: POR,
      })
    ).rejects.toThrow(/INSCRIÇÃO MALFORMADA/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — A VIRADA: o crédito a receber (classe 1) ATRAVESSA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: reconhecido em dezembro, não arrecadado → a apuração zera a VPA (classe 4) mas o CRÉDITO A RECEBER (classe 1) atravessa", async () => {
    await reconhecer("8000.00", "2026-12-20T12:00:00Z");
    expect(await saldo(CR)).toBe("8000.00");
    expect(await saldo(VPA)).toBe("8000.00");

    // a apuração precisa do exercício aberto + a conta de resultados acumulados + o roteiro
    const exercicio = await prisma.exercicio.upsert({
      where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: POR }, select: { id: true },
    });
    await prisma.contaPcasp.create({
      data: { id: "c-resacum", codigo: "2.3.7.1.1.00.00", nome: "Resultados acumulados", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    });
    await prisma.roteiroEncerramento.create({
      data: { contaResultadosAcumuladosId: "c-resacum", criadoPor: POR },
    });

    // ⚠️ Apurar exige o exercício ENCERRADO — não se apura um ano que ainda corre.
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio.id, criadoPor: POR,
    });

    // ⚠️ A APURAÇÃO SÓ TOCA AS CLASSES 3 e 4. A VPA (classe 4) zerou; o resultado foi ao PL.
    expect(await saldo(VPA)).toBe("0.00");
    expect(await saldo(RES_ACUM)).toBe("8000.00"); // virou resultado acumulado

    // ⚠️ MAS O CRÉDITO A RECEBER (CLASSE 1) ATRAVESSA A VIRADA — INTACTO.
    //
    // É o 5.88 cumprido POR NATUREZA, sem código novo: a apuração zera 3/4 e o encerramento de
    // controles zera 5/6 — NINGUÉM toca a classe 1. O crédito reconhecido em dezembro e não
    // arrecadado continua sendo um ativo do ente em janeiro, exatamente como manda a competência.
    expect(await saldo(CR)).toBe("8000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — ESTORNOS e a diferença estornar × cancelar.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: reconhecimento sem baixa estorna livre; com baixa = porta fechada; anular arrecadação vinculada restaura o saldo", async () => {
    // ── (a) SEM baixa: estorna livre (com motivo). A VPA volta atrás. ──
    const rec = await reconhecer("5000.00");
    expect(await saldo(VPA)).toBe("5000.00");
    await estornarReconhecimento(prisma, {
      reconhecimentoId: rec, motivo: "lancamento em duplicidade do IPTU", criadoPor: POR,
    });
    expect(await saldo(CR)).toBe("0.00"); //  o crédito sumiu
    expect(await saldo(VPA)).toBe("0.00"); // a VPA voltou atrás (não houve perda — foi erro)
    expect((await saldoReconhecidoDe(prisma, rec)).toFixed(2)).toBe("0.00");

    // ── (b) COM baixa: porta fechada nomeando ──
    const rec2 = await reconhecer("3000.00");
    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "1000.00",
        dataArrecadacao: new Date("2026-07-01T12:00:00Z"), numeroReceita: "GUIA-2", criadoPor: POR,
      },
      contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
      vinculos: [{ reconhecimentoId: rec2, valor: "1000.00" }],
    });
    await expect(
      estornarReconhecimento(prisma, { reconhecimentoId: rec2, motivo: "tentativa de estorno com baixa viva", criadoPor: POR })
    ).rejects.toThrow(/COM BAIXA NÃO SE ESTORNA DIRETO/);

    // ── (c) anular a arrecadação vinculada RESTAURA o saldo (a guia para de contar) ──
    expect((await saldoReconhecidoDe(prisma, rec2)).toFixed(2)).toBe("2000.00"); // 3.000 − 1.000
    const guia = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { numeroReceita: "GUIA-2", estornoDeId: null }, select: { id: true, numeroReceita: true },
    });
    await anularArrecadacao(
      { receitaId: guia.id, numeroReceita: guia.numeroReceita, dataAnulacao: new Date("2026-07-10T12:00:00Z"), criadoPor: POR },
      criarM04DepsComDividas(prisma)
    );
    // ⚠️ O VÍNCULO NÃO FOI APAGADO — ele PAROU DE CONTAR (a guia foi anulada). Saldo restaurado.
    expect((await saldoReconhecidoDe(prisma, rec2)).toFixed(2)).toBe("3000.00");
    // ...e agora, sem baixa viva, o estorno passa.
    await expect(
      estornarReconhecimento(prisma, { reconhecimentoId: rec2, motivo: "estorno apos anular a arrecadacao vinculada", criadoPor: POR })
    ).resolves.toBeDefined();
  });

  it("t6b: cancelar NÃO é estornar — a VPA de janeiro FICA, e a perda vira VPD (renúncia)", async () => {
    const rec = await reconhecer("5000.00");
    // cancela 1.000 (anistia parcial)
    await cancelarReconhecimento(prisma, {
      reconhecimentoId: rec, valor: "1000.00", data: new Date("2026-09-01T12:00:00Z"),
      motivo: "anistia parcial concedida pela Lei Municipal 123/2026", criadoPor: POR,
    });

    // ⚠️ A VPA FICA (o crédito foi real em janeiro); a perda é uma VPD — é a renúncia fiscal.
    expect(await saldo(VPA)).toBe("5000.00"); // NÃO voltou atrás — cancelar não é estornar
    expect(await saldo(VPD)).toBe("1000.00"); // a perda revelada
    expect(await saldo(CR)).toBe("4000.00"); // o crédito caiu
    expect((await saldoReconhecidoDe(prisma, rec)).toFixed(2)).toBe("4000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — CONCORRÊNCIA: duas baixas de 3.000 contra saldo 4.000 → exatamente uma.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: duas arrecadações concorrentes de 3.000 contra um reconhecimento de 4.000 → exatamente UMA passa (5 rodadas)", async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await limparBanco(prisma);
      await semear();
      const rec = await reconhecer("4000.00");

      const guia = (n: number) =>
        arrecadarComVinculo(prisma, {
          arrecadacao: {
            exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "3000.00",
            dataArrecadacao: new Date("2026-07-01T12:00:00Z"), numeroReceita: `GUIA-R${rodada}-${n}`, criadoPor: POR,
          },
          contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
          vinculos: [{ reconhecimentoId: rec, valor: "3000.00" }],
        });

      const r = await Promise.allSettled([guia(1), guia(2)]);
      const ok = r.filter((x) => x.status === "fulfilled").length;

      // ⚠️ EXATAMENTE UMA. Sem o lock, as duas leriam saldo 4.000 e as duas baixariam 3.000
      // (total 6.000 > 4.000) — o crédito a receber ficaria NEGATIVO em 2.000.
      expect(ok, `rodada ${rodada}: esperava 1 sucesso, veio ${ok}`).toBe(1);
      expect((await saldoReconhecidoDe(prisma, rec)).toFixed(2)).toBe("1000.00"); // 4.000 − 3.000
    }
  }, 60000);

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — AMARRAÇÃO: saldo derivado == crédito a receber no razão (grão = conta).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: o saldo a arrecadar DERIVADO bate com o saldo da CONTA de crédito a receber no razão", async () => {
    const rec = await reconhecer("10000.00");
    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: FONTE, valor: "6000.00",
        dataArrecadacao: new Date("2026-07-01T12:00:00Z"), numeroReceita: "GUIA-1", criadoPor: POR,
      },
      contas: { disponibilidade: CAIXA, creditoAReceber: CR, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA },
      vinculos: [{ reconhecimentoId: rec, valor: "6000.00" }],
    });

    // ⚠️ AS DUAS LEITURAS BATEM — grão = conta (o padrão do bloco 5):
    //   · a DERIVAÇÃO (reconhecido − arrecadado − inscrito − cancelado) = 4.000
    //   · o RAZÃO, pela conta de crédito a receber (DEVEDORA)           = 4.000
    const dem = await saldoAArrecadar(prisma, { naturezaCodigo: NAT_IPTU, ate: new Date("2026-12-31T23:59:59Z") });
    const razao = await saldo(CR);
    expect(dem.saldo).toBe(razao);
    expect(dem.saldo).toBe("4000.00");

    // ── MUTAÇÃO acusa: forjar o VALOR do reconhecimento por fora (sem lançar no razão) quebra a
    //    amarração — a derivação passa a dizer 6.000 de saldo, mas a conta segue mostrando 4.000. ──
    await prisma.receitaReconhecida.update({ where: { id: rec }, data: { valor: "12000.00" } });
    const demMutado = await saldoAArrecadar(prisma, { naturezaCodigo: NAT_IPTU, ate: new Date("2026-12-31T23:59:59Z") });
    const razaoMutado = await saldo(CR);
    expect(demMutado.saldo).not.toBe(razaoMutado); // a amarração ACUSA (6.000 derivado × 4.000 razão)

    // restaura
    await prisma.receitaReconhecida.update({ where: { id: rec }, data: { valor: "10000.00" } });
    const demRestaurado = await saldoAArrecadar(prisma, { naturezaCodigo: NAT_IPTU, ate: new Date("2026-12-31T23:59:59Z") });
    expect(demRestaurado.saldo).toBe(await saldo(CR));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t9 — SIGILO: contribuinteRef fora dos datasets do M13.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t9: contribuinteRef é gravado, mas o dataset de receita do M13 NÃO o expõe (TR 7.4.2)", async () => {
    await reconhecerReceita(prisma, {
      naturezaCodigo: NAT_IPTU, fonteId: FONTE, dataFatoGerador: new Date("2026-01-01T12:00:00Z"),
      valor: "1240.00", contribuinteRef: "INSCR-IMOB-99887766", historico: "IPTU do imovel X", criadoPor: POR,
    });

    // ── está gravado (o ente amarra ao cadastro tributário) ──
    const rec = await prisma.receitaReconhecida.findFirstOrThrow({ select: { contribuinteRef: true } });
    expect(rec.contribuinteRef).toBe("INSCR-IMOB-99887766");

    // ⚠️ GREP ESTRUTURAL: o datasetReceita do M13 é AGREGADO por natureza+fonte e não conhece a
    // tabela de reconhecimento — a ref opaca não tem por onde vazar. Prova por CÓDIGO-FONTE:
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const raiz = fileURLToPath(new URL("../..", import.meta.url));
    const fonteDatasets = readFileSync(`${raiz}/modules/m13-transparencia/datasets.ts`, "utf8");
    expect(fonteDatasets).not.toContain("contribuinteRef");
    expect(fonteDatasets).not.toContain("receitaReconhecida");
    expect(fonteDatasets).not.toContain("ReceitaReconhecida");
  });
});
