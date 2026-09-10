import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { calcularSaldos, roteiroEmpenho, statusDoEmpenho } from "./dominio.js";
import type { RoteiroContabil } from "./dominio.js";
import {
  anularEmpenho,
  empenhar,
  liberarReserva,
  reconciliarFicha,
  reservarDotacao,
  saldosCorrentesDaFicha,
} from "./servico.js";
import type { M05Deps } from "./ports.js";

/**
 * M05 bloco 1 — reserva, empenho e SALDO MATERIALIZADO POR RECÁLCULO.
 *
 * A asserção mais importante deste arquivo não é nenhum valor específico: é
 * `reconciliarFicha() == []` depois de CADA operação. Ela prova que a coluna
 * cache nunca divergiu do SUM dos movimentos — que é o invariante que impede o
 * orçamento de derrapar em silêncio.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-sintetica", codigo: "6.2.2.0.0.00.00", nome: "Execução da Despesa", naturezaSaldo: "CREDORA" as const, nivel: 3, analitica: false },
];

const ROTEIRO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});

const FICHA_ID = "ficha-teste";
/** A ficha é dotada em 10.000,00 — é daí que sai a DOTACAO_INICIAL. */
const DOTADO = "10000.00";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.create({ data: { id: "prg-0012", codigo: "0012", descricao: "Educação Básica" } });
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039",
      descricao: "Outros Serviços de Terceiros - PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
  });
  // Ficha COM dotação inicial — o mesmo que o adapter do M02 faz.
  await criarFichaDeTeste(prisma, {
    id: FICHA_ID, exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg-0012", acaoId: "aca-2001",
    naturezaDespesaId: "nd-339039", fonteId: "fnt-500",
    valorDotado: DOTADO,
  });
}

const CRIADO_POR = "m05@cg.pb.gov.br";

function empenhoBase(numero: string, valor: string) {
  return {
    fichaId: FICHA_ID,
    numero,
    tipo: "ORDINARIO" as const,
    valor,
    data: new Date("2026-04-10T12:00:00Z"),
    credorCpfCnpj: "12345678000199",
    historico: `Empenho ${numero}`,
    // M06 (art. 141): obrigatória — define a fila do pagamento.
    categoriaOrdemCronologica: "FORNECIMENTO_BENS" as const,
    criadoPor: CRIADO_POR,
  };
}

describe("M05 — reserva, empenho e saldo", () => {
  let deps: M05Deps;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("DOTACAO_INICIAL nasce do valorDotado; saldo disponível = dotado", async () => {
    await reservarDotacao(
      { fichaId: FICHA_ID, valor: "1.00", historico: "toque inicial", criadoPor: CRIADO_POR },
      deps
    );

    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.autorizado.toFixed(2)).toBe("10000.00");
    expect(s.reservado.toFixed(2)).toBe("1.00");
    expect(s.disponivel.toFixed(2)).toBe("9999.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("reserva dentro do saldo: disponível cai; reconciliação = []", async () => {
    await reservarDotacao(
      { fichaId: FICHA_ID, valor: "3000.00", historico: "reserva licitação", criadoPor: CRIADO_POR },
      deps
    );

    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.reservado.toFixed(2)).toBe("3000.00");
    expect(s.empenhado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("7000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("REJEITA reserva ALÉM do saldo — nada grava, saldo inalterado", async () => {
    await reservarDotacao(
      { fichaId: FICHA_ID, valor: "9000.00", historico: "reserva 1", criadoPor: CRIADO_POR },
      deps
    );

    await expect(
      reservarDotacao(
        { fichaId: FICHA_ID, valor: "2000.00", historico: "estoura", criadoPor: CRIADO_POR },
        deps
      )
    ).rejects.toThrow(/Saldo insuficiente.*disponível 1000\.00.*solicitado 2000\.00/s);

    // TR 4.51 fail-closed: nada foi gravado
    expect(await prisma.reservaDotacao.count()).toBe(1);
    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.disponivel.toFixed(2)).toBe("1000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("empenho direto dentro do saldo: gera lançamento balanceado; reconciliação = []", async () => {
    const e = await empenhar(empenhoBase("2026NE0001", "4000.00"), ROTEIRO, deps);

    const empenho = await prisma.empenho.findUniqueOrThrow({
      where: { id: e.empenhoId },
      include: { lancamento: { include: { partidas: { include: { conta: true } } } } },
    });
    expect(empenho.valor.toFixed(2)).toBe("4000.00");

    const partidas = empenho.lancamento.partidas;
    expect(partidas).toHaveLength(2);
    const d = partidas.filter((p) => p.tipo === "DEBITO");
    const c = partidas.filter((p) => p.tipo === "CREDITO");
    expect(d).toHaveLength(1);
    expect(c).toHaveLength(1);
    expect(d[0]!.valor.toFixed(2)).toBe(c[0]!.valor.toFixed(2));
    expect(partidas.every((p) => p.subsistema === "ORCAMENTARIO")).toBe(true);
    // ADITIVO M01: a partida carrega a ficha
    expect(partidas.every((p) => p.fichaId === FICHA_ID)).toBe(true);

    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.empenhado.toFixed(2)).toBe("4000.00");
    expect(s.disponivel.toFixed(2)).toBe("6000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("REJEITA empenho ALÉM do saldo — nada grava, nem lançamento", async () => {
    await expect(
      empenhar(empenhoBase("2026NE0001", "10000.01"), ROTEIRO, deps)
    ).rejects.toThrow(/Saldo insuficiente/);

    expect(await prisma.empenho.count()).toBe(0);
    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "EMPENHO" } })
    ).toBe(0);
    expect(await prisma.movimentoDotacao.count({ where: { tipo: "EMPENHO" } })).toBe(0);
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("ROTEIRO DESBALANCEADO é barrado pelo ledger — nada grava", async () => {
    const torto: RoteiroContabil = [
      { conta: "6.2.2.1.1.00.00", tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
      { conta: "6.2.2.1.3.01.00", tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    ];
    await expect(
      empenhar(empenhoBase("2026NE0001", "100.00"), torto, deps)
    ).rejects.toThrow(/partida simples/i);

    expect(await prisma.empenho.count()).toBe(0);
    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "EMPENHO" } })
    ).toBe(0);
  });

  it("REJEITA conta SINTÉTICA no roteiro do empenho", async () => {
    const sintetico = roteiroEmpenho({
      creditoDisponivel: "6.2.2.0.0.00.00", // sintética
      creditoEmpenhado: "6.2.2.1.3.01.00",
    });
    await expect(
      empenhar(empenhoBase("2026NE0001", "100.00"), sintetico, deps)
    ).rejects.toThrow(/sintética não recebe partida/);

    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "EMPENHO" } })
    ).toBe(0);
  });

  it("empenho VINDO DE RESERVA: libera a retenção; disponível não conta duas vezes", async () => {
    const reservaId = await reservarDotacao(
      { fichaId: FICHA_ID, valor: "3000.00", historico: "reserva", criadoPor: CRIADO_POR },
      deps
    );
    expect((await saldosCorrentesDaFicha(FICHA_ID, deps)).disponivel.toFixed(2)).toBe("7000.00");

    await empenhar(
      { ...empenhoBase("2026NE0001", "3000.00"), reservaId },
      ROTEIRO,
      deps
    );

    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    // reservado voltou a zero (RESERVA_LIBERADA), empenhado subiu
    expect(s.reservado.toFixed(2)).toBe("0.00");
    expect(s.empenhado.toFixed(2)).toBe("3000.00");
    // e o disponível NÃO caiu duas vezes: 10000 - 3000 = 7000
    expect(s.disponivel.toFixed(2)).toBe("7000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("REJEITA empenhar a MESMA reserva duas vezes", async () => {
    const reservaId = await reservarDotacao(
      { fichaId: FICHA_ID, valor: "3000.00", historico: "reserva", criadoPor: CRIADO_POR },
      deps
    );
    await empenhar({ ...empenhoBase("2026NE0001", "1000.00"), reservaId }, ROTEIRO, deps);

    await expect(
      empenhar({ ...empenhoBase("2026NE0002", "1000.00"), reservaId }, ROTEIRO, deps)
    ).rejects.toThrow(/já foi empenhada/);
  });

  it("REJEITA empenho que EXCEDE a reserva de origem", async () => {
    const reservaId = await reservarDotacao(
      { fichaId: FICHA_ID, valor: "1000.00", historico: "reserva", criadoPor: CRIADO_POR },
      deps
    );
    await expect(
      empenhar({ ...empenhoBase("2026NE0001", "1500.00"), reservaId }, ROTEIRO, deps)
    ).rejects.toThrow(/excede a reserva/);
  });

  it("liberar reserva devolve o saldo; reconciliação = []", async () => {
    const reservaId = await reservarDotacao(
      { fichaId: FICHA_ID, valor: "2500.00", historico: "reserva", criadoPor: CRIADO_POR },
      deps
    );
    await liberarReserva(
      { reservaId, historico: "licitação deserta", criadoPor: CRIADO_POR },
      deps
    );

    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.reservado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("10000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });

  it("anulação de empenho DEVOLVE o saldo; original INTACTO; reconciliação = []", async () => {
    const e = await empenhar(empenhoBase("2026NE0001", "4000.00"), ROTEIRO, deps);

    const antes = await prisma.empenho.findUniqueOrThrow({
      where: { id: e.empenhoId },
      include: { lancamento: { include: { partidas: true } } },
    });

    const anulacao = await anularEmpenho(
      {
        empenhoId: e.empenhoId,
        numero: "2026NE0001-A",
        data: new Date("2026-05-10T12:00:00Z"),
        historico: "anulação",
        criadoPor: CRIADO_POR,
      },
      deps
    );

    // saldo devolvido
    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    expect(s.empenhado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("10000.00");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    // INVARIANTE 2: nenhum campo do original mudou
    const depois = await prisma.empenho.findUniqueOrThrow({
      where: { id: e.empenhoId },
      include: { lancamento: { include: { partidas: true } } },
    });
    expect(depois).toEqual(antes);

    // pernas invertidas no lançamento da anulação
    const lancAnul = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: anulacao.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    const papel = new Map(
      lancAnul.partidas.map((p) => [p.conta.codigo, p.tipo])
    );
    expect(papel.get("6.2.2.1.1.00.00")).toBe("CREDITO"); // era DEBITO
    expect(papel.get("6.2.2.1.3.01.00")).toBe("DEBITO"); // era CREDITO
  });

  it("REJEITA anular o mesmo empenho duas vezes (barreira do serviço)", async () => {
    const e = await empenhar(empenhoBase("2026NE0001", "1000.00"), ROTEIRO, deps);
    const anul = {
      numero: "2026NE0001-A",
      data: new Date("2026-05-10T12:00:00Z"),
      historico: "anulação",
      criadoPor: CRIADO_POR,
    };
    await anularEmpenho({ empenhoId: e.empenhoId, ...anul }, deps);

    await expect(
      anularEmpenho({ empenhoId: e.empenhoId, ...anul, numero: "2026NE0001-B" }, deps)
    ).rejects.toThrow(/já foi anulado/);
  });

  it("DUPLO ESTORNO: o índice único parcial rejeita mesmo driblando o adapter", async () => {
    const e = await empenhar(empenhoBase("2026NE0001", "1000.00"), ROTEIRO, deps);
    await anularEmpenho(
      {
        empenhoId: e.empenhoId,
        numero: "2026NE0001-A",
        data: new Date("2026-05-10T12:00:00Z"),
        historico: "anulação",
        criadoPor: CRIADO_POR,
      },
      deps
    );

    let erro: unknown;
    try {
      const lanc = await prisma.lancamentoContabil.create({
        data: {
          numeroControle: "2026NE0001-X",
          dataTransacao: new Date("2026-05-11T12:00:00Z"),
          historico: "anulação clandestina",
          origemTipo: "EMPENHO_ANULADO",
          criadoPor: "atacante",
          partidas: {
            create: [
              { contaId: "c-disp", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
              { contaId: "c-emp", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
            ],
          },
        },
        select: { id: true },
      });
      await prisma.empenho.create({
        data: {
          fichaId: FICHA_ID, numero: "2026NE0001-X", tipo: "ORDINARIO",
          valor: "1000.00", data: new Date("2026-05-11T12:00:00Z"),
          credorCpfCnpj: "ANULACAO", historico: "clandestina",
          categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          lancamentoId: lanc.id,
          estornoDeId: e.empenhoId, // JÁ anulado!
          criadoPor: "atacante",
        },
      });
    } catch (err) {
      erro = err;
    }

    expect(erro).toBeDefined();
    console.log("\n>>> ERRO REAL DO POSTGRES (duplo estorno de empenho):\n" + String(erro) + "\n");
    expect(String(erro)).toMatch(/uq_estorno_empenho_unico|Unique constraint/i);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A PROVA DO INVARIANTE 4
  // ══════════════════════════════════════════════════════════════════════════

  it("RECONCILIAÇÃO: 10 operações encadeadas e o cache NUNCA diverge do SUM", async () => {
    // Sequência determinística (não aleatória de verdade: um teste que às vezes
    // testa outra coisa não prova nada). Cobre todos os tipos de movimento.
    const operacoes: readonly (() => Promise<unknown>)[] = [
      () => reservarDotacao({ fichaId: FICHA_ID, valor: "1000.00", historico: "r1", criadoPor: CRIADO_POR }, deps),
      () => empenhar(empenhoBase("NE01", "2000.00"), ROTEIRO, deps),
      () => reservarDotacao({ fichaId: FICHA_ID, valor: "500.00", historico: "r2", criadoPor: CRIADO_POR }, deps),
      () => empenhar(empenhoBase("NE02", "1500.00"), ROTEIRO, deps),
      () => reservarDotacao({ fichaId: FICHA_ID, valor: "250.00", historico: "r3", criadoPor: CRIADO_POR }, deps),
      () => empenhar(empenhoBase("NE03", "300.00"), ROTEIRO, deps),
      () => reservarDotacao({ fichaId: FICHA_ID, valor: "123.45", historico: "r4", criadoPor: CRIADO_POR }, deps),
      () => empenhar(empenhoBase("NE04", "77.77"), ROTEIRO, deps),
      () => reservarDotacao({ fichaId: FICHA_ID, valor: "0.01", historico: "r5", criadoPor: CRIADO_POR }, deps),
      () => empenhar(empenhoBase("NE05", "999.99"), ROTEIRO, deps),
    ];

    for (const [i, op] of operacoes.entries()) {
      await op();
      const divergencias = await reconciliarFicha(FICHA_ID, deps);
      expect(divergencias, `divergiu depois da operação ${i + 1}`).toEqual([]);
    }

    // agora anula e libera, e reconcilia de novo
    const empenhos = await prisma.empenho.findMany({
      where: { estornoDeId: null },
      select: { id: true },
      orderBy: { numero: "asc" },
    });
    await anularEmpenho(
      {
        empenhoId: empenhos[0]!.id,
        numero: "NE01-A",
        data: new Date("2026-06-01T12:00:00Z"),
        historico: "anula",
        criadoPor: CRIADO_POR,
      },
      deps
    );
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    const reservas = await prisma.reservaDotacao.findMany({
      where: { estornoDeId: null },
      select: { id: true },
      orderBy: { criadoEm: "asc" },
    });
    await liberarReserva(
      { reservaId: reservas[0]!.id, historico: "libera", criadoPor: CRIADO_POR },
      deps
    );
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    // conferência final, na unha
    const s = await saldosCorrentesDaFicha(FICHA_ID, deps);
    // reservado: 1000 + 500 + 250 + 123.45 + 0.01 = 1873.46; liberado 1000 -> 873.46
    expect(s.reservado.toFixed(2)).toBe("873.46");
    // empenhado: 2000+1500+300+77.77+999.99 = 4877.76; anulado 2000 -> 2877.76
    expect(s.empenhado.toFixed(2)).toBe("2877.76");
    expect(s.autorizado.toFixed(2)).toBe("10000.00");
    expect(s.disponivel.toFixed(2)).toBe("6248.78"); // 10000 - 873.46 - 2877.76
  });

  it("a coluna cache bate com o SUM depois de TODA operação (detecta cache sujo)", async () => {
    await empenhar(empenhoBase("NE01", "1000.00"), ROTEIRO, deps);

    // sujando o cache À MÃO para provar que a reconciliação PEGA
    await prisma.fichaOrcamentaria.update({
      where: { id: FICHA_ID },
      data: { saldoEmpenhado: "999.99" },
    });

    const divergencias = await reconciliarFicha(FICHA_ID, deps);
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]!.saldo).toBe("empenhado");
    expect(divergencias[0]!.cache.toFixed(2)).toBe("999.99");
    expect(divergencias[0]!.real.toFixed(2)).toBe("1000.00");

    // e uma operação nova RECALCULA (não incrementa), consertando o cache
    await empenhar(empenhoBase("NE02", "500.00"), ROTEIRO, deps);
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);
  });
});

// ── domínio puro (sem banco) ───────────────────────────────────────────────

describe("M05 — saldos (puro)", () => {
  it("calcularSaldos aplica o sinal de cada tipo", () => {
    const s = calcularSaldos({
      DOTACAO_INICIAL: toMoney("10000.00"),
      CREDITO_ADICIONAL: toMoney("2000.00"),
      ANULACAO_CREDITO: toMoney("500.00"),
      RESERVA: toMoney("1000.00"),
      RESERVA_LIBERADA: toMoney("400.00"),
      EMPENHO: toMoney("3000.00"),
      EMPENHO_ANULADO: toMoney("1000.00"),
    });
    expect(s.autorizado.toFixed(2)).toBe("11500.00"); // 10000+2000-500
    expect(s.reservado.toFixed(2)).toBe("600.00"); // 1000-400
    expect(s.empenhado.toFixed(2)).toBe("2000.00"); // 3000-1000
    expect(s.disponivel.toFixed(2)).toBe("8900.00"); // 11500-600-2000
  });

  it("ficha sem movimento nenhum: tudo zero", () => {
    const s = calcularSaldos({});
    expect(s.autorizado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("0.00");
  });
});

describe("M05 — status do empenho (derivado, puro)", () => {
  const base = { empenhado: toMoney("1000.00"), liquidado: toMoney("0.00"), pago: toMoney("0.00"), anulado: false };

  it("EMPENHADO quando nada foi liquidado", () => {
    expect(statusDoEmpenho(base)).toBe("EMPENHADO");
  });
  it("PARCIAL_LIQUIDADO", () => {
    expect(statusDoEmpenho({ ...base, liquidado: toMoney("400.00") })).toBe("PARCIAL_LIQUIDADO");
  });
  it("LIQUIDADO", () => {
    expect(statusDoEmpenho({ ...base, liquidado: toMoney("1000.00") })).toBe("LIQUIDADO");
  });
  it("PARCIAL_PAGO", () => {
    expect(statusDoEmpenho({ ...base, liquidado: toMoney("1000.00"), pago: toMoney("600.00") })).toBe("PARCIAL_PAGO");
  });
  it("PAGO", () => {
    expect(statusDoEmpenho({ ...base, liquidado: toMoney("1000.00"), pago: toMoney("1000.00") })).toBe("PAGO");
  });
  it("ANULADO vence tudo", () => {
    expect(statusDoEmpenho({ ...base, liquidado: toMoney("1000.00"), pago: toMoney("1000.00"), anulado: true })).toBe("ANULADO");
  });
});
