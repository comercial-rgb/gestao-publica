import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "./adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "./dominio.js";
import { empenhar, reconciliarFicha, saldosDaFicha } from "./servico.js";
import {
  anularLiquidacao,
  anularPagamento,
  liquidar,
  pagar,
  statusDeEmpenho,
} from "./servico-bloco2.js";
import type { M05Deps } from "./ports.js";

/**
 * M05 bloco 2 — liquidação e pagamento.
 *
 * O que este arquivo prova: os limites (liquidar <= empenhado, pagar <=
 * liquidado) são lidos do SUM REAL; o status do empenho é DERIVADO e evolui
 * sozinho; a TR 5.23 barra pagamento com fonte divergente da conta; e a
 * reconciliação da ficha continua [] depois da cadeia inteira.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const CONTAS = [
  // orçamentárias
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // patrimoniais
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD - Serviços", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO: RoteiroContabil = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.04.00",
});

const FICHA_ID = "ficha-b2";
/** Ficha do FUNDEB — ver a nota no `semear`. */
const FICHA_540 = "ficha-b2-540";
const CRIADO_POR = "m05b@cg.pb.gov.br";
/** Fonte 500 é a da conta bancária CC-001. Fonte 540 é de OUTRA conta. */
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";

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
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-1", codigo: "CC-001", descricao: "Conta livre", fonteId: FONTE_500 },
      { id: "cb-2", codigo: "CC-002", descricao: "Conta FUNDEB", fonteId: FONTE_540 },
    ],
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA_ID, exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg-0012", acaoId: "aca-2001",
    naturezaDespesaId: "nd-339039", fonteId: FONTE_500,
    valorDotado: "10000.00",
  });
  // ⚠️ FICHA DO FUNDEB — ELA NASCEU NESTE BLOCO, E O MOTIVO É UM ACHADO.
  // O teste "TR 5.23 ACEITA quando a fonte casa com a da conta" pagava a liquidação de
  // uma ficha da fonte 500 com a conta CC-002 (FUNDEB), declarando fonte 540 — e
  // PASSAVA, porque o único guard era `pagamento.fonte == conta.fonte`. Era o buraco
  // que este bloco fecha: a despesa era do imposto e o dinheiro saía do FUNDEB.
  // Para o teste continuar provando o que ele quer provar (o guard da CONTA), a
  // liquidação paga com fonte 540 tem de nascer de uma ficha de fonte 540.
  await criarFichaDeTeste(prisma, {
    id: FICHA_540, exercicio: 2026, numero: 2,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg-0012", acaoId: "aca-2001",
    naturezaDespesaId: "nd-339039", fonteId: FONTE_540,
    valorDotado: "10000.00",
  });
}

/** Empenha 1000 e devolve o id. */
async function empenhar1000(
  deps: M05Deps,
  fichaId: string = FICHA_ID
): Promise<string> {
  const e = await empenhar(
    {
      fichaId,
      numero: "2026NE0001",
      tipo: "ORDINARIO",
      valor: "1000.00",
      data: new Date("2026-04-10T12:00:00Z"),
      credorCpfCnpj: "12345678000199",
      historico: "empenho",
      categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: CRIADO_POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

function liq(empenhoId: string, numero: string, valor: string) {
  return {
    empenhoId,
    numero,
    valor,
    data: new Date("2026-05-01T12:00:00Z"),
    responsavelAtesto: "Fulano de Tal",
    historico: `Liquidação ${numero}`,
    criadoPor: CRIADO_POR,
  };
}

function pg(liquidacaoId: string, numero: string, valor: string, conta = "CC-001", fonteId = FONTE_500) {
  return {
    liquidacaoId,
    numero,
    valor,
    data: new Date("2026-06-01T12:00:00Z"),
    contaBancaria: conta,
    fonteId,
    historico: `Pagamento ${numero}`,
    criadoPor: CRIADO_POR,
  };
}

describe("M05 bloco 2 — liquidação", () => {
  let deps: M05Deps;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("liquidação PARCIAL: status vira PARCIAL_LIQUIDADO", async () => {
    const empenhoId = await empenhar1000(deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("EMPENHADO");

    await liquidar(liq(empenhoId, "2026NL0001", "600.00"), R_LIQUIDACAO, deps);

    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PARCIAL_LIQUIDADO");
    const totais = (await deps.despesa.totaisDoEmpenho(empenhoId))!;
    expect(totais.liquidado.toFixed(2)).toBe("600.00");
  });

  it("liquidação TOTAL: status vira LIQUIDADO; lançamento balanceado por subsistema", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    expect(await statusDeEmpenho(empenhoId, deps)).toBe("LIQUIDADO");

    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: l.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    expect(lanc.partidas).toHaveLength(4);
    for (const sub of ["PATRIMONIAL", "ORCAMENTARIO"] as const) {
      const doSub = lanc.partidas.filter((p) => p.subsistema === sub);
      const d = doSub.filter((p) => p.tipo === "DEBITO");
      const c = doSub.filter((p) => p.tipo === "CREDITO");
      expect(d).toHaveLength(1);
      expect(c).toHaveLength(1);
      expect(d[0]!.valor.toFixed(2)).toBe(c[0]!.valor.toFixed(2));
    }
    // a liquidação é onde nasce o fato patrimonial
    const papel = new Map(lanc.partidas.map((p) => [p.conta.codigo, `${p.tipo}/${p.subsistema}`]));
    expect(papel.get("3.3.2.1.1.01.00")).toBe("DEBITO/PATRIMONIAL"); // VPD
    expect(papel.get("2.1.3.1.1.00.00")).toBe("CREDITO/PATRIMONIAL"); // fornecedor
  });

  it("REJEITA liquidar ALÉM do empenhado (SUM real) — nada grava", async () => {
    const empenhoId = await empenhar1000(deps);
    await liquidar(liq(empenhoId, "2026NL0001", "600.00"), R_LIQUIDACAO, deps);

    await expect(
      liquidar(liq(empenhoId, "2026NL0002", "500.00"), R_LIQUIDACAO, deps)
    ).rejects.toThrow(/excede o empenho.*empenhado 1000\.00.*já liquidado 600\.00.*solicitado 500\.00/s);

    expect(await prisma.liquidacao.count()).toBe(1);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PARCIAL_LIQUIDADO");
  });

  it("REJEITA liquidar empenho ANULADO", async () => {
    const empenhoId = await empenhar1000(deps);
    const { anularEmpenho } = await import("./servico.js");
    await anularEmpenho(
      { empenhoId, numero: "2026NE0001-A", data: new Date("2026-04-20T12:00:00Z"), historico: "anula", criadoPor: CRIADO_POR },
      deps
    );

    await expect(
      liquidar(liq(empenhoId, "2026NL0001", "100.00"), R_LIQUIDACAO, deps)
    ).rejects.toThrow(/está ANULADO/);
  });
});

describe("M05 bloco 2 — pagamento e TR 5.23", () => {
  let deps: M05Deps;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("pagamento PARCIAL e TOTAL: status vai a PARCIAL_PAGO e depois PAGO", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    await pagar(pg(l.liquidacaoId, "2026NP0001", "600.00"), R_PAGAMENTO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PARCIAL_PAGO");

    await pagar(pg(l.liquidacaoId, "2026NP0002", "400.00"), R_PAGAMENTO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PAGO");
  });

  it("REJEITA pagar ALÉM do liquidado (SUM real)", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "600.00"), R_LIQUIDACAO, deps);

    await expect(
      pagar(pg(l.liquidacaoId, "2026NP0001", "700.00"), R_PAGAMENTO, deps)
    ).rejects.toThrow(/excede a liquidação.*liquidado 600\.00.*solicitado 700\.00/s);

    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("TR 5.23: REJEITA pagamento cuja fonte diverge da fonte da CONTA BANCÁRIA", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    // conta CC-001 é fonte 500; o pagamento declara fonte 540 (FUNDEB)
    await expect(
      pagar(
        pg(l.liquidacaoId, "2026NP0001", "100.00", "CC-001", FONTE_540),
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow(/TR 5\.23.*diverge da fonte da conta bancária/s);

    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("TR 5.23: ACEITA quando a fonte casa com a da conta E com a da FICHA", async () => {
    // ⚠️ A CORRENTE INTEIRA: ficha 540 -> empenho -> liquidação -> pagamento na conta
    // CC-002 (FUNDEB), fonte 540. Antes deste bloco, este teste empenhava na ficha da
    // fonte 500 e pagava com o dinheiro do FUNDEB — e passava.
    const empenhoId = await empenhar1000(deps, FICHA_540);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    await pagar(
      pg(l.liquidacaoId, "2026NP0001", "100.00", "CC-002", FONTE_540),
      R_PAGAMENTO,
      deps
    );
    expect(await prisma.pagamento.count()).toBe(1);
  });

  it("A FONTE DA FICHA manda: despesa da fonte 500 NÃO se paga com dinheiro do FUNDEB", async () => {
    // A ficha é 500. A conta CC-002 é 540, e o pagamento declara 540: o guard da TR 5.23
    // (pagamento × conta) CASA — e era só ele que existia. Quem barra é o elo novo.
    const empenhoId = await empenhar1000(deps); // FICHA_ID = fonte 500
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    await expect(
      pagar(
        pg(l.liquidacaoId, "2026NP0001", "100.00", "CC-002", FONTE_540),
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow(/FONTE DO PAGAMENTO DIVERGE DA FONTE DA DESPESA[\s\S]*fonte 500/);

    // SELECT prova: zero escrita — nem pagamento, nem lançamento.
    expect(await prisma.pagamento.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO" } })
    ).toBe(0);
  });

  it("REJEITA conta bancária não cadastrada", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);

    await expect(
      pagar(pg(l.liquidacaoId, "2026NP0001", "100.00", "CC-999"), R_PAGAMENTO, deps)
    ).rejects.toThrow(/não cadastrada/);
  });
});

describe("M05 bloco 2 — anulações (append-only)", () => {
  let deps: M05Deps;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("anular liquidação: registro NOVO; original INTACTO; status volta a EMPENHADO", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("LIQUIDADO");

    const antes = await prisma.liquidacao.findUniqueOrThrow({
      where: { id: l.liquidacaoId },
      include: { lancamento: { include: { partidas: true } } },
    });

    await anularLiquidacao(
      { liquidacaoId: l.liquidacaoId, numero: "2026NL0001-A", data: new Date("2026-05-20T12:00:00Z"), historico: "anula", criadoPor: CRIADO_POR },
      deps
    );

    // o liquidado voltou a zero -> status volta a EMPENHADO
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("EMPENHADO");

    // INVARIANTE 2: original intacto
    const depois = await prisma.liquidacao.findUniqueOrThrow({
      where: { id: l.liquidacaoId },
      include: { lancamento: { include: { partidas: true } } },
    });
    expect(depois).toEqual(antes);
  });

  it("SEM ÓRFÃO: REJEITA anular liquidação que já tem pagamento", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);
    await pagar(pg(l.liquidacaoId, "2026NP0001", "300.00"), R_PAGAMENTO, deps);

    await expect(
      anularLiquidacao(
        { liquidacaoId: l.liquidacaoId, numero: "2026NL0001-A", data: new Date("2026-06-10T12:00:00Z"), historico: "anula", criadoPor: CRIADO_POR },
        deps
      )
    ).rejects.toThrow(/tem 300\.00 já PAGO.*anule o pagamento primeiro/s);

    expect(await prisma.liquidacao.count()).toBe(1);
  });

  it("anular o pagamento LIBERA a anulação da liquidação", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);
    const p = await pagar(pg(l.liquidacaoId, "2026NP0001", "300.00"), R_PAGAMENTO, deps);

    await anularPagamento(
      { pagamentoId: p.pagamentoId, numero: "2026NP0001-A", data: new Date("2026-06-10T12:00:00Z"), historico: "anula pgto", criadoPor: CRIADO_POR },
      deps
    );
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("LIQUIDADO"); // pago voltou a 0

    // agora sim
    await anularLiquidacao(
      { liquidacaoId: l.liquidacaoId, numero: "2026NL0001-A", data: new Date("2026-06-11T12:00:00Z"), historico: "anula liq", criadoPor: CRIADO_POR },
      deps
    );
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("EMPENHADO");
  });

  it("REJEITA anular a mesma liquidação duas vezes", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "500.00"), R_LIQUIDACAO, deps);
    const anul = { liquidacaoId: l.liquidacaoId, data: new Date("2026-05-20T12:00:00Z"), historico: "anula", criadoPor: CRIADO_POR };
    await anularLiquidacao({ ...anul, numero: "A1" }, deps);

    await expect(
      anularLiquidacao({ ...anul, numero: "A2" }, deps)
    ).rejects.toThrow(/já foi anulada/);
  });

  it("DUPLO ESTORNO de pagamento: o índice único parcial rejeita no banco", async () => {
    const empenhoId = await empenhar1000(deps);
    const l = await liquidar(liq(empenhoId, "2026NL0001", "1000.00"), R_LIQUIDACAO, deps);
    const p = await pagar(pg(l.liquidacaoId, "2026NP0001", "500.00"), R_PAGAMENTO, deps);
    await anularPagamento(
      { pagamentoId: p.pagamentoId, numero: "A1", data: new Date("2026-06-10T12:00:00Z"), historico: "anula", criadoPor: CRIADO_POR },
      deps
    );

    let erro: unknown;
    try {
      const lanc = await prisma.lancamentoContabil.create({
        data: {
          numeroControle: "X", dataTransacao: new Date("2026-06-12T12:00:00Z"),
          historico: "clandestina",
          origemTipo: "PAGAMENTO_ANULADO", criadoPor: "atacante",
          partidas: {
            create: [
              { contaId: "c-banco", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "500.00" },
              { contaId: "c-forn", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "500.00" },
            ],
          },
        },
        select: { id: true },
      });
      await prisma.pagamento.create({
        data: {
          liquidacaoId: l.liquidacaoId, numero: "X", valor: "500.00",
          data: new Date("2026-06-12T12:00:00Z"), contaBancaria: "CC-001",
          fonteId: FONTE_500, lancamentoId: lanc.id,
          estornoDeId: p.pagamentoId, // JÁ anulado!
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeDefined();
    console.log("\n>>> ERRO REAL DO POSTGRES (duplo estorno de pagamento):\n" + String(erro) + "\n");
    expect(String(erro)).toMatch(/uq_estorno_pagamento_unico|Unique constraint/i);
  });
});

describe("M05 — CADEIA COMPLETA", () => {
  let deps: M05Deps;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("empenho 1000 → liquida 600+400 → paga 600+400 → PAGO; reconciliação = []", async () => {
    const empenhoId = await empenhar1000(deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("EMPENHADO");
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    const l1 = await liquidar(liq(empenhoId, "NL1", "600.00"), R_LIQUIDACAO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PARCIAL_LIQUIDADO");

    const l2 = await liquidar(liq(empenhoId, "NL2", "400.00"), R_LIQUIDACAO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("LIQUIDADO");

    await pagar(pg(l1.liquidacaoId, "NP1", "600.00"), R_PAGAMENTO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PARCIAL_PAGO");

    await pagar(pg(l2.liquidacaoId, "NP2", "400.00"), R_PAGAMENTO, deps);
    expect(await statusDeEmpenho(empenhoId, deps)).toBe("PAGO");

    // saldos derivados
    const totais = (await deps.despesa.totaisDoEmpenho(empenhoId))!;
    expect(totais.empenhado.toFixed(2)).toBe("1000.00");
    expect(totais.liquidado.toFixed(2)).toBe("1000.00");
    expect(totais.pago.toFixed(2)).toBe("1000.00");
    expect(totais.anulado).toBe(false);

    // a ficha: 10000 dotado, 1000 empenhado, 9000 disponível
    const s = await saldosDaFicha(FICHA_ID, deps);
    expect(s.autorizado.toFixed(2)).toBe("10000.00");
    expect(s.empenhado.toFixed(2)).toBe("1000.00");
    expect(s.reservado.toFixed(2)).toBe("0.00");
    expect(s.disponivel.toFixed(2)).toBe("9000.00");

    // INVARIANTE 4: o cache nunca divergiu do SUM
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    // ⚠️ 7 LANÇAMENTOS, E NÃO 5 — E OS DOIS A MAIS SÃO O BLOCO DA DOTAÇÃO NO RAZÃO.
    // 2 fichas x 1 dotação da LOA (D dotação inicial / C crédito disponível) + 1 empenho
    // + 2 liquidações + 2 pagamentos. Até aqui a LOA não tocava o razão: o crédito
    // disponível era DEBITADO pelo empenho e nunca creditado.
    expect(await prisma.lancamentoContabil.count()).toBe(7);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "LOA" } })
    ).toBe(2);
  });
});
