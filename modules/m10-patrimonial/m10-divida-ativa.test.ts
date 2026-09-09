import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { balancoPatrimonial } from "../m12-relatorios/balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "../m12-relatorios/cadastro-linhas.js";
import {
  ORIGENS_DIVIDA_ATIVA,
  atualizarDividaAtiva,
  cadastrarDividaAtiva,
  cancelarDividaAtiva,
  conferirDividaAtivaContraRazao,
  estornarMovimentoDividaAtiva,
  inscreverDividaAtiva,
  saldoDaDividaAtivaEm,
} from "./divida-ativa.js";
import {
  arrecadarRecebimentoDividaAtiva,
  criarM04DepsComDividas,
} from "./adapter-m04.js";
import { anularArrecadacao } from "../m04-receita/servico.js";

/**
 * M10 — DÍVIDA ATIVA (TR 5.83, 4.63; art. 39 da Lei 4.320/64).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CICLO DO t1 ═══
 *   INSCRIÇÃO ................. + 10.000,00   D ativo (1.2.1.1) / C VPA
 *   ATUALIZAÇÃO (2026-07) ..... +    300,00   D ativo            / C VPA
 *   RECEBIMENTO ............... −  4.000,00   ⚠️ SEM roteiro: quem lança é o M04
 *                                             (D caixa / C ativo — permutativo)
 *   CANCELAMENTO .............. −  1.000,00   D VPD              / C ativo
 *
 *   SALDO = 10.000 + 300 − 4.000 − 1.000 = 5.300,00
 *
 *   ⚠️ A AMARRAÇÃO — o razão, pela conta do ativo (DEVEDORA):
 *     ΣD = 10.000 (inscrição) + 300 (atualização)      = 10.300,00
 *     ΣC =  4.000 (recebimento, pelo M04) + 1.000 (cancelamento) = 5.000,00
 *     saldo devedor = 10.300 − 5.000                   =  5.300,00 ✓
 *   As duas leituras batem — e é isso que prova que o RECEBIMENTO não pode ter
 *   roteiro próprio: com um, o ativo seria creditado DUAS VEZES (8.000) e o razão
 *   mostraria 1.300 onde os movimentos mostram 5.300.
 *
 * ═══ t2 — UMA RECEITA, VÁRIAS DÍVIDAS (o guard que não é óbvio) ═══
 *   guia única de 4.000: quita a dívida A em 3.000 e a B em 1.000 (total 4.000 ✓);
 *   um terceiro recebimento de 0,01 ESTOURA a receita (4.000,01 > 4.000).
 *
 * ═══ t6 — O INDICADOR DO ANEXO 14, E A ESCOLHA DECLARADA ═══
 *   A fixture usa 1.2.1.1 (dívida ativa de LONGO PRAZO) e a classifica como **P**.
 *   O art. 105 dá as duas leituras: pelo § 1º ela é crédito "realizável
 *   independentemente de autorização orçamentária" (F); pelo § 2º é crédito "cuja
 *   mobilização depende de autorização legislativa" (P) — ceder a carteira exige lei.
 *   O indicador é PARÂMETRO: quem decide é o PCASP do ente. A fixture escolhe P (a
 *   parcela de longo prazo), e o teste prova a consequência: o superávit financeiro
 *   NÃO conta com ela — 8.000 de caixa, e não 8.000 + 5.300.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";
const FONTE = "fnt-500";
/**
 * ⚠️ A FIXTURE MUDOU DE CÓDIGO — E A MUDANÇA É A REGRA NOVA.
 *
 * Era "11130111": 1.1.3.0.11.1.**1** — tipo 1, PRINCIPAL. É a guia do IPTU do
 * exercício corrente, e ela vinha "quitando dívida ativa" porque NÃO HAVIA GUARD
 * NENHUM sobre a natureza no `receberNaTx` (o mais degradado dos quatro). O 8º
 * dígito é justamente quem separa os dois fatos — mesma receita, tipos diferentes:
 *
 *   ...1  PRINCIPAL                          o tributo do exercício
 *   ...3  DÍVIDA ATIVA                       o crédito INSCRITO
 *   ...4  MULTAS E JUROS DA DÍVIDA ATIVA     a ATUALIZACAO lançada sobre ele
 */
const NAT_DIVIDA_ATIVA = "11130113"; // tipo 3 — o crédito inscrito
const NAT_JUROS_DA = "11130114"; // tipo 4 — juros e multa DA dívida ativa
const NAT_PRINCIPAL = "11130111"; // tipo 1 — o tributo corrente. NÃO quita inscrição.

const CAIXA = "1.1.1.1.2.00.00";
const ATIVO_DA = "1.2.1.1.1.00.00"; // dívida ativa — longo prazo
const VPA_DA = "4.1.1.1.1.00.00"; // VPA — inscrição em dívida ativa
const VPD_CANCEL = "3.6.1.1.1.00.00"; // VPD — desvalorização/perda de créditos
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";

/** ⚠️ A perna CREDORA da arrecadação aponta para o ATIVO — nunca para uma VPA. */
const R_ARRECADACAO_DA = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: ATIVO_DA,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

const CORTE = new Date("2026-12-31T23:59:59Z");

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

async function dividaDeTeste(id = "CDA-2026-001"): Promise<string> {
  const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
    identificador: id,
    devedorNome: "Contribuinte Fulano de Tal",
    devedorDocumento: "12345678909",
    origem: "TRIBUTARIA",
    contaContabilId: "c-ativo-da",
    criadoPor: POR,
  });
  return dividaAtivaId;
}

/** Arrecada e devolve o id da ReceitaArrecadada. */
async function arrecadar(valor: string, guia: string): Promise<string> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_DIVIDA_ATIVA, fonte: "500", valor,
      dataArrecadacao: new Date("2026-08-01T12:00:00Z"),
      numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO_DA,
    criarM04Deps(prisma)
  );
  const r = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { numeroReceita: guia, estornoDeId: null },
    select: { id: true },
  });
  return r.id;
}

/**
 * ⚠️ A OPERAÇÃO COMPOSTA — arrecadação e recebimento(s) na MESMA transação.
 *
 * Os literais de saldo NÃO mudaram: o que mudou foi a CHAMADA (duas operações viraram
 * uma), não a aritmética.
 */
async function receberComGuia(
  guia: string,
  valor: string,
  vinculos: readonly { readonly dividaAtivaId: string; readonly valor: string }[],
  natureza: string = NAT_DIVIDA_ATIVA
): Promise<string> {
  const r = await arrecadarRecebimentoDividaAtiva(prisma, {
    arrecadacao: {
      exercicio: 2026, naturezaReceita: natureza, fonte: "500", valor,
      dataArrecadacao: new Date("2026-08-01T12:00:00Z"),
      numeroReceita: guia, criadoPor: POR,
    },
    roteiro: R_ARRECADACAO_DA,
    vinculos,
  });
  return r.receitaId;
}

/** O saldo DEVEDOR da conta do ativo, direto do razão. */
async function saldoNoRazao(): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo: ATIVO_DA } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce(
    (acc, p) => (p.tipo === "DEBITO" ? acc + Number(p.valor) : acc - Number(p.valor)),
    0
  );
}

describe("M10 — dívida ativa", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: o ciclo completo — 10.000 + 300 − 4.000 − 1.000 = 5.300, e o razão concorda", async () => {
    const id = await dividaDeTeste();

    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição do IPTU 2025 não pago, após esgotada a cobrança administrativa",
      criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10000.00");

    await atualizarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "300.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "juros e correção monetária de julho", criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10300.00");

    // ⚠️ O RECEBIMENTO: a OPERAÇÃO COMPOSTA — arrecadação e movimento na mesma tx.
    await receberComGuia("GUIA-DA-1", "4000.00", [
      { dividaAtivaId: id, valor: "4000.00" },
    ]);
    // e ele NÃO tem lançamento próprio
    const rec = await prisma.movimentoDividaAtiva.findFirstOrThrow({
      where: { tipo: "RECEBIMENTO" },
      select: { lancamentoId: true },
    });
    expect(rec.lancamentoId).toBeNull();
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6300.00");

    await cancelarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "1000.00",
      dataMovimento: new Date("2026-10-01T12:00:00Z"),
      motivo: "remissão parcial por decisão judicial transitada em julgado",
      criadoPor: POR,
    });

    // 10.000 + 300 − 4.000 − 1.000
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("5300.00");

    // ⚠️ A AMARRAÇÃO: ΣD 10.300 − ΣC 5.000 = 5.300
    expect(await saldoNoRazao()).toBe(5300);
    const conf = await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("5300.00");
    expect(conf.peloRazao.toFixed(2)).toBe("5300.00");

    // e o ledger fecha
    const todas = await prisma.partidaContabil.findMany({
      select: { tipo: true, valor: true },
    });
    const d = todas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
    const c = todas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
    expect(d).toBe(c);
  });

  // t1b — O GUARD DO TIPO (8º dígito). NASCE AQUI: até então, NENHUM.
  it("t1b: só o tipo 3 (dívida ativa) e o 4 (juros dela) quitam; o tipo 1 REJEITA", async () => {
    const id = await dividaDeTeste();

    // inscrição 10.000 + juros de julho 300 = 10.300
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição do IPTU 2025 não pago", criadoPor: POR,
    });
    await atualizarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "300.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "juros e correção monetária de julho", criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10300.00");

    // (a) tipo 3 — o crédito INSCRITO. 10.300 − 4.000 = 6.300
    await receberComGuia("GUIA-DA-3", "4000.00", [{ dividaAtivaId: id, valor: "4000.00" }]);
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6300.00");

    // (b) tipo 4 — os JUROS DA DÍVIDA ATIVA. E este é o ponto: o saldo da dívida
    // ativa inclui a ATUALIZACAO (os 300 de julho). Um guard que só aceitasse o
    // tipo 3 tornaria IMPOSSÍVEL registrar o recebimento DESSES 300 — o dinheiro
    // entraria no razão, o movimento não existiria, e a amarração acusaria para
    // sempre. 6.300 − 300 = 6.000
    await receberComGuia("GUIA-DA-4", "300.00", [{ dividaAtivaId: id, valor: "300.00" }], NAT_JUROS_DA);
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6000.00");

    const receitasAntes = await prisma.receitaArrecadada.count();

    // (c) tipo 1 — o IPTU DO EXERCÍCIO. É a MESMA receita (mesmo 1.1.3.0.11.1), e o
    // que muda é o 8º dígito. Antes deste bloco, isto PASSAVA: o contribuinte que
    // pagou o imposto deste ano tinha a dívida INSCRITA baixada, e o crédito sumia
    // do ativo sem que ninguém o pagasse.
    await expect(
      receberComGuia("GUIA-IPTU", "1000.00", [{ dividaAtivaId: id, valor: "1000.00" }], NAT_PRINCIPAL)
    ).rejects.toThrow(/TIPO é PRINCIPAL/);

    // ⚠️ ATOMICIDADE: a composta cai INTEIRA — nem a arrecadação sobrevive.
    expect(await prisma.receitaArrecadada.count()).toBe(receitasAntes);
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6000.00");

    // e a amarração razão × movimentos fecha: 10.300 − 4.300 = 6.000
    const conf = await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("6000.00");
    expect(conf.peloRazao.toFixed(2)).toBe("6000.00");
  });

  // t2
  it("t2: UMA guia quita VÁRIAS dívidas — e a soma tem de FECHAR com ela (exata)", async () => {
    const a = await dividaDeTeste("CDA-A");
    const b = await dividaDeTeste("CDA-B");
    for (const id of [a, b]) {
      await inscreverDividaAtiva(prisma, {
        dividaAtivaId: id, valor: "5000.00",
        dataMovimento: new Date("2026-01-15T12:00:00Z"),
        motivo: "inscrição de crédito tributário não pago", criadoPor: POR,
      });
    }

    // ⚠️ VINCULAÇÃO PARCIAL NÃO EXISTE MAIS: guia de 4.000 com vínculos de 3.000.
    let erro: unknown;
    try {
      await receberComGuia("GUIA-PARCIAL", "4000.00", [
        { dividaAtivaId: a, valor: "3000.00" },
      ]);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> VINCULAÇÃO NÃO FECHA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/VINCULAÇÃO NÃO FECHA COM A GUIA/);
    expect(msg).toMatch(/3000\.00/);
    expect(msg).toMatch(/4000\.00/);
    // ⚠️ NEM A ARRECADAÇÃO EXISTE — o guard roda ANTES da transação.
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.movimentoDividaAtiva.count({ where: { tipo: "RECEBIMENTO" } })).toBe(0);

    // recebimento MAIOR que o saldo da dívida (6.000 > 5.000): a guia fecha, o saldo não
    await expect(
      receberComGuia("GUIA-GRANDE", "6000.00", [{ dividaAtivaId: a, valor: "6000.00" }])
    ).rejects.toThrow(/RECEBIMENTO MAIOR QUE O SALDO/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    // ── A GUIA ÚNICA QUITANDO DUAS DÍVIDAS: 3.000 + 1.000 = 4.000 ✓ ────────
    await receberComGuia("GUIA-UNICA", "4000.00", [
      { dividaAtivaId: a, valor: "3000.00" },
      { dividaAtivaId: b, valor: "1000.00" },
    ]);
    expect((await saldoDaDividaAtivaEm(prisma, a)).toFixed(2)).toBe("2000.00");
    expect((await saldoDaDividaAtivaEm(prisma, b)).toFixed(2)).toBe("4000.00");

    // e as duas leituras batem: razão 10.000 (inscrições) − 4.000 (a guia) = 6.000
    const conf = await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("6000.00");
    expect(conf.peloRazao.toFixed(2)).toBe("6000.00");
  });

  // t3
  it("t3: a competência da atualização é IDEMPOTENTE — e o estorno a libera", async () => {
    const id = await dividaDeTeste();
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição de crédito tributário", criadoPor: POR,
    });

    const primeira = await atualizarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "300.00", competencia: "2026-07",
      dataMovimento: new Date("2026-07-31T12:00:00Z"),
      motivo: "juros de julho", criadoPor: POR,
    });

    await expect(
      atualizarDividaAtiva(prisma, {
        dividaAtivaId: id, valor: "999.00", competencia: "2026-07",
        dataMovimento: new Date("2026-07-31T12:00:00Z"),
        motivo: "corrigindo julho de novo, por engano", criadoPor: POR,
      })
    ).rejects.toThrow(/COMPETÊNCIA 2026-07 JÁ ATUALIZADA/);
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10300.00");

    // ESTORNA → a competência ABRE (o SALDO governa)
    await estornarMovimentoDividaAtiva(prisma, {
      movimentoId: primeira.movimentoId,
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "índice aplicado estava errado; refazer julho", criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10000.00");

    await atualizarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "250.00", competencia: "2026-07",
      dataMovimento: new Date("2026-08-01T12:00:00Z"),
      motivo: "juros de julho, com o índice certo", criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10250.00");

    // o razão acompanhou (o estorno INVERTE as pernas do roteiro)
    await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    expect(await saldoNoRazao()).toBe(10250);
  });

  // t4
  it("t4: PORTA FECHADA no estorno do RECEBIMENTO; o cancelamento estorna livre", async () => {
    const id = await dividaDeTeste();
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição de crédito tributário", criadoPor: POR,
    });
    await receberComGuia("GUIA-DA-1", "4000.00", [
      { dividaAtivaId: id, valor: "4000.00" },
    ]);
    const rec = await prisma.movimentoDividaAtiva.findFirstOrThrow({
      where: { tipo: "RECEBIMENTO" }, select: { id: true },
    });

    let erro: unknown;
    try {
      await estornarMovimentoDividaAtiva(prisma, {
        movimentoId: rec.id,
        dataMovimento: new Date("2026-09-01T12:00:00Z"),
        motivo: "tentando desfazer o recebimento por fora do M04", criadoPor: POR,
      });
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> PORTA FECHADA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/PORTA FECHADA/);
    expect(msg).toMatch(/ANULE A ARRECADAÇÃO/);
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6000.00");

    // ── O CANCELAMENTO ESTORNA LIVRE (ele não nasceu de fato nenhum do M04) ──
    const canc = await cancelarDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "1000.00",
      dataMovimento: new Date("2026-10-01T12:00:00Z"),
      motivo: "prescrição declarada, depois revista em recurso", criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("5000.00");

    await estornarMovimentoDividaAtiva(prisma, {
      movimentoId: canc.movimentoId,
      dataMovimento: new Date("2026-11-01T12:00:00Z"),
      motivo: "a prescrição foi afastada pelo tribunal; o crédito volta",
      criadoPor: POR,
    });
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6000.00");
    await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
  });

  // t5
  it("t5: dois recebimentos concorrentes de 3.000 contra dívida de 5.000 — UM só grava", async () => {
    const RODADAS = 5;

    for (let i = 0; i < RODADAS; i++) {
      await semear();
      const id = await dividaDeTeste();
      await inscreverDividaAtiva(prisma, {
        dividaAtivaId: id, valor: "5000.00",
        dataMovimento: new Date("2026-01-15T12:00:00Z"),
        motivo: "inscrição de crédito tributário", criadoPor: POR,
      });
      // Guias DISTINTAS: o gargalo é a DÍVIDA, não a receita.
      const r = await Promise.allSettled(
        ["GUIA-A", "GUIA-B"].map((guia) =>
          receberComGuia(guia, "3000.00", [{ dividaAtivaId: id, valor: "3000.00" }])
        )
      );

      const ok = r.filter((x) => x.status === "fulfilled");
      const falhou = r.filter((x) => x.status === "rejected");

      // 3.000 + 3.000 = 6.000 > 5.000 → EXATAMENTE UM.
      expect(ok).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /RECEBIMENTO MAIOR QUE O SALDO/
      );
      expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("2000.00");
    }
  }, 90_000);

  // t6
  it("t6: no Anexo 14 a dívida ativa é ATIVO (classe 1); marcada P, o superávit NÃO a inclui", async () => {
    const id = await dividaDeTeste();
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição de crédito tributário", criadoPor: POR,
    });
    // ⚠️ A GUIA É INTEGRALMENTE VINCULADA — e isso NÃO é detalhe do teste.
    // O roteiro da arrecadação credita o ATIVO pelo valor INTEIRO da guia. Se a
    // guia arrecadasse 8.000 e só 4.000 fossem vinculados, o RAZÃO baixaria a
    // dívida em 8.000 enquanto os MOVIMENTOS a baixariam em 4.000 — e a amarração
    // `conferirDividaAtivaContraRazao` acusaria a diferença. Ela existe justamente
    // para isso. (Nada FORÇA a vinculação integral hoje: a amarração DETECTA, o
    // serviço não impede. Está no MODULO.md.)
    await receberComGuia("GUIA-DA-1", "4000.00", [
      { dividaAtivaId: id, valor: "4000.00" },
    ]);
    // caixa = 4.000 (arrecadado); dívida ativa = 10.000 − 4.000 = 6.000
    expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("6000.00");
    await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");

    for (const l of [
      { codigoLinha: "AC.CAIXA", rotulo: "Caixa e Equivalentes", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1.1"] },
      { codigoLinha: "ANC.DA", rotulo: "Dívida Ativa", grupo: "ATIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["1.2.1"] },
      { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3"] },
    ] as const) {
      await cadastrarLinhaDemonstrativo(prisma, {
        anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
      });
    }

    const b = await balancoPatrimonial(prisma, CORTE);
    const q = b.quadroFinanceiroPermanente;

    // ── A1, SOMADA À MÃO ──────────────────────────────────────────────────
    // ATIVO = caixa 4.000 + dívida ativa 6.000 = 10.000
    // PL    = VPA 10.000 (a inscrição) − VPD 0 = 10.000
    // ⚠️ O RECEBIMENTO NÃO GEROU VPA: ele TROCOU um ativo por outro (permutativo).
    //    Se tivesse gerado, o PL seria 14.000 e o balanço NÃO fecharia — é essa a
    //    prova de que o recebimento não pode ter roteiro próprio.
    expect(b.totalAtivo).toBe("10000.00");
    expect(b.totalPassivo).toBe("0.00");
    expect(b.totalPatrimonioLiquido).toBe("10000.00");
    expect(4000 + 6000).toBe(10000);

    // ── O QUADRO DO ART. 105 ──────────────────────────────────────────────
    // A dívida ativa é ATIVO PERMANENTE (P, pela escolha declarada no cabeçalho).
    expect(q.ativoPermanente).toBe("6000.00");
    // e o superávit financeiro NÃO conta com ela: só o caixa (F).
    expect(q.ativoFinanceiro).toBe("4000.00");
    expect(q.superavitFinanceiro).toBe("4000.00"); // 4.000 − 0 de passivo financeiro
  });

  // ══════════════════════════════════════════════════════════════════════════
  // O FIX ESTRUTURAL — as duas portas (a98f0a5 nomeou os dois furos)
  // ══════════════════════════════════════════════════════════════════════════

  // t3b — A ENTRADA LATERAL
  it("t3b: arrecadar AVULSO numa conta reservada é barrado; conta livre passa", async () => {
    await dividaDeTeste(); // reserva a conta c-ativo-da

    // O M04 COM as portas ligadas (o composition root de quem usa dívidas).
    const deps = criarM04DepsComDividas(prisma);

    let erro: unknown;
    try {
      await registrarArrecadacao(
        {
          exercicio: 2026, naturezaReceita: NAT_DIVIDA_ATIVA, fonte: "500",
          valor: "4000.00", dataArrecadacao: new Date("2026-08-01T12:00:00Z"),
          numeroReceita: "GUIA-LATERAL", criadoPor: POR,
        },
        R_ARRECADACAO_DA, // ⚠️ credita a conta da DÍVIDA ATIVA
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CONTA RESERVADA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CONTA RESERVADA/);
    expect(msg).toMatch(/dívida ativa CDA-2026-001/);
    expect(msg).toMatch(/OPERAÇÃO COMPOSTA/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.partidaContabil.count()).toBe(0);

    // ── CONTA LIVRE: o caminho de sempre, intacto ─────────────────────────
    const livre = roteiroArrecadacao({
      disponibilidade: CAIXA,
      variacaoAumentativa: VPA_DA, // conta NÃO reservada
      receitaARealizar: R_A_REALIZAR,
      receitaRealizada: R_REALIZADA,
    });
    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NAT_DIVIDA_ATIVA, fonte: "500",
        valor: "4000.00", dataArrecadacao: new Date("2026-08-01T12:00:00Z"),
        numeroReceita: "GUIA-LIVRE", criadoPor: POR,
      },
      livre,
      deps
    );
    expect(await prisma.receitaArrecadada.count()).toBe(1);
  });

  // t4b — A CASCATA
  it("t4b: anular a guia estorna os DOIS recebimentos na mesma tx — saldos voltam", async () => {
    const a = await dividaDeTeste("CDA-A");
    const b = await dividaDeTeste("CDA-B");
    for (const id of [a, b]) {
      await inscreverDividaAtiva(prisma, {
        dividaAtivaId: id, valor: "5000.00",
        dataMovimento: new Date("2026-01-15T12:00:00Z"),
        motivo: "inscrição de crédito tributário não pago", criadoPor: POR,
      });
    }

    const receitaId = await receberComGuia("GUIA-UNICA", "4000.00", [
      { dividaAtivaId: a, valor: "3000.00" },
      { dividaAtivaId: b, valor: "1000.00" },
    ]);
    expect((await saldoDaDividaAtivaEm(prisma, a)).toFixed(2)).toBe("2000.00");
    expect((await saldoDaDividaAtivaEm(prisma, b)).toFixed(2)).toBe("4000.00");

    // ═══ ANULA A GUIA — a cascata roda DENTRO da transação da anulação ═══
    await anularArrecadacao(
      {
        receitaId, dataAnulacao: new Date("2026-09-01T12:00:00Z"),
        numeroReceita: "GUIA-UNICA-ANUL", criadoPor: POR,
      },
      criarM04DepsComDividas(prisma)
    );

    // ⚠️ OS DOIS SALDOS VOLTAM — cada um com o SEU valor (3.000 e 1.000), nunca um
    // valor único recarimbado (a lição do `resolverPartidas` do M08).
    expect((await saldoDaDividaAtivaEm(prisma, a)).toFixed(2)).toBe("5000.00");
    expect((await saldoDaDividaAtivaEm(prisma, b)).toFixed(2)).toBe("5000.00");
    expect(
      await prisma.movimentoDividaAtiva.count({ where: { tipo: "ESTORNO_RECEBIMENTO" } })
    ).toBe(2);

    // e a amarração segue fechando: razão 10.000 (inscrições) + a anulação devolveu
    // os 4.000 ⟹ 10.000; movimentos 5.000 + 5.000 = 10.000 ✓
    const conf = await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("10000.00");
    expect(conf.peloRazao.toFixed(2)).toBe("10000.00");
  });

  // t7b — CONCORRÊNCIA: composta × anulação da mesma receita
  it("t7b: composta e anulação concorrentes — nada fica órfão", async () => {
    for (let i = 0; i < 5; i++) {
      await semear();
      const id = await dividaDeTeste();
      await inscreverDividaAtiva(prisma, {
        dividaAtivaId: id, valor: "10000.00",
        dataMovimento: new Date("2026-01-15T12:00:00Z"),
        motivo: "inscrição de crédito tributário", criadoPor: POR,
      });
      const receitaId = await receberComGuia("GUIA-1", "4000.00", [
        { dividaAtivaId: id, valor: "4000.00" },
      ]);

      // Duas anulações concorrentes da MESMA guia: só uma pode vencer (o índice
      // parcial uq_estorno_receita_unico é a garantia dura).
      const anular = () =>
        anularArrecadacao(
          {
            receitaId, dataAnulacao: new Date("2026-09-01T12:00:00Z"),
            numeroReceita: "GUIA-1-ANUL", criadoPor: POR,
          },
          criarM04DepsComDividas(prisma)
        );
      const r = await Promise.allSettled([anular(), anular()]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);

      // ⚠️ NADA ÓRFÃO: uma anulação, um estorno de recebimento, saldo restaurado.
      expect(
        await prisma.receitaArrecadada.count({ where: { tipo: "ANULACAO" } })
      ).toBe(1);
      expect(
        await prisma.movimentoDividaAtiva.count({ where: { tipo: "ESTORNO_RECEBIMENTO" } })
      ).toBe(1);
      expect((await saldoDaDividaAtivaEm(prisma, id)).toFixed(2)).toBe("10000.00");
      await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    }
  }, 90_000);

  // t7
  it("t7: o rol de origens é FECHADO — art. 39, § 2º dá DUAS, e só duas", () => {
    const origens = Object.keys(ORIGENS_DIVIDA_ATIVA);
    expect(origens).toHaveLength(2);
    expect(origens.sort()).toEqual(["NAO_TRIBUTARIA", "TRIBUTARIA"]);
  });

  // t8
  it("t8: a amarração razão × movimentos PEGA um lançamento direto na conta", async () => {
    const id = await dividaDeTeste();
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: id, valor: "10000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"),
      motivo: "inscrição de crédito tributário", criadoPor: POR,
    });
    await conferirDividaAtivaContraRazao(prisma, "c-ativo-da"); // fecha

    // ═══ A MUTAÇÃO: alguém mexe na conta POR FORA dos serviços ═══
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "DIRETO-1",
        dataTransacao: new Date("2026-06-01T12:00:00Z"),
        historico: "lançamento direto na conta da dívida ativa",
        origemTipo: "TESTE",
        criadoPor: "atacante",
        partidas: {
          create: [
            { contaId: "c-ativo-da", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
            { contaId: "c-vpa-da", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await conferirDividaAtivaContraRazao(prisma, "c-ativo-da");
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> AMARRAÇÃO RAZÃO × MOVIMENTOS (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/DÍVIDA ATIVA NÃO FECHA COM O RAZÃO/);
    expect(msg).toMatch(/10000\.00/); // os movimentos
    expect(msg).toMatch(/11500\.00/); // o razão
    expect(msg).toMatch(/1500\.00/); // a diferença
    expect(msg).toMatch(/por fora dos serviços/);
  });
});
