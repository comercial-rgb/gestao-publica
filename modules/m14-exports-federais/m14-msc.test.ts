import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
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
import { apurarResultadoDoExercicio } from "../m08-restos-a-pagar/apuracao.js";
import { encerrarControlesOrcamentarios } from "../m08-restos-a-pagar/encerramento-controles.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { roteiroIngressoExtra } from "../m07-extraorcamentario/dominio.js";
import { registrarIngressoExtra } from "../m07-extraorcamentario/extraorcamentario.js";
import { arrecadarRecebimentoDividaAtiva } from "../m10-patrimonial/adapter-m04.js";
import { cadastrarDividaAtiva, inscreverDividaAtiva } from "../m10-patrimonial/divida-ativa.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { abrirExercicio, encerrarExercicio } from "../m08-restos-a-pagar/exercicio.js";
import {
  conferirM3,
  conferirM4,
  conferirM5,
  gerarMsc,
  serializarMscCsv,
  zipar,
  type LinhaMsc,
} from "./index.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M14 — MATRIZ DE SALDOS CONTÁBEIS (MSC). TR 7.34 / Portaria STN 642/2019.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO — a partir dos ROTEIROS REAIS do
 * repositório (nada foi copiado da saída do programa).
 *
 * ═══ OS FATOS DE JULHO/2026 (o exercício sintético) ═══
 *   10/07  arrecadação 10.000   D CAIXA        10.000 / C VPA           10.000
 *                               D R_A_REALIZAR 10.000 / C R_REALIZADA   10.000
 *   15/07  empenho      6.000   D C_DISPONIVEL 6.000  / C C_EMPENHADO   6.000
 *   20/07  liquidação   6.000   D VPD          6.000  / C FORNECEDOR    6.000
 *                               D C_EMPENHADO  6.000  / C C_LIQUIDADO   6.000
 *   25/07  pagamento    6.000   D FORNECEDOR   6.000  / C CAIXA         6.000
 *                               D C_LIQUIDADO  6.000  / C C_PAGO        6.000
 *
 * ⚠️ E A LOA ENTROU NO RAZÃO (o bloco da dotação). A ficha é dotada em 100.000, e a
 * dotação é um fato de **1º DE JANEIRO**:
 *   01/01  dotação    100.000   D 5.2.2.1.1 (dotação inicial) / C C_DISPONIVEL 100.000
 *
 * ═══ A MSC AGREGADA DE 2026-07, CÉLULA A CÉLULA ═══
 *
 * `beginning_balance` (antes de 01/07) — e ele NÃO é mais todo zero:
 *   5.2.2.1.1        D  100.000,00      C_DISPONIVEL     C  100.000,00
 *   todas as outras: 0,00 (a natureza de um saldo ZERO é a NATURAL da conta — a linha
 *   é publicada, não omitida).
 *
 * `ending_balance`:
 *
 *   conta            nat.  ΣD        ΣC        ΣD−ΣC      -> Nat_Valor  Valor
 *   5.2.2.1.1        D    100.000         0   +100.000         D      100000.00
 *   CAIXA            D     10.000     6.000   +  4.000         D  (2 linhas: ver abaixo)
 *   FORNECEDOR       C      6.000     6.000          0         C           0.00
 *   VPD              D      6.000         0   +  6.000         D        6000.00
 *   VPA              C          0    10.000   − 10.000         C       10000.00
 *   R_A_REALIZAR     D     10.000         0   + 10.000         D       10000.00
 *   R_REALIZADA      C          0    10.000   − 10.000         C       10000.00
 *   C_DISPONIVEL     C      6.000   100.000   − 94.000         C       94000.00  ✅ CURADA
 *   C_EMPENHADO      C      6.000     6.000          0         C           0.00
 *   C_LIQUIDADO      C      6.000     6.000          0         C           0.00
 *   C_PAGO           C          0     6.000   −  6.000         C        6000.00
 *
 *   ⚠️⚠️ A C_DISPONIVEL ERA UMA CONTA CREDORA COM SALDO DEVEDOR (D 6.000) — o empenho a
 *   debitava e a LOA NUNCA a creditava, porque a dotação vivia só no `MovimentoDotacao`
 *   e não tocava o razão. Agora ela fecha em C 94.000 = 100.000 − 6.000 empenhados. O
 *   subsistema orçamentário do razão finalmente reflete o orçamento.
 *
 *   ⚠️ O CAIXA SE PARTE EM DUAS LINHAS (grão das ICs, bloco 2): D 10.000 pela receita
 *   (que traz NR) e C 6.000 pela despesa (que traz ND e funcional). Líquido: 4.000.
 *
 *   ⚠️ M2 (o balancete fecha), no ending:
 *     ΣD = 10.000 + 6.000 + 10.000 + 100.000                  = 126.000,00
 *     ΣC =  6.000 + 10.000 + 10.000 + 94.000 + 6.000          = 126.000,00 ✓
 *
 *   35 linhas: 11 contas × 3 tipos de valor = 33, mais as 2 do caixa partido.
 *
 * ═══ t3 — A MSC DE ENCERRAMENTO (dez/2026) ═══
 *   Apuração: VPA 10.000 − VPD 6.000 = resultado 4.000 (superávit).
 *   O lançamento de ENCERRAMENTO (31/12) zera as VP contra os resultados acumulados:
 *     D VPA 10.000 / C VPD 6.000 / C RESULTADOS_ACUMULADOS 4.000
 *
 *   AGREGADA de dezembro (EXCLUI o encerramento): VPA fecha em C 10.000, VPD em D 6.000.
 *   ENCERRAMENTO:  beginning == esse mesmo (M3) · period_change = SÓ o encerramento ·
 *                  ending: VPA 0,00 · VPD 0,00 · RESULTADOS_ACUMULADOS C 4.000,00
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "siconfi@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";

/** ⚠️ CONFERIDO CONTRA A TABELA DO IBGE: Campina Grande/PB. Ver `EnteConfig`. */
const IBGE = "2504009";
const PO = "01";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const RESULTADOS = "2.3.7.1.1.00.00"; // patrimônio líquido — resultados acumulados
const VPD = "3.3.9.0.1.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
/** Conta de ativo SEM `indicadorSuperavit` — o t6. */
const ATIVO_SEM_INDICADOR = "1.1.2.1.1.00.00";
/** 5.2.2.1.1 — DOTAÇÃO INICIAL. Nasce no razão neste bloco (era o furo de 46dfd5d). */
const DOTACAO_INICIAL = "5.2.2.1.1.00.00";

// ── BLOCO 2: a fonte B (FUNDEB), a consignação e a dívida ativa ──
const FONTE_540 = "fnt-540";
const CAIXA_540 = "1.1.1.1.2.00.01"; // outra conta de caixa, a do FUNDEB
const CONSIGNACAO = "2.1.8.8.1.01.00"; // passivo — consignações a repassar
const ATIVO_DA = "1.2.1.1.1.00.00"; // dívida ativa — longo prazo
const VPA_DA = "4.1.1.1.1.00.00"; // VPA — inscrição em dívida ativa
/** 1.1.3.0.11.1.3 — tipo 3: o crédito INSCRITO em dívida ativa. */
const NAT_DIVIDA_ATIVA = "11130113";

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});

const NAT_IPTU = "11180111";

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-result", codigo: RESULTADOS, nome: "Resultados acumulados", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD, nome: "VPD serviços", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      // ⚠️ SEM indicadorSuperavit — de propósito (t6).
      { id: "c-sem-ind", codigo: ATIVO_SEM_INDICADOR, nome: "Créditos a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      // ── bloco 2 ──
      { id: "c-caixa-540", codigo: CAIXA_540, nome: "Bancos FUNDEB", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-consig", codigo: CONSIGNACAO, nome: "Consignações a repassar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-ativo-da", codigo: ATIVO_DA, nome: "Dívida ativa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpa-da", codigo: VPA_DA, nome: "VPA — inscrição em dívida ativa", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });

  // ═══ A CONFIG DO ENTE — semeada, com quem conferiu ═══
  await prisma.enteConfig.create({
    data: {
      id: "unico",
      codigoIbge: IBGE,
      poderOrgao: PO,
      nome: "Município de Campina Grande",
      tribunalCodigo: "TCE-PB",
      tribunalUf: "PB",
      planoContasSeed: "pcasp-federal",
      conferidoPor: "contabilidade@cg.pb.gov.br",
      conferidoEm: new Date("2026-01-05T12:00:00Z"),
    },
  });

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
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr", codigo: NAT_IPTU, descricao: "IPTU" },
      { id: "nr-da", codigo: NAT_DIVIDA_ATIVA, descricao: "IPTU — dívida ativa" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE, contaContabilId: "c-caixa" },
      { id: "cb-540", codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540, contaContabilId: "c-caixa-540" },
    ],
  });
  await prisma.tipoConsignacao.create({
    data: { id: "t-inss", codigo: "INSS", descricao: "INSS retido na fonte", criadoPor: POR },
  });
  await prisma.roteiroDividaAtiva.create({
    data: { tipo: "INSCRICAO", contaDebitoId: "c-ativo-da", contaCreditoId: "c-vpa-da", criadoPor: POR },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
  await prisma.roteiroEncerramento.create({
    data: { chave: "PADRAO", contaResultadosAcumuladosId: "c-result", criadoPor: POR },
  });
}

/** O exercício sintético do cabeçalho: arrecada 10.000, gasta 6.000 — tudo em julho. */
async function julhoDe2026(): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500", valor: "10000.00",
      dataArrecadacao: new Date("2026-07-10T12:00:00Z"),
      numeroReceita: "GUIA-1", criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );

  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00",
      data: new Date("2026-07-15T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "6000.00",
      data: new Date("2026-07-20T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "medição", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "6000.00",
      data: new Date("2026-07-25T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "OP", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
}

/**
 * ⚠️ COM AS ICs, UMA CONTA TEM VÁRIAS LINHAS POR TIPO DE VALOR — uma por combinação de
 * dimensões. `celula` só serve onde a conta tem UMA combinação; onde ela se PARTE (o
 * caixa, movimentado por uma receita E por uma despesa), o teste confere linha a linha.
 */
/** O INGRESSO EXTRAORÇAMENTÁRIO na conta do FUNDEB — a fonte vem da CONTA, não de ficha. */
async function ingressoExtraDoFundeb(valor: string): Promise<void> {
  await registrarIngressoExtra(
    prisma,
    {
      tipoConsignacaoId: "t-inss",
      credorConsignatario: "INSS",
      contaBancaria: "CC-002",
      valor,
      data: new Date("2026-07-28T12:00:00Z"),
      historico: "INSS retido de terceiro",
      criadoPor: POR,
    },
    roteiroIngressoExtra({
      disponibilidade: CAIXA_540,
      consignacaoAPagar: CONSIGNACAO,
    })
  );
}

/** A perna credora da arrecadação de dívida ativa aponta ao ATIVO — nunca a uma VPA. */
const R_ARRECADACAO_DA = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: ATIVO_DA,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

const celula = (
  linhas: readonly LinhaMsc[],
  conta: string,
  tipo: string
): { nat: string; valor: string } => {
  const achadas = linhas.filter((x) => x.conta === conta && x.tipoValor === tipo);
  if (achadas.length !== 1) {
    throw new Error(
      `A conta ${conta} tem ${achadas.length} linhas em ${tipo} — use \`linhasDe\`.`
    );
  }
  const l = achadas[0]!;
  return { nat: l.naturezaValor, valor: l.valor };
};

const linhasDe = (
  linhas: readonly LinhaMsc[],
  conta: string,
  tipo: string
): readonly LinhaMsc[] =>
  linhas.filter((x) => x.conta === conta && x.tipoValor === tipo);

/** O saldo LÍQUIDO da conta (soma com sinal de todas as linhas dela). É o que a M1 usa. */
const liquido = (
  linhas: readonly LinhaMsc[],
  conta: string,
  tipo: string
): number =>
  linhasDe(linhas, conta, tipo).reduce(
    (a, l) => a + (l.naturezaValor === "D" ? Number(l.valor) : -Number(l.valor)),
    0
  );

describe("M14 — MSC agregada (TR 7.34)", () => {
  beforeEach(async () => {
    await semear();
    await julhoDe2026();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — TESTE DE OURO, célula a célula
  it("t1: a MSC de 2026-07, conta a conta, com os literais do cabeçalho", async () => {
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    expect(msc.instituicao).toBe("2504009EX");
    expect(msc.periodo).toBe("2026-07");

    // ⚠️ 35 LINHAS — e as 3 a mais são a DOTAÇÃO NO RAZÃO (este bloco).
    // 11 contas × 3 tipos = 33, MAIS 2: o CAIXA se PARTE em `period_change` e em
    // `ending_balance` (movimentado por duas combinações de dimensões — a arrecadação,
    // que traz NR, e o pagamento, que traz ND e funcional). A 11ª conta é a 5.2.2.1.1
    // (DOTAÇÃO INICIAL), que não existia no razão até este bloco.
    expect(msc.linhas).toHaveLength(35);

    // ═══ beginning ═══
    // ⚠️ E ELE NÃO É MAIS TODO ZERO. A dotação da LOA é um fato de **1º DE JANEIRO** —
    // ela já estava lá quando julho começou. Pela data de digitação, a MSC de março
    // mostraria a LOA "entrando" em março.
    expect(celula(msc.linhas, DOTACAO_INICIAL, "beginning_balance")).toEqual({ nat: "D", valor: "100000.00" });
    expect(celula(msc.linhas, C_DISPONIVEL, "beginning_balance")).toEqual({ nat: "C", valor: "100000.00" });
    expect(celula(msc.linhas, CAIXA, "beginning_balance")).toEqual({ nat: "D", valor: "0.00" });
    expect(celula(msc.linhas, VPA, "beginning_balance")).toEqual({ nat: "C", valor: "0.00" });

    // ═══ ending — os literais do cabeçalho ═══
    // O CAIXA, PARTIDO: +10.000 que entraram pela receita e −6.000 que saíram pela despesa.
    // Somados, os 4.000 do bloco 1 — e é a M1/M4 que amarram isso.
    const caixaEnd = linhasDe(msc.linhas, CAIXA, "ending_balance");
    expect(caixaEnd).toHaveLength(2);
    const daReceita = caixaEnd.find((l) => l.icNR !== null)!;
    const daDespesa = caixaEnd.find((l) => l.icND !== null)!;
    expect(daReceita.naturezaValor).toBe("D");
    expect(daReceita.valor).toBe("10000.00");
    expect(daDespesa.naturezaValor).toBe("C");
    expect(daDespesa.valor).toBe("6000.00");

    expect(celula(msc.linhas, FORNECEDOR, "ending_balance")).toEqual({ nat: "C", valor: "0.00" });
    expect(celula(msc.linhas, VPD, "ending_balance")).toEqual({ nat: "D", valor: "6000.00" });
    expect(celula(msc.linhas, VPA, "ending_balance")).toEqual({ nat: "C", valor: "10000.00" });
    expect(celula(msc.linhas, R_A_REALIZAR, "ending_balance")).toEqual({ nat: "D", valor: "10000.00" });
    expect(celula(msc.linhas, R_REALIZADA, "ending_balance")).toEqual({ nat: "C", valor: "10000.00" });
    expect(celula(msc.linhas, C_EMPENHADO, "ending_balance")).toEqual({ nat: "C", valor: "0.00" });
    expect(celula(msc.linhas, C_LIQUIDADO, "ending_balance")).toEqual({ nat: "C", valor: "0.00" });
    expect(celula(msc.linhas, C_PAGO, "ending_balance")).toEqual({ nat: "C", valor: "6000.00" });

    // ⚠️⚠️ AQUI ESTÁ A CURA. O CRÉDITO DISPONÍVEL fecha em **C 94.000,00** — 100.000 da
    // LOA menos os 6.000 empenhados. Até este bloco ele fechava em **D 6.000**: uma conta
    // CREDORA com saldo DEVEDOR, permanente, porque o empenho a debitava e a LOA nunca a
    // creditava. O subsistema orçamentário do razão não refletia o orçamento.
    expect(celula(msc.linhas, C_DISPONIVEL, "ending_balance")).toEqual({ nat: "C", valor: "94000.00" });
    expect(celula(msc.linhas, DOTACAO_INICIAL, "ending_balance")).toEqual({ nat: "D", valor: "100000.00" });

    // ⚠️ period_change == ending (tudo aconteceu no mês) — e é a M1 que amarra isso.
    for (const conta of [VPA, VPD, C_PAGO]) {
      expect(celula(msc.linhas, conta, "period_change")).toEqual(
        celula(msc.linhas, conta, "ending_balance")
      );
    }

    // ═══ AS ICs ═══
    const caixa = msc.linhas.find((l) => l.conta === CAIXA)!;
    expect(caixa.icPO).toBe("01"); // da config semeada
    expect(caixa.icFP).toBe("1"); // indicadorSuperavit F -> Financeiro
    const result = msc.linhas.find((l) => l.conta === FORNECEDOR)!;
    expect(result.icFP).toBe("1");
    // classe 3/4 e 5-8 NÃO levam FP — "financeiro ou permanente" é pergunta de saldo
    // patrimonial. Exigir FP delas encheria o relatório de pendência falsa.
    expect(msc.linhas.find((l) => l.conta === VPA)!.icFP).toBeNull();
    expect(msc.linhas.find((l) => l.conta === C_PAGO)!.icFP).toBeNull();

    expect(msc.pendencias).toEqual([]);
  });

  // t4 — A INVERSÃO CURADA... E A INVERSÃO AINDA REPRESENTÁVEL
  it("t4: a conta credora-devedora SUMIU — e a natureza do valor continua sendo o SINAL", async () => {
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // ⚠️ A CURA, EM UMA LINHA. O crédito disponível é conta CREDORA e agora fecha
    // CREDORA: 100.000 da LOA − 6.000 empenhados = 94.000. Até este bloco ele fechava em
    // **D 6.000** — debitado pelo empenho e NUNCA creditado, porque a dotação vivia só no
    // `MovimentoDotacao` e não tocava o razão.
    const disp = msc.linhas.find(
      (l) => l.conta === C_DISPONIVEL && l.tipoValor === "ending_balance"
    )!;
    expect(disp.naturezaValor).toBe("C");
    expect(disp.valor).toBe("94000.00");

    // ⚠️ MAS A REPRESENTAÇÃO DA INVERSÃO CONTINUA SENDO O PONTO — e ela não some com a
    // cura. Um lançamento DIRETO que debita o passivo além do que ele tem deixa o
    // FORNECEDOR (conta CREDORA) com saldo DEVEDOR. A MSC não explode nem "corrige": ela
    // publica "D", porque a Natureza_Valor é o SINAL de (ΣD − ΣC), e mais nada. Derivá-la
    // da CLASSE da conta publicaria "C" — e o balancete da STN não fecharia.
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "DIRETO-INV",
        dataTransacao: new Date("2026-07-29T12:00:00Z"),
        historico: "pagamento a maior ao fornecedor (crédito contra ele)",
        origemTipo: "AJUSTE",
        origemId: "x",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-forn", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "500.00" },
            { contaId: "c-caixa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "500.00" },
          ],
        },
      },
    });

    const comInversao = await gerarMsc(prisma, "2026-07", "AGREGADA");
    expect(liquido(comInversao.linhas, FORNECEDOR, "ending_balance")).toBe(500);
    const forn = linhasDe(comInversao.linhas, FORNECEDOR, "ending_balance").find(
      (l) => l.icFR === null // a perna do ajuste direto — sem fato, sem dimensão
    )!;
    expect(forn.naturezaValor).toBe("D"); // conta CREDORA, saldo DEVEDOR
    expect(forn.valor).toBe("500.00");

    // ...e o balancete FECHA nos dois lados (a M2 roda dentro do gerador — se não
    // fechasse, `gerarMsc` teria lançado).
    //
    // ⚠️ 126.000, E NÃO OS 32.000 DO BLOCO 2: a dotação de 100.000 entrou no razão (D
    // 5.2.2.1.1 / C 6.2.2.1.1), e o disponível deixou de ser D 6.000 para ser C 94.000.
    //   ΣD = 10.000 (caixa/receita) + 6.000 (VPD) + 10.000 (rec. a realizar)
    //        + 100.000 (dotação)                                        = 126.000
    //   ΣC =  6.000 (caixa/despesa) + 10.000 (VPA) + 10.000 (rec. realizada)
    //        + 94.000 (disponível) + 6.000 (crédito pago)               = 126.000 ✓
    const end = msc.linhas.filter((l) => l.tipoValor === "ending_balance");
    const soma = (nat: string) =>
      end
        .filter((l) => l.naturezaValor === nat)
        .reduce((a, l) => a + Number(l.valor), 0);
    expect(soma("D")).toBe(126000);
    expect(soma("C")).toBe(126000);
  });

  // t2 — AS IDENTIDADES QUEBRAM SOB MUTAÇÃO
  it("t2: M1 e M2 acusam — adulterar uma linha derruba a identidade", async () => {
    const { conferirM1, conferirM2 } = await import("./msc/dominio.js");
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // M1: adultero o period_change do CAIXA vindo da RECEITA (10.000 -> 9.999). O
    // beginning + change deixa de dar o ending, e a mensagem nomeia conta e DIFERENÇA.
    //
    // ⚠️ A M1 SOMA as linhas da conta — ela não pega "a" linha. Com as ICs, o caixa tem
    // duas por tipo de valor, e uma M1 que fizesse `set` em vez de `plus` compararia a
    // ÚLTIMA fonte com o total: passaria a mentir exatamente onde é mais necessária.
    const m1 = msc.linhas.map((l) =>
      l.conta === CAIXA && l.tipoValor === "period_change" && l.icNR !== null
        ? { ...l, valor: "9999.00" }
        : l
    );
    expect(() => conferirM1(m1)).toThrow(/M1 NÃO FECHA na conta 1\.1\.1\.1\.2\.00\.00/);
    expect(() => conferirM1(m1)).toThrow(/Diferença: 1\.00/);

    // M2: troco a natureza de uma linha do ending (C -> D). O balancete estoura.
    // ΣD 126.000 + 10.000 = 136.000 contra ΣC 126.000 − 10.000 = 116.000.
    const m2 = msc.linhas.map((l) =>
      l.conta === VPA && l.tipoValor === "ending_balance"
        ? { ...l, naturezaValor: "D" as const }
        : l
    );
    expect(() => conferirM2(m2)).toThrow(/M2 NÃO FECHA em ending_balance/);
    expect(() => conferirM2(m2)).toThrow(/ΣD 136000.00 ≠ ΣC 116000.00/);

    // ...e o original passa nas duas (é o gerador que as roda antes de devolver).
    expect(() => conferirM1(msc.linhas)).not.toThrow();
    expect(() => conferirM2(msc.linhas)).not.toThrow();
  });

  // t6
  it("t6: conta de ativo SEM indicador vira PENDÊNCIA NOMEADA — e a linha SAI", async () => {
    // dou movimento à conta sem indicador: um lançamento direto (D ativo / C VPA)
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "DIRETO-1",
        dataTransacao: new Date("2026-07-28T12:00:00Z"),
        historico: "reconhecimento de crédito a receber",
        origemTipo: "AJUSTE",
        origemId: "x",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-sem-ind", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
          ],
        },
      },
    });

    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // ⚠️ TRÊS PENDÊNCIAS, E CADA UMA DIZ UMA COISA DIFERENTE:
    //  1. FP na conta sem indicador (é da CONTA — não tem lançamento);
    //  2. FR na conta sem indicador (o lançamento DIRETO não tem fato dono);
    //  3. FR na VPA (o MESMO lançamento direto, na outra perna dele).
    // A (2) e a (3) são o resolver dizendo "este lançamento não está pendurado em fato
    // nenhum" — e é por isso que a pendência é POR CONTA **E POR LANÇAMENTO**: ela tem
    // TAMANHO. Saber que "falta FR" não serve; saber em quantos lançamentos falta, sim.
    expect(msc.pendencias).toHaveLength(3);

    const fp = msc.pendencias.find((p) => p.ic === "FP")!;
    expect(fp.conta).toBe(ATIVO_SEM_INDICADOR);
    expect(fp.lancamentoId).toBeUndefined(); // é da CONTA, não de um fato
    expect(fp.motivo).toMatch(/não tem 'indicadorSuperavit'/);
    // ...e ela diz que o Anexo 14 também está cego para esta conta (mesma fonte).
    expect(fp.motivo).toMatch(/superávit financeiro daquele relatório/);

    const fr = msc.pendencias.filter((p) => p.ic === "FR");
    expect(fr).toHaveLength(2);
    expect(fr.map((p) => p.conta).sort()).toEqual([ATIVO_SEM_INDICADOR, VPA]);
    // o MESMO lançamento nas duas — e ele está IDENTIFICADO
    expect(new Set(fr.map((p) => p.lancamentoId)).size).toBe(1);
    expect(fr[0]!.motivo).toMatch(/sem caminho até um fato com dimensão/);
    expect(fr[0]!.motivo).toMatch(/ajuste direto/);

    // ⚠️ E A LINHA SAI — sem a IC. Um arquivo que não existe não entrega nada; uma linha
    // omitida em silêncio derruba o balancete sem dizer por quê.
    const linha = msc.linhas.find(
      (l) => l.conta === ATIVO_SEM_INDICADOR && l.tipoValor === "ending_balance"
    )!;
    expect(linha.valor).toBe("1000.00");
    expect(linha.naturezaValor).toBe("D");
    expect(linha.icFP).toBeNull();
    expect(linha.icPO).toBe("01"); // o PO continua lá
  });

  // t5 — CSV e ZIP
  it("t5: a linha do CSV, literal — ponto decimal, IC como texto, CRLF", async () => {
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");
    const csv = serializarMscCsv(msc);

    const linhas = csv.split("\r\n");
    expect(linhas[0]).toBe(
      "instituicao,periodo,conta,tipo_valor,natureza_valor,valor," +
        "tipo_ic1,ic1,tipo_ic2,ic2,tipo_ic3,ic3,tipo_ic4,ic4,tipo_ic5,ic5,tipo_ic6,ic6," +
        // ⚠️ O 7º PAR NASCEU NESTE BLOCO: a IC "AI" (ano de inscrição do RP).
        "tipo_ic7,ic7"
    );

    // ⚠️ A LINHA LITERAL do ending do CAIXA vindo da RECEITA. Repare:
    //  · "01" — o zero à esquerda do IC SOBREVIVE, porque a IC é TEXTO. Um IC que vira
    //    número deixa de existir na tabela da STN.
    //  · "500" — a FONTE, que o RESOLVER tirou do fato (o razão não a carrega).
    //  · "11180111" — a natureza da RECEITA, 8 dígitos.
    //  · ND, FUNCIONAL e **AI** saem com os DOIS campos VAZIOS: uma receita não TEM
    //    natureza de despesa nem ano de inscrição de RP — e isso não é pendência, é a
    //    resposta. (São 6 campos vazios ao fim: 3 pares.)
    expect(csv).toContain(
      "2504009EX,2026-07,1.1.1.1.2.00.00,ending_balance,D,10000.00," +
        "PO,01,FP,1,FR,500,NR,11180111,,,,,,\r\n"
    );
    // ...e o MESMO caixa, pela DESPESA: ND de 6 dígitos e FUNCIONAL (função 12 +
    // subfunção 361). Aqui é o NR que não se aplica — e a AI tampouco: esta despesa é do
    // exercício CORRENTE, não é resto a pagar de ano nenhum.
    expect(csv).toContain(
      "2504009EX,2026-07,1.1.1.1.2.00.00,ending_balance,C,6000.00," +
        "PO,01,FP,1,FR,500,,,ND,339039,FUNCIONAL,12361,,\r\n"
    );
    // a conta de VPA não leva FP (classe 4) e não leva ND — os pares saem vazios
    expect(csv).toContain(
      "2504009EX,2026-07,4.1.1.2.1.01.00,ending_balance,C,10000.00," +
        "PO,01,,,FR,500,NR,11180111,,,,,,\r\n"
    );
    expect(csv.endsWith("\r\n")).toBe(true);

    // ═══ O ZIP — e ele ABRE (inflate de volta) ═══
    const zip = zipar("msc_2504009EX_2026-07.csv", csv);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // assinatura de header local
    expect(zip.subarray(zip.length - 22).readUInt32LE(0)).toBe(0x06054b50); // EOCD

    // o conteúdo comprimido, de volta: bate byte a byte com o CSV
    const nomeLen = zip.readUInt16LE(26);
    const tamComprimido = zip.readUInt32LE(18);
    const inicio = 30 + nomeLen;
    const dados = zip.subarray(inicio, inicio + tamComprimido);
    expect(inflateRawSync(dados).toString("utf8")).toBe(csv);

    // ⚠️ REPRODUTÍVEL: o MESMO conteúdo gera os MESMOS bytes (a data é fixa, não `now`).
    // Quem auditar amanhã tem de gerar o mesmo arquivo.
    expect(zipar("msc_2504009EX_2026-07.csv", csv).equals(zip)).toBe(true);
  });
});

describe("M14 — MSC de ENCERRAMENTO (a costura do ano)", () => {
  beforeEach(async () => {
    await semear();
    await julhoDe2026();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t3
  it("t3: a agregada de dezembro IGNORA o encerramento; a de encerramento o aplica — e M3 fecha", async () => {
    const ex = await abrirExercicio(prisma, { ano: 2027, criadoPor: POR }).catch(
      () => null
    );
    expect(ex === null || typeof ex === "string").toBe(true);

    const exercicio2026 = await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      select: { id: true },
    });
    await encerrarExercicio(prisma, { ano: 2026, encerradoPor: POR });

    // A APURAÇÃO: VPA 10.000 − VPD 6.000 = 4.000 (superávit). Lançamento de
    // ENCERRAMENTO, datado de 31/12/2026.
    const ap = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026.id,
      criadoPor: POR,
    });
    expect(ap.resultadoApurado.toFixed(2)).toBe("4000.00");

    // ═══ A AGREGADA DE DEZEMBRO — ela NÃO enxerga o encerramento ═══
    const dez = await gerarMsc(prisma, "2026-12", "AGREGADA");
    expect(celula(dez.linhas, VPA, "ending_balance")).toEqual({ nat: "C", valor: "10000.00" });
    expect(celula(dez.linhas, VPD, "ending_balance")).toEqual({ nat: "D", valor: "6000.00" });
    // o resultado acumulado nem aparece: nada normal tocou a conta
    expect(dez.linhas.some((l) => l.conta === RESULTADOS)).toBe(false);
    // e o mês de dezembro não teve movimento NORMAL nenhum
    expect(celula(dez.linhas, VPA, "period_change")).toEqual({ nat: "C", valor: "0.00" });

    // ═══ A DE ENCERRAMENTO — ela parte DALI e aplica a apuração ═══
    //
    // ⚠️ AQUI A VPA TEM **DUAS** LINHAS no ending, e é a prova viva do Record
    // `DIMENSAO_DA_NATUREZA`: uma é a ARRECADAÇÃO (C 10.000, COM fonte e natureza de
    // receita) e a outra é o ENCERRAMENTO (D 10.000, SEM dimensão nenhuma — por design).
    // Somadas, zero. E o encerramento NÃO gera pendência, porque a ausência de dimensão
    // nele está CERTA.
    const enc = await gerarMsc(prisma, "2026-12", "ENCERRAMENTO");
    expect(liquido(enc.linhas, VPA, "beginning_balance")).toBe(-10000); // C 10.000
    expect(liquido(enc.linhas, VPA, "period_change")).toBe(10000); // D 10.000
    expect(liquido(enc.linhas, VPA, "ending_balance")).toBe(0);

    const vpaEnd = linhasDe(enc.linhas, VPA, "ending_balance");
    expect(vpaEnd).toHaveLength(2);
    expect(vpaEnd.find((l) => l.icFR === "500")!.naturezaValor).toBe("C"); // a arrecadação
    const doEncerramento = vpaEnd.find((l) => l.icFR === null)!;
    expect(doEncerramento.naturezaValor).toBe("D");
    expect(doEncerramento.icNR).toBeNull(); // SEM_DIMENSAO_POR_DESIGN

    expect(liquido(enc.linhas, VPD, "beginning_balance")).toBe(6000);
    expect(liquido(enc.linhas, VPD, "ending_balance")).toBe(0);

    // o resultado do exercício, no patrimônio líquido: 10.000 − 6.000 = 4.000
    expect(celula(enc.linhas, RESULTADOS, "beginning_balance")).toEqual({ nat: "C", valor: "0.00" });
    expect(celula(enc.linhas, RESULTADOS, "ending_balance")).toEqual({ nat: "C", valor: "4000.00" });

    // ⚠️ E ZERO PENDÊNCIA VINDA DO ENCERRAMENTO — o falso-positivo é o que se testa aqui.
    // O lançamento de apuração não tem fonte, e isso está CERTO. Se ele virasse
    // "pendência de FR", o relatório gritaria por algo que não tem conserto — e *a
    // pendência que grita por tudo não denuncia nada*.
    expect(enc.pendencias).toEqual([]);
    expect(dez.pendencias).toEqual([]);

    // ═══ M3 — A COSTURA. O beginning da de encerramento É o ending da agregada ═══
    expect(() => conferirM3(enc.linhas, dez.linhas)).not.toThrow();

    // e ela ACUSA se a costura arrebentar (mutação da própria identidade)
    const arrebentada = dez.linhas.map((l) =>
      l.conta === VPA && l.tipoValor === "ending_balance"
        ? { ...l, valor: "9999.00" }
        : l
    );
    expect(() => conferirM3(enc.linhas, arrebentada)).toThrow(
      /M3 NÃO FECHA na conta 4\.1\.1\.2\.1\.01\.00/
    );
  });
});

describe("M14 — as invariantes do módulo (sem banco)", () => {
  // t7
  it("t7: ZERO escrita e ZERO aritmética no módulo inteiro (o grep roda aqui)", () => {
    const raiz = fileURLToPath(new URL(".", import.meta.url));
    const arquivos: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) arquivos.push(p);
      }
    };
    varrer(raiz);
    expect(arquivos.length).toBeGreaterThan(0);

    // Um export fiscal que GRAVA pode corromper o que envia à União — e a MSC tem de
    // poder ser REPRODUZIDA amanhã, do razão, byte a byte.
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    // Um export que SOMA por conta própria pode divergir do balanço — e é o arquivo que
    // o TCE e a STN leem. Toda soma vem do `somasPorConta` (M01, dono do razão).
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;

    for (const f of arquivos) {
      const efetivo = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(ESCRITA.test(efetivo), `${f} tem ESCRITA`).toBe(false);
      expect(SUM_BRUTO.test(efetivo), `${f} tem SUM bruto`).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 2 — o RESOLVER de dimensões
// ═══════════════════════════════════════════════════════════════════════════

describe("M14 — resolver de dimensões (bloco 2)", () => {
  beforeEach(async () => {
    await semear();
    await julhoDe2026();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // tb1 — O EXTRAORÇAMENTÁRIO: a fonte vem da CONTA BANCÁRIA (não há ficha)
  it("tb1: ingresso extra na fonte 540 sai com FR 540 — a fonte é a do CAIXA, não de uma ficha", async () => {
    // ⚠️ A CONSIGNAÇÃO NÃO TEM FICHA. O dinheiro de terceiro está parado num caixa, e a
    // fonte que importa é a DELE: quando o repasse sair, sai daquele caixa. É a mesma
    // leitura do `extraorcamentarioPorFonte` (M12) — o resolver não inventa outra.
    await ingressoExtraDoFundeb("3000.00");

    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // o caixa do FUNDEB (CC-002, fonte 540) recebeu 3.000 de terceiro
    const caixa540 = linhasDe(msc.linhas, CAIXA_540, "ending_balance");
    expect(caixa540).toHaveLength(1);
    expect(caixa540[0]!.icFR).toBe("540");
    expect(caixa540[0]!.valor).toBe("3000.00");
    expect(caixa540[0]!.naturezaValor).toBe("D");
    // e uma consignação não é receita nem despesa: nem NR, nem ND, nem função.
    expect(caixa540[0]!.icNR).toBeNull();
    expect(caixa540[0]!.icND).toBeNull();
    expect(caixa540[0]!.icFUNCIONAL).toBeNull();

    // o passivo da consignação, na MESMA fonte
    const passivo = linhasDe(msc.linhas, CONSIGNACAO, "ending_balance");
    expect(passivo[0]!.icFR).toBe("540");
    expect(passivo[0]!.naturezaValor).toBe("C");
    expect(passivo[0]!.valor).toBe("3000.00");

    // ⚠️ E A FONTE 500 NÃO SE MISTUROU: o caixa da fonte A continua com os 4.000 dele.
    expect(liquido(msc.linhas, CAIXA, "ending_balance")).toBe(4000);
    expect(msc.pendencias).toEqual([]);
  });

  // tb2 — NR e ND/funcional, os literais
  it("tb2: NR na receita (8 díg) e ND + FUNCIONAL na despesa (da ficha) — literais", async () => {
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // A RECEITA REALIZADA (controle) — natureza da receita, 8 dígitos, da fixture.
    const rr = linhasDe(msc.linhas, R_REALIZADA, "ending_balance");
    expect(rr).toHaveLength(1);
    expect(rr[0]!.icNR).toBe("11180111");
    expect(rr[0]!.icFR).toBe("500");
    expect(rr[0]!.icND).toBeNull(); // uma receita não tem natureza de despesa
    expect(rr[0]!.icFUNCIONAL).toBeNull();

    // A DESPESA — natureza (6 dígitos) e funcional (função 12 + subfunção 361), da FICHA.
    const vpd = linhasDe(msc.linhas, VPD, "ending_balance");
    expect(vpd).toHaveLength(1);
    expect(vpd[0]!.icND).toBe("339039");
    expect(vpd[0]!.icFUNCIONAL).toBe("12361");
    expect(vpd[0]!.icFR).toBe("500");
    expect(vpd[0]!.icNR).toBeNull(); // uma despesa não tem natureza de receita

    // ⚠️ O CRÉDITO EMPENHADO herda a classificação PELO EMPENHO — a liquidação e o
    // pagamento chegam à ficha pela mesma cadeia. Os três dizem a MESMA função.
    for (const conta of [C_EMPENHADO, C_LIQUIDADO, C_PAGO]) {
      const l = linhasDe(msc.linhas, conta, "ending_balance");
      expect(l[0]!.icFUNCIONAL).toBe("12361");
      expect(l[0]!.icND).toBe("339039");
    }
  });

  // tb3 — M4 e a mutação
  it("tb3: M4 fecha; e ela ACUSA quando a dimensão some com uma linha", async () => {
    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // O total por (conta, tipo) — o grão GROSSO, o mesmo que a M1 e a M2 amarram.
    const totais = new Map<string, Money>();
    for (const l of msc.linhas) {
      const chave = `${l.conta}|${l.tipoValor}`;
      const v =
        l.naturezaValor === "D"
          ? toMoney(l.valor)
          : toMoney(toMoney(l.valor).negated());
      totais.set(chave, toMoney((totais.get(chave) ?? toMoney("0.00")).plus(v)));
    }
    expect(() => conferirM4(msc.linhas, totais)).not.toThrow();

    // ⚠️ A MUTAÇÃO É A TENTAÇÃO REAL: "não sei a fonte deste lançamento, então não
    // publico a linha". Isso FURA o balancete da conta — e a M4 é quem grita, nomeando
    // a conta e a diferença exata.
    const semALinhaDaReceita = msc.linhas.filter(
      (l) => !(l.conta === CAIXA && l.tipoValor === "ending_balance" && l.icNR !== null)
    );
    expect(() => conferirM4(semALinhaDaReceita, totais)).toThrow(
      /M4 NÃO FECHA na conta 1\.1\.1\.1\.2\.00\.00 \(ending_balance\)/
    );
    expect(() => conferirM4(semALinhaDaReceita, totais)).toThrow(/Diferença: 10000\.00/);
  });

  // tb4 — A COMPOSTA (passo 0(c), provado por teste)
  it("tb4: a composta da dívida ativa — todos os lançamentos dela na MESMA fonte", async () => {
    const { dividaAtivaId } = await cadastrarDividaAtiva(prisma, {
      identificador: "CDA-1",
      devedorNome: "Fulano de Tal",
      devedorDocumento: "12345678909",
      origem: "TRIBUTARIA",
      contaContabilId: "c-ativo-da",
      criadoPor: POR,
    });
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId,
      valor: "5000.00",
      dataMovimento: new Date("2026-07-05T12:00:00Z"),
      motivo: "inscrição do IPTU 2025 não pago, após a cobrança administrativa",
      criadoPor: POR,
    });

    // ⚠️ A COMPOSTA: arrecadação + recebimento, na MESMA transação. O RECEBIMENTO **não
    // tem lançamento próprio** (o M04 já contabilizou — um roteiro aqui creditaria duas
    // vezes). Logo o único lançamento da operação é o da arrecadação, e ele resolve pela
    // receita. É por CONSTRUÇÃO que a composta não cruza fontes — e o teste prova.
    await arrecadarRecebimentoDividaAtiva(prisma, {
      arrecadacao: {
        exercicio: 2026,
        naturezaReceita: NAT_DIVIDA_ATIVA,
        fonte: "500",
        valor: "2000.00",
        dataArrecadacao: new Date("2026-07-30T12:00:00Z"),
        numeroReceita: "GUIA-DA",
        criadoPor: POR,
      },
      roteiro: R_ARRECADACAO_DA,
      vinculos: [{ dividaAtivaId, valor: "2000.00" }],
    });

    const msc = await gerarMsc(prisma, "2026-07", "AGREGADA");

    // o ativo da dívida ativa: inscrito 5.000 (D) e recebido 2.000 (C) -> 3.000 D
    expect(liquido(msc.linhas, ATIVO_DA, "ending_balance")).toBe(3000);

    // ⚠️ E A ARRECADAÇÃO DA COMPOSTA RESOLVEU: o caixa recebeu os 2.000 na fonte 500 —
    // 4.000 (de julho) + 2.000. A perna do ativo que veio DELA também é fonte 500.
    expect(liquido(msc.linhas, CAIXA, "ending_balance")).toBe(6000);
    const daComposta = linhasDe(msc.linhas, ATIVO_DA, "ending_balance").filter(
      (l) => l.icFR !== null
    );
    expect(daComposta.every((l) => l.icFR === "500")).toBe(true);

    // ...e a INSCRIÇÃO é a pendência HONESTA deste cenário: ela não nasce de fato com
    // fonte (inscrever em dívida ativa não movimenta caixa nenhum). Ela sai NOMEADA.
    const pend = msc.pendencias.filter((p) => p.conta === ATIVO_DA && p.ic === "FR");
    expect(pend).toHaveLength(1);
    expect(pend[0]!.lancamentoId).toBeTruthy();
  });

  // tb5 — A RECUSA
  it("tb5: duas fontes candidatas no MESMO lançamento -> o resolver RECUSA, nomeando", async () => {
    // ⚠️ HOJE NENHUM CAMINHO É AMBIGUÁVEL PELOS SERVIÇOS: o pagamento com retenção tem
    // DOIS caminhos até a fonte (a coluna do pagamento e a conta bancária da retenção),
    // e os guards da TR 5.23 e de b05ce06 forçam os dois a concordar. A ambiguidade só se
    // constrói POR FORA — gravando o fato torto direto no banco, que é o que este teste
    // faz. "Concordam por construção" é uma frase que envelhece: o resolver não confia
    // nela, e é por isso que a checagem roda MESMO quando um braço já respondeu.
    const pag = await prisma.pagamento.findFirstOrThrow({
      select: { id: true, lancamentoId: true },
    });

    await prisma.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: "t-inss",
        credorConsignatario: "INSS",
        contaBancariaId: "cb-540", // FUNDEB — fonte 540
        tipo: "INGRESSO",
        valor: "100.00",
        data: new Date("2026-07-25T12:00:00Z"),
        historico: "retenção forjada em fonte divergente",
        pagamentoId: pag.id,
        lancamentoId: pag.lancamentoId, // ...no lançamento do pagamento, que é fonte 500
        criadoPor: POR,
      },
    });

    await expect(gerarMsc(prisma, "2026-07", "AGREGADA")).rejects.toThrow(
      /FONTE AMBÍGUA no lançamento/
    );
    // ...e a mensagem NOMEIA os dois caminhos e as duas fontes.
    await expect(gerarMsc(prisma, "2026-07", "AGREGADA")).rejects.toThrow(
      /ficha\.fonte -> 500[\s\S]*contaBancaria\.fonte -> 540/
    );
    await expect(gerarMsc(prisma, "2026-07", "AGREGADA")).rejects.toThrow(
      /O resolver NÃO ESCOLHE/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 3 — A VIRADA DO EXERCÍCIO E A IC "AI" (ano de inscrição do RP)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ LITERAIS À MÃO, ANTES DO CÓDIGO. O cenário abaixo atravessa TRÊS exercícios — é o
// mínimo para que a virada exista como fato (com um ano só, o bug de recorte é invisível,
// e foi por isso que a suíte não o via).
//
// ═══ OS FATOS ═══
//   ── 2025 (ficha-2025, LOA 50.000) ────────────────────────────────────────────
//   01/01/25  dotação    50.000   D 5.2.2.1.1 / C C_DISPONIVEL
//   01/03/25  empenho     3.000   D C_DISPONIVEL / C C_EMPENHADO
//   01/04/25  liquidação  3.000   D VPD / C FORNECEDOR  +  D C_EMPENHADO / C C_LIQUIDADO
//             NÃO PAGA  -> na virada vira RP PROCESSADO de 3.000, inscrito em **2025**
//   31/12/25  encerra o exercício, apura o resultado e ENCERRA OS CONTROLES
//
//   ── 2026 (ficha-1, LOA 100.000 — a do `semear`) ───────────────────────────────
//   01/01/26  dotação   100.000   D 5.2.2.1.1 / C C_DISPONIVEL
//   10/07/26  arrecada   10.000   D CAIXA / C VPA  +  D R_A_REALIZAR / C R_REALIZADA
//   15/07/26  empenho     6.000   D C_DISPONIVEL / C C_EMPENHADO
//   20/07/26  liquidação  6.000   D VPD / C FORNECEDOR  +  D C_EMPENHADO / C C_LIQUIDADO
//             NÃO PAGA  -> RP PROCESSADO de 6.000, inscrito em **2026**
//   31/12/26  encerra, apura e ENCERRA OS CONTROLES
//
//   ── 2027 ──────────────────────────────────────────────────────────────────────
//   20/01/27  paga o RP de 2025 (3.000) e o RP de 2026 (6.000). DOIS lançamentos,
//             os DOIS na conta FORNECEDOR — e é aqui que a AI ganha sentido.
//
// ═══ O PATRIMÔNIO LÍQUIDO, À MÃO (e ele ACUMULA — é isso que dois anos provam) ═══
//   2025:  VPA 0 − VPD 3.000  =  −3.000  (déficit)   -> DEBITA  o PL em 3.000
//   2026:  VPA 10.000 − VPD 6.000 = +4.000 (superávit) -> CREDITA o PL em 4.000
//   ⚠️ A VPD de 2026 é 6.000 e NÃO 9.000: a apuração de 2025 já zerou a VPD daquele ano.
//      É justamente por isso que a apuração lê o saldo ACUMULADO sem filtro de natureza —
//      o encerramento anterior já saiu da conta.
//   PL em 31/12/2026 = −3.000 + 4.000 = C 1.000,00
//
// ═══ t5 — A MSC AGREGADA DE JANEIRO/2027, `beginning_balance` ═══
// O `beginning` de janeiro/2027 é "tudo até 31/12/2026" — COM os encerramentos de 2025 e
// de 2026, que já são história. Logo:
//
//   5.2.2.1.1 dotação inicial    0,00  ← ⚠️ O ORÇAMENTO MORTO ENTERRADO. Eram D 150.000
//                                        (50.000 de 2025 + 100.000 de 2026) acumulando.
//   6.2.2.1.1 crédito disponível 0,00  ← idem: era C 141.000 (a pendência de eada7b5)
//   6.2.1.1.0 receita a realizar 0,00
//   VPA                          0,00  ← apurada (era C 10.000, ressuscitada todo janeiro)
//   VPD                          0,00
//   FORNECEDOR             C  9.000,00 ← 3.000 (2025) + 6.000 (2026): o RP VIVO, que
//                                        ATRAVESSA — é o que sobrevive ao ano, por direito.
//   RESULTADOS (PL)        C  1.000,00 ← o acumulado dos dois exercícios (acima)
//
// ═══ t7 — A "AI", E POR QUE ELA PARTE A CONTA EM DUAS LINHAS ═══
// Em janeiro/2027 a conta FORNECEDOR é debitada por DOIS pagamentos de RP: um de um RP
// inscrito em 2025 e outro de um inscrito em 2026. O `period_change` dela se parte:
//
//   FORNECEDOR  period_change  D 3.000,00  AI=2025   (ND 339039, FR 500, FUNCIONAL 12361)
//   FORNECEDOR  period_change  D 6.000,00  AI=2026   (idem)
//   Σ = D 9.000,00  ==  o saldo bruto da conta no período  ✓ (a M4 prova)
//
// E o `beginning` dela (C 9.000) NÃO tem AI: ele vem das LIQUIDAÇÕES de 2025 e 2026, que
// são fatos do exercício corrente delas — não são movimento de RP. É o achado do passo
// 0(b): a INSCRIÇÃO não tem lançamento; a AI nasce quando o RP se MOVE.

const FICHA_2025 = "ficha-2025";

/** Os destinos na virada — a tabela-parâmetro do M08. Justificativas no m08. */
async function semearDestinosDaVirada(): Promise<void> {
  const ENCERRA = [
    DOTACAO_INICIAL, "5.2.2.1.2.00.00", C_DISPONIVEL, "6.2.2.1.2.00.00",
    C_EMPENHADO, C_LIQUIDADO, C_PAGO, R_A_REALIZAR, R_REALIZADA,
  ];
  for (const codigo of ENCERRA) {
    const conta = await prisma.contaPcasp.findUnique({
      where: { codigo },
      select: { id: true },
    });
    if (conta === null) continue;
    await prisma.contaNaVirada.create({
      data: {
        contaId: conta.id,
        destino: "ENCERRA",
        justificativa:
          "O orçamento é ANUAL (CF art. 165); o crédito não empenhado caduca em 31/12 " +
          "(CF art. 167, II). Ver as justificativas conta a conta no M08.",
        criadoPor: POR,
      },
    });
  }
}

/** Encerra o exercício, apura o resultado e enterra os controles. A virada inteira. */
async function virar(ano: number): Promise<void> {
  await encerrarExercicioComRestos(prisma, { ano, encerradoPor: POR });
  const ex = await prisma.exercicio.findUniqueOrThrow({
    where: { ano },
    select: { id: true },
  });
  await apurarResultadoDoExercicio(prisma, { exercicioId: ex.id, criadoPor: POR });
  await encerrarControlesOrcamentarios(prisma, { exercicioId: ex.id, criadoPor: POR });
}

const R_PAGAMENTO_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: FORNECEDOR,
  disponibilidade: CAIXA,
});

/** O cenário de três exercícios do cabeçalho. */
async function tresExercicios(): Promise<void> {
  await semearDestinosDaVirada();

  // ── 2025 ──
  await criarFichaDeTeste(prisma, {
    id: FICHA_2025, exercicio: 2025, numero: 9, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "50000.00",
  });
  const e25 = await empenhar(
    {
      fichaId: FICHA_2025, numero: "NE-25", tipo: "ORDINARIO", valor: "3000.00",
      data: new Date("2025-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "serviços de 2025", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await liquidar(
    {
      empenhoId: e25.empenhoId, numero: "NL-25", valor: "3000.00",
      data: new Date("2025-04-01T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "medição de 2025", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  await virar(2025); // -> RP PROCESSADO 3.000, inscrito em 2025

  // ── 2026: arrecada e gasta, mas NÃO paga (o `julhoDe2026` paga; aqui não) ──
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500", valor: "10000.00",
      dataArrecadacao: new Date("2026-07-10T12:00:00Z"),
      numeroReceita: "GUIA-1", criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  const e26 = await empenhar(
    {
      fichaId: FICHA, numero: "NE-26", tipo: "ORDINARIO", valor: "6000.00",
      data: new Date("2026-07-15T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "serviços de 2026", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await liquidar(
    {
      empenhoId: e26.empenhoId, numero: "NL-26", valor: "6000.00",
      data: new Date("2026-07-20T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "medição de 2026", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  await virar(2026); // -> RP PROCESSADO 6.000, inscrito em 2026
}

/** Paga, em janeiro de 2027, os DOIS restos a pagar — o de 2025 e o de 2026. */
async function pagarOsDoisRestosEm2027(): Promise<void> {
  await abrirExercicio(prisma, { ano: 2027, criadoPor: POR }).catch(() => null);

  const liquidacoes = await prisma.liquidacao.findMany({
    select: { id: true, numero: true },
    orderBy: { numero: "asc" },
  });
  const liq = (numero: string): string =>
    liquidacoes.find((l) => l.numero === numero)!.id;

  await pagarRestosAPagar(
    prisma,
    {
      liquidacaoId: liq("NL-25"), numero: "NP-RP-25", valor: "3000.00",
      data: new Date("2027-01-20T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pagamento do RP de 2025", criadoPor: POR,
    },
    R_PAGAMENTO_RP
  );
  await pagarRestosAPagar(
    prisma,
    {
      liquidacaoId: liq("NL-26"), numero: "NP-RP-26", valor: "6000.00",
      data: new Date("2027-01-20T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pagamento do RP de 2026", criadoPor: POR,
    },
    R_PAGAMENTO_RP
  );
}

describe("M14 — a virada do exercício e a IC AI (bloco 3)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t5 — O ORÇAMENTO MORTO, ENTERRADO. A pendência de eada7b5, com teste.
  it("t5: o beginning de JANEIRO/2027 não traz orçamento morto — e a M5 costura os anos", async () => {
    await tresExercicios();

    const jan = await gerarMsc(prisma, "2027-01", "AGREGADA");

    // ⚠️ O CORAÇÃO DO BLOCO: as contas de controle abrem o ano em ZERO. Antes deste
    // commit elas traziam 150.000 de dotação e 140.000 de crédito disponível de dois
    // exercícios mortos — e o `beginning` de janeiro publicava isso à União.
    //
    // ⚠️ E ELAS TÊM **DUAS** LINHAS, que somam zero — a mesma prova viva do Record
    // `DIMENSAO_DA_NATUREZA` que o t3 já mostrava na VPA: uma linha é a DOTAÇÃO (D
    // 150.000, COM as dimensões da ficha — fonte, natureza, funcional) e a outra é o
    // ENCERRAMENTO (C 150.000, SEM dimensão nenhuma, por design). O saldo é a soma delas.
    for (const conta of [DOTACAO_INICIAL, C_DISPONIVEL, C_EMPENHADO, C_LIQUIDADO, R_A_REALIZAR, R_REALIZADA]) {
      expect(liquido(jan.linhas, conta, "beginning_balance"), `conta ${conta}`).toBe(0);
    }

    const dot = linhasDe(jan.linhas, DOTACAO_INICIAL, "beginning_balance");
    expect(dot).toHaveLength(2);
    const daDotacao = dot.find((l) => l.icFR === "500")!;
    expect(daDotacao).toMatchObject({ naturezaValor: "D", valor: "150000.00", icND: "339039" });
    const doEnterro = dot.find((l) => l.icFR === null)!;
    expect(doEnterro).toMatchObject({ naturezaValor: "C", valor: "150000.00", icND: null });

    // as VP também abrem zeradas (a apuração as levou ao PL) — o mesmo bug, classe 3/4
    expect(liquido(jan.linhas, VPA, "beginning_balance")).toBe(0);
    expect(liquido(jan.linhas, VPD, "beginning_balance")).toBe(0);

    // ⚠️ E O QUE **DEVE** ATRAVESSAR, ATRAVESSA. O RP é a obrigação já assumida: ela
    // sobrevive ao ano por direito (Lei 4.320/64, art. 36). 4.000 (2025) + 6.000 (2026).
    expect(celula(jan.linhas, FORNECEDOR, "beginning_balance")).toEqual({ nat: "C", valor: "9000.00" });
    // e o resultado acumulado: −3.000 (déficit de 2025) + 4.000 (superávit de 2026)
    expect(celula(jan.linhas, RESULTADOS, "beginning_balance")).toEqual({ nat: "C", valor: "1000.00" });

    // ═══ M5 — A COSTURA ENTRE OS ANOS ═══
    // O ano novo ABRE exatamente onde o anterior FECHOU (depois do encerramento).
    const enc2026 = await gerarMsc(prisma, "2026-12", "ENCERRAMENTO");
    expect(() => conferirM5(jan.linhas, enc2026.linhas)).not.toThrow();

    // ...e ela ACUSA quando a costura arrebenta. A mutação é o PRÓPRIO BUG que este
    // bloco matou: apagar a perna do ENTERRO (a linha sem dimensão, C 150.000) do
    // beginning de janeiro. Sem ela, a dotação dos dois anos mortos volta a abrir o
    // exercício — que é exatamente o que o filtro antigo fazia.
    const arrebentada = jan.linhas.filter(
      (l) =>
        !(
          l.conta === DOTACAO_INICIAL &&
          l.tipoValor === "beginning_balance" &&
          l.icFR === null
        )
    );
    expect(liquido(arrebentada, DOTACAO_INICIAL, "beginning_balance")).toBe(150000);
    expect(() => conferirM5(arrebentada, enc2026.linhas)).toThrow(
      /M5 NÃO FECHA na conta 5\.2\.2\.1\.1\.00\.00/
    );
    expect(() => conferirM5(arrebentada, enc2026.linhas)).toThrow(
      /orçamento morto atravessando a virada/
    );
  });

  // t6 — A MSC DE ENCERRAMENTO DE 2026: os DOIS encerramentos no period_change.
  it("t6: o period_change da MSC de encerramento leva o encerramento dos controles E a apuração", async () => {
    await tresExercicios();

    const dez = await gerarMsc(prisma, "2026-12", "AGREGADA");
    const enc = await gerarMsc(prisma, "2026-12", "ENCERRAMENTO");

    // ── A AGREGADA DE DEZEMBRO ignora o encerramento DE 2026 (mas já engoliu o de 2025,
    //    que é história): a dotação de 2026 está lá, viva, 100.000. A de 2025 NÃO.
    //
    // ⚠️ ESTE É O LITERAL QUE PROVA O CORTE `excluirDesde`. Se o filtro fosse o antigo
    // ("excluir ENCERRAMENTO, sempre"), o ending de dezembro traria a dotação das DUAS
    // LOAs (150.000) — porque o enterro de 2025 também teria sido descartado. Ele traz
    // 100.000: o de 2025 já é história e foi somado; o de 2026 ainda não aconteceu.
    expect(liquido(dez.linhas, DOTACAO_INICIAL, "ending_balance")).toBe(100000);
    expect(liquido(dez.linhas, C_DISPONIVEL, "ending_balance")).toBe(-94000); // C 94.000
    expect(celula(dez.linhas, VPA, "ending_balance")).toEqual({ nat: "C", valor: "10000.00" });

    // ── A DE ENCERRAMENTO parte DALI (M3) e aplica os DOIS encerramentos ──
    expect(() => conferirM3(enc.linhas, dez.linhas)).not.toThrow();

    // O `period_change` da conta de dotação é SÓ o encerramento dos controles: C 100.000.
    expect(liquido(enc.linhas, DOTACAO_INICIAL, "period_change")).toBe(-100000);
    expect(liquido(enc.linhas, DOTACAO_INICIAL, "ending_balance")).toBe(0);
    // ...e o do crédito disponível, D 94.000 (o que zera o C 94.000 dele).
    expect(liquido(enc.linhas, C_DISPONIVEL, "period_change")).toBe(94000);
    expect(liquido(enc.linhas, C_DISPONIVEL, "ending_balance")).toBe(0);

    // E A APURAÇÃO ESTÁ NO MESMO `period_change` — os dois encerramentos, lado a lado.
    // VPA: D 10.000 (a apuração a zera). PL: C 6.000 (o superávit de 2026).
    expect(liquido(enc.linhas, VPA, "period_change")).toBe(10000);
    expect(liquido(enc.linhas, VPA, "ending_balance")).toBe(0);
    expect(liquido(enc.linhas, RESULTADOS, "period_change")).toBe(-4000);
    // o PL FECHA em C 1.000: o déficit de 2025 (D 3.000) já estava no beginning.
    expect(celula(enc.linhas, RESULTADOS, "beginning_balance")).toEqual({ nat: "D", valor: "3000.00" });
    expect(celula(enc.linhas, RESULTADOS, "ending_balance")).toEqual({ nat: "C", valor: "1000.00" });

    // ⚠️ ZERO PENDÊNCIA: nem a apuração nem o encerramento dos controles têm fonte de
    // recurso — e isso está CERTO (`DIMENSAO_DA_NATUREZA`). Se virassem pendência, o
    // relatório gritaria por algo que não tem conserto.
    expect(enc.pendencias).toEqual([]);
    expect(dez.pendencias).toEqual([]);
  });

  // t7 — A IC "AI": dois exercícios de inscrição na MESMA conta, Σ == o saldo.
  it("t7: dois RP de exercícios diferentes na mesma conta -> duas linhas, AIs distintos, Σ == saldo", async () => {
    await tresExercicios();
    await pagarOsDoisRestosEm2027();

    const jan = await gerarMsc(prisma, "2027-01", "AGREGADA");

    // ⚠️ A CONTA SE PARTE PELA AI — é esse o grão que a MSC pede: "esse RP é de que ano?".
    const pernas = linhasDe(jan.linhas, FORNECEDOR, "period_change");
    expect(pernas).toHaveLength(2);

    const de = (ai: string): LinhaMsc => pernas.find((l) => l.icAI === ai)!;
    expect(de("2025").naturezaValor).toBe("D");
    expect(de("2025").valor).toBe("3000.00");
    expect(de("2026").naturezaValor).toBe("D");
    expect(de("2026").valor).toBe("6000.00");

    // ...e as OUTRAS ICs continuam vindo da ficha do empenho que originou o RP — o resto
    // a pagar não reclassifica nada, ele só ATRAVESSA.
    expect(de("2025").icFR).toBe("500");
    expect(de("2025").icND).toBe("339039");
    expect(de("2025").icFUNCIONAL).toBe("12361");

    // ⚠️ Σ == O SALDO DA CONTA. A dimensão REPARTE o dinheiro; ela não o cria nem o some.
    // (a M4 já roda dentro do `gerarMsc` — aqui a conferimos à mão, com os literais)
    expect(liquido(jan.linhas, FORNECEDOR, "period_change")).toBe(9000);

    // ⚠️ E O `beginning` NÃO TEM AI — ele vem das LIQUIDAÇÕES de 2025/2026, que são fatos
    // do exercício corrente delas, não movimentos de RP. É o achado do passo 0(b): a
    // INSCRIÇÃO não tem lançamento contábil; a AI nasce quando o RP se MOVE.
    const abertura = linhasDe(jan.linhas, FORNECEDOR, "beginning_balance");
    expect(abertura).toHaveLength(1);
    expect(abertura[0]!.icAI).toBeNull();
    expect(abertura[0]!.valor).toBe("9000.00");

    // O RP pago: o FORNECEDOR fecha janeiro ZERADO.
    expect(liquido(jan.linhas, FORNECEDOR, "ending_balance")).toBe(0);

    // Nenhuma pendência: o pagamento de RP resolve fonte, natureza, funcional E ano.
    expect(jan.pendencias).toEqual([]);
  });
});
