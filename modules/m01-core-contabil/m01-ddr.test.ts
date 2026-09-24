import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { saldoDdrPorFonte } from "./consultas.js";
import {
  CONTA_CONTROLE_DDR_POR_NATUREZA,
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "./roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";

/**
 * A DDR — CONTROLE DA DISPONIBILIDADE DE RECURSOS (o insumo do RGF Anexo 5).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ A PERGUNTA QUE A DDR RESPONDE, E QUE A CLASSE 6 NÃO ═══
 * O controle orçamentário diz "quanto do CRÉDITO sobrou". A DDR diz "quanto DINHEIRO
 * daquela fonte ainda está livre". Divergem o tempo todo: aqui a fonte 500 tem uma
 * dotação de 500.000 (crédito) e arrecada só 10.000 (dinheiro) — o crédito disponível
 * fica em 490.000 depois do empenho, e a DDR, em 2.000. Quem empenhar contra os
 * 490.000 estará prometendo dinheiro que não entrou.
 *
 * ═══ A CADEIA, VALOR A VALOR (fonte 500) — os 4 baldes e o TOTAL ═══
 *                        dispon.  c/emp   c/liq   utiliz.  TOTAL
 *   arrecada 10.000      10.000       0       0        0   10.000
 *   empenha   8.000       2.000   8.000       0        0   10.000
 *   liquida   6.000       2.000   2.000   6.000        0   10.000
 *   paga      6.000       2.000   2.000       0    6.000   10.000
 *   anula o empenho      10.000       0       0        0   10.000
 *
 * ⚠️ O DISPONÍVEL NÃO MUDA entre empenhar e pagar — e é isso que a DDR existe para
 * dizer. O dinheiro deixou de estar livre no EMPENHO; liquidar e pagar só o movem de
 * balde. Se ele caísse de novo no pagamento, o mesmo dinheiro sairia duas vezes.
 *
 * ⚠️ E O TOTAL É INVARIANTE (10.000 em toda a linha): só a arrecadação o move. É a
 * prova de que nenhuma perna se perdeu — ele espelha o saldo da classe 7.
 *
 * ⚠️ E A ANULAÇÃO NÃO TEM ROTEIRO PRÓPRIO: `gerarEstorno` inverte as pernas, e a DDR
 * volta sozinha. Ver o t3.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";
const CREDOR = "12345678000199";

const R_EMPENHO = roteiroEmpenho();
const R_LIQUIDACAO = roteiroLiquidacao({
  codElemento: "39",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  // ENT05 ITEM 3 — repontada: a antiga era a variante INTRA OFSS.
  disponibilidade: "1.1.1.1.1.19.00",
});
// ⚠️ N=2 NA DIMENSÃO NOVA (V11 V9.3), e não por simetria decorativa. A perna de classe 7 passou a
// ser resolvida pela NATUREZA da fonte: com uma fonte só, um roteiro que ignorasse a natureza
// passaria por vacuidade. Aqui a 500 (livre) é ORDINARIOS e a 540 (FUNDEB) é VINCULADOS, e as duas
// escrituram em contas DIFERENTES — 7.2.1.1.1.00.00 e 7.2.1.1.2.00.00. O t6 confere isso.
const ROTEIRO_POR_FONTE: Readonly<Record<string, RoteiroContabil>> = {
  "500": roteiroArrecadacao({
    disponibilidade: "1.1.1.1.1.00.00",
    variacaoAumentativa: "4.1.1.2.1.01.00",
    naturezaDaFonte: "ORDINARIOS",
  }),
  "540": roteiroArrecadacao({
    disponibilidade: "1.1.1.1.1.00.00",
    variacaoAumentativa: "4.1.1.2.1.01.00",
    naturezaDaFonte: "VINCULADOS",
  }),
};

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  // O plano de PRODUÇÃO — a DDR só existe porque o seed a tem.
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE_500 },
      { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540 },
    ],
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd39", valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_500, numero: 1, fonteId: FONTE_500 });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_540, numero: 2, fonteId: FONTE_540 });

  deps = criarM05Deps(prisma);
}

async function arrecada(valor: string, fonte: string, n: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11121101", fonte, exercicioFonte: 1,
      valor, dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
      numeroReceita: `2026RC${n}`, criadoPor: POR,
    },
    ROTEIRO_POR_FONTE[fonte]!,
    criarM04Deps(prisma)
  );
}

/** O saldo da fonte 500 (a que a cadeia percorre). */
async function ddr500(): Promise<{
  disponivel: string; comprometidaEmpenho: string;
  comprometidaLiquidacao: string; utilizada: string; total: string;
}> {
  const linhas = await saldoDdrPorFonte(prisma, { exercicio: 2026 });
  const f = linhas.find((l) => l.fonteCodigo === "500")!;
  return {
    disponivel: f.disponivel.toFixed(2),
    comprometidaEmpenho: f.comprometidaEmpenho.toFixed(2),
    comprometidaLiquidacao: f.comprometidaLiquidacao.toFixed(2),
    utilizada: f.utilizada.toFixed(2),
    total: f.total.toFixed(2),
  };
}

describe("M01 — a DDR por fonte (RGF Anexo 5)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a CADEIA completa — arrecada → empenha → liquida → paga, estágio a estágio", async () => {
    // ── arrecada 10.000 ──
    await arrecada("10000.00", "500", "000001");
    expect(await ddr500()).toEqual({
      disponivel: "10000.00", comprometidaEmpenho: "0.00",
      comprometidaLiquidacao: "0.00", utilizada: "0.00", total: "10000.00",
    });

    // ── empenha 8.000: sai do disponível, vira comprometido ──
    const e = await empenhar(
      {
        fichaId: FICHA_500, numero: "NE-1", tipo: "ORDINARIO", valor: "8000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    expect(await ddr500()).toEqual({
      disponivel: "2000.00", comprometidaEmpenho: "8000.00",
      comprometidaLiquidacao: "0.00", utilizada: "0.00", total: "10000.00",
    });

    // ── liquida 6.000: o comprometido MUDA DE ESTADO; o DISPONÍVEL não se mexe ──
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    expect(await ddr500()).toEqual({
      disponivel: "2000.00", comprometidaEmpenho: "2000.00",
      comprometidaLiquidacao: "6000.00", utilizada: "0.00", total: "10000.00",
    });

    // ── paga 6.000: sai. O disponível CONTINUA 2.000 — o dinheiro já não estava livre
    //    desde o empenho, e descontá-lo de novo aqui o contaria duas vezes. ──
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "6000.00",
        data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE_500, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
    expect(await ddr500()).toEqual({
      disponivel: "2000.00", comprometidaEmpenho: "2000.00",
      comprometidaLiquidacao: "0.00", utilizada: "6000.00", total: "10000.00",
    });
  });

  it("t2: a DDR é POR FONTE — o dinheiro do FUNDEB não financia a fonte livre", async () => {
    await arrecada("10000.00", "500", "000001");
    await arrecada("30000.00", "540", "000002");

    await empenhar(
      {
        fichaId: FICHA_540, numero: "NE-540", tipo: "ORDINARIO", valor: "25000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "educação", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const linhas = await saldoDdrPorFonte(prisma, { exercicio: 2026 });
    expect(linhas.map((l) => l.fonteCodigo)).toEqual(["500", "540"]);

    // ⚠️ A 500 NÃO se mexeu: empenhar no FUNDEB não gasta o dinheiro livre. Se a DDR
    // não fosse por fonte, o ente poderia empenhar 40.000 na fonte livre "porque tem
    // caixa" — e o caixa é do FUNDEB, carimbado.
    expect(linhas.find((l) => l.fonteCodigo === "500")!.disponivel.toFixed(2)).toBe("10000.00");
    expect(linhas.find((l) => l.fonteCodigo === "540")!.disponivel.toFixed(2)).toBe("5000.00");
    expect(
      linhas.find((l) => l.fonteCodigo === "540")!.comprometidaEmpenho.toFixed(2)
    ).toBe("25000.00");
  });

  it("t3: ANULAR o empenho DEVOLVE a DDR — e não há roteiro de anulação", async () => {
    await arrecada("10000.00", "500", "000001");
    const e = await empenhar(
      {
        fichaId: FICHA_500, numero: "NE-1", tipo: "ORDINARIO", valor: "8000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    expect((await ddr500()).disponivel).toBe("2000.00");

    // ⚠️ `gerarEstorno` inverte TODAS as pernas — inclusive as de controle. Um roteiro
    // de anulação próprio seria a chance de ele divergir do fato que nega.
    await anularEmpenho(
      {
        empenhoId: e.empenhoId, numero: "NEA-1",
        data: new Date("2026-05-01T12:00:00Z"), historico: "anulação", criadoPor: POR,
      },
      deps
    );

    // Os 8.000 voltam ao disponível: 10.000 arrecadados, nada comprometido.
    expect(await ddr500()).toEqual({
      disponivel: "10000.00", comprometidaEmpenho: "0.00",
      comprometidaLiquidacao: "0.00", utilizada: "0.00", total: "10000.00",
    });
  });

  it("t4: sem arrecadação, empenhar deixa a DDR NEGATIVA — e é isso que o Anexo 5 denuncia", async () => {
    // Nada entrou nesta fonte. O CRÉDITO existe (dotação 500.000), o dinheiro não.
    await empenhar(
      {
        fichaId: FICHA_500, numero: "NE-1", tipo: "ORDINARIO", valor: "8000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
        historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    // ⚠️ DISPONÍVEL NEGATIVO, e o leitor NÃO o esconde. É exatamente a divergência
    // entre crédito e caixa que a DDR existe para tornar visível: o ente empenhou
    // dinheiro que não entrou. O M01 não RECUSA o empenho (essa trava não é desta
    // fatia) — ele REGISTRA, e o Anexo 5 publica.
    const f = await ddr500();
    expect(f.disponivel).toBe("-8000.00");
    expect(f.comprometidaEmpenho).toBe("8000.00");
    // ⚠️ E O TOTAL É ZERO — nada entrou. É a leitura honesta: os 8.000 comprometidos
    // saíram de um disponível que não existia, e os dois lados se anulam.
    expect(f.total).toBe("0.00");
  });

  it("t5: o corte por data respeita o FATO — arrecadação de março não conta em janeiro", async () => {
    await arrecada("10000.00", "500", "000001"); // 10/01

    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: "11121101", fonte: "500", exercicioFonte: 1,
        valor: "5000.00", dataArrecadacao: new Date("2026-03-15T12:00:00Z"),
        numeroReceita: "2026RC000009", criadoPor: POR,
      },
      ROTEIRO_POR_FONTE["500"]!,
      criarM04Deps(prisma)
    );

    const emJaneiro = await saldoDdrPorFonte(prisma, {
      exercicio: 2026,
      ate: new Date("2026-01-31T23:59:59Z"),
    });
    expect(emJaneiro.find((l) => l.fonteCodigo === "500")!.disponivel.toFixed(2)).toBe("10000.00");

    const noAno = await saldoDdrPorFonte(prisma, { exercicio: 2026 });
    expect(noAno.find((l) => l.fonteCodigo === "500")!.disponivel.toFixed(2)).toBe("15000.00");
  });

  // ════════════════════════════════════════════════════════════════════════════════════
  // t6 — A PERNA DE CLASSE 7 SAI DA NATUREZA DA FONTE (V11 V9.3)
  //
  // ⚠️ CONFERIDO NO RAZÃO, NÃO PELO ROTEIRO. Chamar `roteiroArrecadacao` para saber o que
  // `roteiroArrecadacao` deveria ter feito é o teste que passa com qualquer interpretação
  // errada consistente. Aqui a leitura é das PARTIDAS PERSISTIDAS, e o esperado está escrito
  // à mão a partir do `Pcasp_2025.xlsx`: ORDINÁRIOS é `7.2.1.1.1.00.00`, VINCULADOS é
  // `7.2.1.1.2.00.00`. Se alguém trocar o mapa, o teste acusa; se alguém trocar o mapa E o
  // esperado, trocou a norma, e isso é outra conversa.
  // ════════════════════════════════════════════════════════════════════════════════════
  it("t6: fontes de naturezas diferentes escrituram em contas de classe 7 DIFERENTES", async () => {
    await arrecada("10000.00", "500", "000010"); // livre     -> ORDINARIOS
    await arrecada("7000.00", "540", "000011"); // FUNDEB    -> VINCULADOS

    const classe7 = await prisma.partidaContabil.findMany({
      where: { subsistema: "CONTROLE", conta: { codigo: { startsWith: "7." } } },
      select: {
        tipo: true,
        valor: true,
        conta: { select: { codigo: true, analitica: true } },
        lancamento: { select: { historico: true, receita: { select: { numeroReceita: true } } } },
      },
    });

    const porGuia = new Map<string, { conta: string; valor: string; tipo: string; analitica: boolean }>();
    for (const p of classe7) {
      const num = p.lancamento?.receita?.numeroReceita ?? "(sem guia)";
      porGuia.set(num, {
        conta: p.conta.codigo,
        valor: p.valor.toFixed(2),
        tipo: p.tipo,
        analitica: p.conta.analitica,
      });
    }

    // Uma perna de classe 7 por guia — e SÓ uma. Duas seriam o dinheiro entrando duas vezes.
    expect(classe7.length).toBe(2);

    expect(porGuia.get("2026RC000010")).toEqual({
      conta: "7.2.1.1.1.00.00",
      valor: "10000.00",
      tipo: "DEBITO",
      analitica: true,
    });
    expect(porGuia.get("2026RC000011")).toEqual({
      conta: "7.2.1.1.2.00.00",
      valor: "7000.00",
      tipo: "DEBITO",
      analitica: true,
    });

    // ⚠️ E NENHUMA DELAS É O PAI SINTÉTICO — a recusa que originou a pendência.
    expect(classe7.map((p) => p.conta.codigo)).not.toContain("7.2.1.1.0.00.00");

    // O mapa do domínio e o esperado escrito à mão concordam — nas duas direções.
    expect(CONTA_CONTROLE_DDR_POR_NATUREZA.ORDINARIOS).toBe("7.2.1.1.1.00.00");
    expect(CONTA_CONTROLE_DDR_POR_NATUREZA.VINCULADOS).toBe("7.2.1.1.2.00.00");
  });

  // ════════════════════════════════════════════════════════════════════════════════════
  // t7 — O ESTORNO VOLTA PELA MESMA CONTA DO FATO ORIGINAL
  //
  // ⚠️ E ISSO NÃO É O MESMO QUE "volta pela conta da natureza de hoje". `gerarEstorno` inverte
  // as PARTIDAS GRAVADAS; se algum dia alguém o fizesse recompor o roteiro, uma fonte
  // reclassificada entre a arrecadação e o estorno creditaria uma conta de classe 7 que nunca
  // foi debitada — e o saldo das DUAS ficaria errado para sempre, uma positiva e outra
  // negativa, com o total fechando. É o mesmo corolário do carimbo da entidade titular.
  // ════════════════════════════════════════════════════════════════════════════════════
  it("t7: a anulação credita a MESMA conta de classe 7 que a arrecadação debitou", async () => {
    await arrecada("7000.00", "540", "000012"); // VINCULADOS -> 7.2.1.1.2.00.00

    const original = await prisma.receitaArrecadada.findFirstOrThrow({
      where: { numeroReceita: "2026RC000012" },
      select: { id: true },
    });

    await anularArrecadacao(
      {
        receitaId: original.id,
        numeroReceita: "2026RC000012A",
        dataAnulacao: new Date("2026-01-20T12:00:00Z"),
        criadoPor: POR,
      },
      criarM04Deps(prisma)
    );

    const classe7 = await prisma.partidaContabil.findMany({
      where: { subsistema: "CONTROLE", conta: { codigo: { startsWith: "7." } } },
      select: {
        tipo: true,
        valor: true,
        conta: { select: { codigo: true } },
        lancamento: { select: { receita: { select: { numeroReceita: true } } } },
      },
      orderBy: { valor: "asc" },
    });

    const linhas = classe7.map((p) => ({
      guia: p.lancamento?.receita?.numeroReceita ?? "(sem guia)",
      conta: p.conta.codigo,
      tipo: p.tipo,
      valor: p.valor.toFixed(2),
    }));

    // A conta é a MESMA nas duas pernas; o que inverte é o TIPO.
    expect(linhas).toContainEqual({
      guia: "2026RC000012",
      conta: "7.2.1.1.2.00.00",
      tipo: "DEBITO",
      valor: "7000.00",
    });
    expect(linhas).toContainEqual({
      guia: "2026RC000012A",
      conta: "7.2.1.1.2.00.00",
      tipo: "CREDITO",
      valor: "7000.00",
    });
    // E a conta da OUTRA natureza não foi tocada — o estorno não migra de balde.
    expect(linhas.map((l) => l.conta)).not.toContain("7.2.1.1.1.00.00");

    const f = (await saldoDdrPorFonte(prisma, { exercicio: 2026 })).find(
      (l) => l.fonteCodigo === "540"
    )!;
    expect(f.disponivel.toFixed(2)).toBe("0.00");
    expect(f.total.toFixed(2)).toBe("0.00");
  });
});
