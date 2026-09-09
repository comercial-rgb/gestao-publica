import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { balancete, diario, razaoAnalitico } from "./livros.js";

/**
 * M12 — OS LIVROS OBRIGATÓRIOS: Diário, Razão analítico e Balancete de verificação.
 * TR 1.3.2 · 5.92 · 5.93 · 5.94 · art. 50 da LRF.
 *
 * ⚠️ CONTAS À MÃO, ANTES DO CÓDIGO. E o plano tem HIERARQUIA de propósito (para o L2):
 *   1.1.1.0.0.00.00  Caixa e Equiv.        SINTÉTICA  (= Σ das duas abaixo)
 *   1.1.1.1.1.00.00  Caixa                 analítica  DEVEDORA
 *   1.1.1.1.2.00.00  Bancos                analítica  DEVEDORA
 *   4.1.1.1.1.00.00  VPA — impostos        analítica  CREDORA
 *   2.1.3.1.1.00.00  Fornecedores          analítica  CREDORA
 *   3.3.2.1.1.00.00  VPD — serviços        analítica  DEVEDORA
 *
 * ═══ O CICLO-OURO (5 lançamentos, 3 dias — t1) ═══
 *   D01  L-01  2026-03-01  arrecadação   D caixa   1000 / C VPA        1000
 *   D01  L-02  2026-03-01  arrecadação   D bancos   500 / C VPA         500   (MESMO dia — 0(a))
 *   D02  L-03  2026-03-02  liquidação    D VPD      300 / C fornecedor  300
 *   D03  L-04  2026-03-03  pagamento     D fornec.  300 / C bancos      300
 *   D03  L-05  2026-03-03  estorno arrec D VPA      500 / C bancos      500   (MESMO dia)
 *
 * ═══ O RAZÃO DO CAIXA (1.1.1.1.2 bancos — t2), saldo corrente MANUAL ═══
 *   saldo anterior ...................................  0,00
 *   L-02  D 500              → corrente  500,00
 *   L-04         C 300       → corrente  200,00
 *   L-05         C 500       → corrente −300,00
 *   saldo final .....................................  −300,00   (== saldoDaConta no corte — L1)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br"; // identidade de fixture (o funil exige autor ativo)

const CAIXA_SINT = "1.1.1.0.0.00.00";
const CAIXA = "1.1.1.1.1.00.00";
const BANCOS = "1.1.1.1.2.00.00";
const VPA = "4.1.1.1.1.00.00";
const FORN = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.00.00";

const idPorCodigo: Record<string, string> = {};

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa-sint", codigo: CAIXA_SINT, nome: "Caixa e Equivalentes", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false },
      { id: "c-caixa", codigo: CAIXA, nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-bancos", codigo: BANCOS, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA — impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORN, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD — serviços", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  idPorCodigo[CAIXA] = "c-caixa";
  idPorCodigo[BANCOS] = "c-bancos";
  idPorCodigo[VPA] = "c-vpa";
  idPorCodigo[FORN] = "c-forn";
  idPorCodigo[VPD] = "c-vpd";
}

/** Um lançamento PELO FUNIL — dois lados, subsistema PATRIMONIAL. Devolve o id. */
async function lancar(
  numero: string,
  dia: string,
  hist: string,
  origem: string,
  debito: { conta: string; valor: string },
  credito: { conta: string; valor: string },
  natureza?: "ENCERRAMENTO"
): Promise<string> {
  return prisma.$transaction((tx) =>
    lancarNoRazao(tx, {
      numeroControle: numero,
      dataTransacao: new Date(dia),
      historico: hist,
      origemTipo: origem,
      criadoPor: POR,
      ...(natureza !== undefined ? { natureza } : {}),
      partidas: [
        { contaId: idPorCodigo[debito.conta]!, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: debito.valor },
        { contaId: idPorCodigo[credito.conta]!, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: credito.valor },
      ],
    })
  );
}

/** Monta o ciclo-ouro (5 lançamentos, 3 dias). Sequencial: o criadoEm segue a inserção. */
async function cicloOuro(): Promise<void> {
  await lancar("L-01", "2026-03-01T10:00:00Z", "arrecadação IPTU", "ARRECADACAO", { conta: CAIXA, valor: "1000.00" }, { conta: VPA, valor: "1000.00" });
  await lancar("L-02", "2026-03-01T14:00:00Z", "arrecadação ISS", "ARRECADACAO", { conta: BANCOS, valor: "500.00" }, { conta: VPA, valor: "500.00" });
  await lancar("L-03", "2026-03-02T10:00:00Z", "liquidação serviço", "LIQUIDACAO", { conta: VPD, valor: "300.00" }, { conta: FORN, valor: "300.00" });
  await lancar("L-04", "2026-03-03T10:00:00Z", "pagamento fornecedor", "PAGAMENTO", { conta: FORN, valor: "300.00" }, { conta: BANCOS, valor: "300.00" });
  await lancar("L-05", "2026-03-03T15:00:00Z", "estorno arrecadação ISS", "ARRECADACAO_ANULADA", { conta: VPA, valor: "500.00" }, { conta: BANCOS, valor: "500.00" });
}

const JANELA = { desde: new Date("2026-03-01T00:00:00Z"), ate: new Date("2026-03-31T23:59:59Z") };

describe("M12 — livros obrigatórios (TR 1.3.2 · 5.92-5.94)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO DO DIÁRIO: ordem determinística, partidas campo a campo.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: o Diário lista os 5 lançamentos em ordem ESTÁVEL (dois no mesmo dia), com partidas D/C conferidas", async () => {
    await cicloOuro();
    const d = await diario(prisma, JANELA);

    // ── a ordem exata (a data governa; dois do mesmo dia desempatam por criadoEm) ──
    expect(d.map((l) => l.numeroControle)).toEqual(["L-01", "L-02", "L-03", "L-04", "L-05"]);

    // ⚠️ REPRODUZÍVEL (0(a)): reler o livro dá EXATAMENTE a mesma ordem — e ela bate com uma
    // ordenação independente por (dataTransacao, criadoEm, id). Um livro sem isso não é livro.
    const d2 = await diario(prisma, JANELA);
    expect(d2.map((l) => l.id)).toEqual(d.map((l) => l.id));
    const independente = await prisma.lancamentoContabil.findMany({
      orderBy: [{ dataTransacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    expect(d.map((l) => l.id)).toEqual(independente.map((l) => l.id));

    // ── os dois do MESMO dia estão adjacentes, na ordem de registro ──
    expect(d[0]!.data.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(d[1]!.data.toISOString().slice(0, 10)).toBe("2026-03-01");

    // ── L-01: partidas campo a campo ──
    const l1 = d[0]!;
    expect(l1.historico).toBe("arrecadação IPTU");
    expect(l1.criadoPor).toBe(POR);
    expect(l1.natureza).toBe("NORMAL"); // nulo lê-se NORMAL
    expect(l1.partidas).toEqual([
      { conta: CAIXA, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
      { conta: VPA, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
    ]);
    // ── L-05: o estorno ──
    expect(d[4]!.partidas).toEqual([
      { conta: VPA, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "500.00" },
      { conta: BANCOS, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "500.00" },
    ]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — OURO DO RAZÃO: saldo corrente por linha; L1 fecha; mutação acusa.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: o Razão de BANCOS traz saldo corrente por linha; L1 (última == saldoDaConta) fecha; omitir uma linha a quebra", async () => {
    await cicloOuro();
    const r = await razaoAnalitico(prisma, BANCOS, JANELA);

    expect(r.saldoAnterior).toBe("0.00");

    // ── as 3 linhas de BANCOS, com o saldo corrente MANUAL do cabeçalho ──
    expect(r.linhas.map((l) => [l.numeroControle, l.debito, l.credito, l.saldoCorrente])).toEqual([
      ["L-02", "500.00", "0.00", "500.00"], //  +500
      ["L-04", "0.00", "300.00", "200.00"], //  −300
      ["L-05", "0.00", "500.00", "-300.00"], // −500
    ]);
    expect(r.saldoFinal).toBe("-300.00");

    // ⚠️ L1, AUTO-EXECUTÁVEL: a última linha == saldoDaConta no corte (ΣD−ΣC acumulado).
    const saldoNoRazao = await saldoDasContas(prisma, [BANCOS], JANELA.ate, "dataTransacao");
    expect(r.saldoFinal).toBe(saldoNoRazao.toFixed(2));

    // ⚠️ MUTAÇÃO: omitir a última linha (o estorno) faria o saldo derivado (200) DIVERGIR do
    // razão (−300). É o que L1 pega — a conta e a soma linha-a-linha têm de contar a MESMA história.
    const semUltima = r.linhas.slice(0, -1);
    const saldoMutado = semUltima.reduce(
      (acc, l) => acc + Number(l.debito) - Number(l.credito),
      Number(r.saldoAnterior)
    );
    expect(saldoMutado.toFixed(2)).not.toBe(saldoNoRazao.toFixed(2)); // L1 acusaria (200 ≠ −300)
    // restaurada: com todas as linhas, fecha.
    const saldoInteiro = r.linhas.reduce(
      (acc, l) => acc + Number(l.debito) - Number(l.credito),
      Number(r.saldoAnterior)
    );
    expect(saldoInteiro.toFixed(2)).toBe(saldoNoRazao.toFixed(2));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — OURO DO BALANCETE: corte no meio; L3 fecha; PÓS-encerramento zera 3/4.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: Balancete com corte no MEIO do ciclo — células manuais; L3 fecha", async () => {
    await cicloOuro();

    // ⚠️ CORTE em 2026-03-02 (inclui L-01, L-02, L-03; exclui L-04, L-05).
    const b = await balancete(prisma, {
      desde: JANELA.desde,
      ate: new Date("2026-03-02T23:59:59Z"),
      modo: "ANALITICO",
    });

    const linha = (c: string) => b.linhas.find((l) => l.conta === c)!;

    // No corte: caixa 1000 D, bancos 500 D, VPA 1500 C, VPD 300 D, fornecedores 300 C.
    expect([linha(CAIXA).saldoFinalDevedor, linha(CAIXA).saldoFinalCredor]).toEqual(["1000.00", "0.00"]);
    expect([linha(BANCOS).saldoFinalDevedor, linha(BANCOS).saldoFinalCredor]).toEqual(["500.00", "0.00"]);
    expect([linha(VPA).saldoFinalDevedor, linha(VPA).saldoFinalCredor]).toEqual(["0.00", "1500.00"]);
    expect([linha(VPD).saldoFinalDevedor, linha(VPD).saldoFinalCredor]).toEqual(["300.00", "0.00"]);
    expect([linha(FORN).saldoFinalDevedor, linha(FORN).saldoFinalCredor]).toEqual(["0.00", "300.00"]);

    // ⚠️ L3: o balancete FECHA — Σ devedores == Σ credores (1800 == 1800).
    expect(b.totalSaldoFinalDevedor).toBe("1800.00");
    expect(b.totalSaldoFinalCredor).toBe("1800.00");
    expect(b.totalMovimentoDebito).toBe(b.totalMovimentoCredito); // período fecha também
    expect(b.fecha).toBe(true);
  });

  it("t3b: Balancete PÓS-encerramento (natureza TODAS) inclui o lançamento de ENCERRAMENTO — a VPD zera", async () => {
    await cicloOuro();
    // um lançamento de ENCERRAMENTO que zera a VPD (300 D acumulado) contra resultados.
    await lancar("ENC-1", "2026-12-31T23:59:59Z", "encerramento — zera VPD", "APURACAO",
      { conta: VPA, valor: "300.00" }, { conta: VPD, valor: "300.00" }, "ENCERRAMENTO");

    // ── DEFAULT (NORMAL) EXCLUI o encerramento: a VPD segue com saldo ──
    const normal = await balancete(prisma, { desde: JANELA.desde, ate: new Date("2026-12-31T23:59:59Z"), modo: "ANALITICO" });
    const vpdNormal = normal.linhas.find((l) => l.conta === VPD)!;
    expect(vpdNormal.saldoFinalDevedor).toBe("300.00"); // 300 − 0 (o encerramento não entrou)

    // ── TODAS inclui o encerramento: a VPD ZERA (o balancete pós-apuração) ──
    const todas = await balancete(prisma, { desde: JANELA.desde, ate: new Date("2026-12-31T23:59:59Z"), modo: "ANALITICO", natureza: "TODAS" });
    const vpdTodas = todas.linhas.find((l) => l.conta === VPD)!;
    expect(vpdTodas.saldoFinalDevedor).toBe("0.00"); // 300 D − 300 C = 0 (regressão M08 pela lente do livro)
    expect(todas.fecha).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — SINTÉTICO: L2 fecha; mutação (filha fora do rolo) acusa nomeando.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: o Balancete SINTÉTICO soma as analíticas por prefixo — L2 (sintética == Σ filhas) fecha", async () => {
    await cicloOuro();
    const corte = new Date("2026-03-31T23:59:59Z");

    const sint = await balancete(prisma, { desde: JANELA.desde, ate: corte, modo: "SINTETICO" });
    const analitico = await balancete(prisma, { desde: JANELA.desde, ate: corte, modo: "ANALITICO" });

    // A sintética de caixa (1.1.1.0.0.00.00) == Σ de caixa (1.1.1.1.1) + bancos (1.1.1.1.2).
    const sintCaixa = sint.linhas.find((l) => l.conta === CAIXA_SINT)!;
    const caixaAnal = analitico.linhas.find((l) => l.conta === CAIXA)!;
    const bancosAnal = analitico.linhas.find((l) => l.conta === BANCOS)!;

    // caixa: 1000 D; bancos: 500 − 300 − 500 = −300 → credor 300. Σ = 1000 D − 300 = 700 D.
    expect(caixaAnal.saldoFinalDevedor).toBe("1000.00");
    expect([bancosAnal.saldoFinalDevedor, bancosAnal.saldoFinalCredor]).toEqual(["0.00", "300.00"]);

    // ⚠️ L2, AUTO-EXECUTÁVEL: a sintética == Σ das analíticas sob o prefixo dela.
    const somaDevedorFilhas = Number(caixaAnal.saldoFinalDevedor) + Number(bancosAnal.saldoFinalDevedor);
    const somaCredorFilhas = Number(caixaAnal.saldoFinalCredor) + Number(bancosAnal.saldoFinalCredor);
    const liquidoFilhas = somaDevedorFilhas - somaCredorFilhas; // 1000 − 300 = 700
    const liquidoSint = Number(sintCaixa.saldoFinalDevedor) - Number(sintCaixa.saldoFinalCredor);
    expect(liquidoSint).toBe(liquidoFilhas);
    expect(sintCaixa.saldoFinalDevedor).toBe("700.00");

    // ⚠️ MUTAÇÃO: uma filha FORA do rolo (calcular a sintética esquecendo bancos) DIVERGE — L2
    // nomeia a sintética 1.1.1.0.0.00.00. Restaurada: com as duas filhas, fecha.
    const semBancos = Number(caixaAnal.saldoFinalDevedor); // esqueceu bancos
    expect(semBancos).not.toBe(liquidoSint); // 1000 ≠ 700 — L2 acusa
    expect(somaDevedorFilhas - somaCredorFilhas).toBe(liquidoSint); // restaurada
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — FILTROS 5.94: por subsistema e por natureza (recorte manual).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: os filtros do 5.94 recortam o Diário — por conta e por origem, resultado == recorte manual", async () => {
    await cicloOuro();

    // ── por CONTA: só lançamentos que tocam BANCOS (L-02, L-04, L-05) ──
    const soBancos = await diario(prisma, JANELA, { conta: BANCOS });
    expect(soBancos.map((l) => l.numeroControle)).toEqual(["L-02", "L-04", "L-05"]);

    // ── por ORIGEM: só ARRECADACAO (L-01, L-02) ──
    const soArrec = await diario(prisma, JANELA, { origemTipo: "ARRECADACAO" });
    expect(soArrec.map((l) => l.numeroControle)).toEqual(["L-01", "L-02"]);

    // ── por SUBSISTEMA: todos são PATRIMONIAL, então o filtro traz os 5; um subsistema vazio traz 0 ──
    const patrim = await diario(prisma, JANELA, { subsistema: "PATRIMONIAL" });
    expect(patrim).toHaveLength(5);
    const orc = await diario(prisma, JANELA, { subsistema: "ORCAMENTARIO" });
    expect(orc).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — RAZÃO de conta SEM movimento na janela: anterior == final, zero linhas.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: Razão de uma conta sem movimento na janela — saldo anterior == final, zero linhas (não é erro)", async () => {
    await cicloOuro();
    // uma janela DEPOIS do ciclo (abril): nenhum movimento, mas BANCOS tem saldo anterior −300.
    const abril = { desde: new Date("2026-04-01T00:00:00Z"), ate: new Date("2026-04-30T23:59:59Z") };
    const r = await razaoAnalitico(prisma, BANCOS, abril);

    expect(r.linhas).toHaveLength(0);
    expect(r.saldoAnterior).toBe("-300.00"); // carrega o que veio de março
    expect(r.saldoFinal).toBe("-300.00"); //   anterior == final (nada se moveu)
    expect(r.saldoAnterior).toBe(r.saldoFinal);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — LEITURA PURA (grep) + o guard sintético (0(c)).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: `livros.ts` é LEITURA PURA — zero escrita, zero soma bruta (o grep roda aqui)", () => {
    const arquivo = fileURLToPath(new URL("./livros.ts", import.meta.url));
    const efetivo = readFileSync(arquivo, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");

    // ⚠️ Um livro que GRAVA pode corromper o razão que ele deveria só ESPELHAR. E um livro que
    // SOMA por conta própria (aggregate/_sum/groupBy) seria a segunda verdade — o balancete
    // fecharia e o balanço não. Toda soma vem do `somasPorConta` (M01, dono do razão).
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;
    expect(ESCRITA.test(efetivo), "livros.ts tem ESCRITA").toBe(false);
    expect(SUM_BRUTO.test(efetivo), "livros.ts tem SUM bruto").toBe(false);
  });

  it("t7b: NENHUMA conta sintética tem partida direta (0(c) — o balancete sintético pode assumir Σ-analíticas)", async () => {
    await cicloOuro();
    // ⚠️ O balancete sintético soma as FOLHAS por prefixo. Se uma sintética tivesse partida
    // direta, essa partida sumiria do rolo. O guard do M01 (conta sintética não recebe partida)
    // impede isso — e este teste PROVA a premissa, em vez de confiar nela.
    const partidasEmSintetica = await prisma.partidaContabil.count({
      where: { conta: { analitica: false } },
    });
    expect(partidasEmSintetica).toBe(0);
  });

  it("t7c: o módulo M12 inteiro não introduziu escrita nova nos livros (varredura)", () => {
    const raiz = fileURLToPath(new URL(".", import.meta.url));
    const alvo = join(raiz, "livros.ts");
    const arquivos: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (p === alvo) arquivos.push(p);
      }
    };
    varrer(raiz);
    expect(arquivos).toContain(alvo);
  });
});
