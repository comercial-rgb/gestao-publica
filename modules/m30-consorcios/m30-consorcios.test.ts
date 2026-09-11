import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  cadastrarConsorcio,
  estornarMovimentoConsorcio,
  registrarContratoDeRateio,
  registrarDevolucaoDeConsorcio,
  repassarAoConsorcio,
} from "./servico.js";

/**
 * M30 — CONSÓRCIOS PÚBLICOS (Lei 11.107/2005, art. 8º). REGIME: **PROFUNDIDADE**.
 *
 * ═══ AS CONTAS À MÃO ═══
 *   rateio 2026 de 120.000 · repasses de 60.000 e 60.000 ⟹ saldo 0
 *   aditivo de 30.000 ⟹ teto 150.000, saldo 30.000
 *   repasse de 40.000 ⟹ RECUSADO (disponível 30.000)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const C_A = "8.2.1.1.1.00.00";
const C_B = "8.2.1.2.1.00.00";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-a", codigo: C_A, nome: "Rateio de consórcio a honrar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-b", codigo: C_B, nome: "Rateio de consórcio honrado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  await prisma.roteiroConsorcio.createMany({
    data: (["REPASSE", "DEVOLUCAO"] as const).map((tipo) => ({
      tipo,
      contaDebitoId: "c-a",
      contaCreditoId: "c-b",
      historicoPadrao: `Consórcio — ${tipo}`,
    })),
  });
}

async function consorcioDeTeste(): Promise<string> {
  const { consorcioId } = await cadastrarConsorcio(prisma, {
    identificador: "CIS-2026-001",
    denominacao: "Consórcio Intermunicipal de Saúde do Planalto Serrano",
    cnpj: "12345678000188",
    protocoloDeIntencoes: "Protocolo de intenções de 12/03/2019",
    leiRatificadora: "Lei Municipal 7.200/2019",
    areaDeAtuacao: "Saúde",
    fonteRecursoId: FONTE,
    contaContabilId: "c-a",
    criadoPor: POR,
  });
  return consorcioId;
}

const repasse = (consorcioId: string, valor: string, dia: string, exercicio = 2026) => ({
  consorcioId,
  valor,
  exercicio,
  diaMovimento: dia,
  competencia: dia.slice(0, 7),
  motivo: "Repasse mensal da cota do rateio ao consórcio de saúde.",
  criadoPor: POR,
});

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("M30 — o teto do contrato de rateio", () => {
  it("t1: SEM contrato de rateio, o repasse é RECUSADO citando o art. 8º", async () => {
    const consorcioId = await consorcioDeTeste();
    await expect(
      repassarAoConsorcio(prisma, repasse(consorcioId, "10000.00", "2026-02-10"))
    ).rejects.toThrow(/SEM CONTRATO DE RATEIO[\s\S]*art\. 8º[\s\S]*Nada foi gravado/);
    expect(await prisma.movimentoConsorcio.count({ where: { consorcioId } })).toBe(0);
  });

  it("t2: OURO — dois repasses esgotam a cota, e o terceiro é recusado pelo teto", async () => {
    const consorcioId = await consorcioDeTeste();
    const { tetoDoExercicio } = await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    expect(tetoDoExercicio).toBe("120000.00");

    // N=2: é com DOIS repasses que a soma passa a decidir.
    await repassarAoConsorcio(prisma, repasse(consorcioId, "60000.00", "2026-02-10"));
    await repassarAoConsorcio(prisma, repasse(consorcioId, "60000.00", "2026-03-10"));

    await expect(
      repassarAoConsorcio(prisma, repasse(consorcioId, "1.00", "2026-04-10"))
    ).rejects.toThrow(/TETO DO RATEIO EXCEDIDO[\s\S]*disponível 0\.00[\s\S]*ADITIVO[\s\S]*Nada foi gravado/);
    expect(await prisma.movimentoConsorcio.count({ where: { consorcioId } })).toBe(2);
  });

  it("t3: o ADITIVO SOMA ao original e reabre a cota — não substitui", async () => {
    // ⚠️ ESTE TESTE DISTINGUE AS DUAS IMPLEMENTAÇÕES DO TETO. "O último vale" daria teto de
    // 30.000 sobre 120.000 já repassados, e o disponível ficaria NEGATIVO.
    const consorcioId = await consorcioDeTeste();
    const { rateioId } = await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    await repassarAoConsorcio(prisma, repasse(consorcioId, "120000.00", "2026-02-10"));

    const aditivo = await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "30000.00",
      diaAssinatura: "2026-06-15", aditivoDeId: rateioId, criadoPor: POR,
    });
    expect(aditivo.tetoDoExercicio).toBe("150000.00");

    const depois = await repassarAoConsorcio(prisma, repasse(consorcioId, "30000.00", "2026-07-10"));
    expect(depois.movimentoId).toBeTruthy();
  });

  it("t4: DOIS contratos ORIGINAIS do mesmo exercício são recusados PELO BANCO", async () => {
    // ⚠️ A TRAVA É O ÍNDICE PARCIAL (`uq_rateio_original_por_exercicio.sql`), e não um guard
    // no código. Dois "originais" de 2026 dobrariam o teto sem que nada acusasse: a soma
    // daria certo e o contrato assinado diria outra coisa.
    const consorcioId = await consorcioDeTeste();
    await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    await expect(
      registrarContratoDeRateio(prisma, {
        consorcioId, exercicio: 2026, valorDoEnte: "80000.00",
        diaAssinatura: "2026-02-15", criadoPor: POR,
      })
    ).rejects.toThrow();
    expect(
      await prisma.contratoDeRateio.count({ where: { consorcioId, exercicio: 2026 } })
    ).toBe(1);
  });

  it("t5: o aditivo de OUTRO EXERCÍCIO é recusado — o rateio é anual", async () => {
    const consorcioId = await consorcioDeTeste();
    const { rateioId } = await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });
    await expect(
      registrarContratoDeRateio(prisma, {
        consorcioId, exercicio: 2027, valorDoEnte: "10000.00",
        diaAssinatura: "2027-01-15", aditivoDeId: rateioId, criadoPor: POR,
      })
    ).rejects.toThrow(/é do exercício 2026[\s\S]*ANUAL[\s\S]*Nada foi gravado/);
  });

  it("t6: o EXERCÍCIO do movimento é explícito — repasse de 2026 pago em 2027 conta em 2026", async () => {
    // ⚠️ DERIVAR O EXERCÍCIO DA DATA COBRARIA CONTRA O RATEIO ERRADO. Um repasse feito em
    // janeiro de 2027 pode ser da cota de 2026 (restos a pagar) — e é o mesmo defeito que o
    // eixo de data civil achou na cota mensal do CMD.
    const consorcioId = await consorcioDeTeste();
    await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });

    await repassarAoConsorcio(prisma, {
      ...repasse(consorcioId, "120000.00", "2027-01-20"),
      exercicio: 2026,
    });
    // Não sobrou cota de 2026…
    await expect(
      repassarAoConsorcio(prisma, { ...repasse(consorcioId, "1.00", "2027-01-21"), exercicio: 2026 })
    ).rejects.toThrow(/TETO DO RATEIO EXCEDIDO/);
    // …e 2027, que não tem rateio nenhum, recusa por outro motivo.
    await expect(
      repassarAoConsorcio(prisma, { ...repasse(consorcioId, "1.00", "2027-01-21"), exercicio: 2027 })
    ).rejects.toThrow(/SEM CONTRATO DE RATEIO/);
  });

  it("t7: a DEVOLUÇÃO devolve cota, e o ESTORNO do repasse também — cada um por seu caminho", async () => {
    const consorcioId = await consorcioDeTeste();
    await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });
    const r1 = await repassarAoConsorcio(prisma, repasse(consorcioId, "120000.00", "2026-02-10"));

    await registrarDevolucaoDeConsorcio(prisma, {
      ...repasse(consorcioId, "20000.00", "2026-12-20"),
      motivo: "Devolução de saldo não aplicado, conforme prestação de contas anual.",
    });
    // 120.000 − 20.000 = 100.000 repassados ⟹ cabem mais 20.000.
    await repassarAoConsorcio(prisma, repasse(consorcioId, "20000.00", "2026-12-28"));

    await estornarMovimentoConsorcio(prisma, {
      movimentoId: r1.movimentoId, diaMovimento: "2026-12-29",
      motivo: "Ordem bancária do primeiro repasse devolvida pelo banco.", criadoPor: POR,
    });
    const total = await prisma.movimentoConsorcio.count({ where: { consorcioId } });
    expect(total).toBe(4);

    // ⚠️ O ESTORNO CARIMBA O EXERCÍCIO DO ORIGINAL. Carimbar o corrente devolveria cota de um
    // ano ao teto de outro.
    const estorno = await prisma.movimentoConsorcio.findFirstOrThrow({
      where: { estornoDeId: r1.movimentoId },
      select: { exercicio: true },
    });
    expect(estorno.exercicio).toBe(2026);
  });

  it("t8: AUTORIZAÇÃO NO SERVIDOR — sem a ação, o repasse é NEGADO e nada fica gravado", async () => {
    const consorcioId = await consorcioDeTeste();
    await registrarContratoDeRateio(prisma, {
      consorcioId, exercicio: 2026, valorDoEnte: "120000.00",
      diaAssinatura: "2026-01-15", criadoPor: POR,
    });

    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_CADASTRA",
        descricao: "Cadastra consórcio e NÃO repassa — a segregação do 6.4 exercitada.",
        criadoPor: "TESTE",
        permissoes: { create: [{ acao: "CADASTRAR_CONSORCIO", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: "so.cadastra@cg.pb.gov.br", nome: "Só cadastra", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" },
    });

    await expect(
      repassarAoConsorcio(prisma, {
        ...repasse(consorcioId, "1000.00", "2026-02-10"),
        criadoPor: "so.cadastra@cg.pb.gov.br",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);
    expect(await prisma.movimentoConsorcio.count({ where: { consorcioId } })).toBe(0);
  });
});
