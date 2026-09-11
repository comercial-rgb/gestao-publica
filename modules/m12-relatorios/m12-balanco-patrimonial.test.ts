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
import { adquirirBem, atualizarCompetencia } from "../m10-patrimonial/patrimonio.js";
import { roteiroIngressoExtra } from "../m07-extraorcamentario/dominio.js";
import { registrarIngressoExtra } from "../m07-extraorcamentario/extraorcamentario.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { apurarResultadoDoExercicio } from "../m08-restos-a-pagar/apuracao.js";
import { balancoPatrimonial, LINHA_RESULTADO } from "./balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "./cadastro-linhas.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { fimDoDiaCivil, janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * ANEXO 14 — BALANÇO PATRIMONIAL (art. 105 da Lei 4.320/64).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ CENÁRIO DO t1 ═══
 *   arrecada 8.000        D caixa           / C VPA receita
 *   liquida  6.000        D VPD             / C fornecedores
 *   paga     6.000        D fornecedores    / C caixa
 *   adquire  6.000        D imobilizado     / C VPA incorporação
 *   deprecia   500        D VPD depreciação / C depreciação acumulada
 *
 *   ATIVO
 *     Caixa e Equivalentes   8.000 − 6.000            = 2.000,00
 *     Imobilizado            6.000 − 500 (acumulada)  = 5.500,00
 *     TOTAL DO ATIVO                                  = 7.500,00
 *
 *   PASSIVO
 *     Fornecedores           6.000 C − 6.000 D        =     0,00
 *
 *   PATRIMÔNIO LÍQUIDO
 *     Resultado do Exercício  VPA (8.000 + 6.000) −
 *                             VPD (6.000 + 500)       = 7.500,00
 *
 *   A1:  7.500,00  ==  0,00 + 7.500,00   ✓
 *
 * ⚠️ A LINHA DO RESULTADO É ESTRUTURAL, não vem do mapeamento. Das partidas
 * dobradas do patrimonial:  A + VPD = P + VPA  ⟹  A = P + (VPA − VPD). Enquanto o
 * exercício não encerra, o superávit ainda vive nas classes 3/4 — sem essa linha, o
 * ATIVO nunca igualaria PASSIVO + PL.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — QUADRO FINANCEIRO/PERMANENTE (art. 105 da Lei 4.320/64; IPC 04)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ═══ CENÁRIO DO t1 (o cenário-ouro ESTENDIDO) ═══
 *   arrecada        8.000   D caixa            / C VPA receita
 *   liquida         6.000   D VPD              / C fornecedores
 *   paga            2.500   D fornecedores     / C caixa      (PARCIAL, de propósito)
 *   adquire         6.000   D imobilizado      / C VPA incorporação
 *   deprecia          500   D VPD depreciação  / C depreciação acumulada
 *   consignação       900   D caixa            / C consignações a repassar
 *   oper. crédito   2.000   D caixa            / C dívida fundada (longo prazo)
 *
 *   SALDOS EM 31/12
 *     Caixa          8.000 − 2.500 + 900 + 2.000  =  8.400,00
 *     Imobilizado    6.000                        =  6.000,00
 *     Depr. acum.                                 =   −500,00  (retificadora)
 *     Fornecedores   6.000 − 2.500                =  3.500,00
 *     Consignações                                =    900,00
 *     Dívida fundada                              =  2.000,00
 *
 *   QUADRO PRINCIPAL
 *     ATIVO     8.400 + 5.500                     = 13.900,00
 *     PASSIVO   3.500 + 900 + 2.000               =  6.400,00
 *     PL (resultado)  VPA 14.000 − VPD 6.500      =  7.500,00
 *     A1:  13.900 == 6.400 + 7.500                ✓
 *
 *   QUADRO DO ART. 105
 *     Ativo FINANCEIRO      caixa                 =  8.400,00
 *     Ativo PERMANENTE      6.000 − 500           =  5.500,00
 *     Passivo FINANCEIRO    3.500 + 900           =  4.400,00
 *     Passivo PERMANENTE    dívida fundada        =  2.000,00
 *     F1 (ativo):    8.400 + 5.500 = 13.900       ✓ == ATIVO
 *     F1 (passivo):  4.400 + 2.000 =  6.400       ✓ == PASSIVO (o PL fica FORA)
 *     SUPERÁVIT FINANCEIRO  8.400 − 4.400         =  4.000,00
 *
 *   E O RP: processado = liquidado 6.000 − pago 2.500 = 3.500,00 — EXATAMENTE o
 *   saldo de Fornecedores. ⚠️ A inscrição de RP NÃO gera lançamento patrimonial
 *   (é registro de controle): a obrigação continua morando em Fornecedores. É
 *   por marcar Fornecedores como FINANCEIRO que o superávit já desconta os
 *   restos a pagar — como manda o art. 43, § 2º.
 *
 * ═══ POR QUE CADA CONTA TEM O INDICADOR QUE TEM (art. 105) ═══
 *   Caixa/bancos (1.1.1)        F — § 1º: valores numerários, disponíveis sem
 *                                   depender de autorização orçamentária.
 *   Imobilizado (1.2.3)         P — § 2º: alienar o bem depende de autorização
 *                                   legislativa.
 *   Depr. acumulada (1.2.3.8)   P — retificadora do imobilizado: TEM de andar com
 *                                   o bem que ela retifica, senão o permanente não
 *                                   bate com o ativo não circulante.
 *   Fornecedores (2.1.3)        F — § 3º: a despesa já foi empenhada e liquidada;
 *                                   pagá-la não depende de NOVA autorização
 *                                   orçamentária. Em 31/12 ela vira RP — e RP é
 *                                   passivo financeiro por definição.
 *   Consignações (2.1.8)        F — § 3º: dinheiro de terceiro; repassar não é
 *                                   despesa orçamentária.
 *   Dívida fundada (2.2)        P — § 4º: amortizar depende de autorização
 *                                   legislativa.
 *   Resultados acum. (2.3)      — SEM INDICADOR, e de propósito: é PL, não é
 *                                   passivo (art. 105, V — o Saldo Patrimonial é
 *                                   item à parte). Não se paga: não se classifica.
 *                                   O t6 prova que o quadro não o exige.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
const CLASSE = "cl-veiculos";
const NAT_RECEITA = "11130111";
const TIPO_CONSIG = "tc-inss";

// Fixtures do PCASP (o plano real ainda não chegou — ver MODULO.md do M10).
const CAIXA = "1.1.1.1.2.00.00";
const ESTOQUE = "1.1.5.1.1.00.00"; // tem linha, NÃO tem indicador (t2 do bloco 3)
const IMOBILIZADO = "1.2.3.1.1.01.00";
const DEP_ACUMULADA = "1.2.3.8.1.01.00";
const ORFA = "1.9.9.9.9.99.00"; // classe 1, sem linha mapeada (t2)
const FORNECEDOR = "2.1.3.1.1.00.00";
const CONSIGNACAO = "2.1.8.8.1.01.00";
const DIVIDA_FUNDADA = "2.2.1.1.1.00.00";
const RESULTADOS_ACUM = "2.3.1.1.1.00.00"; // PL — sem indicador, de propósito
const VPD = "3.3.2.1.1.01.00";
const VPD_DEPREC = "3.3.3.1.1.00.00";
const VPA_RECEITA = "4.1.1.2.1.01.00";
const VPA_INCORP = "4.5.9.1.1.00.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

// ⚠️ O `indicadorSuperavit` é PARÂMETRO (art. 105) — nunca derivado do código.
// As contas de classe 3/4 (variações) e 5-8 (controle) não têm indicador: elas
// não são ativo nem passivo, e nunca entram no quadro.
const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-estoque", codigo: ESTOQUE, nome: "Estoques (sem indicador)", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  { id: "c-dep-acum", codigo: DEP_ACUMULADA, nome: "Depreciação acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  // Órfã de LINHA, não de indicador: a A2 dispara antes de o quadro ser montado.
  { id: "c-orfa", codigo: ORFA, nome: "Conta sem linha", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-consig", codigo: CONSIGNACAO, nome: "Consignações a repassar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-divida", codigo: DIVIDA_FUNDADA, nome: "Empréstimos a longo prazo", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  { id: "c-resacum", codigo: RESULTADOS_ACUM, nome: "Resultados acumulados", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-dep", codigo: VPD_DEPREC, nome: "VPD depreciação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_RECEITA, nome: "VPA tributária", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-inc", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
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
  disponibilidade: CAIXA, variacaoAumentativa: VPA_RECEITA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_INGRESSO = roteiroIngressoExtra({
  disponibilidade: CAIXA, consignacaoAPagar: CONSIGNACAO,
});


/**
 * ⚠️ O FIM DO EXERCÍCIO É O DO ENTE, E ISSO VIROU LITERAL AQUI DEPOIS DE UMA ACUSAÇÃO.
 *
 * O corte era `new Date("YYYY-12-31T23:59:59Z")`, que em São Paulo é **31/12 às 20:59:59**.
 * Quando o ENT03b pôs o fato do encerramento no último instante CIVIL do exercício, ele
 * passou a cair TRÊS HORAS DEPOIS deste corte — e o teste acusou. A acusação estava certa:
 * o corte é que estava em Greenwich. Ver `docs/adr/ADR-data-civil-do-ente.md`.
 */
const CORTE = janelaCivilDoAno(2026).fim;
let deps: M05Deps;

/** As linhas do quadro principal — rótulos do MCASP, prefixos do plano. */
async function semearLinhas(): Promise<void> {
  const linhas = [
    { codigoLinha: "AC.CAIXA", rotulo: "Caixa e Equivalentes de Caixa", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1.1"] },
    { codigoLinha: "AC.CREDITOS", rotulo: "Créditos a Curto Prazo", grupo: "ATIVO_CIRCULANTE", ordem: 2, prefixos: ["1.1.3"] },
    { codigoLinha: "AC.ESTOQUES", rotulo: "Estoques", grupo: "ATIVO_CIRCULANTE", ordem: 3, prefixos: ["1.1.5"] },
    { codigoLinha: "ANC.IMOB", rotulo: "Imobilizado", grupo: "ATIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["1.2.3"] },
    { codigoLinha: "ANC.INTANG", rotulo: "Intangível", grupo: "ATIVO_NAO_CIRCULANTE", ordem: 2, prefixos: ["1.2.4"] },
    { codigoLinha: "PC.FORN", rotulo: "Fornecedores e Contas a Pagar a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 1, prefixos: ["2.1.3"] },
    { codigoLinha: "PC.DEMAIS", rotulo: "Demais Obrigações a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 2, prefixos: ["2.1.8"] },
    { codigoLinha: "PNC.OBRIG", rotulo: "Obrigações a Longo Prazo", grupo: "PASSIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["2.2"] },
    { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social e Capital Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3"] },
  ] as const;

  for (const l of linhas) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
    });
  }
}

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
      id: "nd", codCategoria: "4", codNatureza: "4", codModalidade: "90",
      codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });

  // M10 — a classe e o roteiro patrimonial.
  await prisma.classeDeBens.create({
    data: {
      id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL",
      contaContabilAtivoId: "c-imob", criadoPor: POR,
    },
  });
  await prisma.parametroAtualizacaoClasse.create({
    data: {
      classeDeBensId: CLASSE, metodo: "DEPRECIACAO", vidaUtilMeses: 12,
      percentualResidual: "0.000000", criadoPor: POR,
    },
  });
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AQUISICAO", contaDebitoId: "c-imob", contaCreditoId: "c-vpa-inc", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
    ],
  });

  // M07 — a consignação (passivo financeiro: dinheiro de terceiro no caixa).
  await prisma.tipoConsignacao.create({
    data: {
      id: TIPO_CONSIG, codigo: "INSS", descricao: "INSS retido", criadoPor: POR,
      // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
      contaPassivo: { connect: { codigo: CONSIGNACAO } },
    },
  });

  // M08 — a conta do PL que recebe o resultado apurado. (O Exercicio 2026 já
  // nasce do `criarFichaDeTeste`, que faz upsert dele; criar outro violaria o
  // @unique de `ano`.)
  await prisma.roteiroEncerramento.create({
    data: { contaResultadosAcumuladosId: "c-resacum", criadoPor: POR },
  });

  await semearLinhas();
}

/**
 * A OPERAÇÃO DE CRÉDITO — entra dinheiro, nasce dívida fundada (fato permutativo:
 * não há VPA). Vai por lançamento DIRETO porque ainda não existe módulo de dívida
 * pública no repo — e inventar um serviço só para o teste seria inventar o
 * sistema. É a única perna do cenário sem serviço por trás, e está declarada.
 */
async function operacaoDeCredito(valor: string, data: string): Promise<void> {
  await prisma.lancamentoContabil.create({
    data: {
      numeroControle: "OC-1",
      dataTransacao: new Date(data),
      historico: "operação de crédito de longo prazo",
      origemTipo: "TESTE",
      criadoPor: POR,
      partidas: {
        create: [
          { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
          { contaId: "c-divida", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
        ],
      },
    },
  });
}

/** Arrecada `valor` numa data. */
async function arrecadar(valor: string, data: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor,
      dataArrecadacao: new Date(data), numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
}

/** Empenha e liquida. Devolve o id da liquidação. */
async function liquidarDespesa(valor: string, numero: string): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${numero}`, tipo: "ORDINARIO", valor,
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

const linhaDe = (b: Awaited<ReturnType<typeof balancoPatrimonial>>, codigo: string) =>
  b.grupos.flatMap((g) => g.linhas).find((l) => l.codigoLinha === codigo)!;
const grupoDe = (b: Awaited<ReturnType<typeof balancoPatrimonial>>, g: string) =>
  b.grupos.find((x) => x.grupo === g)!;

describe("Anexo 14 — Balanço Patrimonial", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: o balanço FECHA — cada linha por literal, e A1 somado à mão", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    const liq = await liquidarDespesa("6000.00", "NL-1");
    await pagar(
      {
        liquidacaoId: liq, numero: "NP-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
    await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "6000.00",
      dataMovimento: new Date("2026-03-05T12:00:00Z"), criadoPor: POR,
    });
    // base 6.000 / 12 meses = 500,00
    await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR,
    });

    const b = await balancoPatrimonial(prisma, CORTE);

    // ── ATIVO ────────────────────────────────────────────────────────────
    // 8.000 arrecadados − 6.000 pagos
    expect(linhaDe(b, "AC.CAIXA").valor).toBe("2000.00");
    // 6.000 do bem − 500 de depreciação ACUMULADA (retificadora, entra negativa)
    expect(linhaDe(b, "ANC.IMOB").valor).toBe("5500.00");
    expect(linhaDe(b, "ANC.IMOB").contas.map((c) => c.saldo)).toEqual([
      "6000.00", // imobilizado
      "-500.00", // depreciação acumulada
    ]);
    expect(grupoDe(b, "ATIVO_CIRCULANTE").total).toBe("2000.00");
    expect(grupoDe(b, "ATIVO_NAO_CIRCULANTE").total).toBe("5500.00");
    expect(b.totalAtivo).toBe("7500.00");

    // ── PASSIVO ──────────────────────────────────────────────────────────
    // liquidou 6.000 e pagou 6.000 -> zera
    expect(linhaDe(b, "PC.FORN").valor).toBe("0.00");
    expect(b.totalPassivo).toBe("0.00");

    // ── PATRIMÔNIO LÍQUIDO ───────────────────────────────────────────────
    // VPA (8.000 receita + 6.000 incorporação) − VPD (6.000 + 500) = 7.500
    expect(linhaDe(b, LINHA_RESULTADO).valor).toBe("7500.00");
    expect(b.resultadoDoExercicio).toBe("7500.00");
    expect(b.totalPatrimonioLiquido).toBe("7500.00");

    // ── A1, SOMADA À MÃO ─────────────────────────────────────────────────
    expect(2000 + 5500).toBe(7500);
    expect(0 + 7500).toBe(7500);
    expect(b.totalAtivo).toBe("7500.00");
    expect(b.totalPassivo).toBe("0.00");
    expect(b.totalPatrimonioLiquido).toBe("7500.00");

    // dinheiro é STRING com 2 casas
    for (const g of b.grupos) {
      for (const l of g.linhas) {
        expect(typeof l.valor).toBe("string");
        expect(l.valor).toMatch(/^-?\d+\.\d{2}$/);
      }
    }
  });

  // t5
  it("t5: conta CREDORA aparece POSITIVA no passivo (o Record de natureza trabalhando)", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    await liquidarDespesa("6000.00", "NL-1"); // liquida e NÃO paga

    const b = await balancoPatrimonial(prisma, CORTE);

    // fornecedores tem ΣC 6.000 > ΣD 0 -> CREDORA -> POSITIVO no passivo
    expect(linhaDe(b, "PC.FORN").valor).toBe("6000.00");
    expect(b.totalPassivo).toBe("6000.00");

    // ativo 8.000 (só o caixa); resultado = VPA 8.000 − VPD 6.000 = 2.000
    expect(b.totalAtivo).toBe("8000.00");
    expect(b.resultadoDoExercicio).toBe("2000.00");
    // A1: 8.000 == 6.000 + 2.000
    expect(b.totalPatrimonioLiquido).toBe("2000.00");
  });

  // t2
  it("t2: CONTA ÓRFÃ derruba o anexo, nomeando a conta e o saldo", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");

    // um lançamento numa conta de classe 1 que NENHUMA linha mapeia
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "ORFA-1",
        dataTransacao: new Date("2026-05-01T12:00:00Z"),
        historico: "ativo sem linha no anexo",
        origemTipo: "TESTE",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-orfa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1234.56" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1234.56" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await balancoPatrimonial(prisma, CORTE);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CONTA ÓRFÃ (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CONTA ÓRFÃ/);
    expect(msg).toMatch(/1\.9\.9\.9\.9\.99\.00/);
    expect(msg).toMatch(/1234\.56/);
    expect(msg).toMatch(/parece certo/);
  });

  // t3
  it("t3: sobreposição de prefixo é barrada no CADASTRO; por INSERT direto, o A3 pega", async () => {
    // "1.1" cobre "1.1.1" -> o cadastro recusa
    await expect(
      cadastrarLinhaDemonstrativo(prisma, {
        anexo: "ANEXO_14", codigoLinha: "AC.OUTRA", rotulo: "Outra linha",
        grupo: "ATIVO_CIRCULANTE", ordem: 9, prefixos: ["1.1"], criadoPor: POR,
      })
    ).rejects.toThrow(/PREFIXO SOBREPOSTO/);

    // driblando o serviço: cria a linha e enfia o prefixo por INSERT direto
    const clandestina = await prisma.linhaDemonstrativo.create({
      data: {
        anexo: "ANEXO_14", codigoLinha: "AC.CLANDESTINA", rotulo: "Clandestina",
        grupo: "ATIVO_CIRCULANTE", ordem: 99, criadoPor: "atacante",
      },
      select: { id: true },
    });
    await prisma.prefixoDaLinha.create({
      data: { linhaId: clandestina.id, prefixoConta: "1.1", criadoPor: "atacante" },
    });

    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");

    // o caixa (1.1.1.1.2) agora casa com "1.1.1" E com "1.1"
    await expect(balancoPatrimonial(prisma, CORTE)).rejects.toThrow(
      /CONTA EM DUAS LINHAS.*AC\.CAIXA.*AC\.CLANDESTINA/s
    );
  });

  // t4
  it("t4: o corte é INCLUSIVO e pela data do FATO — o que vem depois não entra", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    await arrecadar("1000.00", "2026-06-15T12:00:00Z", "GUIA-2");

    // corte em 31/03: só a primeira
    const emMarco = await balancoPatrimonial(prisma, fimDoDiaCivil("2026-03-31"));
    expect(linhaDe(emMarco, "AC.CAIXA").valor).toBe("8000.00");
    expect(emMarco.totalAtivo).toBe("8000.00");

    // corte no fim do ano: as duas
    const emDezembro = await balancoPatrimonial(prisma, CORTE);
    expect(linhaDe(emDezembro, "AC.CAIXA").valor).toBe("9000.00");
    expect(emDezembro.totalAtivo).toBe("9000.00");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // BLOCO 3 — QUADRO FINANCEIRO/PERMANENTE (art. 105)
  // ══════════════════════════════════════════════════════════════════════════

  /** O cenário-ouro ESTENDIDO — ver a conta completa no cabeçalho do arquivo. */
  async function cenarioEstendido(): Promise<void> {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    const liq = await liquidarDespesa("6000.00", "NL-1");
    // PAGAMENTO PARCIAL: 2.500 dos 6.000 — os 3.500 que sobram viram RP.
    await pagar(
      {
        liquidacaoId: liq, numero: "NP-1", valor: "2500.00",
        data: new Date("2026-03-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento parcial", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );
    await adquirirBem(prisma, {
      classeDeBensId: CLASSE, liquidacaoId: liq, valor: "6000.00",
      dataMovimento: new Date("2026-03-05T12:00:00Z"), criadoPor: POR,
    });
    // base 6.000 / 12 meses = 500,00 numa competência
    await atualizarCompetencia(prisma, {
      classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR,
    });
    await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: TIPO_CONSIG, credorConsignatario: "Receita Federal",
        contaBancaria: "CC-001", fonteId: FONTE, valor: "900.00",
        data: new Date("2026-06-01T12:00:00Z"),
        historico: "INSS retido de terceiros", criadoPor: POR,
      },
      R_INGRESSO
    );
    await operacaoDeCredito("2000.00", "2026-06-20T12:00:00Z");
  }

  // t1
  it("t1: as quatro células por literal, o superávit por literal, e o F1 fecha", async () => {
    await cenarioEstendido();

    const b = await balancoPatrimonial(prisma, CORTE);
    const q = b.quadroFinanceiroPermanente;

    // ── O QUADRO PRINCIPAL, primeiro (o quadro do art. 105 tem de casar com ele)
    expect(b.totalAtivo).toBe("13900.00"); // 8.400 + 5.500
    expect(b.totalPassivo).toBe("6400.00"); // 3.500 + 900 + 2.000
    expect(b.totalPatrimonioLiquido).toBe("7500.00"); // VPA 14.000 − VPD 6.500
    expect(linhaDe(b, "AC.CAIXA").valor).toBe("8400.00");
    expect(linhaDe(b, "ANC.IMOB").valor).toBe("5500.00");
    expect(linhaDe(b, "PC.FORN").valor).toBe("3500.00");
    expect(linhaDe(b, "PC.DEMAIS").valor).toBe("900.00");
    expect(linhaDe(b, "PNC.OBRIG").valor).toBe("2000.00");

    // ── AS QUATRO CÉLULAS, CADA UMA POR LITERAL ──────────────────────────
    expect(q.ativoFinanceiro).toBe("8400.00"); // caixa
    expect(q.ativoPermanente).toBe("5500.00"); // 6.000 − 500 (depr. acumulada)
    expect(q.passivoFinanceiro).toBe("4400.00"); // 3.500 fornecedores + 900 consig.
    expect(q.passivoPermanente).toBe("2000.00"); // dívida fundada

    // ── O SUPERÁVIT FINANCEIRO, POR LITERAL ──────────────────────────────
    expect(q.superavitFinanceiro).toBe("4000.00"); // 8.400 − 4.400

    // ── F1, SOMADA À MÃO ─────────────────────────────────────────────────
    expect(8400 + 5500).toBe(13900);
    expect(4400 + 2000).toBe(6400);
    // e o PL (7.500) NÃO entra em nenhuma das duas somas — art. 105, V.
    expect(b.totalPatrimonioLiquido).toBe("7500.00");

    // ── A DEPRECIAÇÃO ACUMULADA ANDA COM O BEM (permanente, negativa) ─────
    const permanentes = q.composicao.filter((c) => c.indicador === "P");
    expect(permanentes.map((c) => [c.codigo, c.saldo])).toEqual([
      [IMOBILIZADO, "6000.00"],
      [DEP_ACUMULADA, "-500.00"],
      [DIVIDA_FUNDADA, "2000.00"],
    ]);

    // ── O RP INSCRITO É O PRÓPRIO PASSIVO FINANCEIRO ──────────────────────
    // processado = liquidado 6.000 − pago 2.500 = 3.500 == saldo de Fornecedores.
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    expect(enc.inscricoes).toHaveLength(1);
    expect(enc.inscricoes[0]!.tipo).toBe("PROCESSADO");
    expect(enc.inscricoes[0]!.valorInscrito.toFixed(2)).toBe("3500.00");
    expect(linhaDe(b, "PC.FORN").valor).toBe("3500.00");

    // a inscrição NÃO é lançamento contábil: o quadro não se mexe.
    const depois = await balancoPatrimonial(prisma, CORTE);
    expect(depois.quadroFinanceiroPermanente.passivoFinanceiro).toBe("4400.00");
    expect(depois.quadroFinanceiroPermanente.superavitFinanceiro).toBe("4000.00");

    // dinheiro é STRING com 2 casas
    for (const v of [q.ativoFinanceiro, q.ativoPermanente, q.passivoFinanceiro, q.passivoPermanente, q.superavitFinanceiro]) {
      expect(typeof v).toBe("string");
      expect(v).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  // t2
  it("t2: ÓRFÃ DO INDICADOR — conta com saldo e sem classificação derruba o anexo", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");

    // Estoques CASA com uma linha (AC.ESTOQUES) — a A2 não pega. O que falta é o
    // indicador. Lançamento BALANCEADO de propósito: a A1 continua fechando, e
    // portanto quem tem de disparar é a F2, e mais ninguém.
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "EST-1",
        dataTransacao: new Date("2026-05-01T12:00:00Z"),
        historico: "estoque sem indicador de superávit",
        origemTipo: "TESTE",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-estoque", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "700.00" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "700.00" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await balancoPatrimonial(prisma, CORTE);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CONTA SEM INDICADOR (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/SEM INDICADOR DE SUPERÁVIT FINANCEIRO/);
    expect(msg).toMatch(/1\.1\.5\.1\.1\.00\.00/);
    expect(msg).toMatch(/700\.00/);
    expect(msg).toMatch(/FINANCEIRO/);
    expect(msg).toMatch(/PERMANENTE/);
  });

  // t3
  it("t3: DÉFICIT financeiro sai NEGATIVO — sem clamp, porque esconder o déficit é mentir", async () => {
    await arrecadar("1000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    await liquidarDespesa("3000.00", "NL-1"); // liquida e NÃO paga

    const b = await balancoPatrimonial(prisma, CORTE);
    const q = b.quadroFinanceiroPermanente;

    expect(q.ativoFinanceiro).toBe("1000.00");
    expect(q.passivoFinanceiro).toBe("3000.00");
    // 1.000 − 3.000 = −2.000 — o ente deve mais do que tem em caixa.
    expect(q.superavitFinanceiro).toBe("-2000.00");

    // nada de permanente no cenário
    expect(q.ativoPermanente).toBe("0.00");
    expect(q.passivoPermanente).toBe("0.00");

    // e o balanço continua fechando: 1.000 == 3.000 + (−2.000)
    expect(b.totalAtivo).toBe("1000.00");
    expect(b.totalPassivo).toBe("3000.00");
    expect(b.totalPatrimonioLiquido).toBe("-2000.00");
  });

  // t4
  it("t4: o corte manda — pagar DEPOIS do corte não reduz o passivo financeiro DO corte", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    const liq = await liquidarDespesa("6000.00", "NL-1"); // liquidada em 10/02
    // paga em JULHO — depois do corte de março
    await pagar(
      {
        liquidacaoId: liq, numero: "NP-1", valor: "2000.00",
        data: new Date("2026-07-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento de restos", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    // ── EM 31/03: o pagamento de julho AINDA NÃO ACONTECEU ────────────────
    const marco = (await balancoPatrimonial(prisma, fimDoDiaCivil("2026-03-31")))
      .quadroFinanceiroPermanente;
    expect(marco.ativoFinanceiro).toBe("8000.00"); // caixa cheio
    expect(marco.passivoFinanceiro).toBe("6000.00"); // a dívida inteira
    expect(marco.superavitFinanceiro).toBe("2000.00"); // 8.000 − 6.000

    // ── EM 31/12: os 2.000 saíram do caixa E da dívida ────────────────────
    const dezembro = (await balancoPatrimonial(prisma, CORTE)).quadroFinanceiroPermanente;
    expect(dezembro.ativoFinanceiro).toBe("6000.00"); // 8.000 − 2.000
    expect(dezembro.passivoFinanceiro).toBe("4000.00"); // 6.000 − 2.000

    // ⚠️ E O SUPERÁVIT NÃO SE MEXEU: pagar um passivo FINANCEIRO com um ativo
    // FINANCEIRO é permutativo DENTRO do financeiro. É por isso que o superávit
    // do art. 43 já nasce descontado dos restos a pagar — pagá-los depois não
    // "gasta" superávit nenhum.
    expect(dezembro.superavitFinanceiro).toBe("2000.00");
  });

  // t5 — A MUTAÇÃO, E A LACUNA QUE ELA EXPÕE
  it("t5: trocar o indicador de uma conta (F→P) passa por TODAS as amarrações", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    await liquidarDespesa("6000.00", "NL-1");

    const certo = (await balancoPatrimonial(prisma, CORTE)).quadroFinanceiroPermanente;
    expect(certo.ativoFinanceiro).toBe("8000.00");
    expect(certo.superavitFinanceiro).toBe("2000.00"); // 8.000 − 6.000

    // ═══ A MUTAÇÃO: o caixa vira PERMANENTE ═══
    // (mutar o PARÂMETRO é mais fiel que mutar o código: é assim que o erro
    // aconteceria de verdade — alguém classificando a conta errado no cadastro.)
    await prisma.contaPcasp.update({
      where: { id: "c-caixa" },
      data: { indicadorSuperavit: "P" },
    });

    // ⚠️⚠️ O ANEXO SAI. NENHUMA AMARRAÇÃO DISPARA. ⚠️⚠️
    const mutante = await balancoPatrimonial(prisma, CORTE);
    const q = mutante.quadroFinanceiroPermanente;

    // A1 fecha: o indicador não existe para a equação fundamental.
    expect(mutante.totalAtivo).toBe("8000.00");
    expect(mutante.totalPassivo).toBe("6000.00");
    expect(mutante.totalPatrimonioLiquido).toBe("2000.00");

    // F1 fecha: mover uma conta de balde NÃO muda a SOMA dos baldes.
    expect(q.ativoFinanceiro).toBe("0.00");
    expect(q.ativoPermanente).toBe("8000.00"); // 0 + 8.000 = 8.000 == ATIVO ✓
    expect(q.passivoFinanceiro).toBe("6000.00");
    expect(q.passivoPermanente).toBe("0.00"); // 6.000 + 0 = 6.000 == PASSIVO ✓

    // F2 fecha: a conta TEM indicador — só tem o indicador ERRADO.
    // E o número sai errado, em silêncio, com cara de certo:
    expect(q.superavitFinanceiro).toBe("-6000.00"); // era +2.000,00
  });

  // t6
  it("t6: depois da APURAÇÃO (M08), a conta de PL não entra no quadro nem exige indicador", async () => {
    await arrecadar("8000.00", "2026-01-10T12:00:00Z", "GUIA-1");
    await liquidarDespesa("6000.00", "NL-1");

    const antes = (await balancoPatrimonial(prisma, CORTE)).quadroFinanceiroPermanente;
    expect(antes.superavitFinanceiro).toBe("2000.00");

    // encerra e apura: VPA 8.000 − VPD 6.000 = 2.000 vão para a 2.3 (PL)
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const ex = await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      select: { id: true },
    });
    const ap = await apurarResultadoDoExercicio(prisma, {
      exercicioId: ex.id, criadoPor: POR,
    });
    expect(ap.resultadoApurado.toFixed(2)).toBe("2000.00");

    const b = await balancoPatrimonial(prisma, CORTE);
    const q = b.quadroFinanceiroPermanente;

    // o resultado saiu das classes 3/4 e virou saldo de PL
    expect(b.resultadoDoExercicio).toBe("0.00");
    expect(linhaDe(b, "PL.SOCIAL").valor).toBe("2000.00");
    expect(b.totalPatrimonioLiquido).toBe("2000.00");

    // ⚠️ A CONTA 2.3 É CLASSE 2 E NÃO TEM INDICADOR — e a F2 NÃO dispara: PL não
    // é passivo (art. 105, V). Se ela entrasse aqui, o "passivo permanente"
    // engoliria o patrimônio do ente e o F1 quebraria.
    expect(q.composicao.map((c) => c.codigo)).not.toContain(RESULTADOS_ACUM);
    expect(q.passivoFinanceiro).toBe("6000.00");
    expect(q.passivoPermanente).toBe("0.00"); // 6.000 + 0 == PASSIVO 6.000 ✓
    expect(b.totalPassivo).toBe("6000.00");

    // e o superávit financeiro NÃO se mexe com a apuração: ela move classes 3/4
    // e 2.3 — nada disso é financeiro.
    expect(q.superavitFinanceiro).toBe("2000.00");
  });
});
