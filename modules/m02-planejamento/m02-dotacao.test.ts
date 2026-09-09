import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  reconciliarFicha,
  reservarDotacao,
  saldosDaFicha,
} from "../m05-despesa/servico.js";
import { criarM02Deps } from "./adapter-prisma.js";
import { backfillDotacaoInicial } from "./backfill-dotacao-inicial.js";
import { criarFicha } from "./servico.js";
import { CLASSIFICACAO_VALIDA, SEED_ACOES, SEED_COS, SEED_FONTES, SEED_FUNCOES, SEED_NATUREZAS_DESPESA, SEED_ORGAOS, SEED_PROGRAMAS, SEED_SUBFUNCOES, SEED_UNIDADES } from "./seed-minimo.js";
import type { M02Deps } from "./ports.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * DOTAÇÃO INICIAL EAGER — a correção do bug "ficha intocada com saldo zero".
 *
 * Antes: a DOTACAO_INICIAL era semeada preguiçosamente, na 1ª operação de saldo.
 * Uma ficha nunca usada não tinha movimento nenhum e devolvia saldoAutorizado
 * = 0 — não o valorDotado da LOA. Nenhuma escrita era comprometida, mas qualquer
 * DEMONSTRATIVO mostrava zero. Num relatório que vai ao TCE, isso é erro de
 * conformidade.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

async function semearClassificacao(): Promise<void> {
  await limparBanco(prisma);
  // ⚠️ A dotação da LOA agora LANÇA no razão (fail-closed sem roteiro). Estes testes
  // criam a ficha pelo ADAPTER do M02 — não pelo helper — logo semeiam o roteiro aqui.
  await semearRoteiroOrcamentario(prisma);
  // M08: ficha só nasce em exercício ABERTO.
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.orgao.createMany({ data: [...SEED_ORGAOS] });
  await prisma.unidadeOrcamentaria.createMany({ data: [...SEED_UNIDADES] });
  await prisma.funcao.createMany({ data: [...SEED_FUNCOES] });
  await prisma.subfuncao.createMany({ data: [...SEED_SUBFUNCOES] });
  await prisma.programa.createMany({ data: [...SEED_PROGRAMAS] });
  await prisma.acao.createMany({ data: [...SEED_ACOES] });
  await prisma.naturezaDespesa.createMany({ data: [...SEED_NATUREZAS_DESPESA] });
  await prisma.fonteRecurso.createMany({ data: [...SEED_FONTES] });
  await prisma.codigoAcompanhamento.createMany({ data: [...SEED_COS] });
}

const FICHA = {
  exercicio: 2026,
  numero: 1,
  classificacao: { ...CLASSIFICACAO_VALIDA },
  exercicioFonte: 1 as const,
  valorDotado: "1500000.00",
  criadoPor: "m02@cg.pb.gov.br",
};

describe("M02 — dotação inicial EAGER", () => {
  let deps: M02Deps;
  let deps05: M05Deps;

  beforeEach(async () => {
    deps = criarM02Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semearClassificacao();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("O BUG: ficha recém-criada e NUNCA tocada já tem saldoAutorizado == valorDotado", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    // nenhuma reserva, nenhum empenho, nenhum crédito — a ficha só nasceu.
    const s = await saldosDaFicha(fichaId, deps05);
    expect(s.autorizado.toFixed(2)).toBe("1500000.00"); // antes: "0.00"
    expect(s.reservado.toFixed(2)).toBe("0.00");
    expect(s.empenhado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("1500000.00");
  });

  it("a COLUNA CACHE também nasce correta (o demonstrativo não mente)", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({
      where: { id: fichaId },
    });
    expect(f.saldoAutorizado.toFixed(2)).toBe("1500000.00");
    expect(f.saldoDisponivel.toFixed(2)).toBe("1500000.00");
    expect(f.saldoReservado.toFixed(2)).toBe("0.00");
    expect(f.saldoEmpenhado.toFixed(2)).toBe("0.00");
  });

  it("reconciliação de ficha recém-criada == [] (cache bate com o SUM desde o nascimento)", async () => {
    const fichaId = await criarFicha(FICHA, deps);
    expect(await reconciliarFicha(fichaId, deps05)).toEqual([]);
  });

  it("exatamente UMA DOTACAO_INICIAL, com valor == valorDotado", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    const movs = await prisma.movimentoDotacao.findMany({
      where: { fichaId },
    });
    expect(movs).toHaveLength(1);
    expect(movs[0]!.tipo).toBe("DOTACAO_INICIAL");
    expect(movs[0]!.valor.toFixed(2)).toBe("1500000.00");
    expect(movs[0]!.origemTipo).toBe("LOA");
  });

  it("IDEMPOTÊNCIA: o índice único parcial impede DOTACAO_INICIAL duplicada", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    // tentando inserir uma segunda à força — é a corrida que o `count()` na
    // transação NÃO fecha sob READ COMMITTED. O índice único vê sempre.
    let erro: unknown;
    try {
      await prisma.movimentoDotacao.create({
        data: {
          fichaId,
          tipo: "DOTACAO_INICIAL",
          valor: "1500000.00",
          origemTipo: "LOA",
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (DOTACAO_INICIAL duplicada):\n" + String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_dotacao_inicial_unica|Unique constraint/i);

    // e o saldo NÃO contou a dotação duas vezes
    const s = await saldosDaFicha(fichaId, deps05);
    expect(s.autorizado.toFixed(2)).toBe("1500000.00"); // não 3.000.000
  });

  it("valorDotado = 0 AINDA cria a DOTACAO_INICIAL (valor 0) — o invariante é 'exatamente 1'", async () => {
    const fichaId = await criarFicha({ ...FICHA, valorDotado: "0.00" }, deps);

    const movs = await prisma.movimentoDotacao.findMany({ where: { fichaId } });
    expect(movs).toHaveLength(1);
    expect(movs[0]!.tipo).toBe("DOTACAO_INICIAL");
    expect(movs[0]!.valor.toFixed(2)).toBe("0.00");

    const s = await saldosDaFicha(fichaId, deps05);
    expect(s.autorizado.toFixed(2)).toBe("0.00");
    expect(await reconciliarFicha(fichaId, deps05)).toEqual([]);
  });

  it("os OUTROS tipos de movimento podem repetir na mesma ficha (índice é PARCIAL)", async () => {
    const fichaId = await criarFicha(FICHA, deps);

    await prisma.movimentoDotacao.createMany({
      data: [
        { fichaId, tipo: "RESERVA", valor: "100.00", origemTipo: "T", criadoPor: "t" },
        { fichaId, tipo: "RESERVA", valor: "200.00", origemTipo: "T", criadoPor: "t" },
      ],
    });

    const s = await saldosDaFicha(fichaId, deps05);
    expect(s.reservado.toFixed(2)).toBe("300.00");
  });
});

describe("M02 — backfill da dotação inicial", () => {
  beforeEach(async () => {
    await semearClassificacao();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Cria uma ficha "antiga": direto pelo Prisma, SEM a DOTACAO_INICIAL. */
  async function fichaAntiga(numero: number, valor: string): Promise<string> {
    const f = await prisma.fichaOrcamentaria.create({
      data: {
        exercicio: 2026,
        numero,
        orgaoId: "org-01",
        unidadeOrcId: "uo-01",
        funcaoId: "fun-12",
        subfuncaoId: numero === 1 ? "sub-361" : "sub-362",
        programaId: "prg-0012",
        acaoId: "aca-2001",
        naturezaDespesaId: "nd-339039",
        fonteId: "fnt-500",
        exercicioFonte: 1,
        valorDotado: valor,
      },
      select: { id: true },
    });
    return f.id;
  }

  it("ficha antiga SEM movimento ganha DOTACAO_INICIAL; o cache é corrigido", async () => {
    const a = await fichaAntiga(1, "10000.00");
    const b = await fichaAntiga(2, "5000.00");
    const deps05 = criarM05Deps(prisma);

    // o bug, reproduzido: cache e SUM ambos zerados
    expect((await saldosDaFicha(a, deps05)).autorizado.toFixed(2)).toBe("0.00");
    const antesA = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: a } });
    expect(antesA.saldoAutorizado.toFixed(2)).toBe("0.00");

    const r = await backfillDotacaoInicial(prisma);
    expect(r.fichas).toBe(2);
    expect(r.antes).toBe(0);
    expect(r.depois).toBe(2);
    expect(r.criadas).toBe(2);

    // consertado nas duas pontas: SUM e cache
    expect((await saldosDaFicha(a, deps05)).autorizado.toFixed(2)).toBe("10000.00");
    expect((await saldosDaFicha(b, deps05)).autorizado.toFixed(2)).toBe("5000.00");
    const depoisA = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: a } });
    expect(depoisA.saldoAutorizado.toFixed(2)).toBe("10000.00");
    expect(depoisA.saldoDisponivel.toFixed(2)).toBe("10000.00");

    expect(await reconciliarFicha(a, deps05)).toEqual([]);
    expect(await reconciliarFicha(b, deps05)).toEqual([]);
  });

  it("FAIL-CLOSED: operar numa ficha ÓRFÃ (sem dotação) é REJEITADO", async () => {
    const orfa = await fichaAntiga(1, "10000.00");
    const deps05 = criarM05Deps(prisma);

    // `garantirDotacaoInicial` já não cria silenciosamente: ele LANÇA.
    // Antes, esta reserva "consertava" a ficha em silêncio e ninguém via o
    // problema — o saldo tinha ficado zero em todo relatório até aqui.
    await expect(
      reservarDotacao(
        { fichaId: orfa, valor: "100.00", historico: "r", criadoPor: "t" },
        deps05
      )
    ).rejects.toThrow(/não tem DOTACAO_INICIAL.*rode o backfill/s);

    expect(await prisma.reservaDotacao.count()).toBe(0);

    // depois do backfill, a MESMA reserva passa
    await backfillDotacaoInicial(prisma);
    await reservarDotacao(
      { fichaId: orfa, valor: "100.00", historico: "r", criadoPor: "t" },
      deps05
    );
    const s = await saldosDaFicha(orfa, deps05);
    expect(s.autorizado.toFixed(2)).toBe("10000.00");
    expect(s.disponivel.toFixed(2)).toBe("9900.00");
    expect(await reconciliarFicha(orfa, deps05)).toEqual([]);
  });

  it("IDEMPOTENTE: rodar 2x não duplica nada", async () => {
    await fichaAntiga(1, "10000.00");
    await fichaAntiga(2, "5000.00");

    const primeira = await backfillDotacaoInicial(prisma);
    expect(primeira.criadas).toBe(2);

    const segunda = await backfillDotacaoInicial(prisma);
    expect(segunda.criadas).toBe(0);
    expect(segunda.depois).toBe(2);

    const terceira = await backfillDotacaoInicial(prisma);
    expect(terceira.criadas).toBe(0);

    expect(
      await prisma.movimentoDotacao.count({ where: { tipo: "DOTACAO_INICIAL" } })
    ).toBe(2);
  });

  it("não toca fichas que JÁ têm DOTACAO_INICIAL (mistura antiga + nova)", async () => {
    const deps = criarM02Deps(prisma);
    // uma ficha NOVA (nasce com dotação) e uma ANTIGA (sem).
    // A antiga usa numero 2 -> subfunção 362, senão bate no uq_ficha_sagres com
    // a classificação da nova (que usa a 361).
    const nova = await criarFicha({ ...FICHA, numero: 9 }, deps);
    await fichaAntiga(2, "10000.00");

    const r = await backfillDotacaoInicial(prisma);
    expect(r.fichas).toBe(2);
    expect(r.antes).toBe(1); // só a nova tinha
    expect(r.criadas).toBe(1); // só a antiga foi tocada

    const movsNova = await prisma.movimentoDotacao.findMany({
      where: { fichaId: nova, tipo: "DOTACAO_INICIAL" },
    });
    expect(movsNova).toHaveLength(1);
    expect(movsNova[0]!.criadoPor).toBe("LOA"); // NÃO foi reescrito pelo BACKFILL
  });
});
