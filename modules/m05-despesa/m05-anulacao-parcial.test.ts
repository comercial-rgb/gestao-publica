import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
import { despesaPorFonte } from "./consultas.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "./dominio.js";
import { empenhar, saldosCorrentesDaFicha } from "./servico.js";
import { anularPagamento, liquidar, pagar } from "./servico-bloco2.js";
import {
  anularEmpenhoParcial,
  anularLiquidacaoParcial,
  anularPagamentoParcial,
  estornarAnulacaoParcial,
} from "./anulacao-parcial.js";
import type { M05Deps } from "./ports.js";
import { criarM05DepsComAlmoxarifado } from "../m10-patrimonial/adapter-m05-almox.js";
import { cadastrarDivida } from "../m10-patrimonial/divida.js";
import {
  cadastrarClasseDeMaterial,
  conferirAlmoxarifadoContraRazao,
  registrarEntradaAlmoxarifado,
  saldoDaClasseDeMaterial,
} from "../m10-patrimonial/almoxarifado.js";

/**
 * TR 5.35 — ANULAÇÃO PARCIAL de empenho, liquidação e pagamento.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ A PARCIAL É UM FATO NOVO, NÃO UM ESTORNO ═══
 * O estorno NEGA o fato (o original sai de toda soma líquida). A parcial o REDUZ (o
 * original fica, valendo menos). Por isso ela ganhou COLUNA PRÓPRIA — gravá-la como
 * estorno faria a fila do art. 141, o saldo do contrato, o superávit por fonte e o
 * relatório de restos responderem ZERO onde a resposta é 1.500.
 *
 * ═══ t1 — EMPENHO ═══
 *   empenha 10.000 → liquida 6.000
 *   saldo a liquidar = 10.000 − 6.000 = 4.000,00
 *   anulação parcial de 4.000,01 ⟹ REJEITADA (é o saldo DE BAIXO que manda)
 *   anulação parcial de 4.000,00 ⟹ PASSA
 *   ⟹ empenhado líquido = 6.000,00; a ficha RECUPERA 4.000,00 (derivação)
 *   estorno da parcial ⟹ empenhado volta a 10.000,00
 *
 * ═══ t2 — LIQUIDAÇÃO ═══
 *   liquidação 6.000, pago 2.500 ⟹ não pago = 3.500,00
 *   parcial de 3.500,01 ⟹ REJEITADA; de 3.500,00 ⟹ PASSA
 *   ⟹ liquidado líquido = 2.500,00, e a FILA do art. 141 some (saldo a pagar = 0)
 *
 * ═══ t3 — PAGAMENTO ═══
 *   pagamento 2.500 → parcial de 1.000 ⟹ pago líquido = 1.500,00
 *   ⟹ saldo a pagar da liquidação = 6.000 − 1.500 = 4.500,00
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-1";
const FICHA_AMORT = "ficha-amort";
const FONTE = "fnt-500";
const T_INSS = "tc-inss";

const CAIXA = "1.1.1.1.2.00.00";
const ESTOQUE = "1.1.5.1.1.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const CONSIGNACAO = "2.1.8.8.1.01.00";
const DIVIDA = "2.2.1.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_LIQUIDACAO_MATERIAL = roteiroLiquidacao({
  variacaoDiminutiva: ESTOQUE,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});

const CORTE = new Date("2026-12-31T23:59:59Z");
let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05DepsComAlmoxarifado(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-estoque", codigo: ESTOQUE, nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-consig", codigo: CONSIGNACAO, nome: "Consignações", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-divida", codigo: DIVIDA, nome: "Dívida fundada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
      { id: "nd-amort", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });
  await prisma.tipoConsignacao.create({
    // A conta de passivo é do CADASTRO: a gravação confronta a conta composta com ela.
    data: { id: T_INSS, codigo: "INSS", descricao: "INSS", contaPassivoId: "c-consig", criadoPor: POR },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA, numero: 1, naturezaDespesaId: "nd" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_AMORT, numero: 2, naturezaDespesaId: "nd-amort" });

  await prisma.roteiroAlmoxarifado.create({
    data: {
      tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque",
      criadoPor: POR,
    },
  });
}

/** Empenha, e devolve o id. */
async function empenhaDe(valor: string, n = "1", ficha = FICHA): Promise<string> {
  const e = await empenhar(
    {
      fichaId: ficha, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

async function liquidaDe(
  empenhoId: string,
  valor: string,
  n = "1",
  roteiro = R_LIQUIDACAO
): Promise<string> {
  const l = await liquidar(
    {
      empenhoId, numero: `NL-${n}`, valor,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    roteiro,
    deps
  );
  return l.liquidacaoId;
}

async function pagaDe(
  liquidacaoId: string,
  valor: string,
  n = "1",
  retencoes?: Parameters<typeof pagar>[3]
): Promise<string> {
  const p = await pagar(
    {
      liquidacaoId, numero: `NP-${n}`, valor,
      data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pagamento", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps,
    retencoes
  );
  return p.pagamentoId;
}

/** ΣD == ΣC no razão inteiro. */
async function ledgerFecha(): Promise<boolean> {
  const todas = await prisma.partidaContabil.findMany({ select: { tipo: true, valor: true } });
  const d = todas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
  const c = todas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
  return d === c;
}

describe("TR 5.35 — anulação parcial", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: empenho 10.000 liquidado em 6.000 — parcial de 4.000 passa; 4.000,01 não", async () => {
    const empenhoId = await empenhaDe("10000.00");
    await liquidaDe(empenhoId, "6000.00");

    // 10.000 − 6.000 = 4.000 a liquidar. Um centavo a mais estoura.
    let erro: unknown;
    try {
      await anularEmpenhoParcial(
        {
          originalId: empenhoId, numero: "NE-1-AP", valor: "4000.01",
          data: new Date("2026-05-01T12:00:00Z"),
          motivo: "anulando mais do que sobrou para liquidar", criadoPor: POR,
        },
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> PARCIAL > SALDO A LIQUIDAR (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/ANULAÇÃO PARCIAL MAIOR QUE O SALDO A LIQUIDAR/);
    expect(msg).toMatch(/4000\.00/);
    expect(msg).toMatch(/anule a liquidação primeiro/);

    const antes = await saldosCorrentesDaFicha(FICHA, deps);
    expect(antes.empenhado.toFixed(2)).toBe("10000.00");

    // ═══ 4.000,00 — EXATAMENTE o saldo a liquidar ═══
    const parcial = await anularEmpenhoParcial(
      {
        originalId: empenhoId, numero: "NE-1-AP", valor: "4000.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "saldo não utilizado do empenho, devolvido à dotação",
        criadoPor: POR,
      },
      deps
    );

    // ⚠️ A FICHA RECUPERA 4.000 POR DERIVAÇÃO (nenhuma escrita de saldo).
    const depois = await saldosCorrentesDaFicha(FICHA, deps);
    expect(depois.empenhado.toFixed(2)).toBe("6000.00");
    expect(Number(antes.disponivel.toFixed(2)) + 4000).toBe(
      Number(depois.disponivel.toFixed(2))
    );
    expect(await ledgerFecha()).toBe(true);

    // ⚠️ E O ORIGINAL NÃO FOI ANULADO: ele continua vivo, valendo menos.
    const original = await prisma.empenho.findUniqueOrThrow({
      where: { id: empenhoId },
      select: { estornoDeId: true, estornos: { select: { id: true } } },
    });
    expect(original.estornoDeId).toBeNull();
    expect(original.estornos).toHaveLength(0);

    // ═══ O ESTORNO DA PARCIAL RESTAURA OS 10.000 ═══
    await estornarAnulacaoParcial(
      {
        anulacaoId: parcial.anulacaoId, nivel: "EMPENHO", numero: "NE-1-AP-EST",
        data: new Date("2026-06-01T12:00:00Z"),
        motivo: "a anulação parcial foi lançada por engano", criadoPor: POR,
      },
      deps
    );
    const restaurado = await saldosCorrentesDaFicha(FICHA, deps);
    expect(restaurado.empenhado.toFixed(2)).toBe("10000.00");
    expect(await ledgerFecha()).toBe(true);
  });

  // t2
  it("t2: liquidação 6.000 paga em 2.500 — parcial de 3.500 passa, e a FILA reflete sozinha", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    await pagaDe(liq, "2500.00");

    const ordem = criarOrdemCronologicaPrisma(prisma);
    const filaAntes = (await ordem.filaDePagamentos(FONTE, "FORNECIMENTO_BENS")).find((x) => x.liquidacaoId === liq);
    expect(filaAntes?.saldoAPagar.toFixed(2)).toBe("3500.00");

    await expect(
      anularLiquidacaoParcial(
        {
          originalId: liq, numero: "NL-1-AP", valor: "3500.01",
          data: new Date("2026-05-01T12:00:00Z"),
          motivo: "anulando abaixo do que já foi pago", criadoPor: POR,
        },
        deps
      )
    ).rejects.toThrow(/ANULAÇÃO PARCIAL MAIOR QUE O SALDO NÃO PAGO/);

    await anularLiquidacaoParcial(
      {
        originalId: liq, numero: "NL-1-AP", valor: "3500.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "nota fiscal glosada em parte pela fiscalização", criadoPor: POR,
      },
      deps
    );

    // ⚠️ A FILA DO ART. 141 REFLETE SOZINHA — nenhum código novo no M06.
    // liquidado líquido 2.500 − pago 2.500 = 0 ⟹ QUITADA, sai da fila.
    const filaDepois = (await ordem.filaDePagamentos(FONTE, "FORNECIMENTO_BENS")).find((x) => x.liquidacaoId === liq);
    expect(filaDepois).toBeUndefined();
    expect(await ledgerFecha()).toBe(true);
  });

  // t3
  it("t3: pagamento 2.500 — parcial de 1.000 deixa o pago líquido em 1.500", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag = await pagaDe(liq, "2500.00");

    await anularPagamentoParcial(
      {
        originalId: pag, numero: "NP-1-AP", valor: "1000.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "devolução parcial do fornecedor por serviço não prestado",
        criadoPor: POR,
      },
      deps
    );

    // ⚠️ O PAGAMENTO VALE 1.500 — e NÃO zero (que é o que responderia se a parcial
    // tivesse sido gravada como estorno).
    const ordem = criarOrdemCronologicaPrisma(prisma);
    const fila = (await ordem.filaDePagamentos(FONTE, "FORNECIMENTO_BENS")).find((x) => x.liquidacaoId === liq);
    // 6.000 liquidado − 1.500 pago = 4.500 a pagar
    expect(fila?.saldoAPagar.toFixed(2)).toBe("4500.00");
    expect(await ledgerFecha()).toBe(true);
  });

  // t4
  it("t4: pagamento COM RETENÇÃO — parcial PROIBIDA; a anulação TOTAL segue funcionando", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag = await pagaDe(liq, "2500.00", "1", {
      contaDisponibilidade: CAIXA,
      retencoes: [
        {
          tipoConsignacaoId: T_INSS, credorConsignatario: "INSS",
          valor: "250.00", contaConsignacaoAPagar: CONSIGNACAO,
        },
      ],
    });

    let erro: unknown;
    try {
      await anularPagamentoParcial(
        {
          originalId: pag, numero: "NP-1-AP", valor: "1000.00",
          data: new Date("2026-05-01T12:00:00Z"),
          motivo: "tentando anular em parte um pagamento com retenção",
          criadoPor: POR,
        },
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> PARCIAL COM RETENÇÃO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/ANULAÇÃO PARCIAL DE PAGAMENTO COM RETENÇÃO É PROIBIDA/);
    expect(msg).toMatch(/de QUEM sai o pedaço/);
    expect(msg).toMatch(/INTEIRO/);

    // ⚠️ REGRESSÃO: a anulação TOTAL segue cascateando a retenção (M07).
    await anularPagamento(
      {
        pagamentoId: pag, numero: "NP-1-ANUL",
        data: new Date("2026-05-01T12:00:00Z"),
        historico: "anulação total", criadoPor: POR,
      },
      deps
    );
    const movs = await prisma.movimentoExtraorcamentario.findMany({
      where: { pagamentoId: pag },
      select: { tipo: true },
    });
    expect(movs.map((m) => m.tipo).sort()).toEqual(["ESTORNO_INGRESSO", "INGRESSO"]);
    expect(await ledgerFecha()).toBe(true);
  });

  // t5
  it("t5: pagamento que AMORTIZOU DÍVIDA — parcial PROIBIDA; total cascateia o estorno", async () => {
    const { dividaId } = await cadastrarDivida(prisma, {
      identificador: "CEF-001", credorNome: "Caixa", credorDocumento: "00360305000104",
      tipo: "CONTRATUAL", leiAutorizativa: "Lei 1/2025",
      objeto: "Financiamento de infraestrutura", contaContabilId: "c-divida",
      criadoPor: POR,
    });
    // a dívida precisa de saldo: um ingresso direto (o vínculo com a receita é do M10)
    await prisma.movimentoDivida.create({
      data: {
        dividaId, tipo: "INGRESSO_OPERACAO_CREDITO", valor: "50000.00",
        dataMovimento: new Date("2026-01-10T12:00:00Z"),
        motivo: "ingresso de teste", criadoPor: POR,
      },
    });

    const e = await empenhar(
      {
        fichaId: FICHA_AMORT, dividaId, numero: "NE-D", tipo: "ORDINARIO",
        valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: "00360305000104", historico: "amortização",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const liq = await liquidaDe(e.empenhoId, "10000.00", "D");
    const pag = await pagaDe(liq, "10000.00", "D");

    let erro: unknown;
    try {
      await anularPagamentoParcial(
        {
          originalId: pag, numero: "NP-D-AP", valor: "1000.00",
          data: new Date("2026-05-01T12:00:00Z"),
          motivo: "tentando encolher uma amortização", criadoPor: POR,
        },
        deps
      );
    } catch (e2) {
      erro = e2;
    }
    const msg = String(erro);
    console.log("\n>>> PARCIAL COM AMORTIZAÇÃO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/ANULAÇÃO PARCIAL DE PAGAMENTO QUE AMORTIZOU DÍVIDA É PROIBIDA/);
    expect(msg).toMatch(/encolher uma amortização/);

    // ⚠️ REGRESSÃO: a anulação TOTAL cascateia o estorno da amortização (bloco 4).
    await anularPagamento(
      {
        pagamentoId: pag, numero: "NP-D-ANUL",
        data: new Date("2026-05-01T12:00:00Z"),
        historico: "anulação total", criadoPor: POR,
      },
      deps
    );
    expect(
      await prisma.movimentoDivida.count({ where: { tipo: "ESTORNO_AMORTIZACAO" } })
    ).toBe(1);
  });

  // t6
  it("t6: a CASCATA do almoxarifado — a parcial que deixaria a liquidação abaixo do material é rejeitada", async () => {
    const classe = await cadastrarClasseDeMaterial(prisma, {
      codigo: "30.01", descricao: "Material de expediente",
      contaContabilId: "c-estoque", criadoPor: POR,
    });
    const classeB = await cadastrarClasseDeMaterial(prisma, {
      codigo: "30.02", descricao: "Material de limpeza",
      contaContabilId: "c-estoque", criadoPor: POR,
    });

    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "5000.00", "1", R_LIQUIDACAO_MATERIAL);

    // as DUAS entradas somam os 5.000 da liquidação
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classe.classeDeMaterialId, liquidacaoId: liq,
      valor: "3000.00", dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classeB.classeDeMaterialId, liquidacaoId: liq,
      valor: "2000.00", dataMovimento: new Date("2026-03-01T12:00:00Z"), criadoPor: POR,
    });
    await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");

    // (a) anular 1.000 deixaria a liquidação valendo 4.000 < 5.000 de material
    let erro: unknown;
    try {
      await anularLiquidacaoParcial(
        {
          originalId: liq, numero: "NL-1-AP", valor: "1000.00",
          data: new Date("2026-05-01T12:00:00Z"),
          motivo: "glosa parcial da nota, com material já recebido", criadoPor: POR,
        },
        deps
      );
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CASCATA PARCIAL (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/ABAIXO DO MATERIAL JÁ RECEBIDO/);
    expect(msg).toMatch(/5000\.00/);
    expect(msg).toMatch(/4000\.00/);
    // nada aconteceu
    expect(await prisma.liquidacao.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(0);

    // (b) a anulação TOTAL estorna AS DUAS entradas, cada uma com o SEU valor
    await prisma.$transaction([]); // no-op, só para separar
    const { anularLiquidacao } = await import("./servico-bloco2.js");
    await anularLiquidacao(
      {
        liquidacaoId: liq, numero: "NL-1-ANUL",
        data: new Date("2026-05-01T12:00:00Z"),
        historico: "nota glosada integralmente", criadoPor: POR,
      },
      deps
    );

    const estornos = await prisma.movimentoAlmoxarifado.findMany({
      where: { tipo: "ESTORNO_ENTRADA" },
      select: { valor: true },
      orderBy: { valor: "asc" },
    });
    // ⚠️ CADA UMA COM O SEU VALOR — nunca um valor único recarimbado.
    expect(estornos.map((e) => Number(e.valor))).toEqual([2000, 3000]);
    expect(
      (await saldoDaClasseDeMaterial(prisma, classe.classeDeMaterialId)).toFixed(2)
    ).toBe("0.00");
    const conf = await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
    expect(conf.pelosMovimentos.toFixed(2)).toBe("0.00");
    expect(conf.peloRazao.toFixed(2)).toBe("0.00");
  });

  // t7
  it("t7: duas anulações parciais concorrentes de 4.000 contra 4.000 — UMA só grava", async () => {
    for (let i = 0; i < 5; i++) {
      await semear();
      const empenhoId = await empenhaDe("10000.00");
      await liquidaDe(empenhoId, "6000.00");

      const anular = (n: string) =>
        anularEmpenhoParcial(
          {
            originalId: empenhoId, numero: `NE-1-AP-${n}`, valor: "4000.00",
            data: new Date("2026-05-01T12:00:00Z"),
            motivo: `devolução do saldo não utilizado ${n}`, criadoPor: POR,
          },
          deps
        );

      const r = await Promise.allSettled([anular("A"), anular("B")]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(
        String((r.filter((x) => x.status === "rejected")[0] as PromiseRejectedResult).reason)
      ).toMatch(/ANULAÇÃO PARCIAL MAIOR QUE O SALDO A LIQUIDAR/);

      const s = await saldosCorrentesDaFicha(FICHA, deps);
      expect(s.empenhado.toFixed(2)).toBe("6000.00");
    }
  }, 90_000);

  // t8
  it("t8: a parcial de pagamento devolve ao caixa da FONTE certa (superávit por fonte)", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag = await pagaDe(liq, "2500.00");

    const antes = await despesaPorFonte(prisma, { ate: CORTE });
    expect(antes.get(FONTE)!.pagoLiquido.toFixed(2)).toBe("2500.00");

    await anularPagamentoParcial(
      {
        originalId: pag, numero: "NP-1-AP", valor: "1000.00",
        data: new Date("2026-05-01T12:00:00Z"),
        motivo: "devolução parcial do fornecedor", criadoPor: POR,
      },
      deps
    );

    // ⚠️ 2.500 − 1.000 = 1.500 saíram do caixa da fonte 500 (e NÃO zero).
    const depois = await despesaPorFonte(prisma, { ate: CORTE });
    expect(depois.get(FONTE)!.pagoLiquido.toFixed(2)).toBe("1500.00");
    expect(depois.get(FONTE)!.pagoBruto.toFixed(2)).toBe("1500.00");
    // obrigações a pagar = liquidado 6.000 − pago 1.500 = 4.500
    expect(depois.get(FONTE)!.obrigacoesAPagar.toFixed(2)).toBe("4500.00");
  });
});
