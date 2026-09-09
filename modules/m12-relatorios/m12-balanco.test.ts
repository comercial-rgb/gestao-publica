import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import {
  cancelarRestosAPagar,
  pagarRestosAPagar,
} from "../m08-restos-a-pagar/restos.js";
import { balancoOrcamentario } from "./balanco-orcamentario.js";
import type {
  BalancoOrcamentario,
  LinhaDespesa,
  LinhaReceita,
} from "./dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ═══ O TESTE DE OURO DO ANEXO 12 ═══
 *
 * Um exercício INTEIRO é montado aqui, e CADA célula do balanço é conferida
 * contra ARITMÉTICA MANUAL, escrita como literal.
 *
 * ⚠️ NENHUMA asserção recalcula o número com a mesma query que o serviço usa. Um
 * teste que replica o SUM do código só prova que o código é igual a ele mesmo —
 * ele passaria com o SUM errado dos dois lados. Os literais abaixo foram feitos
 * na mão, a partir do cenário:
 *
 *   RECEITA   prevê 10.000 → arrecada 8.000            (frustração de 2.000)
 *   DESPESA   dota 10.000 + suplementa 2.000 = 12.000 autorizados
 *             empenha 9.000 → liquida 7.000 → paga 6.000 COM RETENÇÃO de 500
 *   VIRADA    encerra 2026:
 *               RP PROCESSADO     = liquidado − pago     = 7.000 − 6.000 = 1.000
 *               RP NÃO PROCESSADO = empenhado − liquidado = 9.000 − 7.000 = 2.000
 *   2027      paga o RP processado (1.000) e cancela 500 do não processado
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";

/** Natureza da receita: 1 = corrente, origem 1.1 (impostos). Vem do banco. */
const NAT_RECEITA = "11130111";
/** Natureza da despesa 3.3.90.39: categoria 3 (corrente), grupo 3 (ODC). */
const CAT_DESPESA = "3";
const GRUPO_DESPESA = "3";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const P_INSS = "2.1.8.8.1.01.00";
const VPD = "3.3.2.1.1.01.00";
const VPA_RECEITA = "4.1.1.2.1.01.00";
const VPA_CANCEL = "4.9.9.9.9.99.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: P_INSS, nome: "Consignações INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_RECEITA, nome: "VPA tributária", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa2", codigo: VPA_CANCEL, nome: "VPA cancelamento RP", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

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
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: FORNECEDOR,
  disponibilidade: CAIXA,
});
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: FORNECEDOR,
  variacaoAumentativa: VPA_CANCEL,
});

/** Acha a linha pela nota romana do layout. */
const receita = (b: BalancoOrcamentario, nota: string): LinhaReceita =>
  b.receitas.find((l) => l.nota === nota)!;
const despesa = (b: BalancoOrcamentario, nota: string): LinhaDespesa =>
  b.despesas.find((l) => l.nota === nota)!;

describe("M12 — Balanço Orçamentário (Anexo 12)", () => {
  let b2026: BalancoOrcamentario;
  let b2027: BalancoOrcamentario;

  beforeAll(async () => {
    await limparBanco(prisma);
    const deps: M05Deps = criarM05Deps(prisma);
    const depsReceita = criarM04Deps(prisma);

    // ── classificação ────────────────────────────────────────────────────
    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
    });
    await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
    await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
    await prisma.acao.create({
      data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
    });
    await prisma.naturezaDespesa.create({
      data: {
        id: "nd", codCategoria: CAT_DESPESA, codNatureza: GRUPO_DESPESA,
        codModalidade: "90", codElemento: "39", codigoCompleto: "339039",
        descricao: "Outros serviços de terceiros - PJ",
      },
    });
    await prisma.naturezaReceita.create({
      data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" },
    });
    await prisma.fonteRecurso.create({
      data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
    });
    await prisma.contaBancaria.create({
      data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE },
    });
    const tipoInss = await prisma.tipoConsignacao.create({
      data: {
        codigo: "INSS", descricao: "INSS", criadoPor: POR,
        // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
        contaPassivo: { connect: { codigo: P_INSS } },
      },
    });

    // ── RECEITA: prevê 10.000, arrecada 8.000 ────────────────────────────
    await prisma.receitaPrevista.create({
      data: {
        exercicio: 2026, naturezaReceitaId: "nr", fonteId: FONTE,
        tipoReceita: "ORCAMENTARIA", valorPrevisto: "10000.00",
      },
    });
    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500",
        valor: "8000.00", dataArrecadacao: new Date("2026-05-10T12:00:00Z"),
        numeroReceita: "GUIA-1", criadoPor: POR,
      },
      roteiroArrecadacao({
        disponibilidade: CAIXA,
        variacaoAumentativa: VPA_RECEITA,
        receitaARealizar: R_A_REALIZAR,
        receitaRealizada: R_REALIZADA,
      }),
      depsReceita
    );

    // ── DESPESA: dota 10.000 ─────────────────────────────────────────────
    await criarFichaDeTeste(prisma, {
      id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01",
      unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd",
      fonteId: FONTE, valorDotado: "10000.00",
    });

    // ── suplementa 2.000 (crédito adicional por excesso de arrecadação) ──
    // Direto no razão do M05: o M03 exige lei/decreto/disponibilidade, e o que o
    // Anexo 12 lê é o MovimentoDotacao — a verdade é o movimento.
    await prisma.movimentoDotacao.create({
      data: {
        fichaId: FICHA, tipo: "CREDITO_ADICIONAL", valor: "2000.00",
        origemTipo: "CREDITO_ADICIONAL", criadoPor: POR,
      },
    });

    // ── empenha 9.000 → liquida 7.000 → paga 6.000 (retendo 500) ─────────
    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "9000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "7000.00",
        data: new Date("2026-06-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "6000.00",
        data: new Date("2026-09-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps,
      {
        contaDisponibilidade: CAIXA,
        retencoes: [
          {
            tipoConsignacaoId: tipoInss.id, credorConsignatario: "INSS",
            valor: "500.00", contaConsignacaoAPagar: P_INSS,
          },
        ],
      }
    );

    // ── VIRADA: encerra 2026 e inscreve os restos a pagar ────────────────
    const enc = await encerrarExercicioComRestos(prisma, {
      ano: 2026,
      encerradoPor: POR,
    });
    const rpp = enc.inscricoes.find((i) => i.tipo === "PROCESSADO")!;
    const rpnp = enc.inscricoes.find((i) => i.tipo === "NAO_PROCESSADO")!;

    // ── 2027: paga o RP processado (1.000) e cancela 500 do não processado ─
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-RP-1", valor: "1000.00",
        data: new Date("2027-02-10T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento de RP", criadoPor: POR,
      },
      R_PAG_RP
    );
    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: rpnp.id, valor: "500.00",
        motivo: "Contrato rescindido — o serviço não será prestado.",
        data: new Date("2027-03-15T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );

    // sanidade do cenário (não é o teste — é o retrato do que foi montado)
    expect(rpp.valorInscrito.toFixed(2)).toBe("1000.00");
    expect(rpnp.valorInscrito.toFixed(2)).toBe("2000.00");

    b2026 = await balancoOrcamentario(prisma, 2026);
    b2027 = await balancoOrcamentario(prisma, 2027);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── GUARD ──────────────────────────────────────────────────────────────

  it("exercício INEXISTENTE: fail-closed (um balanço zerado pareceria execução)", async () => {
    await expect(balancoOrcamentario(prisma, 2099)).rejects.toThrow(
      /Exercício 2099 não existe/
    );
  });

  it("2026 está ENCERRADO: balanço definitivo. 2027 está aberto: PARCIAL", () => {
    expect(b2026.parcial).toBe(false);
    expect(b2027.parcial).toBe(true);
  });

  // ── QUADRO 1: RECEITAS ─────────────────────────────────────────────────

  it("RECEITA: prevê 10.000, arrecada 8.000 → frustração de 2.000 (d = c − b)", () => {
    const correntes = receita(b2026, "I");
    expect(correntes.rotulo).toBe("RECEITAS CORRENTES");
    expect(correntes.previsaoInicial).toBe("10000.00");
    expect(correntes.previsaoAtualizada).toBe("10000.00");
    expect(correntes.realizadas).toBe("8000.00");
    // 8.000 − 10.000 = −2.000: NEGATIVO é frustração de receita.
    expect(correntes.saldo).toBe("-2000.00");

    // a linha de ORIGEM (2º dígito) sai do código, sem rótulo inventado
    const origem = b2026.receitas.find((l) => l.nivel === "ORIGEM")!;
    expect(origem.codigo).toBe("1.1");
    expect(origem.rotulo).toBeNull();
    expect(origem.realizadas).toBe("8000.00");

    // não há receita de capital: a linha existe, zerada
    expect(receita(b2026, "II").realizadas).toBe("0.00");
    // não há intra: a linha NÃO existe (o layout manda não criar linha vazia)
    expect(b2026.receitas.some((l) => l.codigo === "7")).toBe(false);
    expect(b2026.receitas.some((l) => l.codigo === "8")).toBe(false);
  });

  it("RECEITA: subtotais e total — III = I + II; V = III + IV; VII = V + VI", () => {
    expect(receita(b2026, "III").realizadas).toBe("8000.00"); // 8.000 + 0
    expect(receita(b2026, "IV").realizadas).toBe("0.00"); // refinanciamento: 0 hoje
    expect(receita(b2026, "V").realizadas).toBe("8000.00");

    // DÉFICIT: empenhado (9.000) > realizado (8.000) -> 1.000
    expect(receita(b2026, "VI").rotulo).toBe("DÉFICIT");
    expect(receita(b2026, "VI").realizadas).toBe("1000.00");
    // e ele NÃO polui as colunas de previsão
    expect(receita(b2026, "VI").previsaoInicial).toBe("0.00");
    expect(receita(b2026, "VI").previsaoAtualizada).toBe("0.00");

    // VII = 8.000 + 1.000
    expect(receita(b2026, "VII").realizadas).toBe("9000.00");
    expect(receita(b2026, "VII").previsaoInicial).toBe("10000.00");
  });

  it("SALDOS DE EXERCÍCIOS ANTERIORES: informativa, fora dos subtotais", () => {
    const saldos = b2026.receitas.find((l) => l.nivel === "INFORMATIVA")!;
    // nenhum crédito por superávit financeiro no cenário
    expect(saldos.previsaoAtualizada).toBe("0.00");
    expect(saldos.realizadas).toBe("0.00");
    expect(saldos.previsaoInicial).toBe("0.00"); // só (b) e (c) recebem valor
    // e ela vem DEPOIS do total: não entra em III/V/VII
    const iTotal = b2026.receitas.findIndex((l) => l.nota === "VII");
    const iSaldos = b2026.receitas.indexOf(saldos);
    expect(iSaldos).toBeGreaterThan(iTotal);
  });

  // ── QUADRO 2: DESPESAS ─────────────────────────────────────────────────

  it("DESPESA: 10.000 + 2.000 = 12.000 autorizados; empenha 9.000 → saldo 3.000", () => {
    const correntes = despesa(b2026, "VIII");
    expect(correntes.rotulo).toBe("DESPESAS CORRENTES");
    expect(correntes.dotacaoInicial).toBe("10000.00");
    expect(correntes.creditosAdicionais).toBe("2000.00");
    // (g) = e + f
    expect(correntes.dotacaoAtualizada).toBe("12000.00");
    expect(correntes.empenhadas).toBe("9000.00");
    expect(correntes.liquidadas).toBe("7000.00");
    // (k) = g − h = 12.000 − 9.000. O saldo é contra o EMPENHADO, não o pago.
    expect(correntes.saldoDotacao).toBe("3000.00");

    // o grupo (2º dígito) vem com o rótulo OFICIAL da Portaria 163/2001
    const grupo = b2026.despesas.find((l) => l.nivel === "GRUPO")!;
    expect(grupo.codigo).toBe("3.3");
    expect(grupo.rotulo).toBe("Outras Despesas Correntes");
    expect(grupo.empenhadas).toBe("9000.00");

    // sem despesa de capital e sem reserva de contingência
    expect(despesa(b2026, "IX").empenhadas).toBe("0.00");
    expect(b2026.despesas.some((l) => l.nota === "X")).toBe(false);
  });

  it("⚠️ A COLUNA PAGA É O BRUTO: 6.000, e não os 5.500 que saíram do caixa", async () => {
    // O pagamento reteve 500 de INSS: saíram 5.500 do banco. Mas a DESPESA
    // EXECUTADA é 6.000 — o município deve e paga o valor cheio, parte ao credor
    // e parte ao consignatário. Os 5.500 são assunto do Anexo 13.
    expect(despesa(b2026, "VIII").pagas).toBe("6000.00");
    expect(despesa(b2026, "XIII").pagas).toBe("6000.00");

    // A retenção EXISTE mesmo — senão este teste passaria por acidente, e a
    // asserção acima não estaria provando nada.
    const retencao = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { tipo: "INGRESSO" },
      select: { valor: true, pagamentoId: true },
    });
    expect(retencao.valor.toFixed(2)).toBe("500.00");
    expect(retencao.pagamentoId).not.toBeNull();

    // e o caixa recebeu de fato só o líquido: a perna de disponibilidade do
    // pagamento é 5.500. É esse número que o Anexo 13 vai usar — não este quadro.
    const perna = await prisma.partidaContabil.findFirstOrThrow({
      where: {
        lancamento: { origemTipo: "PAGAMENTO" },
        conta: { codigo: CAIXA },
      },
      select: { valor: true },
    });
    expect(perna.valor.toFixed(2)).toBe("5500.00");
  });

  it("DESPESA: subtotais e total — XI = VIII + IX (+X); XIII = XI + XII; XV = XIII + XIV", () => {
    expect(despesa(b2026, "XI").empenhadas).toBe("9000.00");
    expect(despesa(b2026, "XII").empenhadas).toBe("0.00"); // amortização: 0 hoje
    expect(despesa(b2026, "XIII").empenhadas).toBe("9000.00");

    // SUPERÁVIT: realizado (8.000) < empenhado (9.000) -> zero
    expect(despesa(b2026, "XIV").rotulo).toBe("SUPERÁVIT");
    expect(despesa(b2026, "XIV").empenhadas).toBe("0.00");

    expect(despesa(b2026, "XV").empenhadas).toBe("9000.00");
    expect(despesa(b2026, "XV").dotacaoInicial).toBe("10000.00");
    expect(despesa(b2026, "XV").liquidadas).toBe("7000.00");
    expect(despesa(b2026, "XV").pagas).toBe("6000.00");
  });

  it("A AMARRAÇÃO: TOTAL receitas (VII) == TOTAL despesas (XV)", () => {
    // 9.000 == 9.000. O déficit de 1.000 é a linha de equilíbrio: sem ela, o
    // Anexo 12 não fecharia (receita 8.000 vs despesa 9.000).
    expect(receita(b2026, "VII").realizadas).toBe("9000.00");
    expect(despesa(b2026, "XV").empenhadas).toBe("9000.00");
    expect(receita(b2026, "VII").realizadas).toBe(despesa(b2026, "XV").empenhadas);
  });

  // ── QUADROS 3 e 4: RESTOS A PAGAR ──────────────────────────────────────

  it("2026 NÃO tem RP a executar: os inscritos no encerramento dele são de 2027", () => {
    // Este é o teste do corte temporal. Os RP inscritos em 31/12/2026 aparecem no
    // balanço de 2027 — no de 2026 eles ainda não existiam para executar.
    const np = b2026.restosNaoProcessados.find((l) => l.nivel === "TOTAL")!;
    const pp = b2026.restosProcessados.find((l) => l.nivel === "TOTAL")!;
    expect(np.inscritos31Dez).toBe("0.00");
    expect(np.saldo).toBe("0.00");
    expect(pp.inscritos31Dez).toBe("0.00");
    expect(pp.saldo).toBe("0.00");
  });

  it("2027 — RP PROCESSADOS: inscritos 1.000, pagos 1.000, saldo ZERO", () => {
    const linha = b2027.restosProcessados.find((l) => l.codigo === "3")!;
    expect(linha.rotulo).toBe("DESPESAS CORRENTES");
    // liquidado 7.000 − pago 6.000 = 1.000 inscritos em 31/12/2026
    expect(linha.inscritosExerciciosAnteriores).toBe("0.00");
    expect(linha.inscritos31Dez).toBe("1000.00");
    expect(linha.pagos).toBe("1000.00");
    expect(linha.cancelados).toBe("0.00");
    // 1.000 − 1.000 = 0
    expect(linha.saldo).toBe("0.00");

    const total = b2027.restosProcessados.find((l) => l.nivel === "TOTAL")!;
    expect(total.inscritos31Dez).toBe("1000.00");
    expect(total.pagos).toBe("1000.00");
    expect(total.saldo).toBe("0.00");
  });

  it("2027 — RP NÃO PROCESSADOS: inscritos 2.000, cancela 500 → saldo 1.500", () => {
    const linha = b2027.restosNaoProcessados.find((l) => l.codigo === "3")!;
    // empenhado 9.000 − liquidado 7.000 = 2.000 inscritos em 31/12/2026
    expect(linha.inscritos31Dez).toBe("2000.00");
    expect(linha.liquidados).toBe("0.00"); // nada foi liquidado em 2027
    expect(linha.pagos).toBe("0.00");
    expect(linha.cancelados).toBe("500.00");
    // 2.000 − 0 − 500 = 1.500. A liquidação NÃO baixa saldo de RP.
    expect(linha.saldo).toBe("1500.00");

    const total = b2027.restosNaoProcessados.find((l) => l.nivel === "TOTAL")!;
    expect(total.saldo).toBe("1500.00");
  });

  it("2027: o pagamento de RP NÃO entra na despesa paga de 2026 (corte temporal)", () => {
    // Sem o corte, os 1.000 pagos em 2027 entrariam na coluna "pagas" de 2026
    // (o empenho é da ficha de 2026) E no quadro de RP: o mesmo dinheiro, duas
    // vezes. Por isso a paga de 2026 é 6.000, não 7.000.
    expect(despesa(b2026, "XIII").pagas).toBe("6000.00");
    // e 2027 não tem ficha própria: nenhuma despesa orçamentária
    expect(despesa(b2027, "XIII").empenhadas).toBe("0.00");
    expect(despesa(b2027, "XIII").pagas).toBe("0.00");
  });

  // ── SERIALIZAÇÃO ───────────────────────────────────────────────────────

  it("todo dinheiro é STRING com 2 casas — nunca number", () => {
    const celulas: unknown[] = [
      ...b2026.receitas.flatMap((l) => [
        l.previsaoInicial, l.previsaoAtualizada, l.realizadas, l.saldo,
      ]),
      ...b2026.despesas.flatMap((l) => [
        l.dotacaoInicial, l.creditosAdicionais, l.dotacaoAtualizada,
        l.empenhadas, l.liquidadas, l.pagas, l.saldoDotacao,
      ]),
      ...b2027.restosNaoProcessados.flatMap((l) => [
        l.inscritosExerciciosAnteriores, l.inscritos31Dez, l.liquidados,
        l.pagos, l.cancelados, l.saldo,
      ]),
      ...b2027.restosProcessados.flatMap((l) => [
        l.inscritosExerciciosAnteriores, l.inscritos31Dez, l.pagos,
        l.cancelados, l.saldo,
      ]),
    ];
    expect(celulas.length).toBeGreaterThan(0);
    for (const c of celulas) {
      expect(typeof c).toBe("string");
      expect(c).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});
