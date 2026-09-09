import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarPrismaClient } from "../m01-core-contabil/adapter-prisma.js";
import { registrarLancamento } from "../m01-core-contabil/servico.js";
import { criarM01Deps } from "../m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "./adapter-prisma.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { criarFicha, criarReceitaPrevista } from "./servico.js";
import type { CriarFichaInput } from "./dominio.js";
import {
  CLASSIFICACAO_VALIDA,
  SEED_ACOES,
  SEED_COS,
  SEED_FONTES,
  SEED_FUNCOES,
  SEED_NATUREZAS_DESPESA,
  SEED_NATUREZAS_RECEITA,
  SEED_ORGAOS,
  SEED_PROGRAMAS,
  SEED_SUBFUNCOES,
  SEED_UNIDADES,
} from "./seed-minimo.js";

/**
 * TESTE DE INTEGRAÇÃO do M02 — Postgres real.
 *
 * Prova o que fake nenhum prova:
 * - a unicidade `uq_ficha_sagres` (integridade é do banco);
 * - a ADITIVIDADE: `PartidaContabil.fichaId` liga a ficha SEM quebrar o M01 —
 *   uma partida sem ficha continua perfeitamente válida.
 *
 * O PrismaClient vem de `criarPrismaClient()` do M01 (Prisma 7 exige driver
 * adapter). Sem banco, o describe inteiro é PULADO.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

describe("M02 — integração contra Postgres real", () => {
  const deps = criarM02Deps(prisma);
  const depsM01 = criarM01Deps(prisma);

  /** Contas PCASP do M01 — só o mínimo para um lançamento balanceado. */
  const CONTAS = [
    { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
    { id: "c-desp", codigo: "3.3.9.0.3.90.00", nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  ];

  beforeEach(async () => {
    await limparBanco(prisma);
    // ⚠️ A dotação da LOA agora LANÇA no razão (fail-closed sem roteiro). Estes testes
    // criam a ficha pelo ADAPTER do M02 — não pelo helper — logo semeiam o roteiro aqui.
    await semearRoteiroOrcamentario(prisma);

    // M08: ficha só nasce em exercício ABERTO. Um teste cria ficha em 2027.
    await prisma.exercicio.createMany({
      data: [
        { ano: 2026, criadoPor: "TESTE" },
        { ano: 2027, criadoPor: "TESTE" },
      ],
    });

    // SEED MÍNIMO — não é o oficial (vem na sessão M02a-seed).
    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.orgao.createMany({ data: [...SEED_ORGAOS] });
    await prisma.unidadeOrcamentaria.createMany({ data: [...SEED_UNIDADES] });
    await prisma.funcao.createMany({ data: [...SEED_FUNCOES] });
    await prisma.subfuncao.createMany({ data: [...SEED_SUBFUNCOES] });
    await prisma.programa.createMany({ data: [...SEED_PROGRAMAS] });
    await prisma.acao.createMany({ data: [...SEED_ACOES] });
    await prisma.naturezaDespesa.createMany({ data: [...SEED_NATUREZAS_DESPESA] });
    await prisma.fonteRecurso.createMany({ data: [...SEED_FONTES] });
    await prisma.codigoAcompanhamento.createMany({ data: [...SEED_COS] });
    await prisma.naturezaReceita.createMany({ data: [...SEED_NATUREZAS_RECEITA] });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const FICHA: CriarFichaInput = {
    exercicio: 2026,
    numero: 1,
    classificacao: { ...CLASSIFICACAO_VALIDA },
    exercicioFonte: 1,
    valorDotado: "1500000.00",
    criadoPor: "m02@cg.pb.gov.br",
  };

  it("cria ficha válida com valorDotado DECIMAL(18,2) intacto", async () => {
    const id = await criarFicha(FICHA, deps);

    const gravada = await prisma.fichaOrcamentaria.findUniqueOrThrow({
      where: { id },
      include: { orgao: true, unidadeOrc: true, naturezaDespesa: true, fonte: true, co: true },
    });

    expect(gravada.exercicio).toBe(2026);
    expect(gravada.numero).toBe(1);
    expect(gravada.orgao.codigo).toBe("01");
    expect(gravada.unidadeOrc.codigo).toBe("01001");
    expect(gravada.naturezaDespesa.codigoCompleto).toBe("339039");
    expect(gravada.fonte.codigo).toBe("500");
    expect(gravada.co?.codigo).toBe("0001");
    // o dinheiro sobreviveu à ida e volta pelo Postgres
    expect(gravada.valorDotado.toFixed(2)).toBe("1500000.00");
  });

  it("REJEITA duas fichas com a MESMA classificação no mesmo exercício (uq_ficha_sagres)", async () => {
    await criarFicha(FICHA, deps);

    // número DIFERENTE, classificação IDÊNTICA — tem de bater em uq_ficha_sagres,
    // não na unique de (exercicio, numero).
    let erro: unknown;
    try {
      await criarFicha({ ...FICHA, numero: 2 }, deps);
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    expect(String(erro)).toMatch(/Ficha duplicada/);
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (uq_ficha_sagres):\n" +
        String((erro as { cause?: unknown }).cause) +
        "\n"
    );
    expect(String((erro as { cause?: unknown }).cause)).toMatch(
      /uq_ficha_sagres|Unique constraint/i
    );

    expect(await prisma.fichaOrcamentaria.count()).toBe(1);
  });

  it("REJEITA duas fichas com o mesmo (exercicio, numero)", async () => {
    await criarFicha(FICHA, deps);

    await expect(
      // mesma numeração, classificação diferente (outra fonte)
      criarFicha(
        {
          ...FICHA,
          classificacao: { ...CLASSIFICACAO_VALIDA, fonte: "540" },
        },
        deps
      )
    ).rejects.toThrow(/Ficha duplicada/);

    expect(await prisma.fichaOrcamentaria.count()).toBe(1);
  });

  it("aceita mesma classificação em EXERCÍCIOS diferentes", async () => {
    await criarFicha(FICHA, deps);
    await criarFicha({ ...FICHA, exercicio: 2027, numero: 1 }, deps);

    expect(await prisma.fichaOrcamentaria.count()).toBe(2);
  });

  it("cria receita prevista válida", async () => {
    const id = await criarReceitaPrevista(
      {
        exercicio: 2026,
        naturezaReceita: "11121101",
        fonte: "500",
        exercicioFonte: 1,
        tipoReceita: "ORCAMENTARIA",
        valorPrevisto: "8000000.00",
        criadoPor: "m02@cg.pb.gov.br",
      },
      deps
    );

    const r = await prisma.receitaPrevista.findUniqueOrThrow({
      where: { id },
      include: { naturezaReceita: true, fonte: true },
    });
    expect(r.naturezaReceita.codigo).toBe("11121101");
    expect(r.fonte.codigo).toBe("500");
    expect(r.valorPrevisto.toFixed(2)).toBe("8000000.00");
  });

  it("ADITIVIDADE: partida SEM ficha continua válida; partida COM ficha vincula", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    // (a) o M01, INTOCADO, segue gravando partidas sem ficha
    const idSemFicha = await registrarLancamento(
      {
        numeroControle: "2026NL000001",
        dataTransacao: new Date("2026-07-01T12:00:00Z"),
        historico: "Lançamento sem dimensão orçamentária",
        origemTipo: "ARRECADACAO",
        criadoPor: "m02@cg.pb.gov.br",
        partidas: [
          { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
          { conta: "3.3.9.0.3.90.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
        ],
      },
      depsM01
    );

    const semFicha = await prisma.partidaContabil.findMany({
      where: { lancamentoId: idSemFicha },
    });
    expect(semFicha).toHaveLength(2);
    expect(semFicha.every((p) => p.fichaId === null)).toBe(true);

    // (b) a coluna aditiva vincula de fato a ficha (FK viva)
    const comFicha = await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "2026NE000001",
        dataTransacao: new Date("2026-07-02T12:00:00Z"),
        historico: "Empenho com dimensão orçamentária",
        origemTipo: "EMPENHO",
        criadoPor: "m02@cg.pb.gov.br",
        partidas: {
          create: [
            { contaId: "c-desp", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "500.00", fichaId },
            { contaId: "c-caixa", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "500.00" },
          ],
        },
      },
      select: { id: true },
    });

    const partidas = await prisma.partidaContabil.findMany({
      where: { lancamentoId: comFicha.id },
      include: { ficha: { include: { fonte: true } } },
    });

    const comDimensao = partidas.find((p) => p.fichaId !== null);
    const semDimensao = partidas.find((p) => p.fichaId === null);

    expect(comDimensao?.ficha?.numero).toBe(1);
    expect(comDimensao?.ficha?.fonte.codigo).toBe("500");
    // as duas convivem no MESMO lançamento — a coluna é opcional de verdade
    expect(semDimensao).toBeDefined();
    expect(semDimensao?.ficha ?? null).toBeNull();
  });

  // --- de-para TipoReceita (MCASP) <-> código literal do SAGRES -------------
  // Os `codigoSagres` abaixo são PLACEHOLDERS: os valores oficiais da tabela
  // SAGRES 5.23 ("TipoReceitaLancada") ainda não foram obtidos. O que se testa
  // aqui é a ESTRUTURA (unicidade dos dois lados do de-para), não os valores.

  it("de-para: mapeia tipo conceitual -> código SAGRES", async () => {
    await prisma.tipoReceitaSagres.create({
      data: {
        tipoInterno: "ORCAMENTARIA",
        codigoSagres: "PLACEHOLDER-1",
        descricao: "Receita orçamentária (placeholder — confirmar SAGRES 5.23)",
      },
    });

    const lido = await prisma.tipoReceitaSagres.findUniqueOrThrow({
      where: { tipoInterno: "ORCAMENTARIA" },
    });
    expect(lido.codigoSagres).toBe("PLACEHOLDER-1");
  });

  it("de-para: REJEITA dois códigos SAGRES para o MESMO tipo interno", async () => {
    await prisma.tipoReceitaSagres.create({
      data: { tipoInterno: "ORCAMENTARIA", codigoSagres: "PLACEHOLDER-1", descricao: "a" },
    });

    await expect(
      prisma.tipoReceitaSagres.create({
        data: { tipoInterno: "ORCAMENTARIA", codigoSagres: "PLACEHOLDER-9", descricao: "b" },
      })
    ).rejects.toThrow(/Unique constraint/i);

    expect(await prisma.tipoReceitaSagres.count()).toBe(1);
  });

  it("de-para: REJEITA o MESMO código SAGRES para dois tipos internos", async () => {
    await prisma.tipoReceitaSagres.create({
      data: { tipoInterno: "ORCAMENTARIA", codigoSagres: "PLACEHOLDER-1", descricao: "a" },
    });

    await expect(
      prisma.tipoReceitaSagres.create({
        data: { tipoInterno: "DEDUCAO", codigoSagres: "PLACEHOLDER-1", descricao: "b" },
      })
    ).rejects.toThrow(/Unique constraint/i);

    expect(await prisma.tipoReceitaSagres.count()).toBe(1);
  });

  it("a ReceitaPrevista NÃO depende do de-para: grava sem nenhum mapeamento existir", async () => {
    // O desacoplamento em ação — uma renumeração do TCE não toca a base de
    // receitas, só as 3 linhas do de-para.
    expect(await prisma.tipoReceitaSagres.count()).toBe(0);

    const id = await criarReceitaPrevista(
      {
        exercicio: 2026,
        naturezaReceita: "11121101",
        fonte: "500",
        tipoReceita: "ORCAMENTARIA",
        valorPrevisto: "1000.00",
        criadoPor: "m02@cg.pb.gov.br",
      },
      deps
    );

    const r = await prisma.receitaPrevista.findUniqueOrThrow({ where: { id } });
    expect(r.tipoReceita).toBe("ORCAMENTARIA");
  });

  it("FK viva: fichaId inexistente é rejeitado pelo banco", async () => {
    await expect(
      prisma.lancamentoContabil.create({
        data: {
          numeroControle: "2026NE000002",
          dataTransacao: new Date("2026-07-02T12:00:00Z"),
          historico: "ficha fantasma",
          origemTipo: "EMPENHO",
          criadoPor: "m02@cg.pb.gov.br",
          partidas: {
            create: [
              { contaId: "c-desp", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1.00", fichaId: "ficha-que-nao-existe" },
              { contaId: "c-caixa", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1.00" },
            ],
          },
        },
      })
    ).rejects.toThrow();
  });
});
