import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularLiquidacao, liquidar } from "../m05-despesa/servico-bloco2.js";
import {
  adquirirBem,
  baixarBem,
  estornarMovimentoPatrimonial,
  registrarEntradaAvulsa,
  valorContabilDaClasse,
  valorContabilDoBem,
} from "./patrimonio.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M10 bloco 1 — classes, bens e movimentos patrimoniais.
 *
 * ⚠️ AS CONTAS DO PCASP AQUI SÃO FIXTURES DE TESTE, como em todo o projeto: não
 * existe seed oficial de PCASP no repo. É EXATAMENTE por isso que o roteiro é uma
 * TABELA (`RoteiroPatrimonial`) — quando o plano real chegar, ele entra ali, e
 * nenhuma linha de código muda.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const FONTE = "fnt-500";
const CLASSE = "cl-veiculos";
const BEM_1 = "bem-1";
const BEM_2 = "bem-2";

// Fixtures do PCASP.
const IMOBILIZADO = "1.2.3.1.1.01.00"; // Bens móveis — veículos
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPA_INCORP = "4.5.9.1.1.00.00"; // VPA — incorporação de ativos
const VPD_BAIXA = "3.6.1.1.1.00.00"; // VPD — baixa/alienação de ativos
const VPD_CORRENTE = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const CONTAS = [
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-baixa", codigo: VPD_BAIXA, nome: "VPD baixa de ativos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD_CORRENTE, nome: "VPD corrente", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD_CORRENTE, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });

  // 4.4.90.52 — INVESTIMENTOS (grupo 4): compra bem.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-capital", codCategoria: "4", codNatureza: "4", codModalidade: "90",
      codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos e material permanente",
    },
  });
  // 3.3.90.39 — OUTRAS DESPESAS CORRENTES (grupo 3): NÃO compra bem.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-corrente", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços - PJ",
    },
  });

  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", fonteId: FONTE,
    valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-capital", numero: 1, naturezaDespesaId: "nd-capital" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-corrente", numero: 2, naturezaDespesaId: "nd-corrente" });

  // ── A CLASSE e os BENS (cadastro = IDENTIDADE, zero valor) ──────────────
  await prisma.classeDeBens.create({
    data: {
      id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos",
      especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR,
    },
  });
  await prisma.classeDeBens.create({
    data: {
      id: "cl-outra", codigo: "1.2.3.1.1.02", descricao: "Móveis e utensílios",
      especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR,
    },
  });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: BEM_1, numeroTombamento: "TOMB-0001", descricao: "Ônibus escolar", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
      { id: BEM_2, numeroTombamento: "TOMB-0002", descricao: "Van escolar", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
      { id: "bem-outra-classe", numeroTombamento: "TOMB-0003", descricao: "Armário", classeDeBensId: "cl-outra", dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
    ],
  });

  // ── O ROTEIRO — por PARÂMETRO (tabela). Só os tipos usados neste bloco.
  // CUSTO_SUBSEQUENTE fica DE FORA de propósito: é o teste t10.
  await prisma.roteiroPatrimonial.createMany({
    data: [
      // D imobilizado / C fornecedores (o bem entra; a obrigação existe)
      { tipo: "AQUISICAO", contaDebitoId: "c-imob", contaCreditoId: "c-forn", criadoPor: POR },
      // D imobilizado / C VPA (o patrimônio aumenta sem contrapartida financeira)
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DOACAO_RECEBIDA", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      // D VPD / C imobilizado (o bem sai)
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd-baixa", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "DOACAO_REALIZADA", contaDebitoId: "c-vpd-baixa", contaCreditoId: "c-imob", criadoPor: POR },
    ],
  });
}

/** Empenha e liquida na ficha dada. Devolve o id da liquidação. */
async function umaLiquidacao(
  fichaId: string,
  numero: string,
  valor: string
): Promise<string> {
  const e = await empenhar(
    {
      fichaId, numero: `NE-${numero}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero, valor,
      data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

const DATA = new Date("2026-02-15T12:00:00Z");

/** ΣD == ΣC no PATRIMONIAL, para um lançamento. */
async function conferirBalanceamento(lancamentoId: string): Promise<void> {
  const l = await prisma.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    include: { partidas: { include: { conta: true } } },
  });
  expect(l.partidas.every((p) => p.subsistema === "PATRIMONIAL")).toBe(true);
  // patrimonial puro: o movimento NÃO executa orçamento (quem executou foi o M05)
  expect(l.partidas.every((p) => p.fichaId === null)).toBe(true);

  const soma = (t: string) =>
    l.partidas
      .filter((p) => p.tipo === t)
      .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
  expect(soma("DEBITO").toFixed(2)).toBe(soma("CREDITO").toFixed(2));
}

describe("M10 — patrimônio: classes, bens e movimentos", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: aquisição via liquidação de CAPITAL: movimento + lançamento balanceado", async () => {
    const liq = await umaLiquidacao("ficha-capital", "NL-1", "150000.00");

    const r = await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "150000.00",
      bemId: BEM_1, dataMovimento: DATA, criadoPor: POR,
    });

    const mov = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: r.movimentoId },
      include: { lancamento: { include: { partidas: { include: { conta: true } } } } },
    });
    expect(mov.tipo).toBe("AQUISICAO");
    expect(mov.valor.toFixed(2)).toBe("150000.00");
    expect(mov.liquidacaoId).toBe(liq);
    expect(mov.bemId).toBe(BEM_1);

    // o lançamento: D imobilizado / C fornecedores, PATRIMONIAL, balanceado
    const papel = new Map(mov.lancamento.partidas.map((p) => [p.conta.codigo, p.tipo]));
    expect(papel.get(IMOBILIZADO)).toBe("DEBITO");
    expect(papel.get(FORNECEDOR)).toBe("CREDITO");
    await conferirBalanceamento(r.lancamentoId);

    // e o valor contábil sai do SUM, nunca de coluna
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("150000.00");
    expect((await valorContabilDoBem(prisma, BEM_1)).toFixed(2)).toBe("150000.00");
  });

  // t2
  it("t2: liquidação de despesa CORRENTE não incorpora bem — SELECT prova zero", async () => {
    const liq = await umaLiquidacao("ficha-corrente", "NL-2", "5000.00");

    await expect(
      adquirirBem(prisma, {
        classeDeBensId: CLASSE, liquidacaoId: liq, valor: "5000.00",
        dataMovimento: DATA, criadoPor: POR,
      })
    ).rejects.toThrow(/NÃO é despesa de capital/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "PATRIMONIAL_" } } })
    ).toBe(0);
  });

  // t3
  it("t3: liquidação ANULADA no M05 (de verdade) não incorpora bem", async () => {
    const liq = await umaLiquidacao("ficha-capital", "NL-3", "150000.00");

    // anula pelo SERVIÇO do M05 — nada de mock
    await anularLiquidacao(
      {
        liquidacaoId: liq, numero: "NL-3-ANUL", data: new Date("2026-02-12T12:00:00Z"),
        historico: "Anulação", criadoPor: POR,
      },
      deps
    );

    await expect(
      adquirirBem(prisma, {
        classeDeBensId: CLASSE, liquidacaoId: liq, valor: "150000.00",
        dataMovimento: DATA, criadoPor: POR,
      })
    ).rejects.toThrow(/está ANULADA/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
  });

  // t4
  it("t4: incorporar MAIS do que a liquidação é rejeitado", async () => {
    const liq = await umaLiquidacao("ficha-capital", "NL-4", "150000.00");

    await expect(
      adquirirBem(prisma, {
        classeDeBensId: CLASSE, liquidacaoId: liq, valor: "150000.01",
        dataMovimento: DATA, criadoPor: POR,
      })
    ).rejects.toThrow(/excede a liquidação/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
  });

  // t5
  it("t5: baixa > valor da classe rejeita; baixa == saldo passa; +0,01 rejeita", async () => {
    const liq = await umaLiquidacao("ficha-capital", "NL-5", "150000.00");
    await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "150000.00",
      bemId: BEM_1, dataMovimento: DATA, criadoPor: POR,
    });

    // 150.000,01 > 150.000,00
    await expect(
      baixarBem(prisma, {
        tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "150000.01",
        dataMovimento: DATA, motivo: "Veículo alienado em leilão público.", criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil da classe/);
    expect(await prisma.movimentoPatrimonial.count()).toBe(1); // só a aquisição

    // exatamente o saldo: PASSA
    await baixarBem(prisma, {
      tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "150000.00",
      bemId: BEM_1, dataMovimento: DATA, motivo: "Veículo alienado em leilão público.",
      criadoPor: POR,
    });
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("0.00");

    // e agora 0,01 já não cabe (fail-closed NO LIMITE)
    await expect(
      baixarBem(prisma, {
        tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "0.01",
        dataMovimento: DATA, motivo: "Tentativa de baixar o que já não existe.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil da classe/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(2);
  });

  it("t5b: a classe positiva NÃO mascara a baixa de um bem que já não vale", async () => {
    // BEM_1 vale 100.000; BEM_2 vale 50.000; a classe vale 150.000.
    const liq = await umaLiquidacao("ficha-capital", "NL-5b", "150000.00");
    await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "100000.00",
      bemId: BEM_1, dataMovimento: DATA, criadoPor: POR,
    });
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "50000.00",
      bemId: BEM_2, dataMovimento: DATA,
      motivo: "Avaliação inicial da van escolar recebida.", criadoPor: POR,
    });

    // baixar 120.000 do BEM_2 CABE na classe (150.000), mas NÃO no bem (50.000)
    await expect(
      baixarBem(prisma, {
        tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "120000.00",
        bemId: BEM_2, dataMovimento: DATA,
        motivo: "Tentativa de baixar mais do que o bem vale.", criadoPor: POR,
      })
    ).rejects.toThrow(/excede o valor contábil do BEM/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(2);
  });

  // t6
  it("t6: bem de OUTRA classe é rejeitado", async () => {
    await expect(
      registrarEntradaAvulsa(prisma, {
        tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "1000.00",
        bemId: "bem-outra-classe", dataMovimento: DATA,
        motivo: "Doação de armário recebida da União.", criadoPor: POR,
      })
    ).rejects.toThrow(/NÃO é da classe/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count({ where: { origemTipo: { startsWith: "PATRIMONIAL_" } } })).toBe(0);
  });

  // t7
  it("t7: o BEM soma só o que é dele; a CLASSE soma tudo (inclusive o sintético)", async () => {
    // dois movimentos amarrados ao BEM_1 e um SINTÉTICO (sem bemId) na classe
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "10000.00",
      bemId: BEM_1, dataMovimento: DATA,
      motivo: "Avaliação inicial do ônibus escolar.", criadoPor: POR,
    });
    await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "2500.00",
      bemId: BEM_1, dataMovimento: DATA,
      motivo: "Kit de acessibilidade doado, incorporado ao ônibus.", criadoPor: POR,
    });
    await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "700.00",
      dataMovimento: DATA, // SEM bemId: sintético da classe (TR 5.84)
      motivo: "Lote de peças doado, sem individualização.", criadoPor: POR,
    });

    // o bem: 10.000 + 2.500 = 12.500
    expect((await valorContabilDoBem(prisma, BEM_1)).toFixed(2)).toBe("12500.00");
    // a classe: 10.000 + 2.500 + 700 = 13.200
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("13200.00");
    // e o outro bem, que não recebeu nada, vale zero
    expect((await valorContabilDoBem(prisma, BEM_2)).toFixed(2)).toBe("0.00");
  });

  // t8
  it("t8: estorno restaura classe E bem, com lançamento invertido e valor PRESERVADO", async () => {
    const liq = await umaLiquidacao("ficha-capital", "NL-8", "150000.00");
    const aquisicao = await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "150000.00",
      bemId: BEM_1, dataMovimento: DATA, criadoPor: POR,
    });
    // uma baixa parcial, para o estorno ter o que devolver
    const baixa = await baixarBem(prisma, {
      tipo: "BAIXA_ALIENACAO", classeDeBensId: CLASSE, valor: "40000.00",
      bemId: BEM_1, dataMovimento: DATA,
      motivo: "Baixa registrada por engano — o veículo não foi alienado.",
      criadoPor: POR,
    });

    // 150.000 − 40.000 = 110.000
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("110000.00");
    expect((await valorContabilDoBem(prisma, BEM_1)).toFixed(2)).toBe("110000.00");

    const est = await estornarMovimentoPatrimonial(prisma, {
      movimentoId: baixa.movimentoId, dataMovimento: new Date("2026-03-01T12:00:00Z"),
      motivo: "Baixa indevida — o leilão foi cancelado por decisão judicial.",
      criadoPor: POR,
    });

    // o valor VOLTA — na classe e no bem
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("150000.00");
    expect((await valorContabilDoBem(prisma, BEM_1)).toFixed(2)).toBe("150000.00");

    const movEstorno = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: est.movimentoId },
    });
    expect(movEstorno.tipo).toBe("ESTORNO_BAIXA_ALIENACAO");
    // MESMO valor — recarimbar devolveria um valor diferente do que foi tomado
    expect(movEstorno.valor.toFixed(2)).toBe("40000.00");
    expect(movEstorno.estornoDeId).toBe(baixa.movimentoId);
    expect(movEstorno.bemId).toBe(BEM_1);

    // o lançamento de estorno: pernas INVERTIDAS e balanceado
    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: est.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    expect(lanc.estornoDeId).toBeDefined();
    const papel = new Map(lanc.partidas.map((p) => [p.conta.codigo, p.tipo]));
    // na baixa era D VPD / C imobilizado -> agora invertido
    expect(papel.get(VPD_BAIXA)).toBe("CREDITO");
    expect(papel.get(IMOBILIZADO)).toBe("DEBITO");
    await conferirBalanceamento(est.lancamentoId);

    // APPEND-ONLY: o original está intacto
    const original = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: baixa.movimentoId },
    });
    expect(original.tipo).toBe("BAIXA_ALIENACAO");
    expect(original.estornoDeId).toBeNull();
    expect(aquisicao.movimentoId).toBeDefined();
  });

  it("t8b: estorno de estorno é erro; duplo estorno pelo serviço é erro", async () => {
    const e1 = await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "1000.00",
      dataMovimento: DATA, motivo: "Doação de equipamento recebida.", criadoPor: POR,
    });
    const est = await estornarMovimentoPatrimonial(prisma, {
      movimentoId: e1.movimentoId, dataMovimento: DATA,
      motivo: "Doação registrada em duplicidade no sistema.", criadoPor: POR,
    });

    await expect(
      estornarMovimentoPatrimonial(prisma, {
        movimentoId: est.movimentoId, dataMovimento: DATA,
        motivo: "Tentando estornar o estorno.", criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ É um estorno/);

    await expect(
      estornarMovimentoPatrimonial(prisma, {
        movimentoId: e1.movimentoId, dataMovimento: DATA,
        motivo: "Tentando estornar de novo o mesmo movimento.", criadoPor: POR,
      })
    ).rejects.toThrow(/já foi estornado/);
  });

  // t9
  it("t9: uq_estorno_patrimonial_unico barra o duplo estorno via INSERT direto", async () => {
    const e1 = await registrarEntradaAvulsa(prisma, {
      tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "1000.00",
      dataMovimento: DATA, motivo: "Doação de equipamento recebida.", criadoPor: POR,
    });
    const est = await estornarMovimentoPatrimonial(prisma, {
      movimentoId: e1.movimentoId, dataMovimento: DATA,
      motivo: "Doação registrada em duplicidade no sistema.", criadoPor: POR,
    });

    let erro: unknown;
    try {
      await prisma.movimentoPatrimonial.create({
        data: {
          classeDeBensId: CLASSE,
          tipo: "ESTORNO_DOACAO_RECEBIDA",
          valor: "1000.00",
          dataMovimento: DATA,
          estornoDeId: e1.movimentoId, // JÁ estornado!
          lancamentoId: est.lancamentoId,
          motivo: "clandestino",
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (duplo estorno patrimonial):\n" + String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_patrimonial_unico|Unique constraint/i);

    // e o valor não voltou em dobro: 1.000 − 1.000 = 0
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("0.00");
  });

  // t10
  it("t10: tipo SEM roteiro parametrizado: erro nomeado, e zero escrita", async () => {
    // CUSTO_SUBSEQUENTE não foi seedado no RoteiroPatrimonial de propósito.
    // Não há serviço público para ele neste bloco — o guard vive no núcleo, e é
    // por ele que qualquer tipo novo passa. Provamos com um INSERT de roteiro
    // ausente através do serviço de entrada avulsa, trocando o roteiro da doação.
    await prisma.roteiroPatrimonial.deleteMany({ where: { tipo: "DOACAO_RECEBIDA" } });

    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      registrarEntradaAvulsa(prisma, {
        tipo: "DOACAO_RECEBIDA", classeDeBensId: CLASSE, valor: "1000.00",
        dataMovimento: DATA, motivo: "Doação sem roteiro parametrizado.", criadoPor: POR,
      })
    ).rejects.toThrow(/ROTEIRO CONTÁBIL NÃO PARAMETRIZADO/);

    // NADA: nem movimento, nem lançamento. Melhor não contabilizar do que
    // contabilizar na conta errada.
    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
  });

  it("classe INATIVA não recebe movimento", async () => {
    await prisma.classeDeBens.create({
      data: {
        id: "cl-morta", codigo: "9.9.9", descricao: "Classe extinta", especie: "MOVEL",
        contaContabilAtivoId: "c-imob", ativa: false, criadoPor: POR,
      },
    });

    await expect(
      registrarEntradaAvulsa(prisma, {
        tipo: "DOACAO_RECEBIDA", classeDeBensId: "cl-morta", valor: "100.00",
        dataMovimento: DATA, motivo: "Doação para classe extinta.", criadoPor: POR,
      })
    ).rejects.toThrow(/está INATIVA/);

    expect(await prisma.movimentoPatrimonial.count()).toBe(0);
  });
});
