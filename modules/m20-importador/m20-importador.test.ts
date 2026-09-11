import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearSagresPoc } from "../../prisma/seed/sagres-poc.js";
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
const ROTEIROS = {
  empenho: roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }),
  liquidacao: roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" }),
  pagamento: roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: CONTA_BANCOS, creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" }),
};
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CONTA_BANCOS, variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: "6.2.1.1.0.00.00", receitaRealizada: "6.2.1.2.0.00.00",
});
const CONTAS_CONSIG = { INSS: "2.1.8.8.1.01.00", ISS: "2.1.8.8.1.02.00" };

const fixture = (nome: string): string =>
  readFileSync(fileURLToPath(new URL(`../../docs/poc-fixtures/${nome}`, import.meta.url)), "utf8");

const paramsFolha = (conteudo: string, nome = "folha-poc-2026-11.csv") => ({
  nomeArquivo: nome, conteudo, exercicio: 2026,
  dataEmpenho: new Date(Date.UTC(2026, 10, 5, 12)), dataLiquidacao: new Date(Date.UTC(2026, 10, 6, 12)), dataPagamento: new Date(Date.UTC(2026, 10, 10, 12)),
  contaBancaria: "CC-POC-A", contaDisponibilidade: CONTA_BANCOS,
  contaConsignacaoPorTipo: CONTAS_CONSIG, credorCpfCnpj: "12345678000199", criadoPor: POR,
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
