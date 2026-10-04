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
import { anularEmpenho, empenhar, saldosCorrentesDaFicha } from "./servico.js";
import { anularLiquidacao, anularPagamento, liquidar, pagar } from "./servico-bloco2.js";
import {
  anularEmpenhoParcial,
  anularLiquidacaoParcial,
  anularPagamentoParcial,
  estornarAnulacaoParcial,
} from "./anulacao-parcial.js";
import {
  gerarEstornoLiquidacao,
  gerarEstornos,
  lerFatosEmpenhos,
  lerFatosEstornoLiquidacao,
  lerFatosEstornoPagamento,
  lerFatosEstornos,
  lerFatosLiquidacao,
} from "../../adapters/tribunais/tce-pb/sagres/gerador.js";
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
const FICHA_30 = "ficha-30"; // V4 (§6): a ficha de MATERIAL, só para o t6 — liquidar material é dar entrada dele
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
      { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
      { id: "nd30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
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
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_30, numero: 3, naturezaDespesaId: "nd30" });

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
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000195",
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
  roteiro = R_LIQUIDACAO,
  /** Liquidar MATERIAL é um ato só: as entradas no almoxarifado vão na mesma chamada (V3). */
  entradasDeMaterial?: readonly { readonly classeDeMaterialId: string; readonly valor: string }[]
): Promise<string> {
  const l = await liquidar(
    {
      empenhoId, numero: `NL-${n}`, valor,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
      ...(entradasDeMaterial === undefined ? {} : { entradasDeMaterial: entradasDeMaterial.map((e) => ({ ...e })) }),
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

    const empenhoId = await empenhaDe("10000.00", "1", FICHA_30);
    // as DUAS entradas somam os 5.000 da liquidação — e nascem NO ATO de liquidar (V3)
    const liq = await liquidaDe(empenhoId, "5000.00", "1", R_LIQUIDACAO_MATERIAL, [
      { classeDeMaterialId: classe.classeDeMaterialId, valor: "3000.00" },
      { classeDeMaterialId: classeB.classeDeMaterialId, valor: "2000.00" },
    ]);
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

/**
 * V21 — O MOTIVO DA ANULAÇÃO DE PAGAMENTO CHEGA AO BANCO, E DO BANCO AO SAGRES (§4.13).
 *
 * Até aqui a tela exigia o motivo, a porta o repassava, o serviço o validava — e nenhum campo o
 * recebia. N=2: uma anulação PARCIAL e uma INTEIRA no mesmo dia, cada uma com o seu motivo; o
 * gerador tem de devolver as duas, cada uma apontando a SUA parcela.
 */
describe("V21 — o motivo da anulação de pagamento e o SAGRES EstornoPagamento", () => {
  beforeEach(semear);

  const DIA = new Date("2026-05-01T12:00:00Z");

  it("grava o motivo nas duas anulações e o gerador devolve as duas, cada uma com a sua parcela", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag1 = await pagaDe(liq, "2500.00", "1");
    const pag2 = await pagaDe(liq, "1000.00", "2");

    await anularPagamentoParcial(
      { originalId: pag1, numero: "91", valor: "500.00", data: DIA, motivo: "Devolucao parcial do fornecedor", criadoPor: POR },
      deps
    );
    await anularPagamento(
      { pagamentoId: pag2, numero: "92", data: DIA, historico: "Credor indicado errado na ordem", criadoPor: POR },
      deps
    );

    const anulacoes = await prisma.pagamento.findMany({
      where: { OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] },
      select: { numero: true, motivo: true },
      orderBy: { numero: "asc" },
    });
    expect(anulacoes).toEqual([
      { numero: "91", motivo: "Devolucao parcial do fornecedor" },
      { numero: "92", motivo: "Credor indicado errado na ordem" },
    ]);

    const fatos = await lerFatosEstornoPagamento(prisma, { codUnidadeGestora: "999001", dia: DIA });
    expect(fatos.map((f) => [f.numero, f.numPagamento, f.motivo, f.valor.toFixed(2), f.despesaLiquidada])).toEqual([
      ["91", "NP-1", "Devolucao parcial do fornecedor", "500.00", "S"],
      ["92", "NP-2", "Credor indicado errado na ordem", "1000.00", "S"],
    ]);
  });

  it("recusa na ENTRADA o motivo que o arquivo do tribunal não aceita — e não grava nada", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag = await pagaDe(liq, "2500.00");
    const antes = await prisma.pagamento.count();

    await expect(
      anularPagamento({ pagamentoId: pag, numero: "93", data: DIA, historico: "x".repeat(121), criadoPor: POR }, deps)
    ).rejects.toThrow(/121 caracteres.*até 120/);
    await expect(
      anularPagamentoParcial(
        { originalId: pag, numero: "94", valor: "100.00", data: DIA, motivo: 'Pedido do "fiscal" do contrato', criadoPor: POR },
        deps
      )
    ).rejects.toThrow(/aspas nem apóstrofo/);
    await expect(
      anularPagamento({ pagamentoId: pag, numero: "95", data: DIA, historico: "primeira linha\nsegunda linha", criadoPor: POR }, deps)
    ).rejects.toThrow(/numa linha só/);
    expect(await prisma.pagamento.count()).toBe(antes);
  });

  it("a anulação gravada SEM motivo (anterior à V21) faz o gerador RECUSAR nomeando — não inventa texto", async () => {
    const empenhoId = await empenhaDe("10000.00");
    const liq = await liquidaDe(empenhoId, "6000.00");
    const pag = await pagaDe(liq, "2500.00");
    await anularPagamento({ pagamentoId: pag, numero: "96", data: DIA, historico: "Motivo que sera apagado", criadoPor: POR }, deps);
    // Simula o legado: a coluna nasceu nula para tudo o que veio antes. (O teste roda como DONO.)
    await prisma.pagamento.updateMany({ where: { numero: "96" }, data: { motivo: null } });

    await expect(lerFatosEstornoPagamento(prisma, { codUnidadeGestora: "999001", dia: DIA })).rejects.toThrow(
      /anulação 96 \(do pagamento NP-1\) foi gravada sem motivo/
    );
  });
});

/**
 * V23 — AS ANULAÇÕES DE EMPENHO E DE LIQUIDAÇÃO CHEGAM AO SAGRES (Estornos §4.9, EstornoLiquidacao §4.11).
 *
 * Antes: a linha de anulação saía nos arquivos Empenhos/Liquidacao como se fosse um documento NOVO (o
 * leitor não filtrava), e o motivo da anulação de liquidação era validado e descartado. N=2 em cada
 * nível: uma anulação PARCIAL e uma INTEIRA no mesmo dia, cada uma com o seu motivo.
 *
 * Contas à mão:
 *   NE-1 10.000, liquidado 6.000 → anulação parcial 4.000 (o saldo a liquidar) → "S" (há liquidação viva)
 *   NE-2  2.000, nada liquidado  → anulação inteira 2.000                       → "N"
 *   NL-1 6.000 (NE-1), pago 2.500 → anulação parcial 3.500 (o não pago)
 *   NL-2 1.000 (NE-3), nada pago  → anulação inteira 1.000
 */
describe("V23 — as anulações de empenho e de liquidação no SAGRES", () => {
  beforeEach(semear);

  const DIA = new Date("2026-05-01T12:00:00Z");
  const UG = "999001";

  it("empenho: as duas anulações vão a Estornos com o motivo e o 'já liquidada' certo, e NÃO saem em Empenhos", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    await liquidaDe(ne1, "6000.00", "1");
    const ne2 = await empenhaDe("2000.00", "2");
    // Empenho genuíno no MESMO dia: prova que o filtro não tirou os empenhos do dia junto.
    await empenhar(
      { fichaId: FICHA, numero: "NE-9", tipo: "ORDINARIO", valor: "100.00", data: DIA, credorCpfCnpj: "12345678000195", historico: "empenho do dia", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
      R_EMPENHO,
      deps
    );

    await anularEmpenhoParcial({ originalId: ne1, numero: "81", valor: "4000.00", data: DIA, motivo: "Saldo do empenho nao sera utilizado", criadoPor: POR }, deps);
    await anularEmpenho({ empenhoId: ne2, numero: "82", data: DIA, historico: "Empenho emitido em duplicidade", criadoPor: POR }, deps);

    const fatos = await lerFatosEstornos(prisma, { codUnidadeGestora: UG, dia: DIA });
    expect(fatos.map((f) => [f.numEmpenho, f.numero, f.valor.toFixed(2), f.motivo, f.despesaLiquidada])).toEqual([
      ["NE-1", "81", "4000.00", "Saldo do empenho nao sera utilizado", "S"],
      ["NE-2", "82", "2000.00", "Empenho emitido em duplicidade", "N"],
    ]);
    const empenhosDoDia = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: DIA });
    expect(empenhosDoDia.map((e) => e.numEmpenho)).toEqual(["NE-9"]);
  });

  it("liquidação: o motivo chega ao banco e as duas anulações vão a EstornoLiquidacao, fora de Liquidacao", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    const nl1 = await liquidaDe(ne1, "6000.00", "1");
    await pagaDe(nl1, "2500.00", "1");
    const ne3 = await empenhaDe("1000.00", "3");
    const nl2 = await liquidaDe(ne3, "1000.00", "2");

    await anularLiquidacaoParcial({ originalId: nl1, numero: "91", valor: "3500.00", data: DIA, motivo: "Parte do servico nao foi prestada", criadoPor: POR }, deps);
    await anularLiquidacao({ liquidacaoId: nl2, numero: "92", data: DIA, historico: "Nota fiscal cancelada pelo fornecedor", criadoPor: POR }, deps);

    const gravadas = await prisma.liquidacao.findMany({
      where: { OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] },
      select: { numero: true, motivo: true },
      orderBy: { numero: "asc" },
    });
    expect(gravadas).toEqual([
      { numero: "91", motivo: "Parte do servico nao foi prestada" },
      { numero: "92", motivo: "Nota fiscal cancelada pelo fornecedor" },
    ]);

    const fatos = await lerFatosEstornoLiquidacao(prisma, { codUnidadeGestora: UG, dia: DIA });
    expect(fatos.map((f) => [f.numEmpenho, f.numLiquidacao, f.numero, f.valor.toFixed(2), f.motivo]).sort()).toEqual([
      ["NE-1", "NL-1", "91", "3500.00", "Parte do servico nao foi prestada"],
      ["NE-3", "NL-2", "92", "1000.00", "Nota fiscal cancelada pelo fornecedor"],
    ]);
    expect(await lerFatosLiquidacao(prisma, { codUnidadeGestora: UG, dia: DIA })).toEqual([]);
  });

  it("recusa na ENTRADA o motivo que o arquivo não aceita, nos quatro atos — e não grava nada", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    const nl1 = await liquidaDe(ne1, "6000.00", "1");
    const antesE = await prisma.empenho.count();
    const antesL = await prisma.liquidacao.count();

    await expect(anularEmpenho({ empenhoId: ne1, numero: "83", data: DIA, historico: "x".repeat(121), criadoPor: POR }, deps)).rejects.toThrow(/121 caracteres.*até 120/);
    await expect(
      anularEmpenhoParcial({ originalId: ne1, numero: "84", valor: "10.00", data: DIA, motivo: "Pedido do 'gestor' do contrato", criadoPor: POR }, deps)
    ).rejects.toThrow(/aspas nem apóstrofo/);
    await expect(anularLiquidacao({ liquidacaoId: nl1, numero: "93", data: DIA, historico: "linha um\nlinha dois", criadoPor: POR }, deps)).rejects.toThrow(/numa linha só/);
    await expect(
      anularLiquidacaoParcial({ originalId: nl1, numero: "94", valor: "10.00", data: DIA, motivo: "y".repeat(130), criadoPor: POR }, deps)
    ).rejects.toThrow(/130 caracteres.*até 120/);
    expect(await prisma.empenho.count()).toBe(antesE);
    expect(await prisma.liquidacao.count()).toBe(antesL);
  });

  it("a anulação de liquidação gravada sem motivo (anterior à V23) faz o gerador RECUSAR nomeando", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    const nl1 = await liquidaDe(ne1, "6000.00", "1");
    await anularLiquidacao({ liquidacaoId: nl1, numero: "95", data: DIA, historico: "Motivo que sera apagado", criadoPor: POR }, deps);
    // Simula o legado: a coluna nasceu nula para tudo o que veio antes. (O teste roda como DONO.)
    await prisma.liquidacao.updateMany({ where: { numero: "95" }, data: { motivo: null } });

    await expect(lerFatosEstornoLiquidacao(prisma, { codUnidadeGestora: UG, dia: DIA })).rejects.toThrow(
      /EstornoLiquidacao — a anulação 95 foi gravada sem motivo/
    );
  });

  it("desfazer uma anulação parcial no dia recusa os três arquivos de estorno nomeando — nunca vira estorno nem some", async () => {
    const ne1 = await empenhaDe("10000.00", "1");
    const nl1 = await liquidaDe(ne1, "6000.00", "1");
    const np1 = await pagaDe(nl1, "2500.00", "1");
    const DEPOIS = new Date("2026-05-02T12:00:00Z");
    const ap = await anularEmpenhoParcial({ originalId: ne1, numero: "85", valor: "1000.00", data: DIA, motivo: "Reducao do objeto", criadoPor: POR }, deps);
    const al = await anularLiquidacaoParcial({ originalId: nl1, numero: "96", valor: "500.00", data: DIA, motivo: "Reducao da medicao", criadoPor: POR }, deps);
    const pp = await anularPagamentoParcial({ originalId: np1, numero: "97", valor: "100.00", data: DIA, motivo: "Devolucao parcial", criadoPor: POR }, deps);
    await estornarAnulacaoParcial({ anulacaoId: ap.anulacaoId, nivel: "EMPENHO", numero: "86", data: DEPOIS, motivo: "anulação lançada por engano", criadoPor: POR }, deps);
    await estornarAnulacaoParcial({ anulacaoId: al.anulacaoId, nivel: "LIQUIDACAO", numero: "98", data: DEPOIS, motivo: "anulação lançada por engano", criadoPor: POR }, deps);
    await estornarAnulacaoParcial({ anulacaoId: pp.anulacaoId, nivel: "PAGAMENTO", numero: "99", data: DEPOIS, motivo: "anulação lançada por engano", criadoPor: POR }, deps);

    // O dia da anulação continua exportável; o dia do "desfazer" é recusado, nomeando o registro.
    expect((await lerFatosEstornos(prisma, { codUnidadeGestora: UG, dia: DIA })).map((f) => f.numero)).toEqual(["85"]);
    await expect(lerFatosEstornos(prisma, { codUnidadeGestora: UG, dia: DEPOIS })).rejects.toThrow(/registro 86 desfaz a anulação 85 de um empenho/);
    await expect(lerFatosEstornoLiquidacao(prisma, { codUnidadeGestora: UG, dia: DEPOIS })).rejects.toThrow(/registro 98 desfaz a anulação 96 de um liquidação/);
    await expect(lerFatosEstornoPagamento(prisma, { codUnidadeGestora: UG, dia: DEPOIS })).rejects.toThrow(/registro 99 desfaz a anulação 97 de um pagamento/);
  });

  it("o arquivo sai nas posições do leiaute: 180 caracteres, motivo em 54-173 e 45-164", async () => {
    const e = await empenhar(
      { fichaId: FICHA, numero: "1001", tipo: "ORDINARIO", valor: "3000.00", data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000195", historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      { empenhoId: e.empenhoId, numero: "2001", valor: "1000.00", data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR },
      R_LIQUIDACAO,
      deps
    );
    await anularLiquidacao({ liquidacaoId: l.liquidacaoId, numero: "2002", data: DIA, historico: "Nota cancelada", criadoPor: POR }, deps);
    await anularEmpenhoParcial({ originalId: e.empenhoId, numero: "1002", valor: "2000.00", data: DIA, motivo: "Saldo sem uso", criadoPor: POR }, deps);

    const est = (await gerarEstornos(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(est).toHaveLength(1);
    const r = est[0]!;
    expect(r.length).toBe(180);
    expect(r.slice(0, 6)).toBe(UG);
    expect(r.slice(15, 22)).toBe("0001001"); //         numEmpenho 16-22
    expect(r.slice(22, 29)).toBe("0001002"); //         numero 23-29
    expect(r.slice(29, 37)).toBe("01052026"); //        data 30-37
    expect(r.slice(37, 53)).toBe("0000000002000,00"); // valor 38-53
    expect(r.slice(53, 173).trimEnd()).toBe("Saldo sem uso");
    // A liquidação foi anulada antes, no mesmo dia: o liquidado líquido na data é zero.
    expect(r.slice(173, 174)).toBe("N");
    expect(r.slice(174, 180)).toBe("000000");

    const el = (await gerarEstornoLiquidacao(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(el).toHaveLength(1);
    const s = el[0]!;
    expect(s.length).toBe(180);
    expect(s.slice(15, 22)).toBe("0001001"); //         numEmpenho 16-22
    expect(s.slice(22, 29)).toBe("0002001"); //         numLiquidacao 23-29
    expect(s.slice(29, 36)).toBe("0002002"); //         numero 30-36
    expect(s.slice(44, 164).trimEnd()).toBe("Nota cancelada");
    expect(s.slice(164, 180)).toBe("0000000001000,00");
  });
});

/**
 * ═══ V33 — A ANULAÇÃO PARCIAL NOS GUARDS DO NÚCLEO (liquidar, pagar, anular, entrada de material) ═══
 *
 * Achado pelo levantamento que a composição do M12 abriu. Três padrões, cada um com o seu teste:
 *   A. o limite comparava com o valor BRUTO do original (liquidava-se/pagava-se a glosa);
 *   B. a família do fato não levava o estorno da parcial (a parcial estornada continuava descontando);
 *   C. a linha da parcial passava como se fosse o fato.
 * E a anulação TOTAL depois de uma parcial viva devolvia o valor cheio — a ficha recebia a parcial duas vezes.
 * Literais por aritmética manual.
 */
describe("V33 — a anulação parcial nos guards do núcleo", () => {
  beforeEach(semear);
  const MOTIVO = "glosa registrada pela fiscalização do contrato";

  it("A: empenho 9.000 com parcial de 1.000 — liquidar 9.000 é recusado pelo empenhado LÍQUIDO (8.000); 8.000 passa", async () => {
    const e = await empenhaDe("9000.00");
    await anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP1", valor: "1000.00", data: new Date("2026-02-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    await expect(liquidaDe(e, "9000.00")).rejects.toThrow(/excede o empenho .*empenhado 8000\.00, já liquidado 0\.00, solicitado 9000\.00/);
    await expect(liquidaDe(e, "8000.00")).resolves.toBeTruthy();
  });

  it("A: liquidação 6.000 glosada em 3.500 — pagar 6.000 é recusado pela liquidação LÍQUIDA (2.500); 2.500 passa", async () => {
    const e = await empenhaDe("10000.00");
    const l = await liquidaDe(e, "6000.00");
    await anularLiquidacaoParcial({ originalId: l, numero: "NL-1-AP1", valor: "3500.00", data: new Date("2026-03-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    await expect(pagaDe(l, "6000.00")).rejects.toThrow(/excede a liquidação .*liquidado 2500\.00, já pago 0\.00, solicitado 6000\.00/);
    await expect(pagaDe(l, "2500.00")).resolves.toBeTruthy();
  });

  it("C: a linha da parcial não é liquidada nem paga como se fosse o fato — e o motivo é dito", async () => {
    const e = await empenhaDe("10000.00");
    const pe = await anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP1", valor: "1000.00", data: new Date("2026-02-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    await expect(liquidaDe(pe.anulacaoId, "100.00", "X")).rejects.toThrow(/É uma anulação parcial, e não o fato original/);
    const l = await liquidaDe(e, "5000.00");
    const pl = await anularLiquidacaoParcial({ originalId: l, numero: "NL-1-AP1", valor: "1000.00", data: new Date("2026-03-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    await expect(pagaDe(pl.anulacaoId, "100.00", "X")).rejects.toThrow(/É uma anulação parcial, e não o fato original/);
  });

  it("anulação TOTAL com parcial viva é recusada com o caminho; com a parcial estornada, passa e a ficha volta ao dotado", async () => {
    const e = await empenhaDe("9000.00");
    const ap = await anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP1", valor: "1000.00", data: new Date("2026-02-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    const anular = () => anularEmpenho({ empenhoId: e, numero: "NE-1-ANUL", data: new Date("2026-02-20T12:00:00Z"), historico: "empenho cancelado por desistência do contrato", criadoPor: POR }, deps);
    await expect(anular()).rejects.toThrow(/tem anulação parcial viva: .*Anule o saldo restante pela anulação parcial/);
    expect(await prisma.empenho.count({ where: { estornoDeId: e } })).toBe(0);

    await estornarAnulacaoParcial({ nivel: "EMPENHO", anulacaoId: ap.anulacaoId, numero: "NE-1-AP1-E", data: new Date("2026-02-15T12:00:00Z"), motivo: "anulação registrada em duplicidade", criadoPor: POR }, deps);
    await expect(anular()).resolves.toBeTruthy();
    const saldos = await saldosCorrentesDaFicha(FICHA, deps);
    expect(saldos.empenhado.toFixed(2)).toBe("0.00");
  });

  it("B: com a parcial estornada, uma nova parcial pelo saldo inteiro passa (o guard vê o empenhado de volta)", async () => {
    const e = await empenhaDe("1000.00");
    const ap = await anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP1", valor: "400.00", data: new Date("2026-02-10T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial({ nivel: "EMPENHO", anulacaoId: ap.anulacaoId, numero: "NE-1-AP1-E", data: new Date("2026-02-11T12:00:00Z"), motivo: "anulação registrada em duplicidade", criadoPor: POR }, deps);
    await expect(
      anularEmpenhoParcial({ originalId: e, numero: "NE-1-AP2", valor: "1000.00", data: new Date("2026-02-12T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps)
    ).resolves.toBeTruthy();
  });

  /**
   * A (almoxarifado), V34 — FIXTURE DE LEGADO. Pelo serviço o caminho não se monta: a entrada nasce no ato de liquidar e
   * iguala o liquidado, a parcial abaixo do material é recusada pela cascata (t6), e a entrada vinda de liquidação não se
   * estorna avulsa. O estado que o teto protege é o de dados gravados antes dessas regras: uma liquidação com entrada
   * PARCIALMENTE estornada. Ele é escrito aqui direto no banco isolado (um ESTORNO_ENTRADA sem lançamento, como o legado),
   * e só ele; o resto passa pelos serviços. O razão do estoque fica à frente dos movimentos por construção — a conferência
   * contra o razão não é chamada.
   * Literais: liquidado 6.000, entrou 6.000, legado estornou 4.500 → entrou 1.500; glosa de 3.500 → líquido 2.500, cabe
   * 1.000; glosa estornada → líquido 6.000, cabe 4.500.
   */
  it("A (almoxarifado, legado): a entrada tem como teto a liquidação LÍQUIDA; com a glosa estornada, o teto volta", async () => {
    const classe = await cadastrarClasseDeMaterial(prisma, { codigo: "30.01", descricao: "Material de expediente", contaContabilId: "c-estoque", criadoPor: POR });
    const e = await empenhaDe("10000.00", "1", FICHA_30);
    const l = await liquidaDe(e, "6000.00", "1", R_LIQUIDACAO_MATERIAL, [{ classeDeMaterialId: classe.classeDeMaterialId, valor: "6000.00" }]);
    const entrada = await prisma.movimentoAlmoxarifado.findFirstOrThrow({ where: { liquidacaoId: l, tipo: "ENTRADA" }, select: { id: true } });
    await prisma.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: classe.classeDeMaterialId, tipo: "ESTORNO_ENTRADA", valor: "4500.00", liquidacaoId: l, estornoDeId: entrada.id,
        dataMovimento: new Date("2026-03-02T12:00:00Z"), motivo: "legado: devolução parcial do material gravada antes da regra da entrada no ato",
        criadoPor: "legado-v34",
      },
    });
    const ap = await anularLiquidacaoParcial({ originalId: l, numero: "NL-1-AP1", valor: "3500.00", data: new Date("2026-03-06T12:00:00Z"), motivo: MOTIVO, criadoPor: POR }, deps);
    const entrar = (valor: string) => registrarEntradaAlmoxarifado(prisma, { classeDeMaterialId: classe.classeDeMaterialId, liquidacaoId: l, valor, dataMovimento: new Date("2026-03-07T12:00:00Z"), criadoPor: POR });
    // Pelo bruto (6.000) caberiam 4.500; pelo líquido (2.500), só 1.000.
    await expect(entrar("1500.00")).rejects.toThrow(/ENTRADA MAIOR QUE A LIQUIDAÇÃO NL-1: ela liquidou 2500\.00, já deu entrada de 1500\.00/);
    await estornarAnulacaoParcial({ nivel: "LIQUIDACAO", anulacaoId: ap.anulacaoId, numero: "NL-1-AP1-E", data: new Date("2026-03-08T12:00:00Z"), motivo: "glosa registrada em duplicidade", criadoPor: POR }, deps);
    await expect(entrar("1500.00")).resolves.toBeTruthy();
  });
});
