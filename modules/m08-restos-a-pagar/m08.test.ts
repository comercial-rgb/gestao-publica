import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { criarM02Deps } from "../m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../m02-planejamento/servico.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../m03-creditos/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar, reservarDotacao } from "../m05-despesa/servico.js";
import {
  abrirExercicio,
  encerrarExercicio,
  exercicioEstaEncerrado,
} from "./exercicio.js";
import type { M02Deps } from "../m02-planejamento/ports.js";
import type { M03Deps } from "../m03-creditos/ports.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M08 bloco 1 — exercício, encerramento e os guards fail-closed.
 *
 * "Está encerrado?" é DERIVADO da existência de um EncerramentoExercicio. Não há
 * coluna `status` — ela exigiria UPDATE, e o encerramento é um FATO.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m08@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});

const CLASSIFICACAO = {
  orgao: "01", unidadeOrc: "01001", funcao: "12", subfuncao: "361",
  programa: "0012", acao: "2001", naturezaDespesa: "339039", fonte: "500",
};

/** Semeia a classificação. NÃO abre exercício — cada teste decide. */
async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  // A dotação da LOA lança no razão (fail-closed) — esta fixture cria a ficha pelo
  // ADAPTER do M02, logo semeia o roteiro aqui. DEPOIS das contas do teste: o seed faz
  // `upsert` por CÓDIGO, e o id de quem chegou primeiro é preservado.
  await semearRoteiroOrcamentario(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
}

/** Cria a ficha 2026 pelo SERVIÇO do M02 (passando pelo guard). */
async function fichaDe2026(deps: M02Deps): Promise<string> {
  return criarFicha(
    {
      exercicio: 2026, numero: 1, classificacao: CLASSIFICACAO,
      exercicioFonte: 1, valorDotado: "10000.00", criadoPor: "m08@cg.pb.gov.br",
    },
    deps
  );
}

describe("M08 — exercício e encerramento", () => {
  let deps02: M02Deps;

  beforeEach(async () => {
    deps02 = criarM02Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("exercício aberto: não está encerrado (DERIVADO, não coluna)", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    expect(await exercicioEstaEncerrado(prisma, 2026)).toBe(false);

    // e não existe coluna `status` — o estado sai da relação
    const e = await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      include: { encerramento: true },
    });
    expect(e.encerramento).toBeNull();
  });

  it("encerrar: o FATO passa a existir e o estado vira encerrado", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    expect(await exercicioEstaEncerrado(prisma, 2026)).toBe(true);
    const enc = await prisma.encerramentoExercicio.findFirst();
    expect(enc?.encerradoPor).toBe(POR);
  });

  it("REJEITA encerrar duas vezes (barreira do serviço)", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR })
    ).rejects.toThrow(/já está encerrado/);

    expect(await prisma.encerramentoExercicio.count()).toBe(1);
  });

  it("DUPLO ENCERRAMENTO: o UNIQUE do banco rejeita mesmo driblando o serviço", async () => {
    const id = await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    let erro: unknown;
    try {
      await prisma.encerramentoExercicio.create({
        data: { exercicioId: id, encerradoPor: "atacante" },
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeDefined();
    console.log("\n>>> ERRO REAL DO POSTGRES (duplo encerramento):\n" + String(erro) + "\n");
    expect(String(erro)).toMatch(/Unique constraint/i);
    expect(await prisma.encerramentoExercicio.count()).toBe(1);
  });

  it("REJEITA encerrar exercício inexistente", async () => {
    await expect(
      encerrarExercicio(prisma, { ano: 2099, encerradoPor: POR })
    ).rejects.toThrow(/não existe/);
  });
});

describe("M08 — guards fail-closed", () => {
  let deps02: M02Deps;
  let deps03: M03Deps;
  let deps05: M05Deps;

  beforeEach(async () => {
    deps02 = criarM02Deps(prisma);
    deps03 = criarM03Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("M02: REJEITA criar ficha em exercício INEXISTENTE — nada grava", async () => {
    await expect(fichaDe2026(deps02)).rejects.toThrow(
      /Exercício 2026 não existe.*um exercício não nasce de um empenho/s
    );

    // prova por SELECT: nada foi gravado
    expect(await prisma.fichaOrcamentaria.count()).toBe(0);
    expect(await prisma.movimentoDotacao.count()).toBe(0);
  });

  it("M02: REJEITA criar ficha em exercício ENCERRADO — nada grava", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    await expect(fichaDe2026(deps02)).rejects.toThrow(
      /Exercício 2026 está ENCERRADO.*vira RESTOS A PAGAR/s
    );

    expect(await prisma.fichaOrcamentaria.count()).toBe(0);
    expect(await prisma.movimentoDotacao.count()).toBe(0);
  });

  it("M05: REJEITA reservar e empenhar em exercício ENCERRADO — nada grava", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    const fichaId = await fichaDe2026(deps02);
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      reservarDotacao(
        { fichaId, valor: "100.00", historico: "r", criadoPor: POR },
        deps05
      )
    ).rejects.toThrow(/Exercício 2026 está ENCERRADO/);

    await expect(
      empenhar(
        {
          fichaId, numero: "NE1", tipo: "ORDINARIO", valor: "100.00",
          data: new Date("2026-06-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
          historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: POR,
        },
        R_EMPENHO,
        deps05
      )
    ).rejects.toThrow(/Exercício 2026 está ENCERRADO/);

    // prova por SELECT: nem reserva, nem empenho, nem lançamento, nem movimento
    // de saldo além da DOTACAO_INICIAL com que a ficha nasceu.
    expect(await prisma.reservaDotacao.count()).toBe(0);
    expect(await prisma.empenho.count()).toBe(0);
    // ⚠️ A DOTAÇÃO DA LOA AGORA LANÇA (este bloco). O que se prova aqui é que a
    // operação REJEITADA não gravou NADA — logo a contagem é dos lançamentos DELA,
    // não do total: a perna da dotação é um fato legítimo, e ela continua lá.
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: { not: "LOA" } } })
    ).toBe(0);
    const movs = await prisma.movimentoDotacao.findMany();
    expect(movs).toHaveLength(1);
    expect(movs[0]!.tipo).toBe("DOTACAO_INICIAL");
  });

  it("M03: REJEITA crédito adicional em exercício ENCERRADO — nada grava", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    const fichaId = await fichaDe2026(deps02);

    const leiId = await criarLei(
      {
        numero: "L1", ano: 2026, tipoCredito: "SUPLEMENTAR",
        valorAutorizado: "5000.00", dataPublicacao: new Date("2026-01-15T12:00:00Z"),
        criadoPor: POR,
      },
      deps03
    );
    const decretoId = await criarDecreto(
      {
        leiId, numero: "D1", ano: 2026, data: new Date("2026-03-01T12:00:00Z"),
        origemRecurso: "SUPERAVIT_FINANCEIRO", criadoPor: POR,
      },
      deps03
    );
    await prisma.disponibilidadeRecursoNovo.create({
      data: {
        exercicio: 2026, fonteId: FONTE, origem: "SUPERAVIT_FINANCEIRO",
        valor: "5000.00", descricao: "superávit", criadoPor: POR,
      },
    });

    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    await expect(
      executarCredito(
        {
          decretoId,
          itens: [{ fichaId, tipo: "SUPLEMENTACAO", valor: "1000.00", fonteId: FONTE }],
          criadoPor: POR,
        },
        deps03
      )
    ).rejects.toThrow(/Exercício 2026 está ENCERRADO/);

    // prova por SELECT: suplementar um exercício fechado seria reabrir o
    // orçamento de um ano já prestado ao TCE.
    expect(await prisma.itemCredito.count()).toBe(0);
    expect(
      await prisma.movimentoDotacao.count({ where: { tipo: "CREDITO_ADICIONAL" } })
    ).toBe(0);
  });

  it("exercício ABERTO: tudo funciona normalmente", async () => {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
    const fichaId = await fichaDe2026(deps02);

    await reservarDotacao(
      { fichaId, valor: "100.00", historico: "r", criadoPor: POR },
      deps05
    );
    await empenhar(
      {
        fichaId, numero: "NE1", tipo: "ORDINARIO", valor: "500.00",
        data: new Date("2026-06-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps05
    );

    expect(await prisma.reservaDotacao.count()).toBe(1);
    expect(await prisma.empenho.count()).toBe(1);
  });
});
