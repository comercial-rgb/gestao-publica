import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { roteiroArrecadacao } from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { diagnosticoPreEnvio, executarVerificacoes } from "./consistencia.js";

/**
 * M12 — RELATÓRIO DE CONSISTÊNCIA (TR 5.128–5.131 · 7.27). A tríade é a alma: OK / DIVERGE / SEM_DADO.
 *
 * ═══ O CENÁRIO LIMPO ═══ uma arrecadação de 100.000 (D caixa / C VPA) — um lançamento DOBRADO:
 * o balancete fecha, o balanço patrimonial fecha (ativo == PL), a DVP bate com o balanço.
 *
 * ═══ A DIVERGÊNCIA PLANTADA ═══ uma partida CRUA de débito sem crédito (bypass do `validarLancamento`)
 * — o balancete deixa de fechar, e o motor mostra os DOIS lados e a diferença.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const CORTE = new Date(Date.UTC(2026, 5, 30, 23, 59, 59)); // 30/06/2026
const R_ARR = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11130111", descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: "fnt-500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "T" } });
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "100000.00", dataArrecadacao: new Date("2026-06-15T12:00:00Z"), numeroReceita: "RC-1", criadoPor: POR },
    R_ARR,
    criarM04Deps(prisma)
  );
}

/** ⚠️ CORROMPE o razão: uma partida de débito SEM crédito (bypass do guard) — o balancete não fecha. */
async function plantarDivergencia(): Promise<void> {
  const caixa = await prisma.contaPcasp.findFirstOrThrow({ where: { codigo: "1.1.1.1.1.00.00" }, select: { id: true } });
  const l = await prisma.lancamentoContabil.create({
    data: { numeroControle: "CORROMPIDO-1", dataTransacao: new Date("2026-06-20T12:00:00Z"), historico: "partida órfã (plantada)", origemTipo: "TESTE", criadoPor: POR },
    select: { id: true },
  });
  await prisma.partidaContabil.create({
    data: { lancamentoId: l.id, contaId: caixa.id, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "777.00" },
  });
}

const acha = (vs: readonly Awaited<ReturnType<typeof executarVerificacoes>>[number][], chave: string) => vs.find((v) => v.chave === chave)!;

describe("M12 — Relatório de Consistência", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 (limpa → OK): o balancete fecha, e os dois lados são iguais", async () => {
    const vs = await executarVerificacoes(prisma, { exercicio: 2026, corte: CORTE, escopo: "MENSAL" });
    const b = acha(vs, "BALANCETE_FECHA");
    expect(b.resultado).toBe("OK");
    expect(b.esquerda).toBe(b.direita); // devedor == credor
    expect(b.diferenca).toBe("0.00");
    expect(acha(vs, "BALANCETE_MOVIMENTO").resultado).toBe("OK");
  });

  it("t2 (plantada → DIVERGE): a partida órfã aparece com os DOIS lados e a diferença", async () => {
    await plantarDivergencia();
    const vs = await executarVerificacoes(prisma, { exercicio: 2026, corte: CORTE, escopo: "MENSAL" });
    const b = acha(vs, "BALANCETE_FECHA");
    expect(b.resultado).toBe("DIVERGE");
    // Os dois lados diferem, e a diferença é EXATAMENTE a partida plantada (777).
    expect(b.esquerda).not.toBe(b.direita);
    expect(Math.abs(Number.parseFloat(b.diferenca))).toBe(777);
  });

  it("t3 (planejamento → agora visita o motor da LOA, 7.17): equilíbrio presente; base sem de-para = SEM_DADO", async () => {
    // Sem ReceitaPrevista nem fichas, o equilíbrio é 0==0 (OK trivial); o que importa aqui é que o
    // escopo DEIXOU de ser um SEM_DADO-total e passou a trazer as verificações da LOA.
    const vs = await executarVerificacoes(prisma, { exercicio: 2026, corte: CORTE, escopo: "PLANEJAMENTO" });
    expect(acha(vs, "LOA_EQUILIBRIO")).toBeDefined();
    expect(acha(vs, "LOA_POR_FONTE")).toBeDefined();
    // A base de impostos não está semeada → o MDE é SEM_DADO (nunca projeta sobre base inexistente).
    const mde = acha(vs, "LOA_MDE_25");
    expect(mde.resultado).toBe("SEM_DADO");
    expect(mde.detalhe).toContain("SEM-DEPARA");
  });

  it("t4 (anual, sem cadastro de linhas → SEM_DADO, NÃO DIVERGE): a falta de cadastro não é erro", async () => {
    // ⚠️ A fixture não semeia o cadastro de linhas do balanço (parametrização do ente). O dono
    // estoura com "CONTA ÓRFÃ" — e o motor traduz isso como SEM_DADO (cadastro ausente), não como
    // uma divergência de números. É a tríade fazendo seu trabalho: um verde falso seria pior.
    const vs = await executarVerificacoes(prisma, { exercicio: 2026, corte: CORTE, escopo: "ANUAL" });
    const bp = acha(vs, "BALANCO_PATRIMONIAL_EQUACAO");
    expect(bp.resultado).toBe("SEM_DADO");
    expect(bp.detalhe).toMatch(/ÓRFÃ|órf|mapeie/i);
    // Nenhum dos anuais vira DIVERGE por falta de cadastro.
    expect(vs.some((v) => v.resultado === "DIVERGE")).toBe(false);
  });

  it("t5 (7.27 pré-envio): sem divergência = pronto (SEM_DADO não trava); divergência plantada = NÃO pronto", async () => {
    const limpo = await diagnosticoPreEnvio(prisma, { exercicio: 2026, corte: CORTE });
    // ⚠️ SEM_DADO (planejamento + balanço sem cadastro) NÃO trava — falta cadastro, não há erro de número.
    expect(limpo.prontoParaEnvio).toBe(true);
    expect(limpo.divergencias).toEqual([]);
    expect(limpo.semDados.length).toBeGreaterThan(0);

    await plantarDivergencia();
    const travado = await diagnosticoPreEnvio(prisma, { exercicio: 2026, corte: CORTE });
    expect(travado.prontoParaEnvio).toBe(false);
    expect(travado.divergencias.length).toBeGreaterThan(0); // o balancete que não fecha trava
  });
});
