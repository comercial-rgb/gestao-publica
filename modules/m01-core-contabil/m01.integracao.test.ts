import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM01Deps } from "./adapter-prisma.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { estornarLancamento, registrarLancamento } from "./servico.js";
import type { M01Deps } from "./ports.js";

/**
 * TESTE DE INTEGRAÇÃO — bate no Postgres de verdade, não em fake.
 *
 * É aqui que o `adapter-prisma.ts` sai do "testado só por leitura": transação,
 * recheck de conta analítica e — o que vale ouro — a corrida de duplo estorno
 * batendo no índice único PARCIAL `uq_estorno_unico`, que não existe no schema
 * Prisma (ver prisma/sql/uq_estorno_unico.sql).
 *
 * ⚠️ SEM BANCO, ISTO **FALHA** — e o comentário que este parágrafo substitui dizia o
 * contrário ("o describe inteiro é PULADO — não falha o `vitest run` de quem só quer
 * rodar os testes puros"). Era a doutrina errada, e ela custava caro: uma suíte
 * inteiramente pulada o Vitest reporta como PASSANDO, com exit code 0. Quem quer só os
 * testes puros que os selecione (`vitest run packages/`); quem roda a suíte inteira tem
 * de receber a verdade. Ver `test/banco.ts`.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula.
await exigirBanco(prisma);

describe("M01 — integração contra Postgres real", () => {
  let deps: M01Deps;

  /** Seed MÍNIMO do PCASP — o plano completo é tarefa de dados separada. */
  const CONTAS = [
    { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
    // ⚠️ ERA `6.2.1.1.0.00.00` (classe 6, ORÇAMENTÁRIA) batizada "IPTU a receber" e
    // usada em perna PATRIMONIAL. O crédito tributário é ATIVO: classe 1, DEVEDORA.
    // Ver MODULO.md do M01 (GUARD-NATUREZA-INFORMACAO).
    { id: "c-iptu", codigo: "1.1.2.2.1.00.00", nome: "Créditos tributários a receber", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
    { id: "c-sintetica", codigo: "1.1.1.0.0.00.00", nome: "Caixa e equivalentes", naturezaSaldo: "DEVEDORA" as const, nivel: 3, analitica: false },
  ];

  beforeAll(async () => {
    deps = criarM01Deps(prisma);
  });

  beforeEach(async () => {
    // append-only vale para o NEGÓCIO; limpar a base de teste é infraestrutura.
    await limparBanco(prisma);
    await prisma.contaPcasp.createMany({ data: CONTAS });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const LANCAMENTO = {
    numeroControle: "2026NL000001",
    dataTransacao: new Date("2026-07-01T12:00:00Z"),
    historico: "Arrecadação de IPTU",
    origemTipo: "ARRECADACAO",
    criadoPor: "integracao@cg.pb.gov.br",
    partidas: [
      { conta: "1.1.1.1.1.00.00", tipo: "DEBITO" as const, subsistema: "PATRIMONIAL" as const, valor: "1500.00" },
      { conta: "1.1.2.2.1.00.00", tipo: "CREDITO" as const, subsistema: "PATRIMONIAL" as const, valor: "1500.00" },
    ],
  };

  it("persiste lançamento balanceado com valor DECIMAL(18,2) intacto", async () => {
    const id = await registrarLancamento(LANCAMENTO, deps);

    const gravado = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id },
      include: { partidas: { include: { conta: true } } },
    });

    expect(gravado.numeroControle).toBe("2026NL000001");
    expect(gravado.estornoDeId).toBeNull();
    expect(gravado.partidas).toHaveLength(2);

    // o dinheiro sobreviveu à ida e volta pelo Postgres sem virar float
    const porTipo = new Map(
      gravado.partidas.map((p) => [p.tipo, p.valor.toFixed(2)])
    );
    expect(porTipo.get("DEBITO")).toBe("1500.00");
    expect(porTipo.get("CREDITO")).toBe("1500.00");
  });

  it("REJEITA partida em conta SINTÉTICA — recheck dentro da transação", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO,
          partidas: [
            { conta: "1.1.1.0.0.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
          ],
        },
        deps
      )
    ).rejects.toThrow(/sintética não recebe partida/);

    // fail-closed: a transação abortou, NADA foi gravado
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    expect(await prisma.partidaContabil.count()).toBe(0);
  });

  /**
   * ⚠️ O TESTE DA COLUNA REMOVIDA — e ele prova o que SOBROU, não o que morreu.
   *
   * `LancamentoContabil.competencia` era uma SEGUNDA competência: todo estorno herdava a do
   * original, ela divergia da `dataTransacao` no banco, e ninguém a lia. Ela foi removida.
   *
   * O cenário que mais assustava era este: **anular, em JANEIRO, um fato de DEZEMBRO.** Era
   * exatamente aí que a coluna dormente "fazia alguma coisa" — carimbava o estorno com
   * dezembro. Como nada a lia, ela não fazia coisa nenhuma; e o dia em que alguém a lesse, o
   * estorno de janeiro apareceria em dezembro, num mês possivelmente já fechado.
   *
   * O que o sistema faz — e sempre fez, porque é `dataTransacao` que todos leem — é o certo:
   * **o estorno é um fato NOVO, do dia em que se estorna.** É a semântica de `a4f2bd6`, e ela
   * sai INTACTA da remoção. Este teste a prova de novo, agora sem a segunda data por perto.
   */
  it("t3: anula em JANEIRO um fato de DEZEMBRO — o estorno é um fato de JANEIRO (e não há segunda data)", async () => {
    const DEZEMBRO = new Date("2026-12-20T12:00:00Z");
    const JANEIRO = new Date("2027-01-15T12:00:00Z");

    const idOriginal = await registrarLancamento(
      { ...LANCAMENTO, numeroControle: "2026NL-DEZ", dataTransacao: DEZEMBRO },
      deps
    );

    const idEstorno = await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2027NL-JAN",
        dataEstorno: JANEIRO,
        criadoPor: "integracao@cg.pb.gov.br",
      },
      deps
    );

    const original = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idOriginal },
    });
    const estorno = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idEstorno },
      include: { partidas: true },
    });

    // ── O ESTORNO FOI CRIADO, NORMALMENTE, e ele é um fato de JANEIRO ──
    expect(estorno.dataTransacao).toEqual(JANEIRO);
    expect(estorno.estornoDeId).toBe(idOriginal);
    expect(estorno.partidas.length).toBeGreaterThan(0);

    // ── O ORIGINAL continua sendo um fato de DEZEMBRO (append-only: nada foi reescrito) ──
    expect(original.dataTransacao).toEqual(DEZEMBRO);

    // ⚠️ E NÃO HÁ SEGUNDA DATA. Antes, o estorno saía daqui carimbado com DEZEMBRO numa coluna
    // `competencia` que ninguém lia — a divergência que 498de7b encontrou no banco de verdade.
    // Agora a linha tem UMA data de negócio, e ela diz a verdade.
    expect(Object.keys(estorno)).not.toContain("competencia");
    expect(Object.keys(original)).not.toContain("competencia");
  });

  it("estorno persiste lançamento NOVO; original permanece byte-a-byte intacto", async () => {
    const idOriginal = await registrarLancamento(LANCAMENTO, deps);
    const antes = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idOriginal },
      include: { partidas: true },
    });

    const idEstorno = await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2026NL000099",
        dataEstorno: new Date("2026-07-05T12:00:00Z"),
        criadoPor: "integracao@cg.pb.gov.br",
      },
      deps
    );

    const estorno = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idEstorno },
      include: { partidas: { include: { conta: true } } },
    });
    expect(estorno.estornoDeId).toBe(idOriginal);

    // tipo invertido na mesma conta
    const invertido = new Map(
      estorno.partidas.map((p) => [p.conta.codigo, p.tipo])
    );
    expect(invertido.get("1.1.1.1.1.00.00")).toBe("CREDITO");
    expect(invertido.get("1.1.2.2.1.00.00")).toBe("DEBITO");

    // INVARIANTE 2/3: o original NÃO foi tocado
    const depois = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idOriginal },
      include: { partidas: true },
    });
    expect(depois).toEqual(antes);

    // "está estornado?" é DERIVADO da relação
    const comEstornos = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: idOriginal },
      include: { estornos: { select: { id: true } } },
    });
    expect(comEstornos.estornos.map((e) => e.id)).toEqual([idEstorno]);
  });

  it("DUPLO ESTORNO: o índice único parcial do Postgres rejeita, mesmo driblando o adapter", async () => {
    const idOriginal = await registrarLancamento(LANCAMENTO, deps);
    await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2026NL000099",
        dataEstorno: new Date("2026-07-05T12:00:00Z"),
        criadoPor: "integracao@cg.pb.gov.br",
      },
      deps
    );

    // 1) barreira do adapter (count dentro da tx) — mensagem limpa
    await expect(
      estornarLancamento(
        {
          lancamentoId: idOriginal,
          numeroControleEstorno: "2026NL000100",
          dataEstorno: new Date("2026-07-06T12:00:00Z"),
          criadoPor: "integracao@cg.pb.gov.br",
        },
        deps
      )
    ).rejects.toThrow(/já foi estornado/);

    // 2) barreira do BANCO — driblando o adapter, INSERT direto. Sob concorrência
    //    o count da tx pode não ver o outro estorno; o índice único vê sempre.
    let erroDoPostgres: unknown;
    try {
      await prisma.lancamentoContabil.create({
        data: {
          numeroControle: "2026NL000101",
          dataTransacao: new Date("2026-07-07T12:00:00Z"),
          historico: "estorno clandestino",
          origemTipo: "ESTORNO",
          estornoDeId: idOriginal, // já estornado!
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erroDoPostgres = e;
    }

    expect(erroDoPostgres).toBeDefined();
    const msg = String(erroDoPostgres);
    console.log("\n>>> ERRO REAL DO POSTGRES (duplo estorno):\n" + msg + "\n");
    expect(msg).toMatch(/uq_estorno_unico|Unique constraint/i);

    // só existem 2 lançamentos: o original e o único estorno legítimo
    expect(await prisma.lancamentoContabil.count()).toBe(2);
  });
});
