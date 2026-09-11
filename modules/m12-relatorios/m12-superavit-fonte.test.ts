import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { balancoPatrimonial } from "./balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "./cadastro-linhas.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { fimDoDiaCivil, janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * ANEXO 14 — BLOCO 4: SUPERÁVIT FINANCEIRO POR FONTE
 * (art. 43, § 1º, III da Lei 4.320/64; IPC 04; TR 4.39)
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ CENÁRIO DO t1 — DUAS FONTES ═══
 *   FONTE 500 (Livre)
 *     arrecada          8.000    D caixa        / C VPA
 *     empenha/liquida   9.500    D VPD          / C fornecedores
 *     paga BRUTO        6.000    D fornecedores 6.000
 *                                C caixa        5.100  (o LÍQUIDO)
 *                                C consignações   900  (a retenção de INSS)
 *     encerra 2026 → RP PROCESSADO = liquidado 9.500 − pago 6.000 = 3.500
 *
 *   FONTE 999 (Convênio)
 *     arrecada          2.000    D caixa        / C VPA
 *
 *   CAIXA POR FONTE (dos FATOS)
 *     F500 = 8.000 − 5.100                    =  2.900,00
 *     F999 = 2.000                            =  2.000,00
 *     Σ                                       =  4.900,00
 *   CAIXA NO RAZÃO = 8.000 + 2.000 − 5.100    =  4.900,00   ✓ S1
 *
 *   O QUE CADA FONTE DEVE
 *     F500 obrigações  = liquidado 9.500 − pago BRUTO 6.000  =  3.500,00
 *     F500 consignações                                      =    900,00
 *     F999                                                   =      0,00
 *
 *   SUPERÁVIT
 *     F500 = 2.900 − 3.500 − 900              = −1.500,00  (DEFICITÁRIA — IPC 04
 *                                                           prevê; sem clamp)
 *     F999 = 2.000 − 0 − 0                    =  2.000,00
 *     Σ                                       =    500,00
 *
 *   QUADRO FINANCEIRO/PERMANENTE (do RAZÃO, bloco 3)
 *     AF = caixa                              =  4.900,00
 *     PF = fornecedores 3.500 + consig. 900   =  4.400,00
 *     superávit                               =    500,00  ✓ S2
 *
 * ═══ AS DUAS MEDIDAS DO MESMO PAGAMENTO (e é o coração do bloco) ═══
 * Os 6.000 pagos com 900 retidos tiram 5.100 do CAIXA e baixam 6.000 da
 * OBRIGAÇÃO. Usar o bruto no caixa some com 900 reais que ainda estão no banco;
 * usar o líquido na obrigação deixa 900 de dívida que já não existe. O superávit
 * só fecha porque cada medida foi para o seu lado.
 *
 * ═══ POR QUE O RP NÃO É SUBTRAÍDO ═══
 * O RP processado (3.500) É a obrigação a pagar (3.500) — o mesmo dinheiro, com
 * um rótulo que ele ganha em 31/12. Subtrair os dois pagaria o fornecedor duas
 * vezes no relatório. O RP entra na linha porque o art. 43 quer VÊ-LO, não porque
 * entre na conta. Provado no t1: as duas células são iguais e o superávit fecha
 * com a S2 usando só uma delas.
 *
 * ═══ A CONTA DE "RP PROCESSADOS" APONTA PARA FORNECEDORES (e tem de apontar) ═══
 * A inscrição de RP NÃO gera lançamento contábil — a obrigação nunca sai de
 * Fornecedores. Então o roteiro de PAGAMENTO de RP tem de debitar Fornecedores,
 * senão o razão ficaria com uma conta de RP negativa e um Fornecedores travado
 * para sempre. (Está registrado no MODULO.md: falta ao M08 o lançamento de
 * RECLASSIFICAÇÃO da inscrição.)
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const F500 = "fnt-500";
const F999 = "fnt-999";
const F777 = "fnt-777";
const FICHA_500 = "ficha-500";
const FICHA_777 = "ficha-777";
const T_INSS = "tc-inss";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const CONSIGNACAO = "2.1.8.8.1.01.00";
const DIVIDA_FUNDADA = "2.2.1.1.1.00.00"; // t2 — a operação de crédito órfã
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

/** As contas de caixa — PARÂMETRO do relatório (a S1 amarra contra elas). */
const CONTAS_CAIXA = [CAIXA];

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-consig", codigo: CONSIGNACAO, nome: "Consignações a repassar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-divida", codigo: DIVIDA_FUNDADA, nome: "Empréstimos a longo prazo", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
// ⚠️ A obrigação do RP mora em FORNECEDORES — ver o cabeçalho.
const R_PAGAMENTO_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: FORNECEDOR, disponibilidade: CAIXA,
});


/**
 * ⚠️ O FIM DO EXERCÍCIO É O DO ENTE, E ISSO VIROU LITERAL AQUI DEPOIS DE UMA ACUSAÇÃO.
 *
 * O corte era `new Date("YYYY-12-31T23:59:59Z")`, que em São Paulo é **31/12 às 20:59:59**.
 * Quando o ENT03b pôs o fato do encerramento no último instante CIVIL do exercício, ele
 * passou a cair TRÊS HORAS DEPOIS deste corte — e o teste acusou. A acusação estava certa:
 * o corte é que estava em Greenwich. Ver `docs/adr/ADR-data-civil-do-ente.md`.
 */
const CORTE_2026 = janelaCivilDoAno(2026).fim;
const CORTE_2027 = janelaCivilDoAno(2027).fim;
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
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "30", codigoCompleto: "339030", descricao: "Consumo",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });

  // TRÊS fontes: a que arrecada e gasta, a que só arrecada, a que só deve.
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F500, codigo: "500", descricao: "Recursos Livres", codigoTce: "500" },
      { id: F999, codigo: "999", descricao: "Convênio Federal", codigoTce: "999" },
      { id: F777, codigo: "777", descricao: "Salário-Educação", codigoTce: "777" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-500", codigo: "CC-500", descricao: "Movimento livre", fonteId: F500 },
      { id: "cb-999", codigo: "CC-999", descricao: "Convênio", fonteId: F999 },
      { id: "cb-777", codigo: "CC-777", descricao: "Salário-educação", fonteId: F777 },
    ],
  });
  await prisma.tipoConsignacao.create({
    data: {
      id: T_INSS, codigo: "INSS", descricao: "INSS retido", criadoPor: POR,
      // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
      contaPassivo: { connect: { codigo: CONSIGNACAO } },
    },
  });

  const fichaBase = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", valorDotado: "100000.00",
  };
  await criarFichaDeTeste(prisma, { ...fichaBase, id: FICHA_500, numero: 1, fonteId: F500 });
  await criarFichaDeTeste(prisma, { ...fichaBase, id: FICHA_777, numero: 2, fonteId: F777 });

  for (const l of [
    { codigoLinha: "AC.CAIXA", rotulo: "Caixa e Equivalentes de Caixa", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1.1"] },
    { codigoLinha: "PC.FORN", rotulo: "Fornecedores e Contas a Pagar a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 1, prefixos: ["2.1.3"] },
    { codigoLinha: "PC.DEMAIS", rotulo: "Demais Obrigações a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 2, prefixos: ["2.1.8"] },
    { codigoLinha: "PNC.OBRIG", rotulo: "Obrigações a Longo Prazo", grupo: "PASSIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["2.2"] },
    { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3"] },
  ] as const) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
    });
  }
}

async function arrecadar(valor: string, fonte: string, data: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte, valor,
      dataArrecadacao: new Date(data), numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
}

/** Empenha e liquida numa ficha. Devolve o id da liquidação. */
async function liquidarDespesa(
  fichaId: string, valor: string, numero: string
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
      empenhoId: e.empenhoId, numero, valor, data: new Date("2026-02-10T12:00:00Z"),
      responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

/** O cenário-ouro: duas fontes, uma retenção, um RP inscrito. */
async function cenarioOuro(): Promise<string> {
  await arrecadar("8000.00", "500", "2026-01-10T12:00:00Z", "GUIA-1");
  await arrecadar("2000.00", "999", "2026-01-15T12:00:00Z", "GUIA-2");

  const liq = await liquidarDespesa(FICHA_500, "9500.00", "NL-1");

  // BRUTO 6.000, retenção 900 → o caixa perde 5.100.
  await pagar(
    {
      liquidacaoId: liq, numero: "NP-1", valor: "6000.00",
      data: new Date("2026-03-01T12:00:00Z"), contaBancaria: "CC-500",
      fonteId: F500, historico: "pagamento com retenção", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps,
    {
      contaDisponibilidade: CAIXA,
      retencoes: [
        {
          tipoConsignacaoId: T_INSS, credorConsignatario: "INSS",
          valor: "900.00", contaConsignacaoAPagar: CONSIGNACAO,
        },
      ],
    }
  );

  // 31/12: o que ficou liquidado e não pago vira RP processado (9.500 − 6.000).
  await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
  return liq;
}

const linhaDe = (
  b: Awaited<ReturnType<typeof balancoPatrimonial>>,
  fonte: string
) => b.superavitPorFonte!.linhas.find((l) => l.fonte === fonte)!;

const emitir = (corte: Date) =>
  balancoPatrimonial(prisma, corte, { contasCaixa: CONTAS_CAIXA });

describe("Anexo 14 — superávit financeiro POR FONTE", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: OURO — duas fontes, cada célula por literal; S1, S2 e S3 fecham", async () => {
    await cenarioOuro();

    const b = await emitir(CORTE_2026);
    const q = b.superavitPorFonte!;
    const f500 = linhaDe(b, "500");
    const f999 = linhaDe(b, "999");

    // ── FONTE 500 ────────────────────────────────────────────────────────
    expect(f500.arrecadado).toBe("8000.00");
    // ⚠️ O PAGAMENTO ENTRA NO CAIXA PELO LÍQUIDO: 6.000 − 900 = 5.100
    expect(f500.pagamentosLiquidos).toBe("5100.00");
    expect(f500.caixa).toBe("2900.00"); // 8.000 − 5.100
    // ⚠️ E BAIXA A OBRIGAÇÃO PELO BRUTO: 9.500 − 6.000 = 3.500
    expect(f500.obrigacoesAPagar).toBe("3500.00");
    expect(f500.consignacoesARepassar).toBe("900.00");
    // o RP processado é O MESMO dinheiro da obrigação — rotulado em 31/12
    expect(f500.restosAPagar).toBe("3500.00");
    // 2.900 − 3.500 − 900 = −1.500 → FONTE DEFICITÁRIA, e ela sai NEGATIVA
    expect(f500.superavit).toBe("-1500.00");

    // ── FONTE 999 ────────────────────────────────────────────────────────
    expect(f999.arrecadado).toBe("2000.00");
    expect(f999.caixa).toBe("2000.00");
    expect(f999.obrigacoesAPagar).toBe("0.00");
    expect(f999.superavit).toBe("2000.00");

    // ── S1: os caixas das fontes == o caixa do RAZÃO ─────────────────────
    expect(2900 + 2000).toBe(4900);
    expect(q.totalCaixa).toBe("4900.00");

    // ── S2: Σ superávit == o superávit do quadro do art. 105 ─────────────
    expect(-1500 + 2000).toBe(500);
    expect(q.totalSuperavit).toBe("500.00");
    expect(b.quadroFinanceiroPermanente.superavitFinanceiro).toBe("500.00");
    // e as duas leituras são independentes: esta veio dos FATOS, aquela do RAZÃO
    expect(b.quadroFinanceiroPermanente.ativoFinanceiro).toBe("4900.00");
    expect(b.quadroFinanceiroPermanente.passivoFinanceiro).toBe("4400.00"); // 3.500 + 900

    // dinheiro é STRING com 2 casas
    for (const l of q.linhas) {
      expect(l.superavit).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  // t2
  it("t2: DINHEIRO ÓRFÃO — 2.000 no caixa sem fato com fonte derrubam o anexo", async () => {
    await cenarioOuro();

    // Operação de crédito: D caixa / C dívida fundada. Fato permutativo, REAL — e
    // sem fonte nenhuma, porque NÃO EXISTE módulo de dívida pública (auditoria P2;
    // pendência registrada no MODULO.md). É exatamente assim que o dinheiro entra
    // no caixa sem que nenhuma fonte o explique.
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "OC-1",
        dataTransacao: new Date("2026-06-20T12:00:00Z"),
        historico: "operação de crédito de longo prazo",
        origemTipo: "TESTE",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "2000.00" },
            { contaId: "c-divida", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "2000.00" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await emitir(CORTE_2026);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> DINHEIRO ÓRFÃO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CAIXA POR FONTE NÃO FECHA COM O RAZÃO/);
    expect(msg).toMatch(/4900\.00/); // o que as fontes explicam
    expect(msg).toMatch(/6900\.00/); // o que o razão tem
    expect(msg).toMatch(/2000\.00/); // o órfão
    expect(msg).toMatch(/dinheiro órfão/);
  });

  // t3
  it("t3: fonte SÓ COM DÍVIDA (caixa zero) não some da listagem — superávit −1.000", async () => {
    // Fonte 777: liquida 1.000 e não paga. Nenhuma arrecadação, nenhum caixa.
    await liquidarDespesa(FICHA_777, "1000.00", "NL-777");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    const b = await emitir(CORTE_2026);
    const f777 = linhaDe(b, "777");

    expect(f777.caixa).toBe("0.00");
    expect(f777.obrigacoesAPagar).toBe("1000.00");
    expect(f777.restosAPagar).toBe("1000.00"); // inscrito como RP processado
    expect(f777.superavit).toBe("-1000.00"); // 0 − 1.000 − 0

    // uma fonte deficitária NÃO pode sumir do relatório: é justamente a que não
    // pode lastrear crédito adicional nenhum.
    expect(b.superavitPorFonte!.linhas.map((l) => l.fonte)).toContain("777");

    // S1: nenhum caixa dos dois lados. S2: o quadro do razão também dá −1.000.
    expect(b.superavitPorFonte!.totalCaixa).toBe("0.00");
    expect(b.quadroFinanceiroPermanente.superavitFinanceiro).toBe("-1000.00");
    expect(b.superavitPorFonte!.totalSuperavit).toBe("-1000.00");
  });

  // t4 — O MUTANTE DO BLOCO 3, AGORA PEGO
  it("t4: indicador trocado (caixa F→P) — a S2 pega o que NENHUMA amarração do bloco 3 pegava", async () => {
    await cenarioOuro();

    // antes: as duas leituras concordam
    expect((await emitir(CORTE_2026)).superavitPorFonte!.totalSuperavit).toBe("500.00");

    // ═══ A MUTAÇÃO: o caixa vira PERMANENTE no cadastro ═══
    await prisma.contaPcasp.update({
      where: { id: "c-caixa" },
      data: { indicadorSuperavit: "P" },
    });

    let erro: unknown;
    try {
      await emitir(CORTE_2026);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> INDICADOR TROCADO (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/SUPERÁVIT POR FONTE ≠ SUPERÁVIT DO QUADRO/);
    expect(msg).toMatch(/500\.00/); // o que os FATOS dizem
    expect(msg).toMatch(/-4400\.00/); // o que o RAZÃO mutante diz (0 − 4.400)
    expect(msg).toMatch(/4900\.00/); // a diferença: 500 − (−4.400)
    expect(msg).toMatch(/indicador de superávit está errado/);

    // ⚠️ O LIMITE HONESTO: a S2 só pega a conta que TEM fato com fonte. Trocar o
    // indicador do IMOBILIZADO (que não tem fato nenhum por trás) continua passando
    // por todas as amarrações — o imobilizado não entra nem no caixa nem no
    // passivo dos fatos, e mover uma conta ENTRE os baldes do permanente não muda
    // soma nenhuma. As redes externas do MODULO.md (conferir contra o PCASP oficial
    // da STN, no import do plano) continuam sendo as únicas para esse caso.
  });

  // t6 (o t5 é a mutação de código — feita à mão, ver o relato do bloco)
  it("t6: RP pago DEPOIS do corte não mexe no corte — e o cheque do RP entra no caixa UMA vez", async () => {
    const liq = await cenarioOuro();

    // paga 1.000 do RP em MARÇO DE 2027 — depois do corte de 2026.
    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: liq, numero: "NP-RP-1", valor: "1000.00",
        data: new Date("2027-03-10T12:00:00Z"), contaBancaria: "CC-500",
        fonteId: F500, historico: "pagamento de restos a pagar", criadoPor: POR,
      },
      R_PAGAMENTO_RP
    );

    // ── NO CORTE DE 2026: como se o pagamento de 2027 não existisse ───────
    const em2026 = linhaDe(await emitir(CORTE_2026), "500");
    expect(em2026.caixa).toBe("2900.00");
    expect(em2026.restosAPagar).toBe("3500.00");
    expect(em2026.obrigacoesAPagar).toBe("3500.00");
    expect(em2026.superavit).toBe("-1500.00");

    // ── NO CORTE DE 2027: os 1.000 saíram do caixa E da dívida ────────────
    const b2027 = await emitir(CORTE_2027);
    const em2027 = linhaDe(b2027, "500");
    // ⚠️ 2.900 − 1.000 = 1.900. Se o pagamento de RP fosse contado DUAS vezes (uma
    // pela varredura de `Pagamento` do M05 e outra por uma função própria do M08),
    // aqui sairia 900,00. Ele é UM cheque só, e entra no caixa UMA vez.
    expect(em2027.caixa).toBe("1900.00");
    expect(em2027.obrigacoesAPagar).toBe("2500.00"); // 9.500 − 7.000
    expect(em2027.restosAPagar).toBe("2500.00"); // 3.500 − 1.000
    // e o SUPERÁVIT NÃO SE MEXEU: pagar RP é permutativo dentro do financeiro.
    expect(em2027.superavit).toBe("-1500.00"); // 1.900 − 2.500 − 900

    // as duas leituras seguem concordando em 2027 (S1 e S2 rodaram e passaram)
    expect(b2027.superavitPorFonte!.totalSuperavit).toBe("500.00");
    expect(b2027.quadroFinanceiroPermanente.superavitFinanceiro).toBe("500.00");
  });

  // t6b — O DINHEIRO ÓRFÃO, AGORA COM DONO (M10 — dívida consolidada)
  it("t6b: operação de crédito via ReceitaArrecadada FECHA a S1 — o caixa da fonte a inclui", async () => {
    await cenarioOuro();

    // ⚠️ A MESMA operação de crédito do t2 — mas agora ela ENTRA COMO RECEITA
    // ORÇAMENTÁRIA (é o que ela é), com fonte, e o roteiro credita a CONTA DA
    // DÍVIDA em vez de uma VPA: o ente não ficou mais rico, ficou mais endividado.
    // O bloco 4 do M10 é exatamente isto — e é isto que dá dono ao dinheiro órfão.
    await prisma.naturezaReceita.create({
      data: { id: "nr-oc", codigo: "21110000", descricao: "Operações de crédito" },
    });
    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: "21110000", fonte: "500",
        valor: "2000.00", dataArrecadacao: new Date("2026-06-20T12:00:00Z"),
        numeroReceita: "GUIA-OC", criadoPor: POR,
      },
      roteiroArrecadacao({
        disponibilidade: CAIXA,
        variacaoAumentativa: DIVIDA_FUNDADA, // ⚠️ o passivo, não uma VPA
        receitaARealizar: R_A_REALIZAR,
        receitaRealizada: R_REALIZADA,
      }),
      criarM04Deps(prisma)
    );

    // ⚠️ A S1 NÃO LANÇA MAIS. O caixa da fonte 500 passa de 2.900 para 4.900:
    // 8.000 arrecadados − 5.100 pagos + 2.000 da operação de crédito.
    const b = await emitir(CORTE_2026);
    const f500 = linhaDe(b, "500");
    expect(f500.arrecadado).toBe("10000.00"); // 8.000 + 2.000
    expect(f500.caixa).toBe("4900.00"); // 2.900 + 2.000
    expect(b.superavitPorFonte!.totalCaixa).toBe("6900.00"); // + 2.000 da F999

    // ── t8 do bloco: a DÍVIDA no Anexo 14 ────────────────────────────────
    const q = b.quadroFinanceiroPermanente;
    // o passivo da dívida é PERMANENTE (2.2, indicador P)
    expect(q.passivoPermanente).toBe("2000.00");
    expect(q.composicao.find((c) => c.codigo === DIVIDA_FUNDADA)?.indicador).toBe("P");

    // ⚠️ E O SUPERÁVIT FINANCEIRO **NÃO DESCONTA** A DÍVIDA FUNDADA — ela é
    // PERMANENTE (amortizá-la depende de autorização legislativa, art. 105 § 4º).
    // O caixa dela ENTRA (é financeiro); a dívida NÃO SAI.
    expect(q.ativoFinanceiro).toBe("6900.00"); // o caixa, com os 2.000
    expect(q.passivoFinanceiro).toBe("4400.00"); // fornecedores 3.500 + consig. 900
    expect(q.superavitFinanceiro).toBe("2500.00"); // 6.900 − 4.400
    // as duas leituras concordam (S2 rodou e passou)
    expect(b.superavitPorFonte!.totalSuperavit).toBe("2500.00");

    // ⚠️ ISTO É O ART. 43 § 2º NA PRÁTICA: a "conjugação" das operações de crédito
    // — o dinheiro da dívida INFLA o superávit financeiro, e é por isso que a lei
    // manda conjugá-lo. A pendência do MODULO.md segue de pé; o que morreu foi o
    // dinheiro SEM FONTE.
  });

  // t7 — o quadro por fonte é FAIL-CLOSED: sem as contas de caixa, não sai.
  it("t7: sem `contasCaixa`, o quadro por fonte NÃO é emitido (e o balanço segue)", async () => {
    await cenarioOuro();

    const semParametro = await balancoPatrimonial(prisma, CORTE_2026);
    expect(semParametro.superavitPorFonte).toBeNull();
    // o resto do anexo continua inteiro
    expect(semParametro.totalAtivo).toBe("4900.00");
    expect(semParametro.quadroFinanceiroPermanente.superavitFinanceiro).toBe("500.00");
  });
});
