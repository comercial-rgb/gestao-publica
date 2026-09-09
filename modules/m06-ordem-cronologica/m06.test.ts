import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { criarOrdemCronologicaPrisma } from "./adapter-prisma.js";
import {
  avaliarOrdem,
  cabecaDaFila,
  ordenarFila,
  posicaoNaFila,
  zJustificativaQuebraOrdemInput,
  type LiquidacaoNaFila,
} from "./dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";

// ── DOMÍNIO PURO (sem banco) ───────────────────────────────────────────────

function liq(
  id: string,
  numero: string,
  data: string,
  saldo = "100.00"
): LiquidacaoNaFila {
  return {
    liquidacaoId: id,
    numero,
    dataLiquidacao: new Date(data),
    fonteId: "f500",
    categoria: "FORNECIMENTO_BENS",
    saldoAPagar: toMoney(saldo),
  };
}

describe("M06 — ordenarFila (puro)", () => {
  it("ordena pela data de liquidação (marco de exigibilidade, art. 141 caput)", () => {
    const fila = ordenarFila([
      liq("c", "NL3", "2026-03-10"),
      liq("a", "NL1", "2026-01-05"),
      liq("b", "NL2", "2026-02-20"),
    ]);
    expect(fila.map((l) => l.liquidacaoId)).toEqual(["a", "b", "c"]);
  });

  it("desempata pelo NÚMERO quando a data é a mesma (a fila precisa de ordem TOTAL)", () => {
    // sem desempate, "cabeça da fila" seria ambíguo e a regra viraria loteria
    const fila = ordenarFila([
      liq("z", "NL9", "2026-01-05"),
      liq("a", "NL1", "2026-01-05"),
      liq("m", "NL5", "2026-01-05"),
    ]);
    expect(fila.map((l) => l.numero)).toEqual(["NL1", "NL5", "NL9"]);
  });

  it("não muta o array original", () => {
    const original = [liq("c", "NL3", "2026-03-10"), liq("a", "NL1", "2026-01-05")];
    const copia = [...original];
    ordenarFila(original);
    expect(original).toEqual(copia);
  });

  it("fila vazia: sem cabeça", () => {
    expect(cabecaDaFila([])).toBeNull();
    expect(posicaoNaFila([], "x")).toBeNull();
  });
});

describe("M06 — avaliarOrdem (puro)", () => {
  const fila = [
    liq("a", "NL1", "2026-01-05"),
    liq("b", "NL2", "2026-02-20"),
    liq("c", "NL3", "2026-03-10"),
  ];

  it("a cabeça da fila não precisa de justificativa", () => {
    const r = avaliarOrdem(fila, "a");
    expect(r.ehCabecaDaFila).toBe(true);
    expect(r.posicao).toBe(1);
    expect(r.preterida).toBeNull();
  });

  it("fora de ordem: aponta QUEM está sendo preterido", () => {
    const r = avaliarOrdem(fila, "c");
    expect(r.ehCabecaDaFila).toBe(false);
    expect(r.posicao).toBe(3);
    expect(r.preterida?.liquidacaoId).toBe("a"); // a mais antiga
  });

  it("liquidação fora da fila: posição null", () => {
    expect(avaliarOrdem(fila, "inexistente").posicao).toBeNull();
  });
});

describe("M06 — justificativa (Zod, §1º)", () => {
  const valida = {
    hipotese: "V_ATIVIDADE_FINALISTICA",
    justificativa:
      "Pagamento imprescindível à continuidade do atendimento da rede municipal de ensino.",
    autorizadoPor: "Secretário de Finanças",
  };

  it("aceita justificativa válida", () => {
    expect(() => zJustificativaQuebraOrdemInput.parse(valida)).not.toThrow();
  });

  it("REJEITA texto com menos de 30 caracteres", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, justificativa: "urgente" })
    ).toThrow(/ao menos 30 caracteres/);
  });

  it("REJEITA hipótese fora do rol TAXATIVO do §1º", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, hipotese: "VI_OUTROS" })
    ).toThrow();
  });

  it("REJEITA sem quem autorizou", () => {
    expect(() =>
      zJustificativaQuebraOrdemInput.parse({ ...valida, autorizadoPor: "" })
    ).toThrow();
  });
});

// ── FILA DERIVADA (banco de teste) ─────────────────────────────────────────

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // A DISPONIBILIDADE de verdade: o pagamento sai do BANCO. Esta fixture usava o
  // "Crédito Disponível" (6.2.2.1.1, classe 6 = ORÇAMENTÁRIA) na perna PATRIMONIAL
  // do pagamento — o razão dizia que o dinheiro saía de uma conta de controle
  // orçamentário. O guard de natureza de informação pegou; ver MODULO.md do M01.
  { id: "c-caixa", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
];
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});

const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
/** Ficha A: fonte 500. Ficha B: fonte 540. */
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";
const POR = "m06@cg.pb.gov.br";

export async function semearM06(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "EF" },
      { id: "sub-362", codigo: "362", nome: "EM" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "PJ",
    },
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
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_500, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE_500, valorDotado: "100000.00" },
    { ...base, id: FICHA_540, numero: 2, subfuncaoId: "sub-362", fonteId: FONTE_540, valorDotado: "100000.00" },
  ]);
}

/** Empenha + liquida numa data. Devolve o id da liquidação. */
export async function empenharELiquidar(
  deps: M05Deps,
  opts: {
    fichaId: string;
    numero: string;
    valor: string;
    categoria: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
    dataLiquidacao: string;
  }
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: opts.fichaId,
      numero: `NE-${opts.numero}`,
      tipo: "ORDINARIO",
      valor: opts.valor,
      data: new Date("2026-01-02T12:00:00Z"),
      credorCpfCnpj: "12345678000199",
      historico: `empenho ${opts.numero}`,
      categoriaOrdemCronologica: opts.categoria,
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId,
      numero: opts.numero,
      valor: opts.valor,
      data: new Date(opts.dataLiquidacao),
      responsavelAtesto: "Fulano",
      historico: `liquidação ${opts.numero}`,
      criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

describe("M06 — fila DERIVADA (banco real)", () => {
  let deps: M05Deps;
  const ordem = criarOrdemCronologicaPrisma(prisma);

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM06();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a fila sai ordenada pela data de liquidação", async () => {
    const b = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL2", valor: "200.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-03-10T12:00:00Z",
    });
    const a = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });

    const fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila.map((l) => l.liquidacaoId)).toEqual([a, b]);
    expect(fila[0]!.saldoAPagar.toFixed(2)).toBe("100.00");
    expect(await ordem.posicaoNaFila(a)).toBe(1);
    expect(await ordem.posicaoNaFila(b)).toBe(2);
  });

  it("FILAS INDEPENDENTES por FONTE", async () => {
    const antiga500 = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    const nova540 = await empenharELiquidar(deps, {
      fichaId: FICHA_540, numero: "NL2", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // a liquidação de junho é a CABEÇA da fila da fonte 540, mesmo havendo uma
    // de janeiro na fonte 500 — o art. 141 ordena POR FONTE.
    expect(await ordem.posicaoNaFila(nova540)).toBe(1);
    expect(await ordem.posicaoNaFila(antiga500)).toBe(1);

    const fila540 = await ordem.filaDePagamentos(FONTE_540, "FORNECIMENTO_BENS");
    expect(fila540.map((l) => l.liquidacaoId)).toEqual([nova540]);
  });

  it("FILAS INDEPENDENTES por CATEGORIA (mesma fonte)", async () => {
    const bens = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    const obras = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL2", valor: "100.00",
      categoria: "REALIZACAO_OBRAS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // a de obras é cabeça da SUA fila, mesmo sendo posterior à de bens
    expect(await ordem.posicaoNaFila(bens)).toBe(1);
    expect(await ordem.posicaoNaFila(obras)).toBe(1);

    expect(
      (await ordem.filaDePagamentos(FONTE_500, "REALIZACAO_OBRAS")).map((l) => l.liquidacaoId)
    ).toEqual([obras]);
  });

  it("a liquidação QUITADA sai da fila; a PARCIALMENTE paga CONTINUA", async () => {
    const { pagar } = await import("../m05-despesa/servico-bloco2.js");
    const { roteiroPagamento } = await import("../m05-despesa/dominio.js");
    const R_PAG = roteiroPagamento({
      obrigacaoAPagar: "2.1.3.1.1.00.00",
      disponibilidade: "1.1.1.1.2.00.00",
      creditoLiquidado: "6.2.2.1.3.03.00",
      creditoPago: "6.2.2.1.3.01.00",
    });

    const a = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });

    // paga METADE -> continua na fila, com saldo 50
    await pagar(
      {
        liquidacaoId: a, numero: "NP1", valor: "50.00",
        data: new Date("2026-02-01T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE_500,
        historico: "parcial", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    let fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila).toHaveLength(1);
    expect(fila[0]!.saldoAPagar.toFixed(2)).toBe("50.00");
    // e continua na data ORIGINAL — não foi para o fim da fila
    expect(fila[0]!.dataLiquidacao.toISOString().slice(0, 10)).toBe("2026-01-05");

    // quita -> SAI da fila
    await pagar(
      {
        liquidacaoId: a, numero: "NP2", valor: "50.00",
        data: new Date("2026-02-02T12:00:00Z"),
        contaBancaria: "CC-001", fonteId: FONTE_500,
        historico: "quita", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    fila = await ordem.filaDePagamentos(FONTE_500, "FORNECIMENTO_BENS");
    expect(fila).toHaveLength(0);
    expect(await ordem.posicaoNaFila(a)).toBeNull();
  });

  it("consultaOrdemCronologica (§3º) devolve as filas e as quebras do mês", async () => {
    await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    await empenharELiquidar(deps, {
      fichaId: FICHA_540, numero: "NL2", valor: "100.00",
      categoria: "REALIZACAO_OBRAS", dataLiquidacao: "2026-01-20T12:00:00Z",
    });

    const c = await ordem.consultaOrdemCronologica({
      inicio: new Date("2026-01-01T00:00:00Z"),
      fim: new Date("2026-12-31T23:59:59Z"),
    });

    // duas filas distintas: (500, BENS) e (540, OBRAS)
    expect(c.filas).toHaveLength(2);
    const chaves = c.filas.map((f) => `${f.fonteCodigo}|${f.categoria}`).sort();
    expect(chaves).toEqual(["500|FORNECIMENTO_BENS", "540|REALIZACAO_OBRAS"]);
    expect(c.quebras).toHaveLength(0); // nenhuma quebra ainda
  });
});
