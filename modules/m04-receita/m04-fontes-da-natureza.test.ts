import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import { CONTA_PREVISAO_INICIAL_RECEITA_BRUTA, CONTA_RECEITA_A_REALIZAR } from "../m01-core-contabil/roteiros.js";
import { preverReceitaPorRateio } from "../m02-planejamento/previsao-por-rateio.js";
import { composicoesVigentes, definirFontesDaNatureza } from "./fontes-da-natureza.js";

/**
 * M04 — AS FONTES DA NATUREZA COM PERCENTUAL (TR 5.9.3.4) E A PREVISÃO DA LOA RATEADA POR ELAS (TR 5.9.3.7).
 *
 * As contas, à mão:
 *   IPTU em três fontes, 33,333334% (500, resíduo) + 33,333333% (540) + 33,333333% (550); 1.000,00 rateados:
 *     500: 1.000 x 33,333334% = 333,33334 -> 333,33 truncado; 540 e 550: 333,33333 -> 333,33.
 *     Soma 999,99; o centavo que sobra vai à 500 (resíduo): 333,34 + 333,33 + 333,33 = 1.000,00.
 *   ISS em duas fontes, 60% (500) + 40% (540, resíduo); 2.500,55 rateados:
 *     500: 1.500,33; 540: 1.000,22 (exatos, resíduo zero).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const IPTU = "11180111";
const ISS = "11180231";
const INTRA = "72150011";

const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    const m = (e as Error).message;
    // Erro do banco não é recusa: o trecho de código que o Prisma anexa pode conter a mensagem da linha vizinha.
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
  return "(não recusou)";
};

const tresTercos = {
  naturezaReceita: IPTU,
  itens: [
    { fonte: "500", percentual: "33.333334" },
    { fonte: "540", percentual: "33.333333" },
    { fonte: "550", percentual: "33.333333" },
  ],
  fonteDoResiduo: "500",
  fundamento: "Lei municipal fictícia de vinculação",
  criadoPor: POR,
};

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: CONTA_PREVISAO_INICIAL_RECEITA_BRUTA, nome: "Previsão inicial da receita bruta", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: CONTA_RECEITA_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { codigo: IPTU, descricao: "IPTU" },
      { codigo: ISS, descricao: "ISS" },
      { codigo: INTRA, descricao: "Contribuição patronal intraorçamentária" },
    ],
  });
  await prisma.exercicio.createMany({ data: [{ ano: 2026, criadoPor: "TESTE" }, { ano: 2027, criadoPor: "TESTE" }] });
  await prisma.fonteRecurso.createMany({
    data: [
      { codigo: "500", descricao: "Livre", codigoTce: "500" },
      { codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
      { codigo: "550", descricao: "Salário-educação", codigoTce: "550" },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const previsoes = (natureza: string): Promise<{ fonte: string; valor: string; tipo: string }[]> =>
  prisma.receitaPrevista
    .findMany({ where: { naturezaReceita: { codigo: natureza } }, select: { valorPrevisto: true, tipoReceita: true, fonte: { select: { codigo: true } } }, orderBy: { fonte: { codigo: "asc" } } })
    .then((r) => r.map((x) => ({ fonte: x.fonte.codigo, valor: x.valorPrevisto.toFixed(2), tipo: x.tipoReceita })));

describe("M04 — fontes da natureza com percentual e a previsão rateada", () => {
  it("t1: três terços rateiam 1.000,00 e o centavo vai à fonte do resíduo; cada parte vai ao razão", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    const [c] = await composicoesVigentes(prisma, { naturezas: [IPTU] });
    expect(c?.completa).toBe(true);
    expect(c?.itens.map((i) => `${i.fonte}:${i.percentual.toFixed(6)}`)).toEqual(["500:33.333334", "540:33.333333", "550:33.333333"]);

    const r = await preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: IPTU, valor: "1000.00", criadoPor: POR });
    expect(r.map((p) => `${p.fonte}:${p.valor}`)).toEqual(["500:333.34", "540:333.33", "550:333.33"]);
    expect(await previsoes(IPTU)).toEqual([
      { fonte: "500", valor: "333.34", tipo: "ORCAMENTARIA" },
      { fonte: "540", valor: "333.33", tipo: "ORCAMENTARIA" },
      { fonte: "550", valor: "333.33", tipo: "ORCAMENTARIA" },
    ]);
    const lancamentos = await prisma.lancamentoContabil.findMany({ where: { origemTipo: "PREVISAO_DA_RECEITA" }, select: { partidas: { select: { tipo: true, valor: true, subsistema: true, conta: { select: { codigo: true } } } } } });
    expect(lancamentos).toHaveLength(3);
    const partidas = lancamentos.flatMap((l) => l.partidas);
    const soma = (tipo: string, conta: string): string =>
      partidas.filter((p) => p.tipo === tipo && p.conta.codigo === conta).reduce((t, p) => toMoney(t.plus(p.valor.toFixed(2))), toMoney("0.00")).toFixed(2);
    expect(soma("DEBITO", CONTA_PREVISAO_INICIAL_RECEITA_BRUTA)).toBe("1000.00");
    expect(soma("CREDITO", CONTA_RECEITA_A_REALIZAR)).toBe("1000.00");
    expect(partidas).toHaveLength(6);
    expect(new Set(partidas.map((p) => p.subsistema))).toEqual(new Set(["ORCAMENTARIO"]));
  });

  it("t2: duas naturezas (N=2), cada uma com a sua composição vigente; a nova versão substitui a anterior sem apagá-la", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    await definirFontesDaNatureza(prisma, { naturezaReceita: ISS, itens: [{ fonte: "500", percentual: "50" }, { fonte: "540", percentual: "50" }], fonteDoResiduo: "540", fundamento: "Primeira versão", criadoPor: POR });
    await definirFontesDaNatureza(prisma, { naturezaReceita: ISS, itens: [{ fonte: "500", percentual: "60" }, { fonte: "540", percentual: "40" }], fonteDoResiduo: "540", fundamento: "Segunda versão", criadoPor: POR });
    const vig = await composicoesVigentes(prisma);
    expect(vig.map((v) => `${v.naturezaCodigo}:${v.fundamento}`)).toEqual([`${IPTU}:Lei municipal fictícia de vinculação`, `${ISS}:Segunda versão`]);
    expect(await prisma.composicaoDeFontesDaNatureza.count({ where: { naturezaReceita: { codigo: ISS } } })).toBe(2);

    const r = await preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: ISS, valor: "2500.55", criadoPor: POR });
    expect(r.map((p) => `${p.fonte}:${p.valor}`)).toEqual(["500:1500.33", "540:1000.22"]);
    expect(await previsoes(IPTU)).toEqual([]);
  });

  it("t3: o cadastro aceita a composição incompleta, mas o rateio a recusa nomeando o que ficaria sem fonte, e nada é gravado", async () => {
    const r = await definirFontesDaNatureza(prisma, { naturezaReceita: IPTU, itens: [{ fonte: "500", percentual: "70" }, { fonte: "540", percentual: "20" }], fonteDoResiduo: "500", fundamento: "Composição parcial", criadoPor: POR });
    expect(r.soma).toBe("90.000000");
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: IPTU, valor: "1000.00", criadoPor: POR }))).toMatch(/somam 90%: 10% do valor ficaria sem fonte/);
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: ISS, valor: "1000.00", criadoPor: POR }))).toMatch(/não tem fontes cadastradas com percentual/);
    expect(await prisma.receitaPrevista.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("t4: o cadastro recusa soma acima de 100, fonte repetida, resíduo fora da composição, natureza e fonte inexistentes", async () => {
    const base = { naturezaReceita: IPTU, fundamento: "Teste das recusas", criadoPor: POR };
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, itens: [{ fonte: "500", percentual: "60" }, { fonte: "540", percentual: "40.000001" }], fonteDoResiduo: "500" }))).toMatch(/soma dos percentuais é 100,000001% e não pode passar de 100%/);
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, itens: [{ fonte: "500", percentual: "30" }, { fonte: "500", percentual: "30" }], fonteDoResiduo: "500" }))).toMatch(/A fonte 500 aparece mais de uma vez/);
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, itens: [{ fonte: "500", percentual: "100" }], fonteDoResiduo: "540" }))).toMatch(/\(540\) tem de ser uma das fontes da composição/);
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, naturezaReceita: "19999999", itens: [{ fonte: "500", percentual: "100" }], fonteDoResiduo: "500" }))).toMatch(/19999999 não está no ementário/);
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, itens: [{ fonte: "999", percentual: "100" }], fonteDoResiduo: "999" }))).toMatch(/Fonte fora do cadastro: 999/);
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...base, itens: [{ fonte: "500", percentual: "0" }], fonteDoResiduo: "500" }))).toMatch(/entre 0 \(exclusive\) e 100/);
    expect(await prisma.composicaoDeFontesDaNatureza.count()).toBe(0);
  });

  it("t5: o rateio é tudo ou nada — com uma fonte já prevista, recusa nomeando-a e não grava as outras", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    const n = await prisma.naturezaReceita.findUniqueOrThrow({ where: { codigo: IPTU }, select: { id: true } });
    const f = await prisma.fonteRecurso.findUniqueOrThrow({ where: { codigo: "550" }, select: { id: true } });
    await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: n.id, fonteId: f.id, tipoReceita: "ORCAMENTARIA", valorPrevisto: "10.00" } });
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: IPTU, valor: "1000.00", criadoPor: POR }))).toMatch(/já tem previsão da natureza 11180111 na\(s\) fonte\(s\) 550/);
    expect(await previsoes(IPTU)).toEqual([{ fonte: "550", valor: "10.00", tipo: "ORCAMENTARIA" }]);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    // Outro exercício não é a mesma previsão. 3,00 x 33,333334% = 1,00000002 -> 1,00; x 33,333333% = 0,99999999 -> 0,99
    // (truncado); soma 2,98, e os 0,02 de sobra vão à 500: 1,02 + 0,99 + 0,99.
    const r = await preverReceitaPorRateio(prisma, { exercicio: 2027, naturezaReceita: IPTU, valor: "3.00", criadoPor: POR });
    expect(r.map((p) => `${p.fonte}:${p.valor}`)).toEqual(["500:1.02", "540:0.99", "550:0.99"]);
  });

  it("t6: a natureza intraorçamentária rateia como intraorçamentária; a parte zero não vira previsão", async () => {
    await definirFontesDaNatureza(prisma, { naturezaReceita: INTRA, itens: [{ fonte: "500", percentual: "99" }, { fonte: "540", percentual: "1" }], fonteDoResiduo: "500", fundamento: "Intraorçamentária", criadoPor: POR });
    const r = await preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: INTRA, valor: "0.50", criadoPor: POR });
    // 540: 0,50 x 1% = 0,005 -> 0,00 (não grava); 500: 0,495 -> 0,49 + resíduo 0,01 = 0,50.
    expect(r.map((p) => `${p.fonte}:${p.valor}`)).toEqual(["500:0.50"]);
    expect(await previsoes(INTRA)).toEqual([{ fonte: "500", valor: "0.50", tipo: "INTRA_ORCAMENTARIA" }]);
  });

  it("t7: a corrida que a conferência não vê — o rateio cai na chave única, volta inteiro e diz a fonte", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    const n = await prisma.naturezaReceita.findUniqueOrThrow({ where: { codigo: IPTU }, select: { id: true } });
    const f540 = await prisma.fonteRecurso.findUniqueOrThrow({ where: { codigo: "540" }, select: { id: true } });
    // Determinístico: uma transação grava a previsão da 540 e fica ABERTA. O rateio confere (não vê a linha não
    // confirmada), grava a 500, para no índice único da 540 e espera. Só quando o banco mostra a espera a primeira
    // confirma — e o rateio recebe a violação de unicidade.
    let inserido = (): void => undefined;
    let liberar = (): void => undefined;
    const gravou = new Promise<void>((r) => (inserido = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const outra = prisma.$transaction(
      async (tx) => {
        await tx.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: n.id, fonteId: f540.id, tipoReceita: "ORCAMENTARIA", valorPrevisto: "7.00" } });
        inserido();
        await segura;
      },
      { timeout: 60000 }
    );
    await gravou;
    const rateio = preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: IPTU, valor: "1000.00", criadoPor: POR }).then(
      () => "(gravou)",
      (e: unknown) => (e as Error).message
    );
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [linha] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
      vista = (linha?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    if (!vista) liberar();
    expect(vista, "o rateio não chegou a esperar o índice único em 10 s: a corrida não foi exercitada").toBe(true);
    liberar();
    await outra;
    expect(await rateio).toMatch(/^Outra previsão da natureza 11180111 na fonte 540 foi gravada ao mesmo tempo. O rateio foi desfeito por inteiro/);
    expect(await previsoes(IPTU)).toEqual([{ fonte: "540", valor: "7.00", tipo: "ORCAMENTARIA" }]);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  }, 60000);

  it("t7b: a publicação da composição espera a da mesma natureza, e a hora gravada é a de depois da espera", async () => {
    const n = await prisma.naturezaReceita.findUniqueOrThrow({ where: { codigo: IPTU }, select: { id: true } });
    let travou = (): void => undefined;
    let liberar = (): void => undefined;
    const pegou = new Promise<void>((r) => (travou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const outra = prisma.$transaction(
      async (tx) => {
        await travar(tx, "NaturezaDaReceita", [n.id]);
        travou();
        await segura;
      },
      { timeout: 60000 }
    );
    await pegou;
    const publicacao = definirFontesDaNatureza(prisma, tresTercos);
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [linha] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
      vista = (linha?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    const soltaEm = new Date();
    liberar();
    await outra;
    await publicacao;
    expect(vista, "a publicação não esperou a trava da natureza").toBe(true);
    const [c] = await composicoesVigentes(prisma, { naturezas: [IPTU] });
    expect(c!.criadoEm.getTime()).toBeGreaterThanOrEqual(soltaEm.getTime());
  }, 60000);

  it("t7c: exercício inexistente ou encerrado não recebe previsão, e nada é gravado", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2030, naturezaReceita: IPTU, valor: "10.00", criadoPor: POR }))).toMatch(/Exercício 2030 não existe — previsão da receita da natureza 11180111 por rateio rejeitado/);
    const e = await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2027 }, select: { id: true } });
    await prisma.encerramentoExercicio.create({ data: { exercicioId: e.id, encerradoPor: "TESTE" } });
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2027, naturezaReceita: IPTU, valor: "10.00", criadoPor: POR }))).toMatch(/Exercício 2027 está ENCERRADO/);
    expect(await prisma.receitaPrevista.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("t8: quem só consulta a receita não cadastra a composição nem rateia a previsão", async () => {
    await definirFontesDaNatureza(prisma, tresTercos);
    const u = await prisma.usuario.create({ data: { identificador: "so.le.receita@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const perfil = await prisma.perfil.create({ data: { nome: "SO_LE_RECEITA", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_RECEITA" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
    expect(await recusa(() => definirFontesDaNatureza(prisma, { ...tresTercos, criadoPor: "so.le.receita@cg.pb.gov.br" }))).toMatch(/PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/);
    expect(await recusa(() => preverReceitaPorRateio(prisma, { exercicio: 2026, naturezaReceita: IPTU, valor: "1000.00", criadoPor: "so.le.receita@cg.pb.gov.br" }))).toMatch(/CRIAR_RECEITA_PREVISTA/);
    expect(await prisma.composicaoDeFontesDaNatureza.count()).toBe(1);
    expect(await prisma.receitaPrevista.count()).toBe(0);
  });
});
