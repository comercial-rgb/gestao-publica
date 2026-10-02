import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearSagresPoc } from "../../prisma/seed/sagres-poc.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_LIQUIDADO_A_PAGAR,
  CONTA_CREDITO_LIQUIDADO_PAGO,
  CONTA_FORNECEDORES_A_PAGAR,
  CONTA_RECEITA_A_REALIZAR,
  CONTA_RECEITA_REALIZADA,
  CONTA_VPD,
} from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComAlmoxarifado } from "../m10-patrimonial/adapter-m05-almox.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { previaDaFolha, previaDeTributos } from "./dominio.js";
import {
  confirmarImportacaoFolha,
  confirmarImportacaoTributos,
  listarImportacoes,
  ArquivoJaImportadoError,
  ImportacaoInvalidaError,
} from "./servico.js";

/**
 * M20 — o IMPORTADOR ponta a ponta (TR 7.10-7.11). O arquivo entra, a prévia valida, a confirmação
 * gera os fatos PELOS SERVIÇOS REAIS (M05 empenho/liquidação/pagamento + M07 retenção; M04
 * arrecadação), e reimportar o MESMO arquivo é RECUSA NOMEADA.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m05@cg.pb.gov.br"; // identidade de fixture (o seed não cria usuários — t5)
// ENT05 ITEM 3 — repontada: a antiga era a variante INTRA OFSS.
const CONTA_BANCOS = "1.1.1.1.1.19.00";
/**
 * ⚠️ AS CONTAS VÊM DA CONSTANTE, NÃO DE LITERAL (corrigido em V11 V7.1). Este arquivo semeia
 * pelo `semearSagresPoc` e depois lançava contra `2.1.3.1.1.00.00` escrita à mão. A V6.3
 * repontou `CONTA_FORNECEDORES_A_PAGAR` para `2.1.3.1.1.01.01` FORNECEDORES NÃO PARCELADOS A
 * PAGAR — e o seed passou a criar só a nova. Os dois testes deste arquivo caíram desde
 * `e774d63` com "Conta(s) inexistente(s) no plano PCASP", e eu não os tinha visto.
 */
const ROTEIROS = {
  empenho: roteiroEmpenho({ creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR }),
  liquidacao: roteiroLiquidacao({ variacaoDiminutiva: CONTA_VPD, obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR, creditoLiquidado: CONTA_CREDITO_LIQUIDADO_A_PAGAR }),
  pagamento: roteiroPagamento({ obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, disponibilidade: CONTA_BANCOS, creditoLiquidado: CONTA_CREDITO_LIQUIDADO_A_PAGAR, creditoPago: CONTA_CREDITO_LIQUIDADO_PAGO }),
};
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CONTA_BANCOS, variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: CONTA_RECEITA_A_REALIZAR, receitaRealizada: CONTA_RECEITA_REALIZADA,
});

const fixture = (nome: string): string =>
  readFileSync(fileURLToPath(new URL(`../../docs/poc-fixtures/${nome}`, import.meta.url)), "utf8");

const paramsFolha = (conteudo: string, nome = "folha-poc-2026-11.csv") => ({
  nomeArquivo: nome, conteudo, exercicio: 2026,
  dataEmpenho: new Date(Date.UTC(2026, 10, 5, 12)), dataLiquidacao: new Date(Date.UTC(2026, 10, 6, 12)), dataPagamento: new Date(Date.UTC(2026, 10, 10, 12)),
  contaBancaria: "CC-POC-A", contaDisponibilidade: CONTA_BANCOS,
  credorCpfCnpj: "12345678000195", criadoPor: POR,
});

describe("M20 — importador de folha e tributos", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("PRÉVIA da folha: 5 servidores, líquido = bruto − consignações, confirmável", () => {
    const p = previaDaFolha("folha.csv", fixture("folha-poc-2026-11.csv"));
    expect(p.violacoes).toEqual([]);
    expect(p.confirmavel).toBe(true);
    expect(p.linhas).toHaveLength(5);
    expect(p.totalBruto).toBe("13500.00"); // 3000+2500+4000+1800+2200
    const primeira = p.linhas[0]!;
    expect(primeira.valorBruto).toBe("3000.00");
    expect(primeira.consignacoes).toHaveLength(2); // INSS + ISS
    expect(primeira.valorLiquido).toBe("2610.00"); // 3000 − 330 − 60
  });

  it("PRÉVIA fail-closed: arquivo inválido NOMEIA linha e campo, e não é confirmável", () => {
    const ruim = "matricula;nome;ficha;fonte;bruto;inss;iss\n;SEM MATRICULA;abc;50;xyz;0;0";
    const p = previaDaFolha("ruim.csv", ruim);
    expect(p.confirmavel).toBe(false);
    expect(p.violacoes.length).toBeGreaterThanOrEqual(4);
    const campos = p.violacoes.map((v) => v.campo);
    expect(campos).toContain("matricula");
    expect(campos).toContain("ficha");
    expect(campos).toContain("fonte");
    expect(campos).toContain("bruto");
    expect(p.violacoes.every((v) => v.linha === 2)).toBe(true);
  });

  it("CONFIRMA a folha pelos serviços reais: 5 empenhos+liquidações+pagamentos e 10 retenções", async () => {
    const antesEmp = await prisma.empenho.count();
    const antesRet = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "INGRESSO" } });

    const r = await confirmarImportacaoFolha(prisma, paramsFolha(fixture("folha-poc-2026-11.csv")), ROTEIROS, criarM05DepsComAlmoxarifado(prisma));

    expect(r.linhas).toBe(5);
    expect(await prisma.empenho.count()).toBe(antesEmp + 5);
    expect(await prisma.liquidacao.count()).toBeGreaterThanOrEqual(5);
    // 2 consignações por servidor → 10 ingressos extra novos, cada um VINCULADO ao seu pagamento (5.25).
    expect(await prisma.movimentoExtraorcamentario.count({ where: { tipo: "INGRESSO" } })).toBe(antesRet + 10);
    const comVinculo = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "INGRESSO", pagamentoId: { not: null } } });
    expect(comVinculo).toBeGreaterThanOrEqual(10);

    // A trilha: a importação fica registrada com correlation e hash.
    const hist = await listarImportacoes(prisma);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.tipo).toBe("FOLHA");
    expect(hist[0]!.linhas).toBe(5);
  });

  /**
   * V27 — a conta da consignação vem do CADASTRO. O importador tinha um mapa fixo (ISS → Garantias,
   * INSS → a sintética); com a conta redefinida, o pagamento recusava a folha ou, antes da redefinição,
   * deixava o ISS em Garantias. Fixture N=2: dois tipos, dois destinos.
   */
  it("a conta de cada consignação é a da decisão vigente do tipo (ISS e INSS redefinidos)", async () => {
    const contas = [
      { codigo: "2.1.8.8.1.01.08", nome: "ISS" },
      { codigo: "2.1.8.8.1.01.02", nome: "CONTRIBUIÇÃO AO RGPS" },
    ];
    for (const c of contas) {
      await prisma.contaPcasp.upsert({ where: { codigo: c.codigo }, update: {}, create: { ...c, naturezaSaldo: "CREDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" } });
    }
    for (const [tipo, conta] of [["ISS", "2.1.8.8.1.01.08"], ["INSS", "2.1.8.8.1.01.02"]] as const) {
      const t = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: tipo } });
      const c = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: conta } });
      await prisma.decisaoDoTipoDeConsignacao.create({ data: { tipoId: t.id, ativo: true, contaPassivoId: c.id, fundamento: "PCASP do TCE-PB 2025, analítica do tributo", criadoPor: POR } });
    }

    await confirmarImportacaoFolha(prisma, paramsFolha(fixture("folha-poc-2026-11.csv")), ROTEIROS, criarM05DepsComAlmoxarifado(prisma));

    const credito = async (codigo: string): Promise<number> =>
      prisma.partidaContabil.count({ where: { tipo: "CREDITO", conta: { codigo }, lancamento: { origemTipo: "PAGAMENTO", historico: { startsWith: "Folha" } } } });
    expect(await credito("2.1.8.8.1.01.08")).toBe(5);
    expect(await credito("2.1.8.8.1.01.02")).toBe(5);
    expect(await credito("2.1.8.8.1.02.00")).toBe(0);
    expect(await credito("2.1.8.8.1.01.00")).toBe(0);
  });

  it("tipo de consignação desativado no cadastro: recusa nomeada antes de gravar qualquer fato", async () => {
    const t = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "ISS" } });
    await prisma.decisaoDoTipoDeConsignacao.create({ data: { tipoId: t.id, ativo: false, contaPassivoId: null, fundamento: "desativado para o teste da importação", criadoPor: POR } });
    const antes = await prisma.empenho.count();
    await expect(
      confirmarImportacaoFolha(prisma, paramsFolha(fixture("folha-poc-2026-11.csv")), ROTEIROS, criarM05DepsComAlmoxarifado(prisma))
    ).rejects.toThrow(/ISS está INATIVO/);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("IDEMPOTÊNCIA: reimportar o MESMO arquivo é recusa NOMEADA — nada duplica", async () => {
    const conteudo = fixture("folha-poc-2026-11.csv");
    await confirmarImportacaoFolha(prisma, paramsFolha(conteudo), ROTEIROS, criarM05DepsComAlmoxarifado(prisma));
    const depoisDaPrimeira = await prisma.empenho.count();

    await expect(
      confirmarImportacaoFolha(prisma, paramsFolha(conteudo), ROTEIROS, criarM05DepsComAlmoxarifado(prisma))
    ).rejects.toThrow(ArquivoJaImportadoError);

    expect(await prisma.empenho.count()).toBe(depoisDaPrimeira); // NADA duplicou
    expect(await listarImportacoes(prisma)).toHaveLength(1);
  });

  it("arquivo INVÁLIDO não é confirmável: recusa nomeada e nada grava", async () => {
    const antes = await prisma.empenho.count();
    const ruim = "matricula;nome;ficha;fonte;bruto;inss;iss\n;X;abc;50;xyz;0;0";
    await expect(
      confirmarImportacaoFolha(prisma, paramsFolha(ruim, "ruim.csv"), ROTEIROS, criarM05DepsComAlmoxarifado(prisma))
    ).rejects.toThrow(ImportacaoInvalidaError);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("TRIBUTOS: prévia + confirmação geram as guias pelos serviços reais; reimportar recusa", async () => {
    const conteudo = fixture("tributos-poc-2026-11.csv");
    const p = previaDeTributos("tributos.csv", conteudo);
    expect(p.confirmavel).toBe(true);
    expect(p.linhas).toHaveLength(3);
    expect(p.totalBruto).toBe("5230.50"); // 1500 + 2750,50 + 980

    const antes = await prisma.receitaArrecadada.count();
    const r = await confirmarImportacaoTributos(prisma, { nomeArquivo: "tributos-poc-2026-11.csv", conteudo, exercicio: 2026, criadoPor: POR }, R_ARRECADACAO, criarM04Deps(prisma));
    expect(r.linhas).toBe(3);
    expect(await prisma.receitaArrecadada.count()).toBe(antes + 3);

    await expect(
      confirmarImportacaoTributos(prisma, { nomeArquivo: "tributos-poc-2026-11.csv", conteudo, exercicio: 2026, criadoPor: POR }, R_ARRECADACAO, criarM04Deps(prisma))
    ).rejects.toThrow(ArquivoJaImportadoError);
    expect(await prisma.receitaArrecadada.count()).toBe(antes + 3); // não duplicou
  });
});
