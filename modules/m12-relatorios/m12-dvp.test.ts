import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import {
  alienarBem,
  atualizarCompetencia,
  estornarMovimentoPatrimonial,
  registrarEntradaAvulsa,
} from "../m10-patrimonial/patrimonio.js";
import { balancoPatrimonial } from "./balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "./cadastro-linhas.js";
import { demonstracaoVariacoesPatrimoniais } from "./dvp.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ANEXO 15 — DVP (art. 104 da Lei 4.320/64).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ CENÁRIO DO t1 (exercício de 2026) ═══
 *   10/01  arrecada 8.000        D caixa      / C VPA 4.1 (impostos)
 *   10/02  liquida  2.000        D VPD 3.3.2  / C fornecedores   (despesa corrente)
 *   05/03  incorpora 6.000       D imob       / C VPA 4.6 (incorporação)
 *   04/26  deprecia   500        D VPD 3.3.3  / C depreciação acumulada
 *   05/26  deprecia   500        idem
 *   10/06  aliena: bruto 3.000, acumulada 500, venda 3.000
 *            baixa bruto         D VPD 3.6    / C imob            3.000
 *            baixa acumulada     D dep.acum   / C VPD 3.6           500
 *            GANHO = 3.000 − (3.000 − 500) = 500
 *                                D créditos   / C VPA 4.6 (ganho)   500
 *   01/07  ESTORNA a depreciação de maio (valor REAL: 500)
 *                                D dep.acum   / C VPD 3.3.3         500
 *
 *   VPA
 *     Impostos, Taxas e Contribuições de Melhoria        =  8.000,00
 *     Valorização e Ganhos com Ativos    6.000 + 500     =  6.500,00
 *     TOTAL VPA                                          = 14.500,00
 *   VPD
 *     Uso de Bens, Serviços e Consumo de Capital Fixo
 *              2.000 + 500 + 500 − 500 (estorno)         =  2.500,00
 *     Desvalorização e Perda de Ativos   3.000 − 500     =  2.500,00
 *     TOTAL VPD                                          =  5.000,00
 *
 *   RESULTADO PATRIMONIAL = 14.500 − 5.000               =  9.500,00
 *
 * ═══ D3 — a amarração cruzada ═══
 *   BALANÇO em 31/12/2026:
 *     ATIVO  caixa 8.000 + imobilizado (6.000 − 3.000) + créditos 500 = 11.500
 *     PASSIVO fornecedores                                            =  2.000
 *     PL (resultado)                                                  =  9.500
 *     11.500 == 2.000 + 9.500 ✓
 *   BALANÇO na véspera de 01/01/2026: tudo zero -> resultado 0,00
 *   D3:  9.500 − 0  ==  9.500  ✓  (o mesmo número, por dois caminhos)
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-corrente";
const CLASSE = "cl-veiculos";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const CREDITOS = "1.1.3.1.1.00.00";
const IMOBILIZADO = "1.2.3.1.1.01.00";
const DEP_ACUMULADA = "1.2.3.8.1.01.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD_USO = "3.3.2.1.1.01.00"; // uso de bens e serviços (liquidação)
const VPD_DEPREC = "3.3.3.1.1.00.00"; // consumo de capital fixo (depreciação)
const VPD_BAIXA = "3.6.1.1.1.00.00"; // desvalorização e perda de ativos
const VPD_ORFA = "3.8.1.1.1.00.00"; // classe 3 SEM linha mapeada (t3)
const VPA_IMPOSTOS = "4.1.1.2.1.01.00";
const VPA_INCORP = "4.6.1.1.1.00.00"; // valorização e ganhos com ativos
const VPA_GANHO = "4.6.2.1.1.00.00"; // ganho na alienação
const VPA_ORFA = "4.8.1.1.1.00.00"; // classe 4 SEM linha mapeada (t3)
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

// O `indicadorSuperavit` (art. 105) é EXIGIDO de toda conta de classe 1/2 com
// saldo — a DVP amarra contra o Balanço (D3), e o Balanço monta o quadro do art.
// 105. Créditos a curto prazo são realizáveis sem autorização orçamentária (F);
// o imobilizado e a depreciação que o retifica dependem de autorização
// legislativa para serem mobilizados (P).
const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-cred", codigo: CREDITOS, nome: "Créditos por alienação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  { id: "c-dep-acum", codigo: DEP_ACUMULADA, nome: "Depreciação acumulada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "P" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-vpd-uso", codigo: VPD_USO, nome: "VPD uso de bens", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-dep", codigo: VPD_DEPREC, nome: "VPD depreciação", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-baixa", codigo: VPD_BAIXA, nome: "VPD baixa de ativos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-orfa", codigo: VPD_ORFA, nome: "VPD sem linha", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-imp", codigo: VPA_IMPOSTOS, nome: "VPA impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-inc", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-ganho", codigo: VPA_GANHO, nome: "VPA ganho com alienação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-orfa", codigo: VPA_ORFA, nome: "VPA sem linha", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD_USO, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA_IMPOSTOS,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});

const INICIO = new Date("2026-01-01T00:00:00Z");
const FIM = new Date("2026-12-31T23:59:59Z");
let deps: M05Deps;

/** As linhas do ANEXO 14 — o mínimo para o D3 poder rodar o balanço. */
async function semearAnexo14(): Promise<void> {
  const linhas = [
    { codigoLinha: "AC.CAIXA", rotulo: "Caixa e Equivalentes de Caixa", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1.1"] },
    { codigoLinha: "AC.CREDITOS", rotulo: "Créditos a Curto Prazo", grupo: "ATIVO_CIRCULANTE", ordem: 2, prefixos: ["1.1.3"] },
    { codigoLinha: "ANC.IMOB", rotulo: "Imobilizado", grupo: "ATIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["1.2.3"] },
    { codigoLinha: "PC.FORN", rotulo: "Fornecedores e Contas a Pagar a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 1, prefixos: ["2.1"] },
    { codigoLinha: "PNC.OBRIG", rotulo: "Obrigações a Longo Prazo", grupo: "PASSIVO_NAO_CIRCULANTE", ordem: 1, prefixos: ["2.2"] },
    { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social e Capital Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3"] },
  ] as const;
  for (const l of linhas) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
    });
  }
}

/** As linhas do ANEXO 15 — rótulos do MCASP. */
async function semearAnexo15(): Promise<void> {
  const vpa = [
    { codigoLinha: "VPA.1", rotulo: "Impostos, Taxas e Contribuições de Melhoria", prefixos: ["4.1"] },
    { codigoLinha: "VPA.2", rotulo: "Contribuições", prefixos: ["4.2"] },
    { codigoLinha: "VPA.3", rotulo: "Exploração e Venda de Bens, Serviços e Direitos", prefixos: ["4.3"] },
    { codigoLinha: "VPA.4", rotulo: "Variações Patrimoniais Aumentativas Financeiras", prefixos: ["4.4"] },
    { codigoLinha: "VPA.5", rotulo: "Transferências e Delegações Recebidas", prefixos: ["4.5"] },
    { codigoLinha: "VPA.6", rotulo: "Valorização e Ganhos com Ativos e Desincorporação de Passivos", prefixos: ["4.6"] },
    { codigoLinha: "VPA.9", rotulo: "Outras Variações Patrimoniais Aumentativas", prefixos: ["4.9"] },
  ];
  // ⚠️ Estes são os RÓTULOS de LINHA do MCASP (Anexo 15) — agrupam contas por prefixo (3.x). NÃO são
  // o nome da conta sintética 3.0.0.0.0, que segue o oficial "Variação Patrimonial Diminutiva"
  // (Pcasp_2025.xlsx, cód. 300000000, adotado no seed pcasp.ts). O DVP não exibe o nome dessa conta —
  // logo o rótulo "…Diminutivas Financeiras" abaixo é independente e permanece como o MCASP define.
  const vpd = [
    { codigoLinha: "VPD.1", rotulo: "Pessoal e Encargos", prefixos: ["3.1"] },
    { codigoLinha: "VPD.2", rotulo: "Benefícios Previdenciários e Assistenciais", prefixos: ["3.2"] },
    { codigoLinha: "VPD.3", rotulo: "Uso de Bens, Serviços e Consumo de Capital Fixo", prefixos: ["3.3"] },
    { codigoLinha: "VPD.4", rotulo: "Variações Patrimoniais Diminutivas Financeiras", prefixos: ["3.4"] },
    { codigoLinha: "VPD.5", rotulo: "Transferências e Delegações Concedidas", prefixos: ["3.5"] },
    { codigoLinha: "VPD.6", rotulo: "Desvalorização e Perda de Ativos e Incorporação de Passivos", prefixos: ["3.6"] },
    { codigoLinha: "VPD.7", rotulo: "Tributárias", prefixos: ["3.7"] },
    { codigoLinha: "VPD.9", rotulo: "Outras Variações Patrimoniais Diminutivas", prefixos: ["3.9"] },
  ];

  let ordem = 1;
  for (const l of vpa) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_15", grupo: "VPA", ordem: ordem++, criadoPor: POR, ...l,
    });
  }
  ordem = 1;
  for (const l of vpd) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_15", grupo: "VPD", ordem: ordem++, criadoPor: POR, ...l,
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
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços - PJ",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });

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
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa-inc", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd-baixa", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "BAIXA_DE_ATUALIZACAO_ACUMULADA", contaDebitoId: "c-dep-acum", contaCreditoId: "c-vpd-baixa", criadoPor: POR },
    ],
  });
  await prisma.roteiroResultadoAlienacao.create({
    data: { chave: "GANHO_ALIENACAO", contaDebitoId: "c-cred", contaCreditoId: "c-vpa-ganho", criadoPor: POR },
  });

  await semearAnexo14();
  await semearAnexo15();
}

/** Um lançamento avulso, para os testes de corte e de órfã. */
async function lancar(
  debito: string,
  credito: string,
  valor: string,
  data: string,
  numero: string
): Promise<void> {
  await prisma.lancamentoContabil.create({
    data: {
      numeroControle: numero,
      dataTransacao: new Date(data),
      historico: numero,
      origemTipo: "TESTE",
      criadoPor: POR,
      partidas: {
        create: [
          { contaId: debito, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
          { contaId: credito, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
        ],
      },
    },
  });
}

const linhaDe = (
  d: Awaited<ReturnType<typeof demonstracaoVariacoesPatrimoniais>>,
  codigo: string
) => d.quadros.flatMap((q) => q.linhas).find((l) => l.codigoLinha === codigo)!;

describe("Anexo 15 — DVP", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — TESTE DE OURO
  it("t1: BP ↔ DVP integrados; cada linha por literal; D3 fecha", async () => {
    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor: "8000.00",
        dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: "GUIA-1",
        criadoPor: POR,
      },
      R_ARRECADACAO,
      criarM04Deps(prisma)
    );

    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "2000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "2000.00",
        data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );

    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "6000.00",
      dataMovimento: new Date("2026-03-05T12:00:00Z"),
      motivo: "Incorporação do veículo ao patrimônio.", criadoPor: POR,
    });

    // base 6.000 / 12 = 500,00 por competência
    await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR });
    const maio = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-05", criadoPor: POR });
    expect(maio.valorDaParcela.toFixed(2)).toBe("500.00");

    // aliena: 3.000 − 500 = 2.500 de líquido; venda 3.000 -> ganho 500
    const alien = await alienarBem(prisma, {
      classeDeBensId: CLASSE, valorBrutoBaixado: "3000.00", acumuladaBaixada: "500.00",
      valorVenda: "3000.00", dataMovimento: new Date("2026-06-10T12:00:00Z"),
      motivo: "Veículo alienado em leilão público.", criadoPor: POR,
    });
    expect(alien.ganhoPerda.toFixed(2)).toBe("500.00");

    // o ESTORNO com VALOR REAL (500), nunca zero estrutural
    await estornarMovimentoPatrimonial(prisma, {
      movimentoId: maio.movimentoId,
      dataMovimento: new Date("2026-07-01T12:00:00Z"),
      motivo: "Depreciação de maio lançada em duplicidade.", criadoPor: POR,
    });

    const d = await demonstracaoVariacoesPatrimoniais(prisma, INICIO, FIM);

    // ── VPA ──────────────────────────────────────────────────────────────
    expect(linhaDe(d, "VPA.1").rotulo).toBe("Impostos, Taxas e Contribuições de Melhoria");
    expect(linhaDe(d, "VPA.1").valor).toBe("8000.00");
    // 6.000 (incorporação) + 500 (ganho na alienação)
    expect(linhaDe(d, "VPA.6").valor).toBe("6500.00");
    expect(linhaDe(d, "VPA.9").valor).toBe("0.00"); // sem movimento
    expect(d.totalVPA).toBe("14500.00");

    // ── VPD ──────────────────────────────────────────────────────────────
    // 2.000 (liquidação) + 500 + 500 (depreciações) − 500 (ESTORNO, valor real)
    expect(linhaDe(d, "VPD.3").valor).toBe("2500.00");
    // 3.000 (baixa do bruto) − 500 (baixa da acumulada credita o VPD)
    expect(linhaDe(d, "VPD.6").valor).toBe("2500.00");
    expect(d.totalVPD).toBe("5000.00");

    // ── RESULTADO ────────────────────────────────────────────────────────
    // 14.500 − 5.000
    expect(d.resultadoPatrimonial).toBe("9500.00");

    // ── D3, conferida À MÃO contra o Balanço ─────────────────────────────
    const bp = await balancoPatrimonial(prisma, FIM);
    expect(bp.totalAtivo).toBe("11500.00"); // 8.000 + 3.000 + 500
    expect(bp.totalPassivo).toBe("2000.00");
    expect(bp.resultadoDoExercicio).toBe("9500.00"); // o MESMO número da DVP
    expect(bp.totalPatrimonioLiquido).toBe("9500.00");
    expect(11500).toBe(2000 + 9500);

    const bpAntes = await balancoPatrimonial(prisma, new Date(INICIO.getTime() - 1));
    expect(bpAntes.resultadoDoExercicio).toBe("0.00");
  });

  // t2
  it("t2: o período recorta — o que veio antes e o que veio depois não entram", async () => {
    await lancar("c-caixa", "c-vpa-imp", "1000.00", "2025-12-20T12:00:00Z", "ANTES");
    await lancar("c-caixa", "c-vpa-imp", "8000.00", "2026-05-10T12:00:00Z", "DENTRO");
    await lancar("c-caixa", "c-vpa-imp", "2000.00", "2027-02-10T12:00:00Z", "DEPOIS");

    // só o de dentro
    const de2026 = await demonstracaoVariacoesPatrimoniais(prisma, INICIO, FIM);
    expect(linhaDe(de2026, "VPA.1").valor).toBe("8000.00");
    expect(de2026.resultadoPatrimonial).toBe("8000.00");

    // a janela larga pega os três: 1.000 + 8.000 + 2.000
    const larga = await demonstracaoVariacoesPatrimoniais(
      prisma,
      new Date("2025-12-01T00:00:00Z"),
      new Date("2027-12-31T23:59:59Z")
    );
    expect(linhaDe(larga, "VPA.1").valor).toBe("11000.00");
    expect(larga.resultadoPatrimonial).toBe("11000.00");
  });

  // t3
  it("t3: CONTA ÓRFÃ de classe 4 derruba a DVP, nomeando conta e valor", async () => {
    await lancar("c-caixa", "c-vpa-imp", "8000.00", "2026-05-10T12:00:00Z", "OK");
    // uma VPA que NENHUMA linha do Anexo 15 mapeia (4.8)
    await lancar("c-caixa", "c-vpa-orfa", "1234.56", "2026-06-10T12:00:00Z", "ORFA");

    let erro: unknown;
    try {
      await demonstracaoVariacoesPatrimoniais(prisma, INICIO, FIM);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> CONTA ÓRFÃ NA DVP (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CONTA ÓRFÃ na DVP/);
    expect(msg).toMatch(/4\.8\.1\.1\.1\.00\.00/);
    expect(msg).toMatch(/1234\.56/);
  });

  // t4
  it("t4: o ESTORNO reduz a linha certa, com valor REAL (nunca zero estrutural)", async () => {
    await registrarEntradaAvulsa(prisma, {
      tipo: "AVALIACAO_INICIAL", classeDeBensId: CLASSE, valor: "6000.00",
      dataMovimento: new Date("2026-03-05T12:00:00Z"),
      motivo: "Incorporação do veículo ao patrimônio.", criadoPor: POR,
    });
    await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR });
    const maio = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-05", criadoPor: POR });

    // SEM estorno: 500 + 500 = 1.000
    const antes = await demonstracaoVariacoesPatrimoniais(prisma, INICIO, FIM);
    expect(linhaDe(antes, "VPD.3").valor).toBe("1000.00");

    await estornarMovimentoPatrimonial(prisma, {
      movimentoId: maio.movimentoId,
      dataMovimento: new Date("2026-07-01T12:00:00Z"),
      motivo: "Depreciação de maio lançada em duplicidade.", criadoPor: POR,
    });

    // COM estorno: 1.000 − 500 = 500 (nem 1.000, nem 0 — o estorno tem valor real)
    const depois = await demonstracaoVariacoesPatrimoniais(prisma, INICIO, FIM);
    expect(linhaDe(depois, "VPD.3").valor).toBe("500.00");
    expect(depois.totalVPD).toBe("500.00");
    // VPA: só a incorporação
    expect(depois.totalVPA).toBe("6000.00");
    expect(depois.resultadoPatrimonial).toBe("5500.00");
  });

  it("período invertido: fail-closed", async () => {
    await expect(
      demonstracaoVariacoesPatrimoniais(prisma, FIM, INICIO)
    ).rejects.toThrow(/Período invertido/);
  });
});
