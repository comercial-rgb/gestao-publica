import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  CONTA_DIVIDA_FUNDADA,
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { roteiroDispendioExtra } from "../m07-extraorcamentario/dominio.js";
import { registrarDispendioExtra } from "../m07-extraorcamentario/extraorcamentario.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { demonstracaoFluxosDeCaixa } from "./dfc.js";
import {
  DfcItemNaoClassificadoError,
  DfcNaoFechaError,
  classificarDespesaDfc,
  classificarReceitaDfc,
  montarDfc,
  type AtividadeDfc,
  type DemonstracaoFluxosDeCaixa,
  type FatosDfc,
  type FluxoDaAtividade,
} from "./dominio-dfc.js";

/**
 * ═══ DEMONSTRAÇÃO DOS FLUXOS DE CAIXA — CONTAS FEITAS À MÃO, ANTES DO CÓDIGO ═══
 *
 * 2025 (encerrado)
 *   arrecada IPTU 11130111 ................ 50.000                      caixa +50.000
 *   f25-3 (3.3 outras correntes): empenha e liquida 8.000, não paga → RPP 8.000
 *   f25-4 (4.4 investimentos):    empenha e liquida 6.000, não paga → RPP 6.000
 *   ── caixa no encerramento de 2025 = 50.000 = CAIXA INICIAL de 2026
 *
 * 2026 (aberto — posição parcial)
 *   RECEITAS                                              atividade
 *     11130111 IPTU ........... 10.000 + 5.000 = 15.000   operacional (Receita Tributária)   N=2
 *     17210151 FPM ........................... 20.000     operacional (Transf. Correntes)
 *     22110001 alienação ...... 3.000 + 1.000 =  4.000     investimento (Alienação de Bens)    N=2
 *     23110001 amort. empréstimos concedidos ...  500     investimento
 *     21180111 operação de crédito 30.000 + 10.000 = 40.000 financiamento                    N=2
 *     24110001 transferência de capital ....... 7.000     financiamento
 *   DESPESA PAGA (bruto)
 *     3.1 pessoal ..................................... 12.000   operacional
 *     3.3 outras correntes 9.000 (retém 1.000) + 4.000 (retém 500) = 13.000   operacional  N=2
 *     4.4 investimentos ................................ 6.000   investimento
 *     4.5 inversões .................................... 2.000   investimento
 *     4.6 amortização da dívida ........ 5.000 + 3.000 = 8.000   financiamento           N=2
 *   RESTOS A PAGAR PAGOS
 *     RPP f25-3 (3.3) ............ 8.000   operacional → linha 3.3 = 13.000 + 8.000 = 21.000
 *     RPP f25-4 (4.4), parcial ... 4.000   investimento → linha 4.4 = 6.000 + 4.000 = 10.000
 *   DEPÓSITOS: recebidos 1.000 + 500 = 1.500 (as retenções) · pagos 1.200 (repasse ao INSS)
 *
 *   OPERACIONAL   ingressos 15.000 + 20.000 + 1.500 ................... = 36.500
 *                 desembolsos 12.000 + 21.000 + 1.200 ................. = 34.200   líquido  2.300
 *   INVESTIMENTO  ingressos 4.000 + 500 ............................... =  4.500
 *                 desembolsos 10.000 + 2.000 .......................... = 12.000   líquido −7.500
 *   FINANCIAMENTO ingressos 40.000 + 7.000 ............................ = 47.000
 *                 desembolsos 8.000 ................................... =  8.000   líquido 39.000
 *   GERAÇÃO LÍQUIDA = 2.300 − 7.500 + 39.000 = 33.800
 *   CAIXA FINAL = 50.000 + 33.800 = 83.800
 *
 *   A PROVA PELO BANCO, somada por outro caminho (o que entrou e saiu do caixa, pelo líquido):
 *     entrou 86.500 (receitas) · saiu 12.000 + 8.000 + 3.500 + 6.000 + 2.000 + 8.000 (despesa
 *     pelo líquido) + 12.000 (RP) + 1.200 (repasse) = 52.700
 *     50.000 + 86.500 − 52.700 = 83.800 ✓
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const F500 = "fnt-500";
const F540 = "fnt-540";
const CREDOR = "12345678000195";
const CAIXA = "1.1.1.1.1.00.00";
const FORNECEDORES = "2.1.3.1.1.00.00";
const P_INSS = "2.1.8.8.1.01.00";
const CONTAS_CAIXA = [CAIXA];

/**
 * ⚠️ UMA FILA DO ART. 141 POR RESTO A PAGAR — mesma razão da fixture do Anexo 6: um resto a
 * pagar liquidado e não pago fica na cabeça da fila dele, e um pagamento do exercício na mesma
 * fila seria (corretamente) recusado pelo M06. Os pagamentos de 2026 são integrais e imediatos,
 * então dividem uma fila só sem se atropelar.
 */
const FILAS = {
  rp33: { fonte: F500, conta: "CC-001", cat: "FORNECIMENTO_BENS" },
  rp44: { fonte: F500, conta: "CC-001", cat: "LOCACAO" },
  ex26: { fonte: F540, conta: "CC-002", cat: "PRESTACAO_SERVICOS" },
} as const;
type Fila = (typeof FILAS)[keyof typeof FILAS];

const R_EMP = roteiroEmpenho();
const R_LIQ_39 = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDORES });
const R_LIQ_71 = roteiroLiquidacao({ codElemento: "71", obrigacaoAPagar: FORNECEDORES });
const R_PAG = roteiroPagamento({ obrigacaoAPagar: FORNECEDORES, disponibilidade: CAIXA });
const R_ARR = roteiroArrecadacao({
  naturezaDaFonte: "ORDINARIOS",
  disponibilidade: CAIXA,
  variacaoAumentativa: "4.1.1.2.1.01.00",
});
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: FORNECEDORES, disponibilidade: CAIXA });
const R_REPASSE = roteiroDispendioExtra({ consignacaoAPagar: P_INSS, disponibilidade: CAIXA });

let deps: M05Deps;
let tipoInssId = "";
let dfc2026: DemonstracaoFluxosDeCaixa;

const fluxo = (d: DemonstracaoFluxosDeCaixa, a: AtividadeDfc): FluxoDaAtividade =>
  d.fluxos.find((f) => f.atividade === a)!;
const valorDe = (
  linhas: FluxoDaAtividade["ingressos"],
  rotulo: string
): string => {
  const l = linhas.find((x) => x.rotulo === rotulo && x.nivel === "ITEM");
  if (l === undefined) throw new Error(`linha "${rotulo}" ausente`);
  return l.valor;
};

async function arrecada(exercicio: number, codigo: string, valor: string, n: string, quando: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio, naturezaReceita: codigo, fonte: "500", exercicioFonte: 1,
      valor, dataArrecadacao: new Date(quando), numeroReceita: `RC-${n}`, criadoPor: POR,
    },
    R_ARR,
    criarM04Deps(prisma)
  );
}

async function empenhaLiquida(
  ficha: string, n: string, valor: string, ano: number, fila: Fila, roteiro = R_LIQ_39, dividaId?: string
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: ficha, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: new Date(`${ano}-03-10T12:00:00Z`), credorCpfCnpj: CREDOR, historico: "despesa",
      categoriaOrdemCronologica: fila.cat, criadoPor: POR,
      ...(dividaId !== undefined ? { dividaId } : {}),
    },
    R_EMP,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor, data: new Date(`${ano}-04-10T12:00:00Z`),
      responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR,
    },
    roteiro,
    deps
  );
  return l.liquidacaoId;
}

/** Empenha, liquida e paga INTEGRAL em 2026, com retenção de INSS opcional. */
async function executa2026(
  ficha: string, n: string, valor: string, opcoes: { retencao?: string; roteiro?: typeof R_LIQ_39; dividaId?: string } = {}
): Promise<void> {
  const liq = await empenhaLiquida(ficha, n, valor, 2026, FILAS.ex26, opcoes.roteiro ?? R_LIQ_39, opcoes.dividaId);
  await pagar(
    {
      liquidacaoId: liq, numero: `NP-${n}`, valor, data: new Date("2026-05-10T12:00:00Z"),
      contaBancaria: FILAS.ex26.conta, fonteId: FILAS.ex26.fonte, historico: "pagamento", criadoPor: POR,
    },
    R_PAG,
    deps,
    opcoes.retencao !== undefined
      ? {
          contaDisponibilidade: CAIXA,
          retencoes: [
            {
              tipoConsignacaoId: tipoInssId, credorConsignatario: "INSS",
              valor: opcoes.retencao, contaConsignacaoAPagar: P_INSS,
            },
          ],
        }
      : undefined
  );
}

describe("M12 — Demonstração dos Fluxos de Caixa", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    await semearPcasp(prisma);
    deps = criarM05Deps(prisma);

    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
    });
    await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
    await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });

    // O elemento 39 fora do grupo 3 é a concessão à pendência MAPA-ELEMENTO-CONTA (o roteiro de
    // liquidação só cobre 30, 39 e 71) — a mesma da fixture do Anexo 6. A DFC lê CATEGORIA e
    // GRUPO; o elemento não muda nenhuma classificação aqui.
    await prisma.naturezaDespesa.createMany({
      data: [
        { id: "nd-31", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "39", codigoCompleto: "319039", descricao: "Pessoal (ver MAPA-ELEMENTO-CONTA)" },
        { id: "nd-33", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
        { id: "nd-44", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "39", codigoCompleto: "449039", descricao: "Investimento" },
        { id: "nd-45", codCategoria: "4", codNatureza: "5", codModalidade: "90", codElemento: "39", codigoCompleto: "459039", descricao: "Inversão financeira" },
        { id: "nd-46", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida resgatado" },
      ],
    });
    await prisma.naturezaReceita.createMany({
      data: [
        { id: "nr-iptu", codigo: "11130111", descricao: "IPTU — principal" },
        { id: "nr-fpm", codigo: "17210151", descricao: "FPM" },
        { id: "nr-alien", codigo: "22110001", descricao: "Alienação de bens móveis" },
        { id: "nr-amort", codigo: "23110001", descricao: "Amortização de empréstimos concedidos" },
        { id: "nr-opcred", codigo: "21180111", descricao: "Operações de crédito internas" },
        { id: "nr-tcap", codigo: "24110001", descricao: "Transferência de capital" },
        { id: "nr-outras", codigo: "29110001", descricao: "Outras receitas de capital" },
      ],
    });
    await prisma.fonteRecurso.createMany({
      data: [
        { id: F500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
        { id: F540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
      ],
    });
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: F500 },
        { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: F540 },
      ],
    });
    const tipoInss = await prisma.tipoConsignacao.create({
      data: {
        codigo: "INSS", descricao: "INSS", criadoPor: POR,
        contaPassivo: { connect: { codigo: P_INSS } },
      },
    });
    tipoInssId = tipoInss.id;

    // A DÍVIDA EXISTE PORQUE O M05 EXIGE: empenho do grupo 6 diz qual dívida amortiza.
    const contaDivida = await prisma.contaPcasp.findFirstOrThrow({
      where: { codigo: CONTA_DIVIDA_FUNDADA },
      select: { id: true },
    });
    await prisma.dividaConsolidada.create({
      data: {
        id: "div-1", identificador: "CONTRATO-001", credorNome: "Banco do Brasil S.A.",
        credorDocumento: "00000000000191", tipo: "CONTRATUAL",
        leiAutorizativa: "Lei Municipal 1.234/2020", objeto: "Infraestrutura urbana",
        contaContabilId: contaDivida.id, criadoPor: POR,
      },
    });
    // O saldo devedor, pela data do fato (2024) — não toca o caixa.
    await prisma.movimentoDivida.create({
      data: {
        dividaId: "div-1", tipo: "INGRESSO_OPERACAO_CREDITO", valor: "500000.00",
        dataMovimento: new Date("2024-03-01T12:00:00Z"), motivo: "assinatura do contrato", criadoPor: POR,
      },
    });

    const base = {
      orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04",
      subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    };
    await criarFichaDeTeste(prisma, { ...base, id: "f25-3", exercicio: 2025, numero: 1, naturezaDespesaId: "nd-33", fonteId: F500, valorDotado: "20000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f25-4", exercicio: 2025, numero: 2, naturezaDespesaId: "nd-44", fonteId: F500, valorDotado: "20000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f26-31", exercicio: 2026, numero: 1, naturezaDespesaId: "nd-31", fonteId: F540, valorDotado: "50000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f26-33", exercicio: 2026, numero: 2, naturezaDespesaId: "nd-33", fonteId: F540, valorDotado: "50000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f26-44", exercicio: 2026, numero: 3, naturezaDespesaId: "nd-44", fonteId: F540, valorDotado: "50000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f26-45", exercicio: 2026, numero: 4, naturezaDespesaId: "nd-45", fonteId: F540, valorDotado: "50000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "f26-46", exercicio: 2026, numero: 5, naturezaDespesaId: "nd-46", fonteId: F540, valorDotado: "50000.00" });

    // ═══ 2025 ═══
    await arrecada(2025, "11130111", "50000.00", "25-1", "2025-02-10T12:00:00Z");
    const l25a = await empenhaLiquida("f25-3", "25A", "8000.00", 2025, FILAS.rp33);
    const l25b = await empenhaLiquida("f25-4", "25B", "6000.00", 2025, FILAS.rp44);
    await encerrarExercicioComRestos(prisma, { ano: 2025, encerradoPor: POR });

    // ═══ 2026 — receitas ═══
    await arrecada(2026, "11130111", "10000.00", "26-1", "2026-01-15T12:00:00Z");
    await arrecada(2026, "11130111", "5000.00", "26-2", "2026-01-16T12:00:00Z");
    await arrecada(2026, "17210151", "20000.00", "26-3", "2026-01-17T12:00:00Z");
    await arrecada(2026, "22110001", "3000.00", "26-4", "2026-01-18T12:00:00Z");
    await arrecada(2026, "22110001", "1000.00", "26-5", "2026-01-19T12:00:00Z");
    await arrecada(2026, "23110001", "500.00", "26-6", "2026-01-20T12:00:00Z");
    await arrecada(2026, "21180111", "30000.00", "26-7", "2026-01-21T12:00:00Z");
    await arrecada(2026, "21180111", "10000.00", "26-8", "2026-01-22T12:00:00Z");
    await arrecada(2026, "24110001", "7000.00", "26-9", "2026-01-23T12:00:00Z");

    // ═══ 2026 — despesa paga ═══
    await executa2026("f26-31", "26-31", "12000.00");
    await executa2026("f26-33", "26-33a", "9000.00", { retencao: "1000.00" });
    await executa2026("f26-33", "26-33b", "4000.00", { retencao: "500.00" });
    await executa2026("f26-44", "26-44", "6000.00");
    await executa2026("f26-45", "26-45", "2000.00");
    await executa2026("f26-46", "26-46a", "5000.00", { roteiro: R_LIQ_71, dividaId: "div-1" });
    await executa2026("f26-46", "26-46b", "3000.00", { roteiro: R_LIQ_71, dividaId: "div-1" });

    // ═══ 2026 — restos a pagar de 2025 ═══
    await pagarRestosAPagar(
      prisma,
      { liquidacaoId: l25a, numero: "NP-RP-A", valor: "8000.00", data: new Date("2026-02-15T12:00:00Z"), contaBancaria: FILAS.rp33.conta, fonteId: FILAS.rp33.fonte, historico: "RPP", criadoPor: POR },
      R_PAG_RP
    );
    await pagarRestosAPagar(
      prisma,
      { liquidacaoId: l25b, numero: "NP-RP-B", valor: "4000.00", data: new Date("2026-02-16T12:00:00Z"), contaBancaria: FILAS.rp44.conta, fonteId: FILAS.rp44.fonte, historico: "RPP parcial", criadoPor: POR },
      R_PAG_RP
    );

    // ═══ 2026 — repasse de parte das retenções ═══
    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: tipoInssId, credorConsignatario: "INSS",
        contaBancaria: "CC-002", fonteId: F540, valor: "1200.00",
        data: new Date("2026-06-20T12:00:00Z"), historico: "GPS", criadoPor: POR,
      },
      R_REPASSE
    );

    dfc2026 = await demonstracaoFluxosDeCaixa(prisma, 2026, CONTAS_CAIXA);
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── GUARDS DE ENTRADA ─────────────────────────────────────────────────

  it("sem o rol de contas de caixa: recusa (não há como apurar caixa inicial e final)", async () => {
    await expect(demonstracaoFluxosDeCaixa(prisma, 2026, [])).rejects.toThrow(/sem contas de disponibilidade/);
  });

  it("conta de caixa inexistente no PCASP: recusa nomeando a conta", async () => {
    await expect(demonstracaoFluxosDeCaixa(prisma, 2026, ["9.9.9.9.9.99.99"])).rejects.toThrow(
      /inexistente\(s\) no PCASP: 9\.9\.9\.9\.9\.99\.99/
    );
  });

  it("exercício inexistente: recusa", async () => {
    await expect(demonstracaoFluxosDeCaixa(prisma, 2099, CONTAS_CAIXA)).rejects.toThrow(/Exercício 2099 não existe/);
  });

  // ── OS TRÊS FLUXOS, célula a célula contra a conta feita à mão ─────────

  it("OPERACIONAL — N=2 na receita tributária e na despesa corrente, retenções como depósito", () => {
    const op = fluxo(dfc2026, "OPERACIONAL");
    expect(valorDe(op.ingressos, "Receita Tributária")).toBe("15000.00"); // 10.000 + 5.000
    expect(valorDe(op.ingressos, "Transferências Correntes Recebidas")).toBe("20000.00");
    expect(valorDe(op.ingressos, "Depósitos Restituíveis e Valores Vinculados")).toBe("1500.00"); // 1.000 + 500
    expect(op.totalIngressos).toBe("36500.00");

    expect(valorDe(op.desembolsos, "Pessoal e Encargos Sociais")).toBe("12000.00");
    // 9.000 + 4.000 do exercício, PELO BRUTO, + 8.000 de restos a pagar
    expect(valorDe(op.desembolsos, "Outras Despesas Correntes")).toBe("21000.00");
    const detalhe = op.desembolsos.find((l) => l.nivel === "DETALHE")!;
    expect(detalhe.valor).toBe("8000.00");
    expect(valorDe(op.desembolsos, "Juros e Encargos da Dívida")).toBe("0.00");
    expect(valorDe(op.desembolsos, "Depósitos Restituíveis e Valores Vinculados")).toBe("1200.00");
    // O DETALHE não soma de novo: 12.000 + 21.000 + 1.200 = 34.200 (e não 42.200)
    expect(op.totalDesembolsos).toBe("34200.00");
    expect(op.fluxoLiquido).toBe("2300.00");
  });

  it("INVESTIMENTO — N=2 na alienação, e restos a pagar de investimento no grupo 4", () => {
    const inv = fluxo(dfc2026, "INVESTIMENTO");
    expect(valorDe(inv.ingressos, "Alienação de Bens")).toBe("4000.00"); // 3.000 + 1.000
    expect(valorDe(inv.ingressos, "Amortização de Empréstimos e Financiamentos Concedidos")).toBe("500.00");
    expect(inv.totalIngressos).toBe("4500.00");

    expect(valorDe(inv.desembolsos, "Investimentos")).toBe("10000.00"); // 6.000 + RP 4.000
    expect(valorDe(inv.desembolsos, "Inversões Financeiras")).toBe("2000.00");
    expect(inv.totalDesembolsos).toBe("12000.00");
    expect(inv.fluxoLiquido).toBe("-7500.00");
  });

  it("FINANCIAMENTO — N=2 na operação de crédito e na amortização da dívida", () => {
    const fin = fluxo(dfc2026, "FINANCIAMENTO");
    expect(valorDe(fin.ingressos, "Operações de Crédito")).toBe("40000.00"); // 30.000 + 10.000
    expect(valorDe(fin.ingressos, "Transferências de Capital Recebidas")).toBe("7000.00");
    expect(fin.totalIngressos).toBe("47000.00");

    expect(valorDe(fin.desembolsos, "Amortização da Dívida")).toBe("8000.00"); // 5.000 + 3.000
    expect(fin.totalDesembolsos).toBe("8000.00");
    expect(fin.fluxoLiquido).toBe("39000.00");
  });

  it("JUROS são operacionais; só o PRINCIPAL (grupo 6) é financiamento", () => {
    const fin = fluxo(dfc2026, "FINANCIAMENTO");
    expect(fin.desembolsos.map((l) => l.rotulo)).not.toContain("Juros e Encargos da Dívida");
    const op = fluxo(dfc2026, "OPERACIONAL");
    expect(op.desembolsos.map((l) => l.rotulo)).toContain("Juros e Encargos da Dívida");
  });

  it("GERAÇÃO LÍQUIDA e CAIXA: 50.000 + 33.800 = 83.800, e bate com as partidas", () => {
    expect(dfc2026.parcial).toBe(true);
    expect(dfc2026.geracaoLiquida).toBe("33800.00");
    expect(dfc2026.caixaInicial).toBe("50000.00");
    expect(dfc2026.caixaFinal).toBe("83800.00");
    // Prova independente, escrita como literal (ver o cabeçalho): 50.000 + 86.500 − 52.700.
    expect(dfc2026.caixaApuradoPelasPartidas).toBe("83800.00");
  });

  it("todo dinheiro é STRING com 2 casas — nunca number", () => {
    const celulas = [
      ...dfc2026.fluxos.flatMap((f) => [
        ...f.ingressos.map((l) => l.valor),
        ...f.desembolsos.map((l) => l.valor),
        f.totalIngressos, f.totalDesembolsos, f.fluxoLiquido,
      ]),
      dfc2026.geracaoLiquida, dfc2026.caixaInicial, dfc2026.caixaFinal, dfc2026.caixaApuradoPelasPartidas,
    ];
    for (const c of celulas) {
      expect(typeof c).toBe("string");
      expect(c).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  // ── AS RECUSAS (negação com MOTIVO) — por último, porque sujam o caixa ─

  it("NÃO FECHA: 1.234,56 no caixa sem fato recusam a DFC, nomeando a diferença", async () => {
    // Um lançamento direto em conta de caixa, que nenhum fato (receita, pagamento, depósito)
    // explica. O Balanço Financeiro recusaria pelo mesmo motivo; a DFC também tem de recusar.
    const caixa = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: CAIXA }, select: { id: true } });
    const vpa = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: "4.1.1.2.1.01.00" }, select: { id: true } });
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "ORFAO-1",
        dataTransacao: new Date("2026-07-01T12:00:00Z"),
        historico: "entrada de caixa sem fato",
        origemTipo: "TESTE",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: caixa.id, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1234.56" },
            { contaId: vpa.id, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1234.56" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await demonstracaoFluxosDeCaixa(prisma, 2026, CONTAS_CAIXA);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DfcNaoFechaError);
    const msg = (erro as Error).message;
    expect(msg).toMatch(/não fecha contra o caixa/);
    expect(msg).toMatch(/caixa final derivado é 83800\.00/);
    expect(msg).toMatch(/apurado pelas partidas das contas de disponibilidade é 85034\.56/);
    expect(msg).toMatch(/diferença de -1234\.56/);
    expect((erro as DfcNaoFechaError).diferenca).toBe("-1234.56");
  });

  it("NÃO CLASSIFICADO: receita de 'outras receitas de capital' recusa a DFC nomeando o item", async () => {
    await arrecada(2026, "29110001", "700.00", "26-10", "2026-07-02T12:00:00Z");
    let erro: unknown;
    try {
      await demonstracaoFluxosDeCaixa(prisma, 2026, CONTAS_CAIXA);
    } catch (e) {
      erro = e;
    }
    // A classificação é conferida ANTES do caixa: o item sem atividade é o motivo, não o órfão.
    expect(erro).toBeInstanceOf(DfcItemNaoClassificadoError);
    const e = erro as DfcItemNaoClassificadoError;
    expect(e.itens).toHaveLength(1);
    expect(e.itens[0]!.item).toBe("receita 29110001 (Outras receitas de capital)");
    expect(e.itens[0]!.valor).toBe("700.00");
    expect(e.message).toMatch(/outras receitas de capital" reúne ingressos que o manual reparte/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O MONTADOR PURO — a classificação e a conferência, sem banco
// ═══════════════════════════════════════════════════════════════════════════

describe("M12 — DFC, montador puro", () => {
  const m = (v: string) => toMoney(v);
  const base: FatosDfc = {
    exercicio: 2026,
    parcial: false,
    receitas: [
      { codigoNatureza: "11130111", descricao: "IPTU", valor: m("100.00") },
      { codigoNatureza: "71130111", descricao: "IPTU intra", valor: m("50.00") },
    ],
    despesasPagas: [
      { codCategoria: "3", codGrupo: "3", valor: m("30.00") },
      { codCategoria: "3", codGrupo: "3", valor: m("20.00") },
    ],
    restosPagos: [],
    depositosRecebidos: m("0.00"),
    depositosPagos: m("0.00"),
    caixaInicial: m("10.00"),
    caixaApurado: m("110.00"),
  };

  it("fecha: 10 + (150 − 50) = 110, e a intraorçamentária segue a origem da categoria base", () => {
    const d = montarDfc(base);
    const op = d.fluxos.find((f) => f.atividade === "OPERACIONAL")!;
    expect(op.ingressos.find((l) => l.rotulo === "Receita Tributária")!.valor).toBe("150.00");
    expect(d.caixaFinal).toBe("110.00");
  });

  it("não fecha por 0,01: recusa com a diferença exata", () => {
    expect(() => montarDfc({ ...base, caixaApurado: m("110.01") })).toThrow(/diferença de -0\.01/);
  });

  it("par categoria × grupo fora da classificação oficial: recusa nomeando o par", () => {
    let erro: unknown;
    try {
      montarDfc({ ...base, despesasPagas: [...base.despesasPagas, { codCategoria: "3", codGrupo: "4", valor: m("5.00") }] });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DfcItemNaoClassificadoError);
    expect((erro as Error).message).toMatch(/despesa paga de natureza 3\.4, 5\.00/);
  });

  it("código de receita malformado vira item não classificado com o motivo do parser", () => {
    const c = classificarReceitaDfc("9");
    expect(c.atividade).toBeNull();
    expect(c.atividade === null ? c.motivo : "").toMatch(/8 DÍGITOS/);
  });

  it("fato zerado não é item: reserva de contingência sem pagamento não recusa", () => {
    const d = montarDfc({ ...base, despesasPagas: [...base.despesasPagas, { codCategoria: "9", codGrupo: "9", valor: m("0.00") }] });
    expect(d.caixaFinal).toBe("110.00");
  });

  it("a tabela da despesa: 3.1/3.2/3.3 operacional, 4.4/4.5 investimento, 4.6 financiamento", () => {
    expect(classificarDespesaDfc("3", "1").atividade).toBe("OPERACIONAL");
    expect(classificarDespesaDfc("3", "2").atividade).toBe("OPERACIONAL");
    expect(classificarDespesaDfc("3", "3").atividade).toBe("OPERACIONAL");
    expect(classificarDespesaDfc("4", "4").atividade).toBe("INVESTIMENTO");
    expect(classificarDespesaDfc("4", "5").atividade).toBe("INVESTIMENTO");
    expect(classificarDespesaDfc("4", "6").atividade).toBe("FINANCIAMENTO");
    expect(classificarDespesaDfc("9", "9").atividade).toBeNull();
  });
});
