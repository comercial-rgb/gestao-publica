import "dotenv/config";
import { CONTA_DIVIDA_FUNDADA } from "../m01-core-contabil/roteiros.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { liquidarRestosAPagar, pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import {
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { anexo6, classificarReceitaAnexo6, classificarDespesaAnexo6 } from "./rreo-anexo6.js";
import { anexo6AbaixoDaLinha } from "./rreo-anexo6-abaixo.js";
import { dclNoCorte } from "./rgf-anexo2.js";

/**
 * RREO — ANEXO 6: RESULTADO PRIMÁRIO E NOMINAL, ACIMA DA LINHA (LRF, art. 53, III).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO. Bimestre 1 de 2026 (corte 28/02/2026).
 *
 * ═══ RECEITAS ARRECADADAS (janeiro/2026) ═══
 *   11130111  IPTU principal ........... 500.000   origem 11 → PRIMÁRIA (impostos)
 *   11121102  IPTU multas e juros ...... 10.000    tipo 2   → PRIMÁRIA (decisão 0.5-A)
 *   17210151  FPM ..................... 300.000    origem 17 → PRIMÁRIA (transf. correntes)
 *   13210001  rendimentos de aplicação . 20.000    rol      → FINANCEIRA (deduz!)
 *   21180111  operação de crédito ..... 100.000    origem 21 → FINANCEIRA (fora do XII)
 *   22110001  alienação de móveis ...... 50.000    origem 22 → PRIMÁRIA (capital)
 *   29110001  outras receitas capital ... 7.000    origem 29 → NÃO CLASSIFICADA (interruptor)
 *
 *   REC_IMPOSTOS ......... 500.000 + 10.000 ..... 510.000   (previsão 600.000)
 *   REC_TRANSF_CORRENTES ........................ 300.000   (previsão 350.000)
 *   REC_CORRENTES ........ 510.000 + 300.000 .... 810.000   (previsão 950.000)
 *   REC_FINANCEIRAS (−) ......................... 20.000
 *   REC_CAPITAL .......... 50.000 + 0 ............ 50.000
 *   XII = 810.000 − 20.000 + 50.000 ............. 840.000
 *
 *   ⚠️ Os 100.000 de operação de crédito e os 7.000 da origem 29 NÃO entram no XII. Se
 *      entrassem, o XII seria 947.000 — e o ente pareceria primariamente superavitário por
 *      ter tomado dinheiro emprestado, que é exatamente o que este anexo existe para negar.
 *
 * ═══ DESPESAS DO EXERCÍCIO 2026 ═══
 *   grupo 3 | elem 39 → PRIMÁRIA CORRENTE: dot 500.000, emp 400.000, liq 300.000, pago 200.000
 *   grupo 3 | elem 39 → a ficha f26-3b .... dot 100.000, SEM execução até o 1º bim (é a fila de
 *                       março, do t8) — mas a DOTAÇÃO dela conta desde já: dotação é autorização,
 *                       não execução, e ela existe no orçamento em 01/01.
 *   grupo 4 | elem 39 → PRIMÁRIA CAPITAL : dot 150.000, emp 100.000, liq  80.000, pago  70.000
 *   grupo 2 | elem 39 → FINANCEIRA (juros): dot 100.000, emp 60.000, liq 50.000, pago 40.000
 *   grupo 6 | elem 71 → FINANCEIRA (amort): dot  40.000, emp 30.000, liq 30.000, pago 30.000
 *
 * ═══ RESTOS A PAGAR (empenhos de 2025, pagos em fev/2026) ═══
 *   grupo 3 | elem 39  RPP  pago .... 25.000  → coluna (b)
 *   grupo 3 | elem 39  RPNP pago .... 15.000  → coluna (c)
 *   grupo 2 | elem 39  RPP  pago .....5.000  → (b) do grupo 2, entra no XXVI
 *
 *   DESP_CORRENTES: dot 600.000 · emp 400.000 · liq 300.000 · (a) 200.000 · (b) 25.000 · (c) 15.000
 *                      (500.000 da f26-3 + 100.000 da f26-3b)
 *   DESP_CAPITAL  : dot 150.000 · emp 100.000 · liq  80.000 · (a)  70.000 · (b)      0 · (c)      0
 *   XXIII         : dot 750.000 · emp 500.000 · liq 380.000 · (a) 270.000 · (b) 25.000 · (c) 15.000
 *   XXIII CAIXA = 270.000 + 25.000 + 15.000 ..................... 310.000
 *   XXIV = 840.000 − 310.000 .................................... 530.000   SUPERÁVIT PRIMÁRIO
 *
 *   XXVI (juros passivos, caixa do grupo 2) = 40.000 + 5.000 ..... 45.000
 *   XXV  = null (JUROS-ATIVOS-XXV) → XXVII = null
 *
 * ═══ ⚠️ A DUPLA CONTAGEM DO RP — o t3, a alma desta sessão ═══
 * O M08 grava o pagamento de RP como um `Pagamento` DE VERDADE. Se a coluna (a) varresse
 * `Pagamento` sem filtrar `ficha.exercicio`, o grupo 3 pagaria 200.000 + 25.000 + 15.000 =
 * 240.000, e o MESMO cheque entraria de novo em (b) e (c):
 *      XXIII caixa = (240.000 + 25.000 + 15.000) + 70.000 = 350.000
 *      XXIV = 840.000 − 350.000 = 490.000   ✗ ERRADO em 40.000
 * O erro é EXATAMENTE o RP do grupo 3 (25.000 + 15.000), contado duas vezes. O t3 trava as duas
 * pontas: a coluna (a) e o resultado.
 *
 * ═══ ⚠️ A FIXTURE E A FILA DO ART. 141 (M06) ═══
 * Cada fluxo desta fixture tem PAR (fonte, categoria) PRÓPRIO, e não é decoração: a fila da ordem
 * cronológica é por fonte × categoria, e uma liquidação antiga PARCIALMENTE paga continua na
 * cabeça dela. Como quase todo fluxo aqui paga parcial (é o que produz liquidada ≠ paga), pô-los
 * na mesma fila faria o M06 recusar o segundo pagamento — corretamente. A fonte NÃO é eixo deste
 * anexo (ele agrupa por grupo|elemento), então separar as filas não mexe em número nenhum. A
 * alternativa seria justificar quebra de ordem numa das hipóteses taxativas do §1º — inventar
 * emergência para fazer fixture passar, que é maquiar o guard.
 *
 * ═══ ⚠️ A FIXTURE E O MAPA-ELEMENTO-CONTA ═══
 * O grupo 2 deveria usar o elemento 21 (Juros sobre a Dívida por Contrato). Ele NÃO tem roteiro
 * de liquidação: o rol de `contrapartidaDaLiquidacao` cobre só 30, 39 e 71 (pendência
 * MAPA-ELEMENTO-CONTA, do M01). A fixture usa 39, cuja contrapartida — VPD — é a
 * semanticamente CORRETA para juros (juros são despesa incorrida; não viram ativo). O que muda é
 * só o CÓDIGO do elemento, e a classificação do Anexo 6 lê o GRUPO — o XXVI é exercido fielmente.
 * Quando o MAPA-ELEMENTO-CONTA fechar, esta fixture troca 39 por 21 e nada mais muda.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const F500 = "fnt-500";
const F540 = "fnt-540";
const CREDOR = "12345678000199";

/**
 * ⚠️ UMA FILA POR FLUXO — ver o cabeçalho. Cada par (fonte, categoria) é usado por UM fluxo só.
 * Não há dois pagamentos parciais disputando a mesma cabeça de fila.
 */
const FILAS = {
  rppGrupo3: { fonte: F500, conta: "CC-001", cat: "FORNECIMENTO_BENS" },
  rpnpGrupo3: { fonte: F500, conta: "CC-001", cat: "LOCACAO" },
  rppGrupo2: { fonte: F500, conta: "CC-001", cat: "REALIZACAO_OBRAS" },
  ex26Grupo3: { fonte: F500, conta: "CC-001", cat: "PRESTACAO_SERVICOS" },
  ex26Grupo4: { fonte: F540, conta: "CC-002", cat: "FORNECIMENTO_BENS" },
  ex26Grupo2: { fonte: F540, conta: "CC-002", cat: "LOCACAO" },
  ex26Grupo6: { fonte: F540, conta: "CC-002", cat: "PRESTACAO_SERVICOS" },
  /** o t8 — a despesa de março, fora do 1º bimestre. */
  marco: { fonte: F540, conta: "CC-002", cat: "REALIZACAO_OBRAS" },
} as const;

const R_EMP = roteiroEmpenho();
const R_LIQ_39 = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_LIQ_71 = roteiroLiquidacao({ codElemento: "71", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.1.00.00",
});
const R_ARR = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});
const R_LIQ_RP = roteiroLiquidacaoRestos({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  restosAPagarProcessados: "2.1.3.1.1.00.00",
});
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.1.00.00",
});

let deps: M05Deps;

const NATUREZAS_RECEITA = [
  { id: "nr-iptu", codigo: "11130111", descricao: "IPTU — principal" },
  { id: "nr-iptu-m", codigo: "11121102", descricao: "IPTU — multas e juros de mora" },
  { id: "nr-fpm", codigo: "17210151", descricao: "FPM" },
  { id: "nr-rend", codigo: "13210001", descricao: "Rendimentos de aplicação financeira" },
  { id: "nr-opcred", codigo: "21180111", descricao: "Operações de crédito internas" },
  { id: "nr-alien", codigo: "22110001", descricao: "Alienação de bens móveis" },
  { id: "nr-outras", codigo: "29110001", descricao: "Outras receitas de capital" },
];

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({
    data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
  });

  // ⚠️ O elemento 39 no grupo 2 é a concessão à MAPA-ELEMENTO-CONTA — ver o cabeçalho.
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-3-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
      { id: "nd-4-39", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "39", codigoCompleto: "449039", descricao: "Serviços PJ — investimento" },
      { id: "nd-2-39", codCategoria: "3", codNatureza: "2", codModalidade: "90", codElemento: "39", codigoCompleto: "329039", descricao: "Juros da dívida (ver MAPA-ELEMENTO-CONTA)" },
      { id: "nd-6-71", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida resgatado" },
    ],
  });
  await prisma.naturezaReceita.createMany({ data: NATUREZAS_RECEITA });
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

  // ⚠️ A DÍVIDA EXISTE PORQUE O M05 EXIGE (TR 4.48): empenho do grupo 6 amortiza ALGUMA dívida, e
  // tem de dizer qual — senão o demonstrativo da dívida nunca fecha com a despesa executada.
  const contaDivida = await prisma.contaPcasp.findFirstOrThrow({
    // ⚠️ PELA CONSTANTE, NÃO PELO LITERAL. O ENT05 repontou a conta (ITEM 3) e este
    // literal apontava para PESSOAL A PAGAR — a fixture semeava uma conta e o roteiro
    // pedia outra. Pela constante, a fixture acompanha o repontamento sozinha.
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
  // O ingresso, pela DATA DO FATO (a assinatura, em 2024) — sem saldo não há o que amortizar, e o
  // M10 recusa (corretamente) pagar mais do que se deve.
  await prisma.movimentoDivida.create({
    data: {
      dividaId: "div-1", tipo: "INGRESSO_OPERACAO_CREDITO", valor: "500000.00",
      dataMovimento: new Date("2024-03-01T12:00:00Z"),
      motivo: "assinatura do contrato", criadoPor: POR,
    },
  });

  const base = {
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04",
    subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
  };
  // ── as fichas de 2025 (as que virarão RESTOS A PAGAR) ──
  await criarFichaDeTeste(prisma, { ...base, id: "f25-3", exercicio: 2025, numero: 1, naturezaDespesaId: "nd-3-39", fonteId: F500, valorDotado: "300000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f25-2", exercicio: 2025, numero: 2, naturezaDespesaId: "nd-2-39", fonteId: F500, valorDotado: "100000.00" });
  // ── as fichas de 2026 (a execução do exercício) ──
  // ⚠️ A FONTE aqui é escolhida pela FILA do art. 141 (ver FILAS), não pelo relatório: o Anexo 6
  // agrupa por grupo|elemento e não olha fonte nenhuma.
  await criarFichaDeTeste(prisma, { ...base, id: "f26-3", exercicio: 2026, numero: 1, naturezaDespesaId: "nd-3-39", fonteId: F500, valorDotado: "500000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f26-4", exercicio: 2026, numero: 2, naturezaDespesaId: "nd-4-39", fonteId: F540, valorDotado: "150000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f26-2", exercicio: 2026, numero: 3, naturezaDespesaId: "nd-2-39", fonteId: F540, valorDotado: "100000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f26-6", exercicio: 2026, numero: 4, naturezaDespesaId: "nd-6-71", fonteId: F540, valorDotado: "40000.00" });
  // f26-3b — grupo 3 também, na fila de março (t8).
  await criarFichaDeTeste(prisma, { ...base, id: "f26-3b", exercicio: 2026, numero: 5, naturezaDespesaId: "nd-3-39", fonteId: F540, valorDotado: "100000.00" });

  deps = criarM05Deps(prisma);
}

async function arrecada(codigo: string, valor: string, n: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: codigo, fonte: "500", exercicioFonte: 1,
      valor, dataArrecadacao: new Date("2026-01-15T12:00:00Z"),
      numeroReceita: `2026RC${n}`, criadoPor: POR,
    },
    R_ARR,
    criarM04Deps(prisma)
  );
}

async function preve(naturezaReceitaId: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({
    data: { exercicio: 2026, naturezaReceitaId, fonteId: F500, tipoReceita: "ORCAMENTARIA", valorPrevisto: valor },
  });
}

type Fila = (typeof FILAS)[keyof typeof FILAS];

async function empenha(
  ficha: string, n: string, valor: string, quando: Date, fila: Fila, dividaId?: string
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: ficha, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: quando, credorCpfCnpj: CREDOR, historico: "despesa",
      categoriaOrdemCronologica: fila.cat, criadoPor: POR,
      ...(dividaId !== undefined ? { dividaId } : {}),
    },
    R_EMP,
    deps
  );
  return e.empenhoId;
}

async function liquida(empenhoId: string, n: string, valor: string, quando: Date, roteiro = R_LIQ_39): Promise<string> {
  const l = await liquidar(
    {
      empenhoId, numero: `NL-${n}`, valor, data: quando,
      responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR,
    },
    roteiro,
    deps
  );
  return l.liquidacaoId;
}

async function paga(liquidacaoId: string, n: string, valor: string, quando: Date, fila: Fila): Promise<void> {
  await pagar(
    {
      liquidacaoId, numero: `NP-${n}`, valor, data: quando,
      contaBancaria: fila.conta, fonteId: fila.fonte, historico: "pagamento", criadoPor: POR,
    },
    R_PAG,
    deps
  );
}

/** empenha → liquida → paga, tudo dentro do 1º bimestre de 2026. */
async function executa2026(
  ficha: string, n: string, emp: string, liq: string, pag: string, fila: Fila,
  roteiro = R_LIQ_39, dividaId?: string
): Promise<void> {
  const e = await empenha(ficha, n, emp, new Date("2026-01-10T12:00:00Z"), fila, dividaId);
  const l = await liquida(e, n, liq, new Date("2026-01-20T12:00:00Z"), roteiro);
  await paga(l, n, pag, new Date("2026-02-10T12:00:00Z"), fila);
}

async function cenario(): Promise<void> {
  // ═══ 2025 — o que virará resto a pagar ═══
  const e25a = await empenha("f25-3", "25A", "100000.00", new Date("2025-05-10T12:00:00Z"), FILAS.rppGrupo3);
  const l25a = await liquida(e25a, "25A", "100000.00", new Date("2025-06-10T12:00:00Z"));
  // E25B: empenhado e NÃO liquidado → vira RPNP.
  const e25b = await empenha("f25-3", "25B", "60000.00", new Date("2025-05-11T12:00:00Z"), FILAS.rpnpGrupo3);
  const e25c = await empenha("f25-2", "25C", "20000.00", new Date("2025-05-12T12:00:00Z"), FILAS.rppGrupo2);
  const l25c = await liquida(e25c, "25C", "20000.00", new Date("2025-06-12T12:00:00Z"));

  // O encerramento INSCREVE os restos. RPP = liquidado − pago; RPNP = empenhado − liquidado.
  await encerrarExercicioComRestos(prisma, { ano: 2025, encerradoPor: POR });

  // ═══ 2026 — a execução do exercício ═══
  await executa2026("f26-3", "26-3", "400000.00", "300000.00", "200000.00", FILAS.ex26Grupo3);
  await executa2026("f26-4", "26-4", "100000.00", "80000.00", "70000.00", FILAS.ex26Grupo4);
  await executa2026("f26-2", "26-2", "60000.00", "50000.00", "40000.00", FILAS.ex26Grupo2);
  await executa2026("f26-6", "26-6", "30000.00", "30000.00", "30000.00", FILAS.ex26Grupo6, R_LIQ_71, "div-1");

  // ═══ 2026 — o pagamento dos RESTOS A PAGAR de 2025 ═══
  // ⚠️ Estes criam `Pagamento` DE VERDADE, pendurados nas liquidações de 2025. É por isso que a
  // armadilha da dupla contagem é REAL nesta fixture, e não uma hipótese.
  await pagarRestosAPagar(
    prisma,
    { liquidacaoId: l25a, numero: "NP-RP-A", valor: "25000.00", data: new Date("2026-02-15T12:00:00Z"), contaBancaria: "CC-001", fonteId: F500, historico: "RPP", criadoPor: POR },
    R_PAG_RP
  );
  // O RPNP tem de ser LIQUIDADO antes de pago. A liquidação nasce DEPOIS do encerramento — e é
  // isso que o M08 usa para saber que ela quita a inscrição NÃO PROCESSADA.
  const lRpnp = await liquidarRestosAPagar(
    prisma,
    { empenhoId: e25b, numero: "NL-RP-B", valor: "15000.00", data: new Date("2026-02-05T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liq RPNP", criadoPor: POR },
    R_LIQ_RP
  );
  await pagarRestosAPagar(
    prisma,
    { liquidacaoId: lRpnp.liquidacaoId, numero: "NP-RP-B", valor: "15000.00", data: new Date("2026-02-15T12:00:00Z"), contaBancaria: "CC-001", fonteId: F500, historico: "RPNP", criadoPor: POR },
    R_PAG_RP
  );
  await pagarRestosAPagar(
    prisma,
    { liquidacaoId: l25c, numero: "NP-RP-C", valor: "5000.00", data: new Date("2026-02-15T12:00:00Z"), contaBancaria: "CC-001", fonteId: F500, historico: "RPP juros", criadoPor: POR },
    R_PAG_RP
  );

  // ═══ 2026 — as receitas ═══
  await preve("nr-iptu", "600000.00");
  await preve("nr-fpm", "350000.00");
  await arrecada("11130111", "500000.00", "000001");
  await arrecada("11121102", "10000.00", "000002");
  await arrecada("17210151", "300000.00", "000003");
  await arrecada("13210001", "20000.00", "000004");
  await arrecada("21180111", "100000.00", "000005");
  await arrecada("22110001", "50000.00", "000006");
  await arrecada("29110001", "7000.00", "000007");
}

const rec = (a: Awaited<ReturnType<typeof anexo6>>, chave: string) =>
  a.receitas.find((l) => l.chave === chave)!;
const desp = (a: Awaited<ReturnType<typeof anexo6>>, chave: string) =>
  a.despesas.find((l) => l.chave === chave)!;

// ═══════════════════════════════════════════════════════════════════════════
// t5/t6 — A CLASSIFICAÇÃO, PURA (sem banco)
// ═══════════════════════════════════════════════════════════════════════════

describe("RREO Anexo 6 — a classificação da receita (t5)", () => {
  it("decisão 0.5-A: multas e juros de mora são PRIMÁRIOS — o acessório segue o principal", () => {
    // O tipo 2 é "multas E juros de mora": um código só. O MDF os trata como acessórios do
    // tributo, e o tributo é primário. Ver JUROS-ATIVOS-XXV no MODULO.
    expect(classificarReceitaAnexo6("11121102")).toEqual({ classe: "PRIMARIA", linha: "REC_IMPOSTOS" });
    expect(classificarReceitaAnexo6("11121104")).toEqual({ classe: "PRIMARIA", linha: "REC_IMPOSTOS" });
    // E a dívida ativa (tipo 3) também: continua sendo o imposto.
    expect(classificarReceitaAnexo6("11121103")).toEqual({ classe: "PRIMARIA", linha: "REC_IMPOSTOS" });
  });

  it("a ESTRUTURA classifica o capital — não uma lista que alguém tem de lembrar de atualizar", () => {
    expect(classificarReceitaAnexo6("21180111").classe).toBe("FINANCEIRA"); // origem 21
    expect(classificarReceitaAnexo6("22110001").classe).toBe("PRIMARIA"); // origem 22
    expect(classificarReceitaAnexo6("24180111").classe).toBe("PRIMARIA"); // origem 24
    // ⚠️ Origem 23 (amortização de empréstimos concedidos): NENHUM código existe no censo. A regra
    // está aqui porque a estrutura a decide — não porque alguém a viu numa fixture.
    expect(classificarReceitaAnexo6("23180111").classe).toBe("FINANCEIRA");
  });

  it("o rol fechado decide a origem 13; fora dele, INTERRUPTOR — nunca chute", () => {
    expect(classificarReceitaAnexo6("13210001")).toEqual({ classe: "FINANCEIRA", linha: "REC_RENDIMENTOS" });
    expect(classificarReceitaAnexo6("13210051")).toEqual({ classe: "FINANCEIRA", linha: "REC_RENDIMENTOS" });
    // Um código 13 fora do rol tanto pode ser aluguel (primário) quanto rendimento não mapeado.
    // Cair em "demais correntes" inflaria a receita primária em SILÊNCIO.
    const outro13 = classificarReceitaAnexo6("13110001");
    expect(outro13.classe).toBe("NAO_CLASSIFICADA");
    expect(outro13.motivo).toBe("ORIGEM-13-SEM-CLASSIFICACAO");
  });

  it("o que o layout não classifica vira interruptor NOMEADO, não uma gaveta qualquer", () => {
    expect(classificarReceitaAnexo6("29110001").motivo).toBe("ORIGEM-29-SEM-CLASSIFICACAO");
    expect(classificarReceitaAnexo6("71130111").motivo).toBe("RECEITA-INTRA-NO-PRIMARIO");
  });

  it("FAIL-CLOSED na forma: natureza inválida DERRUBA — não vira 'outras'", () => {
    expect(() => classificarReceitaAnexo6("31180111")).toThrow();
    expect(() => classificarReceitaAnexo6("111")).toThrow();
  });
});

describe("RREO Anexo 6 — a classificação da despesa (t6)", () => {
  it("grupos 2 e 6 são FINANCEIROS; 1/3 correntes e 4/5 capital são primários", () => {
    expect(classificarDespesaAnexo6("2|21").classe).toBe("FINANCEIRA"); // juros da dívida
    expect(classificarDespesaAnexo6("6|71").classe).toBe("FINANCEIRA"); // amortização
    expect(classificarDespesaAnexo6("1|11").classe).toBe("PRIMARIA_CORRENTE"); // pessoal
    expect(classificarDespesaAnexo6("3|39").classe).toBe("PRIMARIA_CORRENTE");
    expect(classificarDespesaAnexo6("4|51").classe).toBe("PRIMARIA_CAPITAL"); // obras
    expect(classificarDespesaAnexo6("5|65").classe).toBe("PRIMARIA_CAPITAL");
  });

  it("o elemento 66 é financeiro DENTRO de grupo primário — quem empresta não gasta", () => {
    expect(classificarDespesaAnexo6("4|66").classe).toBe("FINANCEIRA");
    expect(classificarDespesaAnexo6("3|66").classe).toBe("FINANCEIRA");
  });

  it("a Reserva de Contingência (grupo 9) não é primária nem financeira: é interruptor", () => {
    const r = classificarDespesaAnexo6("9|99");
    expect(r.classe).toBe("NAO_CLASSIFICADA");
    expect(r.motivo).toBe("GRUPO-ND-9-SEM-CLASSIFICACAO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

describe("RREO Anexo 6 — acima da linha", () => {
  beforeEach(async () => {
    await semear();
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 — as receitas primárias: a financeira DEDUZ e a operação de crédito não entra", async () => {
    const a = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });

    expect(rec(a, "REC_IMPOSTOS").realizada).toBe("510000.00"); // 500.000 + 10.000 (multas)
    expect(rec(a, "REC_IMPOSTOS").previsao).toBe("600000.00");
    expect(rec(a, "REC_TRANSF_CORRENTES").realizada).toBe("300000.00");
    expect(rec(a, "REC_CORRENTES").realizada).toBe("810000.00");
    expect(rec(a, "REC_CORRENTES").previsao).toBe("950000.00"); // 600.000 + 350.000

    expect(rec(a, "REC_RENDIMENTOS").realizada).toBe("20000.00");
    expect(rec(a, "REC_FINANCEIRAS").realizada).toBe("20000.00");
    expect(rec(a, "REC_ALIENACAO").realizada).toBe("50000.00");
    expect(rec(a, "REC_CAPITAL").realizada).toBe("50000.00");

    // A operação de crédito APARECE na tela (o leitor tem de ver que ela existe)...
    expect(rec(a, "REC_OPERACOES_CREDITO").realizada).toBe("100000.00");
    // ...e NÃO entra no XII. 810.000 − 20.000 + 50.000 = 840.000.
    expect(a.receitaPrimariaTotal.realizada).toBe("840000.00");
    // ⚠️ Se a operação de crédito e a origem 29 entrassem: 947.000. O ente pareceria superavitário
    // por ter tomado emprestado — a mentira que este anexo existe para impedir.
    expect(a.receitaPrimariaTotal.realizada).not.toBe("947000.00");
  });

  it("t2 — as despesas primárias: juros e amortização ficam FORA", async () => {
    const a = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });

    const correntes = desp(a, "DESP_CORRENTES");
    // 500.000 (f26-3) + 100.000 (f26-3b, ainda sem execução): a DOTAÇÃO é autorização, e ela
    // existe em 01/01 mesmo que o empenho só venha em março.
    expect(correntes.dotacaoAtualizada).toBe("600000.00");
    expect(correntes.empenhada).toBe("400000.00");
    expect(correntes.liquidada).toBe("300000.00");

    const capital = desp(a, "DESP_CAPITAL");
    expect(capital.empenhada).toBe("100000.00");
    expect(capital.paga).toBe("70000.00");

    // XXIII: 600.000 + 150.000 de dotação; 400.000 + 100.000 empenhados.
    expect(a.despesaPrimariaTotal.dotacaoAtualizada).toBe("750000.00");
    expect(a.despesaPrimariaTotal.empenhada).toBe("500000.00");
    expect(a.despesaPrimariaTotal.liquidada).toBe("380000.00");
    expect(a.despesaPrimariaTotal.paga).toBe("270000.00");

    // ⚠️ Os 60.000 de juros e os 30.000 de amortização NÃO estão no XXIII. Se estivessem, a
    // empenhada seria 590.000 — e o "resultado primário" mediria justamente o que ele exclui.
    expect(a.despesaPrimariaTotal.empenhada).not.toBe("590000.00");
  });

  it("t3 — ⚠️ O RP PAGO ENTRA UMA VEZ SÓ: (a) não contém o cheque que (b) e (c) contam", async () => {
    const a = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });
    const correntes = desp(a, "DESP_CORRENTES");

    // (a) — SÓ a despesa de 2026. Os 40.000 de RP pagos em fev/2026 são `Pagamento` de verdade,
    // mas penduram em liquidações de empenhos de 2025 → `ficha.exercicio` os exclui daqui.
    expect(correntes.paga).toBe("200000.00");
    expect(correntes.paga).not.toBe("240000.00"); // ← 200.000 + 25.000 + 15.000, o bug

    // (b) e (c) — o MESMO dinheiro, contado no lugar certo e uma vez só.
    expect(correntes.rpProcessadosPagos).toBe("25000.00");
    expect(correntes.rpNaoProcessadosPagos).toBe("15000.00");

    // XXIV = 840.000 − (270.000 + 25.000 + 15.000) = 840.000 − 310.000.
    expect(a.resultadoPrimario).toBe("530000.00");
    // ⚠️ A PROVA: com a dupla contagem o XXIV seria 490.000 — 40.000 a menos, exatamente o RP do
    // grupo 3 pago duas vezes. O ente apareceria com 40.000 a menos de superávit primário, e o
    // total fecharia, então ninguém veria.
    expect(a.resultadoPrimario).not.toBe("490000.00");
  });

  it("t4 — o XXVI é o CAIXA do grupo 2 (com o RP dele); o XXV é `null`, e não zero", async () => {
    const a = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });

    // XXVI = pago 40.000 + RPP 5.000. O RP de juros é juros pagos — é caixa que saiu.
    expect(a.jurosPassivos).toBe("45000.00");

    // ⚠️ `null`, NÃO "0.00". Zero afirmaria que o ente não recebeu juros nenhum; o que sabemos é
    // que não temos como saber (JUROS-ATIVOS-XXV). E um XXVII calculado com XXV=0 sairia MENOR do
    // que a verdade, faltando uma parcela positiva que ninguém veria faltar.
    expect(a.jurosAtivos).toBeNull();
    expect(a.jurosNominais).toBeNull();
    expect(a.resultadoNominal).toBeNull();

    // A meta da LDO não existe: mostra o resultado e CALA (doutrina do IEI).
    expect(a.metaFiscal).toBeNull();

    expect(a.pendencias.some((p) => p.startsWith("JUROS-ATIVOS-XXV"))).toBe(true);
    expect(a.pendencias.some((p) => p.startsWith("SEM-SEGREGACAO-RPPS"))).toBe(true);
  });

  it("t7 — a natureza não classificada fica VISÍVEL e fora do XII — nunca sumida", async () => {
    const a = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });

    const nc = a.naoClassificadas.find((n) => n.codigo === "29110001");
    expect(nc).toBeDefined();
    expect(nc!.motivo).toBe("ORIGEM-29-SEM-CLASSIFICACAO");
    expect(nc!.realizada).toBe("7000.00");
    expect(a.pendencias.some((p) => p.startsWith("ORIGEM-29-SEM-CLASSIFICACAO"))).toBe(true);

    // Os 7.000 NÃO entraram no XII — e é por isso que eles têm de aparecer em algum lugar.
    expect(a.receitaPrimariaTotal.realizada).toBe("840000.00");
  });

  it("t8 — o bimestre é um CORTE: publicar o 1º não mostra o que ainda não aconteceu", async () => {
    // Uma despesa de março — DEPOIS do 1º bimestre. Grupo 3 (cai em DESP_CORRENTES), fila própria.
    const e = await empenha("f26-3b", "MAR", "50000.00", new Date("2026-03-10T12:00:00Z"), FILAS.marco);
    const l = await liquida(e, "MAR", "50000.00", new Date("2026-03-15T12:00:00Z"));
    await paga(l, "MAR", "50000.00", new Date("2026-03-20T12:00:00Z"), FILAS.marco);

    const b1 = await anexo6(prisma, { exercicio: 2026, bimestre: 1 });
    // O 1º bimestre não sabe de março. Se soubesse, a paga seria 250.000.
    expect(desp(b1, "DESP_CORRENTES").paga).toBe("200000.00");
    expect(b1.resultadoPrimario).toBe("530000.00");

    // O 2º bimestre (até 30/04) já vê: 200.000 + 50.000 de pago, 400.000 + 50.000 empenhado.
    const b2 = await anexo6(prisma, { exercicio: 2026, bimestre: 2 });
    expect(desp(b2, "DESP_CORRENTES").paga).toBe("250000.00");
    expect(desp(b2, "DESP_CORRENTES").empenhada).toBe("450000.00");
    // XXIV = 840.000 − (320.000 + 25.000 + 15.000) = 480.000.
    expect(b2.resultadoPrimario).toBe("480000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ABAIXO DA LINHA (7.8-b) — sobre a MESMA fixture: aqui os dois caminhos DIVERGEM,
  // e a divergência é NOMEADA, não fechada à força. Ver `m12-rreo-anexo6-abaixo.test.ts`
  // para a fixture LIMPA que prova a identidade.
  // ═══════════════════════════════════════════════════════════════════════════

  it("t9 — a DCL nos dois cortes, com a amortização do grupo 6 movendo o ESTOQUE", async () => {
    const a = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    // 31/12/2025: dívida 500.000 (ingresso 2024); caixa 0, RP processados 120.000 (e25a+e25c
    // inscritos no encerramento) → disponibilidade PISADA a 0 pela nota¹. DCL = 500.000.
    expect(a.dclInicial).toBe("500000.00");

    // A amortização de 30.000 (grupo 6, paga em fev/2026) REDUZIU o estoque: 500.000 → 470.000.
    const dFinal = await dclNoCorte(prisma, { exercicio: 2026, corte: new Date("2026-02-28T23:59:59Z") });
    expect(dFinal.dividaConsolidada.toFixed(2)).toBe("470000.00");

    // DCL(28/02): dívida 470.000 − disponibilidade 512.000 (caixa 602.000 − RP proc 90.000) = −42.000.
    expect(a.dclFinal).toBe("-42000.00");
    expect(a.variacaoDclBruta).toBe("542000.00");
  });

  it("t10 — os dois caminhos DIVERGEM (12.000), e a divergência é NOMEADA", async () => {
    const a = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    // Nenhum ajuste vivo nesta fixture (não há atualização monetária) → nominal = variação bruta.
    expect(a.totalAjustes).toBe("0.00");
    expect(a.resultadoNominal).toBe("542000.00");

    // ⚠️ diferenca = nominal-abaixo (542.000) − XXIV (530.000) = 12.000. NÃO fecha — e é ESPERADO:
    // esta fixture tem juros (XXVI = 45.000), pagamento de RP processado (DCL-neutro, mas subtraído
    // no XXIV) e o piso da nota¹ no corte de abertura. Isolar cada parcela seria a reconciliação
    // que a sessão decidiu NÃO construir (ver o MODULO): aqui a divergência se MOSTRA, não se fecha.
    expect(a.harmonizacao.primarioAcima).toBe("530000.00");
    expect(a.harmonizacao.diferenca).toBe("12000.00");
    expect(a.harmonizacao.fecha).toBe(false);
    expect(a.notas.some((n) => n.startsWith("HARMONIZACAO-NAO-FECHA"))).toBe(true);
  });

  it("t11 — mesmo divergindo, o interruptor do XXV NÃO se relaxa: primário abaixo e XXVII null", async () => {
    const a = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    // XXVI (juros passivos) vem do acima e é concreto (45.000)...
    expect(a.jurosPassivos).toBe("45000.00");
    // ...mas sem o XXV a conta dos juros não fecha de nenhum lado.
    expect(a.jurosNominais).toBeNull();
    expect(a.resultadoPrimario).toBeNull();
    expect(a.harmonizacao.nominalAcima).toBeNull();
    expect(a.harmonizacao.primarioAbaixo).toBeNull();
  });
});
