import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, exigirObrigacaoDaLiquidacao, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  avaliarRetencoesDoPagamento,
  perfilFiscalVigente,
  prepararRetencoesCalculadas,
  registrarPerfilFiscal,
  type DadosFiscaisDaOperacao,
} from "./retencao-calculada.js";
import { redefinirContaDaConsignacao } from "./servico-tipos-de-consignacao.js";
import { classificacaoPropriaVigente, classificarRetencaoPropria } from "./retencao-propria.js";
import { registrarDispendioExtra } from "./extraorcamentario.js";
import { roteiroDispendioExtra } from "./dominio.js";
import { anularArrecadacao } from "../m04-receita/servico.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { anularPagamentoParcial } from "../m05-despesa/anulacao-parcial.js";
import { regularizarConsignacaoPropria } from "../m04-receita/receita-por-retencao.js";
import { reconhecerReceita, saldoReconhecidoDe } from "../m04-receita/reconhecimento.js";
import { parsearNaturezaReceita } from "../m04-receita/natureza.js";
import { conferirComposicaoExtra, retencoesComSaldo } from "./consultas.js";
import { lerFatosEstornoRetencao, lerFatosReceitaOrcamentaria, lerFatosRetencao } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";

/**
 * V24 — a retenção CALCULADA dentro do `pagar()`: o fornecedor vem do empenho, as tabelas do banco
 * (com os valores das fontes oficiais), e a memória do cálculo nasce na mesma transação do pagamento.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m07@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FICHA = "ficha-500";
const FORNECEDOR_PJ = "12345678000195";
const ESPERANCA = "2506004";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const P_IR = "2.1.8.8.1.01.04";
const P_INSS = "2.1.8.8.1.01.02";
const P_ISS = "2.1.8.8.1.01.08";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
// V26 — o IR e o ISS do próprio município viram receita (PCASP do TCE-PB, Pcasp_2025.xlsx).
const CRED_IR = "1.1.2.1.1.01.01";
const CRED_ISS = "1.1.2.1.1.01.07";
const VPA_IR_PJ = "4.1.1.2.1.03.02";
const VPA_ISS = "4.1.1.3.1.02.00";

const conta = (id: string, codigo: string, nat: "DEVEDORA" | "CREDORA") => ({ id, codigo, nome: codigo, naturezaSaldo: nat, nivel: 5, analitica: true });
const CONTAS = [
  conta("c-caixa", CAIXA, "DEVEDORA"), conta("c-forn", FORNECEDOR, "CREDORA"), conta("c-ir", P_IR, "CREDORA"),
  conta("c-inss", P_INSS, "CREDORA"), conta("c-iss", P_ISS, "CREDORA"), conta("c-vpd", VPD, "DEVEDORA"),
  conta("c-disp", C_DISPONIVEL, "CREDORA"), conta("c-emp", C_EMPENHADO, "CREDORA"), conta("c-liq", C_LIQUIDADO, "CREDORA"), conta("c-pago", C_PAGO, "CREDORA"),
  conta("c-cred-ir", CRED_IR, "DEVEDORA"), conta("c-cred-iss", CRED_ISS, "DEVEDORA"), conta("c-vpa-ir", VPA_IR_PJ, "CREDORA"), conta("c-vpa-iss", VPA_ISS, "CREDORA"),
  conta("c-rar", "6.2.1.1.0.00.00", "DEVEDORA"), conta("c-rr", "6.2.1.2.0.00.00", "CREDORA"), conta("c-ddr-ord", "7.2.1.1.1.00.00", "DEVEDORA"), conta("c-ddr-disp", "8.2.1.1.1.01.00", "CREDORA"),
];
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });

const DATA_PGTO = new Date("2026-03-01T12:00:00Z");
const DESDE = new Date("2022-11-01T00:00:00Z");

async function semear(comTipoISS = true): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "PJ" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE_500 } });
  await criarFichasDeTeste(prisma, [
    { id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE_500, valorDotado: "100000.00" },
  ]);
  await prisma.enteConfig.create({ data: { id: "unico", codigoIbge: ESPERANCA, poderOrgao: "01", nome: "PREFEITURA MUNICIPAL DE ESPERANCA", uf: "PB", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", conferidoPor: POR, conferidoEm: new Date("2026-01-05T12:00:00Z") } });
  await prisma.tipoConsignacao.create({ data: { codigo: "IRRF", descricao: "IR retido", contaPassivoId: "c-ir", criadoPor: "TESTE" } });
  await prisma.tipoConsignacao.create({ data: { codigo: "INSS", descricao: "INSS retido", contaPassivoId: "c-inss", criadoPor: "TESTE" } });
  if (comTipoISS) await prisma.tipoConsignacao.create({ data: { codigo: "ISS", descricao: "ISS retido", contaPassivoId: "c-iss", criadoPor: "TESTE" } });
  // V26 — a decisão do ente: IR de PJ e ISS retidos são receita do Tesouro (ementário STN 2026).
  await prisma.naturezaReceita.createMany({ data: [{ codigo: "11130341", descricao: "IRRF - Outros Rendimentos - Principal" }, { codigo: "11145111", descricao: "ISSQN - Principal" }] });
  await prisma.deParaFonteNaturezaDdr.create({ data: { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "Recursos não vinculados de impostos", versao: 1, criadoPor: POR } });
  await classificarRetencaoPropria(prisma, { fato: "IRRF_FORNECEDOR_PJ", tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130341", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: VPA_IR_PJ, entidadeTitularId: null, vigenteDesde: new Date("2026-01-01T00:00:00Z"), fundamento: "MCASP 11ª ed., Parte I 3.6.2; ordem V26", criadoPor: POR });
  if (comTipoISS) await classificarRetencaoPropria(prisma, { fato: "ISS", tipoConsignacaoCodigo: "ISS", naturezaReceitaCodigo: "11145111", fonteCodigo: "500", contaCreditoCodigo: CRED_ISS, contaVpaCodigo: VPA_ISS, entidadeTitularId: null, vigenteDesde: new Date("2026-01-01T00:00:00Z"), fundamento: "ISS do próprio município; ordem V26", criadoPor: POR });
  // Linhas das fontes oficiais: Anexo I (6190, 4,8%), IN 2.110 (111-I; 11%; R$ 10,00), LC 132 (17.05, 5%).
  await prisma.naturezaDaRetencaoDoIR.create({ data: { codigoReceita: "6190", natureza: "Demais serviços", aliquota: "0.048", vigenteDesde: new Date("2023-06-27T00:00:00Z"), fonte: "IN RFB 1.234/2012, Anexo I", consultadoEm: DESDE, criadoPor: POR } });
  await prisma.servicoDaRetencaoPrevidenciaria.create({ data: { codigo: "111-I", artigo: 111, inciso: "I", descricao: "limpeza, conservação ou zeladoria", somenteCessaoDeMaoDeObra: false, construcaoCivil: false, vigenteDesde: DESDE, fonte: "IN RFB 2.110/2022, art. 111, I", consultadoEm: DESDE, criadoPor: POR } });
  await prisma.parametroDaRetencaoPrevidenciaria.create({ data: { aliquota: "0.11", valorMinimo: "10.00", vigenteDesde: DESDE, fonte: "IN RFB 2.110/2022, arts. 110 e 238", consultadoEm: DESDE, criadoPor: POR } });
  await prisma.itemDaListaDoISS.create({ data: { municipioIbge: ESPERANCA, subitem: "17.05", descricao: "Fornecimento de mão-de-obra", aliquota: "0.05", localDeIncidencia: "ESTABELECIMENTO_DO_TOMADOR", marcadoRetencaoNaFonte: true, vigenteDesde: new Date("2025-12-30T00:00:00Z"), fonte: "LC 80/2017, art. 62, I (LC 132/2025)", consultadoEm: DESDE, criadoPor: POR } });
}

async function empenharELiquidar(deps: M05Deps): Promise<string> {
  const e = await empenhar({ fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "1000.00", data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: FORNECEDOR_PJ, historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps);
  const l = await liquidar({ empenhoId: e.empenhoId, numero: "NL-1", valor: "1000.00", data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR }, R_LIQUIDACAO, deps);
  return l.liquidacaoId;
}

const perfil = (o: Partial<Parameters<typeof registrarPerfilFiscal>[1]> = {}) =>
  registrarPerfilFiscal(prisma, {
    documento: FORNECEDOR_PJ, vigenteDesde: new Date("2026-01-01T00:00:00Z"), optanteSimplesNacional: false, tributadoNoAnexoIVDoSimples: false,
    contribuiSobreReceitaBruta: false, dispensaDoIR: null, municipioDoEstabelecimento: "2504009", fundamento: "Consulta ao Portal do Simples em 05/01/2026", criadoPor: POR, ...o,
  });

const OPERACAO: DadosFiscaisDaOperacao = {
  valorDoDocumentoFiscal: toMoney("1000.00"),
  pagamentoComGlosa: false,
  naturezaIR: "6190",
  inss: { servico: "111-I", modalidade: "CESSAO_DE_MAO_DE_OBRA", enquadramento: "VALOR_BRUTO", valorMateriais: toMoney(0), baseMinima: null, deducoes: toMoney(0), dispensa: null },
  iss: { subitem: "17.05", municipioDaPrestacao: null, aliquotaDoSimplesNoDocumento: null },
  informados: {},
};
const pgto = (liquidacaoId: string) => ({ liquidacaoId, numero: "NP-1", valor: "1000.00", data: DATA_PGTO, contaBancaria: "CC-001", fonteId: FONTE_500, historico: "Pagamento NP-1", criadoPor: POR });

describe("V24 — pagar() com retenção calculada", { timeout: 60000 }, () => {
  let deps: M05Deps;
  let liq: string;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    liq = await empenharELiquidar(deps);
  }, 60000);
  afterAll(async () => prisma.$disconnect());

  it("retém IR 48,00 + INSS 110,00 + ISS 50,00 de 1.000,00: caixa sai por 792,00; o INSS vira consignação e o IR e o ISS do município, receita (V26)", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias });

    const pag = await prisma.pagamento.findUniqueOrThrow({ where: { id: r.pagamentoId } });
    expect(pag.valor.toFixed(2)).toBe("1000.00");
    const movs = await prisma.movimentoExtraorcamentario.findMany({ where: { pagamentoId: r.pagamentoId }, include: { tipoConsignacao: true } });
    expect(Object.fromEntries(movs.map((m) => [m.tipoConsignacao.codigo, m.valor.toFixed(2)]))).toEqual({ INSS: "110.00" });
    expect(movs.find((m) => m.tipoConsignacao.codigo === "INSS")!.credorConsignatario).toBe("Previdência Social");
    const proprias = await prisma.retencaoPropriaDoPagamento.findMany({ where: { pagamentoId: r.pagamentoId }, include: { receitaArrecadada: { include: { naturezaReceita: true } } }, orderBy: { fato: "asc" } });
    expect(proprias.map((x) => [x.fato, x.valor.toFixed(2), x.receitaArrecadada.naturezaReceita.codigo, x.receitaArrecadada.valor.toFixed(2)])).toEqual([
      ["IRRF_FORNECEDOR_PJ", "48.00", "11130341", "48.00"],
      ["ISS", "50.00", "11145111", "50.00"],
    ]);

    const calc = await prisma.calculoDaRetencao.findMany({ where: { pagamentoId: r.pagamentoId }, orderBy: { tributo: "asc" } });
    // A memória da consignação (INSS) fica no cálculo; a do IR e do ISS próprios, no elo da retenção própria.
    expect(calc.map((c) => [c.tributo, c.resultado, c.valor.toFixed(2), c.base?.toFixed(2), c.aliquota?.toString()])).toEqual([
      ["INSS", "RETIDO", "110.00", "1000.00", "0.11"],
    ]);
    expect(calc[0]!.movimentoId).toBe(movs[0]!.id);
    expect(proprias.map((x) => [x.fato, x.base?.toFixed(2), x.aliquota?.toString()])).toEqual([
      ["IRRF_FORNECEDOR_PJ", "1000.00", "0.048"],
      ["ISS", "1000.00", "0.05"],
    ]);
    expect(proprias.find((x) => x.fato === "ISS")!.fundamento).toMatch(/art\. 58, III/);

    const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: r.lancamentoId }, include: { partidas: { include: { conta: true } } } });
    const valor = (codigo: string) => l.partidas.filter((x) => x.conta.codigo === codigo).map((x) => `${x.tipo} ${x.valor.toFixed(2)}`);
    expect(valor(CAIXA)).toEqual(["CREDITO 792.00"]);
    expect(valor(P_IR)).toEqual([]);
    expect(valor(P_INSS)).toEqual(["CREDITO 110.00"]);
    expect(valor(P_ISS)).toEqual([]);
    expect(valor(CRED_IR)).toEqual(["CREDITO 48.00"]);
    expect(valor(CRED_ISS)).toEqual(["CREDITO 50.00"]);
    expect(valor(FORNECEDOR)).toEqual(["DEBITO 1000.00"]);
  });

  it("optante do Simples: IR e INSS não retidos (com o motivo gravado), ISS pela alíquota do documento", async () => {
    await perfil({ optanteSimplesNacional: true });
    const op = { ...OPERACAO, iss: { ...OPERACAO.iss, aliquotaDoSimplesNoDocumento: new Decimal("0.0201") } };
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: op, contaBancariaId: "cb1" });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias });
    const calc = await prisma.calculoDaRetencao.findMany({ where: { pagamentoId: r.pagamentoId }, orderBy: { tributo: "asc" } });
    expect(calc.map((c) => [c.tributo, c.resultado, c.valor.toFixed(2), c.movimentoId === null])).toEqual([
      ["IRRF", "NAO_RETIDO", "0.00", true],
      ["INSS", "NAO_RETIDO", "0.00", true],
    ]);
    // V26 — o ISS retido pelo próprio município é receita: a memória vai com o elo.
    const iss = await prisma.retencaoPropriaDoPagamento.findFirstOrThrow({ where: { pagamentoId: r.pagamentoId } });
    expect([iss.fato, iss.valor.toFixed(2), iss.aliquota?.toString()]).toEqual(["ISS", "20.10", "0.0201"]);
    expect(calc[0]!.fundamento).toMatch(/art\. 4º, XI/);
    expect(calc[1]!.fundamento).toMatch(/art\. 167/);
  });

  it("o perfil vigente é o de maior data até o pagamento (N=2), e um perfil futuro não vale", async () => {
    await perfil({ vigenteDesde: new Date("2026-01-01T00:00:00Z"), optanteSimplesNacional: true });
    await perfil({ vigenteDesde: new Date("2026-02-01T00:00:00Z"), optanteSimplesNacional: false });
    await perfil({ vigenteDesde: new Date("2026-04-01T00:00:00Z"), optanteSimplesNacional: true });
    const v = await perfilFiscalVigente(prisma, FORNECEDOR_PJ, DATA_PGTO);
    expect(v?.optanteSimplesNacional).toBe(false);
    expect(v?.vigenteDesde.toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it("sem perfil fiscal, recusa nomeando os três tributos — e nada é gravado", async () => {
    await expect(prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" })).rejects.toThrow(/IRRF — O fornecedor não tem perfil fiscal.*INSS — .*ISS — /);
    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("memória que não casa com a retenção derruba o pagamento inteiro", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" });
    const adulterada = p.calculos.map((c) => (c.tributo === "INSS" ? { ...c, valor: toMoney("100.00") } : c));
    await expect(pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: adulterada, proprias: p.proprias })).rejects.toThrow(/INSS \(100\.00\) não casa/);
    const semCalculoDoISS = p.calculos.filter((c) => c.tributo !== "ISS");
    await expect(pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: semCalculoDoISS, proprias: p.proprias })).rejects.toThrow(/imposto do próprio município sem o cálculo que as justifica/);
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
    expect(await prisma.calculoDaRetencao.count()).toBe(0);
  });

  it("anular o pagamento estorna as retenções; a memória do cálculo continua como registro do que foi feito", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias });
    await anularPagamento({ pagamentoId: r.pagamentoId, numero: "NP-1-ANUL", data: new Date("2026-03-05T12:00:00Z"), historico: "Anulação do pagamento", criadoPor: POR }, deps);
    const estornos = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } });
    expect(estornos).toBe(1);
    // V26 — as duas receitas por retenção anuladas na mesma operação.
    expect(await prisma.receitaArrecadada.count({ where: { tipo: "ANULACAO" } })).toBe(2);
    expect(await prisma.retencaoPropriaDoPagamento.count({ where: { estornoDeId: { not: null } } })).toBe(2);
    expect(await prisma.calculoDaRetencao.count({ where: { pagamentoId: r.pagamentoId } })).toBe(1);
    expect(await prisma.retencaoPropriaDoPagamento.count({ where: { pagamentoId: r.pagamentoId, fundamento: { not: null } } })).toBe(2);
  });
});

describe("V24 — o pagamento extingue a obrigação que a liquidação criou", { timeout: 60000 }, () => {
  afterAll(async () => prisma.$disconnect());

  it("regra pura: obrigação única e igual à do roteiro passa; divergente, ausente ou dupla recusa nomeando", () => {
    expect(() => exigirObrigacaoDaLiquidacao(R_PAGAMENTO, [FORNECEDOR])).not.toThrow();
    expect(() => exigirObrigacaoDaLiquidacao(R_PAGAMENTO, [P_INSS])).toThrow(new RegExp(`OBRIGACAO-DIVERGENTE: a liquidação registrou a obrigação em ${P_INSS.replace(/\./g, "\\.")}, e o pagamento debitaria ${FORNECEDOR.replace(/\./g, "\\.")}`));
    expect(() => exigirObrigacaoDaLiquidacao(R_PAGAMENTO, [])).toThrow(/OBRIGACAO-DA-LIQUIDACAO-INDEFINIDA: a liquidação creditou nenhuma conta/);
    expect(() => exigirObrigacaoDaLiquidacao(R_PAGAMENTO, [FORNECEDOR, P_INSS])).toThrow(/2 contas de obrigação/);
  });

  it("liquidada como obrigação de encargo, paga pelo roteiro de fornecedor: recusa e nada grava; pelo da obrigação, debita a obrigação (N=2)", async () => {
    await semear();
    const deps = criarM05Deps(prisma);
    const R_LIQ_ENCARGO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: P_INSS, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
    const e = await empenhar({ fichaId: FICHA, numero: "NE-2", tipo: "ORDINARIO", valor: "500.00", data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: FORNECEDOR_PJ, historico: "encargo", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps);
    const l = await liquidar({ empenhoId: e.empenhoId, numero: "NL-2", valor: "500.00", data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liquidação do encargo", criadoPor: POR }, R_LIQ_ENCARGO, deps);
    await expect(pagar({ ...pgto(l.liquidacaoId), valor: "500.00" }, R_PAGAMENTO, deps)).rejects.toThrow(/OBRIGACAO-DIVERGENTE/);
    expect(await prisma.pagamento.count()).toBe(0);
    const certo = roteiroPagamento({ obrigacaoAPagar: P_INSS, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });
    const r = await pagar({ ...pgto(l.liquidacaoId), valor: "500.00" }, certo, deps);
    const partidas = await prisma.partidaContabil.findMany({ where: { lancamentoId: r.lancamentoId, subsistema: "PATRIMONIAL" }, include: { conta: true } });
    expect(partidas.map((p) => `${p.tipo} ${p.conta.codigo}`).sort()).toEqual([`CREDITO ${CAIXA}`, `DEBITO ${P_INSS}`]);
    // A liquidação de fornecedor da mesma base continua paga pelo roteiro de fornecedor.
    const liq = await empenharELiquidar(deps);
    await expect(pagar(pgto(liq), R_PAGAMENTO, deps)).resolves.toBeDefined();
  });
});

describe("V24 — recusas que dependem do cadastro", { timeout: 60000 }, () => {
  afterAll(async () => prisma.$disconnect());

  it("tributo retido sem tipo de consignação cadastrado é recusado nomeando o tipo", async () => {
    await semear(false);
    const deps = criarM05Deps(prisma);
    const liq = await empenharELiquidar(deps);
    await perfil();
    await expect(prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" })).rejects.toThrow(/ISS retido de prestador de serviço: é imposto do próprio município.*Retenções do próprio município/);
  });

  it("o perfil recusa CNPJ com dígito errado, Anexo IV sem Simples e inciso inexistente", async () => {
    await semear();
    await expect(perfil({ documento: "12345678000100" })).rejects.toThrow(/não é válido/);
    await expect(perfil({ tributadoNoAnexoIVDoSimples: true })).rejects.toThrow(/Anexo IV/);
    await expect(perfil({ dispensaDoIR: "XXX" })).rejects.toThrow(/I a XXII/);
    expect(await prisma.perfilFiscalDoFornecedor.count()).toBe(0);
  });

  it("a conta do passivo é a da DECISÃO vigente do ente: trocada pela tela, o pagamento calculado usa a nova", async () => {
    await semear();
    const deps = criarM05Deps(prisma);
    const liq = await empenharELiquidar(deps);
    await perfil();
    await prisma.contaPcasp.create({ data: conta("c-inss-nova", "2.1.8.8.1.01.99", "CREDORA") });
    const inss = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "INSS" } });
    await redefinirContaDaConsignacao(prisma, { tipoId: inss.id, contaPassivoCodigo: "2.1.8.8.1.01.99", fundamento: "Conta analítica própria do INSS retido de fornecedores", criadoPor: POR });
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO, contaBancariaId: "cb1" });
    expect(p.retencoes.find((r) => r.tipoConsignacaoId === inss.id)?.contaConsignacaoAPagar).toBe("2.1.8.8.1.01.99");
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias });
    const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: r.lancamentoId }, include: { partidas: { include: { conta: true } } } });
    expect(l.partidas.filter((x) => x.conta.codigo === "2.1.8.8.1.01.99").map((x) => x.valor.toFixed(2))).toEqual(["110.00"]);
    expect(l.partidas.some((x) => x.conta.codigo === P_INSS)).toBe(false);
  });

  it("o perfil fiscal exige ALTERAR_PESSOA: quem só cadastra pessoa é recusado nomeando a ação; quem a tem grava", async () => {
    await semear();
    async function usuarioCom(id: string, acoes: readonly ("CADASTRAR_PESSOA" | "ALTERAR_PESSOA")[]): Promise<string> {
      const u = await prisma.usuario.create({ data: { identificador: id, nome: id, criadoPor: "seed-teste" }, select: { id: true } });
      const p = await prisma.perfil.create({ data: { nome: `perfil-${id}`, descricao: "teste", criadoPor: "seed-teste" }, select: { id: true } });
      for (const a of acoes) await prisma.permissaoDePerfil.create({ data: { perfilId: p.id, acao: a, unidadeOrcId: null, criadoPor: "seed-teste" } });
      await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "seed-teste" } });
      return id;
    }
    const vizinho = await usuarioCom("so-cadastra@teste.local", ["CADASTRAR_PESSOA"]);
    const autorizado = await usuarioCom("altera@teste.local", ["ALTERAR_PESSOA"]);
    await expect(perfil({ criadoPor: vizinho })).rejects.toThrow(/ALTERAR_PESSOA/);
    expect(await prisma.perfilFiscalDoFornecedor.count()).toBe(0);
    await perfil({ criadoPor: autorizado });
    expect(await prisma.perfilFiscalDoFornecedor.count()).toBe(1);
  });

  it("a avaliação usa o credor do EMPENHO: outro fornecedor com perfil não interfere", async () => {
    await semear();
    const deps = criarM05Deps(prisma);
    const liq = await empenharELiquidar(deps);
    await perfil({ documento: "11222333000181", optanteSimplesNacional: true });
    await perfil({ optanteSimplesNacional: false });
    const av = await avaliarRetencoesDoPagamento(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO });
    expect(av.documentoDoFornecedor).toBe(FORNECEDOR_PJ);
    expect(av.avaliacoes.find((a) => a.tributo === "IRRF")!.resultado).toBe("RETIDO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// V26 — O IR E O ISS DO PRÓPRIO TESOURO SÃO RECEITA (cadeia A da ordem V26)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** As partidas de um lançamento, "TIPO conta valor", ordenadas. */
async function partidasDe(lancamentoId: string): Promise<string[]> {
  const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId }, include: { conta: true } });
  return ps.map((x) => `${x.tipo} ${x.conta.codigo} ${x.valor.toFixed(2)}`).sort();
}

/** O saldo devedor (D − C) de uma conta em todo o razão. */
async function saldoDe(codigo: string): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } } });
  return ps.reduce((s, x) => (x.tipo === "DEBITO" ? s.plus(x.valor.toString()) : s.minus(x.valor.toString())), new Decimal(0)).toFixed(2);
}

/** Uma entidade contábil mínima, com a versão vigente. */
async function entidade(codigo: string, nome: string): Promise<string> {
  const e = await prisma.entidadeContabil.create({ data: { codigo, criadoPor: POR }, select: { id: true } });
  await prisma.versaoDaEntidadeContabil.create({ data: { entidadeId: e.id, versao: 1, nome, tipoManad: codigo === "TES" ? "01" : "12", atoTipo: "LEI", atoNumero: "1", atoAno: 2020, atoDispositivo: "art. 1º", atoCitacao: `Cria ${nome}`, criadoPor: POR } });
  return e.id;
}
async function titular(entidadeId: string, versao: number): Promise<void> {
  await prisma.declaracaoDeTitularDaConta.create({ data: { contaBancariaId: "cb1", entidadeId, versao, atoTipo: "DECRETO", atoNumero: "10", atoAno: 2025, atoDispositivo: "art. 2º", atoCitacao: "Conta CC-001", criadoPor: POR } });
}

describe("V26 — IR e ISS retidos pelo próprio município viram receita no pagamento", { timeout: 120000 }, () => {
  let deps: M05Deps;
  let liq: string;
  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    liq = await empenharELiquidar(deps);
    await perfil();
  }, 120000);
  afterAll(async () => prisma.$disconnect());

  const pagarCalculado = async (liquidacaoId: string, numero = "NP-1", valor = "1000.00") => {
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId, valorDoPagamento: toMoney(valor), data: DATA_PGTO, operacao: { ...OPERACAO, valorDoDocumentoFiscal: toMoney(valor) }, contaBancariaId: "cb1" });
    return pagar({ ...pgto(liquidacaoId), numero, valor, historico: `Pagamento ${numero}` }, R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias });
  };

  it("a guia por retenção: natureza e destinação da classificação, sem conta bancária; reconhece, realiza e controla — e o banco sai só pelo líquido", async () => {
    const r = await pagarCalculado(liq);
    const guias = await prisma.receitaArrecadada.findMany({ include: { naturezaReceita: true, fonte: true }, orderBy: { numeroReceita: "asc" } });
    expect(guias.map((g) => [g.numeroReceita, g.naturezaReceita.codigo, g.fonte.codigo, g.valor.toFixed(2), g.contaBancariaId, g.tipo])).toEqual([
      ["1", "11130341", "500", "48.00", null, "ARRECADACAO"],
      ["2", "11145111", "500", "50.00", null, "ARRECADACAO"],
    ]);
    expect(await partidasDe(guias[0]!.lancamentoId)).toEqual(
      [
        "CREDITO 6.2.1.2.0.00.00 48.00", "CREDITO 8.2.1.1.1.01.00 48.00", `CREDITO ${VPA_IR_PJ} 48.00`,
        "DEBITO 6.2.1.1.0.00.00 48.00", "DEBITO 7.2.1.1.1.00.00 48.00", `DEBITO ${CRED_IR} 48.00`,
      ].sort()
    );
    // O pagamento: obrigação pelo bruto, banco pelo líquido, o crédito tributário baixado — nenhum débito no banco.
    const pag = await partidasDe(r.lancamentoId);
    expect(pag.filter((x) => x.includes(CAIXA))).toEqual([`CREDITO ${CAIXA} 792.00`]);
    expect(pag).toContain(`DEBITO ${FORNECEDOR} 1000.00`);
    expect(pag).toContain(`CREDITO ${CRED_IR} 48.00`);
    expect(pag).toContain(`CREDITO ${CRED_ISS} 50.00`);
    expect(pag).toContain(`DEBITO ${C_LIQUIDADO} 1000.00`);
    expect(pag).toContain(`CREDITO ${C_PAGO} 1000.00`);
    // O crédito tributário nasce e morre no mesmo ato; a VPA nasce uma vez.
    expect(await saldoDe(CRED_IR)).toBe("0.00");
    expect(await saldoDe(CRED_ISS)).toBe("0.00");
    expect(await saldoDe(VPA_IR_PJ)).toBe("-48.00");
    expect(await saldoDe(VPA_ISS)).toBe("-50.00");
    expect(await saldoDe(CAIXA)).toBe("-792.00");
  });

  it("N=2: dois pagamentos numeram as guias em sequência, sem colisão, e cada elo aponta para a sua", async () => {
    await pagarCalculado(liq, "NP-1", "600.00");
    await pagarCalculado(liq, "NP-2", "400.00");
    const elos = await prisma.retencaoPropriaDoPagamento.findMany({ include: { receitaArrecadada: true, pagamento: true }, orderBy: { receitaArrecadada: { numeroReceita: "asc" } } });
    expect(elos.map((e) => [e.pagamento.numero, e.fato, e.valor.toFixed(2), e.receitaArrecadada.numeroReceita])).toEqual([
      ["NP-1", "IRRF_FORNECEDOR_PJ", "28.80", "1"], ["NP-1", "ISS", "30.00", "2"],
      ["NP-2", "IRRF_FORNECEDOR_PJ", "19.20", "3"], ["NP-2", "ISS", "20.00", "4"],
    ]);
  });

  it("reenvio do mesmo pagamento não duplica nada", async () => {
    await pagarCalculado(liq, "NP-1", "500.00");
    const antes = [await prisma.pagamento.count(), await prisma.receitaArrecadada.count(), await prisma.lancamentoContabil.count()];
    await expect(pagarCalculado(liq, "NP-1", "500.00")).rejects.toThrow();
    expect([await prisma.pagamento.count(), await prisma.receitaArrecadada.count(), await prisma.lancamentoContabil.count()]).toEqual(antes);
  });

  it("falha no meio (a destinação sem natureza declarada) desfaz tudo: nem pagamento, nem consignação, nem guia, nem lançamento", async () => {
    await prisma.deParaFonteNaturezaDdr.deleteMany({});
    const antes = await prisma.lancamentoContabil.count();
    await expect(pagarCalculado(liq)).rejects.toThrow(/FONTE 500 AINDA NÃO TEM NATUREZA DECLARADA/);
    expect([await prisma.pagamento.count(), await prisma.movimentoExtraorcamentario.count(), await prisma.receitaArrecadada.count(), await prisma.retencaoPropriaDoPagamento.count(), await prisma.lancamentoContabil.count()]).toEqual([0, 0, 0, 0, antes]);
  });

  it("estorno coordenado: anular o pagamento anula as duas guias e zera crédito, VPA e receita; a guia sozinha e a anulação parcial são recusadas", async () => {
    const r = await pagarCalculado(liq);
    const guia = await prisma.receitaArrecadada.findFirstOrThrow({ where: { numeroReceita: "1" } });
    await expect(anularArrecadacao({ receitaId: guia.id, numeroReceita: "1", dataAnulacao: new Date("2026-03-02T12:00:00Z"), criadoPor: POR }, criarM04Deps(prisma))).rejects.toThrow(/só é desfeita junto com ele/);
    await expect(anularPagamentoParcial({ originalId: r.pagamentoId, numero: "NP-1-P", valor: "100.00", data: new Date("2026-03-02T12:00:00Z"), motivo: "Valor pago a maior ao fornecedor", criadoPor: POR }, deps)).rejects.toThrow(/ANULAÇÃO PARCIAL DE PAGAMENTO COM RETENÇÃO É PROIBIDA/);
    await anularPagamento({ pagamentoId: r.pagamentoId, numero: "NP-1-ANUL", data: new Date("2026-03-05T12:00:00Z"), historico: "Anulação do pagamento", criadoPor: POR }, deps);
    const anuladas = await prisma.receitaArrecadada.findMany({ where: { tipo: "ANULACAO" }, orderBy: { numeroReceita: "asc" } });
    expect(anuladas.map((a) => [a.numeroReceita, a.valor.toFixed(2)])).toEqual([["1", "48.00"], ["2", "50.00"]]);
    for (const conta of [CRED_IR, CRED_ISS, VPA_IR_PJ, VPA_ISS, "6.2.1.2.0.00.00", "7.2.1.1.1.00.00", CAIXA]) {
      expect(await saldoDe(conta), conta).toBe("0.00");
    }
    await expect(anularPagamento({ pagamentoId: r.pagamentoId, numero: "NP-1-ANUL2", data: new Date("2026-03-06T12:00:00Z"), historico: "De novo", criadoPor: POR }, deps)).rejects.toThrow(/já foi anulado/);
  });

  it("reter IR do município como consignação, pela entrada manual, é recusado nomeando o caminho", async () => {
    const ir = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "IRRF" } });
    await expect(
      pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: [{ tipoConsignacaoId: ir.id, credorConsignatario: "PREFEITURA MUNICIPAL DE ESPERANCA", valor: "48.00", contaConsignacaoAPagar: P_IR }] })
    ).rejects.toThrow(/IRRF retido para PREFEITURA MUNICIPAL DE ESPERANCA é imposto do próprio município/);
    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("conta de OUTRA entidade (fundo): o imposto do Tesouro fica como consignação a repassar e o repasse passa; a conta passando ao Tesouro, o recolhimento com saída de banco é recusado (N=2)", async () => {
    const tes = await entidade("TES", "Tesouro Municipal");
    const fundo = await entidade("FMS", "Fundo Municipal de Saúde");
    await classificarRetencaoPropria(prisma, { fato: "IRRF_FORNECEDOR_PJ", tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130341", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: VPA_IR_PJ, entidadeTitularId: tes, vigenteDesde: new Date("2026-02-01T00:00:00Z"), fundamento: "O titular do IR é o Tesouro Municipal", criadoPor: POR });
    await classificarRetencaoPropria(prisma, { fato: "ISS", tipoConsignacaoCodigo: "ISS", naturezaReceitaCodigo: "11145111", fonteCodigo: "500", contaCreditoCodigo: CRED_ISS, contaVpaCodigo: VPA_ISS, entidadeTitularId: tes, vigenteDesde: new Date("2026-02-01T00:00:00Z"), fundamento: "O titular do ISS é o Tesouro Municipal", criadoPor: POR });
    await titular(fundo, 1);
    const r = await pagarCalculado(liq, "NP-1", "500.00");
    const movs = await prisma.movimentoExtraorcamentario.findMany({ where: { pagamentoId: r.pagamentoId }, include: { tipoConsignacao: true }, orderBy: { valor: "asc" } });
    expect(movs.map((m) => [m.tipoConsignacao.codigo, m.credorConsignatario, m.valor.toFixed(2)])).toEqual([
      ["IRRF", "PREFEITURA MUNICIPAL DE ESPERANCA", "24.00"], ["ISS", "PREFEITURA MUNICIPAL DE ESPERANCA", "25.00"], ["INSS", "Previdência Social", "55.00"],
    ]);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
    const ir = movs[0]!;
    const recolher = (valor: string, numero: string) =>
      registrarDispendioExtra(prisma, { tipoConsignacaoId: ir.tipoConsignacaoId, credorConsignatario: ir.credorConsignatario, contaBancaria: "CC-001", fonteId: FONTE_500, valor, data: new Date("2026-03-10T12:00:00Z"), historico: `Repasse ${numero}`, criadoPor: POR }, roteiroDispendioExtra({ consignacaoAPagar: P_IR, disponibilidade: CAIXA }));
    await recolher("10.00", "1");
    await titular(tes, 2);
    await expect(recolher("14.00", "2")).rejects.toThrow(/é imposto do próprio município, retido nos pagamentos: ele não é recolhido com saída de dinheiro do banco/);
    // O INSS (terceiro) continua recolhível.
    await registrarDispendioExtra(prisma, { tipoConsignacaoId: movs[2]!.tipoConsignacaoId, credorConsignatario: "Previdência Social", contaBancaria: "CC-001", fonteId: FONTE_500, valor: "55.00", data: new Date("2026-03-10T12:00:00Z"), historico: "GPS", criadoPor: POR }, roteiroDispendioExtra({ consignacaoAPagar: P_INSS, disponibilidade: CAIXA }));
  });

  it("SAGRES: a retenção do pagamento lista INSS, IR e ISS; a receita do dia traz as duas guias por retenção; o estorno sai no dia da anulação", async () => {
    await prisma.contaBancaria.update({ where: { codigo: "CC-001" }, data: { banco: "001", agencia: "1234", digitoAgencia: "0", conta: "5555", digitoConta: "1" } });
    const r = await pagarCalculado(liq);
    const dia = new Date(Date.UTC(2026, 2, 1));
    const ret = await lerFatosRetencao(prisma, { codUnidadeGestora: "999001", dia });
    expect(ret.map((x) => [x.numPagamento, x.tipoConsignacaoCodigo, x.valor.toFixed(2)]).sort()).toEqual([["NP-1", "INSS", "110.00"], ["NP-1", "IRRF", "48.00"], ["NP-1", "ISS", "50.00"]]);
    const rec = await lerFatosReceitaOrcamentaria(prisma, { codUnidadeGestora: "999001", cnpjGerenciadora: "12345678000195", codContaArrecadadora: "CC-001", dia });
    expect(rec.map((x) => [x.numeroReceita, x.codReceitaOrcamentaria, x.valor.toFixed(2)])).toEqual([["1", "11130341", "48.00"], ["2", "11145111", "50.00"]]);
    await anularPagamento({ pagamentoId: r.pagamentoId, numero: "NP-1-ANUL", data: new Date("2026-03-05T12:00:00Z"), historico: "Anulação do pagamento", criadoPor: POR }, deps);
    const est = await lerFatosEstornoRetencao(prisma, { codUnidadeGestora: "999001", dia: new Date(Date.UTC(2026, 2, 5)) });
    expect(est.map((x) => [x.tipoConsignacaoCodigo, x.valor.toFixed(2), x.numero]).sort()).toEqual([["INSS", "110.00", "1"], ["IRRF", "48.00", "2"], ["ISS", "50.00", "3"]]);
  });

  it("a vigência é pelo dia civil do ente: 28/02 às 23h30 em Esperança (01/03 em UTC) usa a decisão de fevereiro, não a de 01/03 (N=2)", async () => {
    await prisma.naturezaReceita.create({ data: { codigo: "11130311", descricao: "IRRF - Trabalho - Principal" } });
    await classificarRetencaoPropria(prisma, { fato: "IRRF_FORNECEDOR_PJ", tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130311", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: VPA_IR_PJ, entidadeTitularId: null, vigenteDesde: new Date("2026-03-01T00:00:00Z"), fundamento: "Decisão nova a partir de março", criadoPor: POR });
    const naNoite = await classificacaoPropriaVigente(prisma, "IRRF_FORNECEDOR_PJ", new Date("2026-03-01T02:30:00Z"));
    const naManha = await classificacaoPropriaVigente(prisma, "IRRF_FORNECEDOR_PJ", new Date("2026-03-01T11:00:00Z"));
    expect([naNoite?.naturezaReceitaCodigo, naManha?.naturezaReceitaCodigo]).toEqual(["11130341", "11130311"]);
  });

  it("a classificação recusa natureza que não é de principal, conta sintética e conta fora da família", async () => {
    await prisma.naturezaReceita.create({ data: { codigo: "11130342", descricao: "IRRF - Outros Rendimentos - Multas e Juros" } });
    await prisma.contaPcasp.create({ data: { id: "c-sint", codigo: "1.1.2.1.1.01.00", nome: "Impostos", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false } });
    const base = { fato: "IRRF_FORNECEDOR_PJ" as const, tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130341", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: VPA_IR_PJ, entidadeTitularId: null, vigenteDesde: new Date("2026-05-01T00:00:00Z"), fundamento: "Teste das recusas do cadastro", criadoPor: POR };
    await expect(classificarRetencaoPropria(prisma, { ...base, naturezaReceitaCodigo: "11130342" })).rejects.toThrow(/não é de principal/);
    await expect(classificarRetencaoPropria(prisma, { ...base, naturezaReceitaCodigo: "11130340" })).rejects.toThrow(/não é de principal/);
    await expect(classificarRetencaoPropria(prisma, { ...base, contaCreditoCodigo: "1.1.2.1.1.01.00" })).rejects.toThrow(/é sintética/);
    await expect(classificarRetencaoPropria(prisma, { ...base, contaCreditoCodigo: P_IR })).rejects.toThrow(/não é da família 1\.1\.2\.1\./);
    await expect(classificarRetencaoPropria(prisma, { ...base, contaVpaCodigo: VPA_ISS })).rejects.toThrow(/não é da família 4\.1\.1\.2\./);
    expect(await prisma.classificacaoDaRetencaoPropria.count()).toBe(2);
  });
});

describe("V26 — o legado: IR do município que ficou na consignação vira receita, sem saída de banco", { timeout: 120000 }, () => {
  let deps: M05Deps;
  let ingressoIr: string;
  let ingressoInss: string;
  const ESPERANCA_NOME = "PREFEITURA MUNICIPAL DE ESPERANCA";
  const regularizar = (o: Partial<Parameters<typeof regularizarConsignacaoPropria>[1]> = {}) =>
    regularizarConsignacaoPropria(prisma, { ingressoId: ingressoIr, data: new Date("2026-03-20T12:00:00Z"), motivo: "IR do município retido como consignação antes da decisão", reconhecimentoId: null, criadoPor: POR, ...o });

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semear();
    const liq = await empenharELiquidar(deps);
    // O LEGADO: antes da decisão do ente, o IR do município era retido como consignação, com o credor = o município.
    const classificacoes = await prisma.classificacaoDaRetencaoPropria.findMany();
    await prisma.classificacaoDaRetencaoPropria.deleteMany({});
    const [ir, inss] = await Promise.all([prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "IRRF" } }), prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "INSS" } })]);
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, {
      contaDisponibilidade: CAIXA,
      retencoes: [
        { tipoConsignacaoId: ir.id, credorConsignatario: ESPERANCA_NOME, valor: "48.00", contaConsignacaoAPagar: P_IR },
        { tipoConsignacaoId: inss.id, credorConsignatario: "Previdência Social", valor: "110.00", contaConsignacaoAPagar: P_INSS },
      ],
    });
    const movs = await prisma.movimentoExtraorcamentario.findMany({ where: { pagamentoId: r.pagamentoId }, include: { tipoConsignacao: true } });
    ingressoIr = movs.find((m) => m.tipoConsignacao.codigo === "IRRF")!.id;
    ingressoInss = movs.find((m) => m.tipoConsignacao.codigo === "INSS")!.id;
    // A decisão chega depois (mesma vigência de antes).
    await prisma.classificacaoDaRetencaoPropria.createMany({ data: classificacoes });
  }, 120000);
  afterAll(async () => prisma.$disconnect());

  it("receita não reconhecida: a guia faz D consignação × C VPA, realiza a receita e o controle; o saldo do consignatário zera; o banco não se mexe", async () => {
    // N=2: a decisão do IR da FOLHA aponta para o mesmo tipo de consignação (IRRF). O legado de um pagamento a
    // fornecedor tem de ir à natureza do IR de fornecedor, não à do trabalho (defeito achado no percurso da 3011).
    await prisma.naturezaReceita.create({ data: { codigo: "11130311", descricao: "IRRF - Trabalho - Principal" } });
    await prisma.contaPcasp.create({ data: conta("c-vpa-ir-pf", "4.1.1.2.1.03.01", "CREDORA") });
    await classificarRetencaoPropria(prisma, { fato: "IRRF_FOLHA", tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130311", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: "4.1.1.2.1.03.01", entidadeTitularId: null, vigenteDesde: new Date("2026-01-01T00:00:00Z"), fundamento: "IR do servidor; ordem V26", criadoPor: POR });
    const caixaAntes = await saldoDe(CAIXA);
    const r = await regularizar();
    expect(r.valor).toBe("48.00");
    const guia = await prisma.receitaArrecadada.findUniqueOrThrow({ where: { id: r.receitaId }, include: { naturezaReceita: true } });
    expect([guia.naturezaReceita.codigo, guia.valor.toFixed(2), guia.contaBancariaId]).toEqual(["11130341", "48.00", null]);
    expect(await partidasDe(guia.lancamentoId)).toEqual(
      [`DEBITO ${P_IR} 48.00`, `CREDITO ${VPA_IR_PJ} 48.00`, "DEBITO 6.2.1.1.0.00.00 48.00", "CREDITO 6.2.1.2.0.00.00 48.00", "DEBITO 7.2.1.1.1.00.00 48.00", "CREDITO 8.2.1.1.1.01.00 48.00"].sort()
    );
    expect(await saldoDe(P_IR)).toBe("0.00");
    expect(await saldoDe(CAIXA)).toBe(caixaAntes);
    const saldo = await retencoesComSaldo(prisma, { tipoConsignacaoId: (await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "IRRF" } })).id, credorConsignatario: ESPERANCA_NOME });
    expect(saldo.map((s) => [s.valor, s.aRecolher])).toEqual([["48.00", "0.00"]]);
    // A conferência da composição continua fechando (o tipo novo é contado, não ignorado).
    const conf = await conferirComposicaoExtra(prisma);
    expect(conf.confere).toBe(true);
    expect(conf.obrigacoes.find((o) => o.tipoCodigo === "IRRF")!.aRecolher).toBe("0.00");
    // Idempotente: a segunda tentativa nomeia a guia da primeira.
    await expect(regularizar()).rejects.toThrow(new RegExp(`já foi regularizada \\(guia de receita ${r.numeroReceita}\\)`));
    expect(await prisma.receitaArrecadada.count()).toBe(1);
  });

  it("parte já recolhida antes da decisão (N=2): regulariza só o que resta", async () => {
    // Antes da decisão, 20,00 foram "recolhidos" (o legado que a ordem manda não reescrever).
    const classificacoes = await prisma.classificacaoDaRetencaoPropria.findMany();
    await prisma.classificacaoDaRetencaoPropria.deleteMany({});
    const ir = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "IRRF" } });
    await registrarDispendioExtra(prisma, { tipoConsignacaoId: ir.id, credorConsignatario: ESPERANCA_NOME, contaBancaria: "CC-001", fonteId: FONTE_500, valor: "20.00", data: new Date("2026-03-10T12:00:00Z"), historico: "Recolhimento antigo", criadoPor: POR, alocacoes: [{ ingressoId: ingressoIr, valor: "20.00" }] }, roteiroDispendioExtra({ consignacaoAPagar: P_IR, disponibilidade: CAIXA }));
    await prisma.classificacaoDaRetencaoPropria.createMany({ data: classificacoes });
    const r = await regularizar();
    expect(r.valor).toBe("28.00");
    expect(await saldoDe(P_IR)).toBe("0.00");
  });

  it("receita já reconhecida: a guia baixa o crédito do reconhecimento e a VPA não se repete", async () => {
    const origem = parsearNaturezaReceita("11130341").origem;
    await prisma.roteiroReconhecimento.create({ data: { origem, contaCreditoAReceberId: "c-cred-ir", contaVpaId: "c-vpa-ir", contaVpdId: "c-vpd", criadoPor: POR } });
    const rec = await reconhecerReceita(prisma, { naturezaCodigo: "11130341", fonteId: FONTE_500, dataFatoGerador: new Date("2026-03-01T12:00:00Z"), valor: "48.00", historico: "IR retido no pagamento NP-1", criadoPor: POR });
    const r = await regularizar({ reconhecimentoId: rec.reconhecimentoId });
    const guia = await prisma.receitaArrecadada.findUniqueOrThrow({ where: { id: r.receitaId } });
    expect((await partidasDe(guia.lancamentoId)).filter((x) => !x.includes(" 6.") && !x.includes(" 7.") && !x.includes(" 8."))).toEqual([`CREDITO ${CRED_IR} 48.00`, `DEBITO ${P_IR} 48.00`]);
    expect(await saldoDe(VPA_IR_PJ)).toBe("-48.00");
    expect(await saldoDe(CRED_IR)).toBe("0.00");
    expect(await saldoDe(P_IR)).toBe("0.00");
    expect((await saldoReconhecidoDe(prisma, rec.reconhecimentoId)).toFixed(2)).toBe("0.00");
  });

  it("recusas: o INSS é de terceiro; reconhecimento de outra natureza; motivo curto — e nada é gravado", async () => {
    await expect(regularizar({ ingressoId: ingressoInss })).rejects.toThrow(/não é imposto do próprio município no mesmo caixa/);
    await prisma.naturezaReceita.create({ data: { codigo: "11130311", descricao: "IRRF - Trabalho - Principal" } });
    const origem = parsearNaturezaReceita("11130311").origem;
    await prisma.roteiroReconhecimento.create({ data: { origem, contaCreditoAReceberId: "c-cred-ir", contaVpaId: "c-vpa-ir", contaVpdId: "c-vpd", criadoPor: POR } });
    const rec = await reconhecerReceita(prisma, { naturezaCodigo: "11130311", fonteId: FONTE_500, dataFatoGerador: new Date("2026-03-01T12:00:00Z"), valor: "48.00", historico: "IR da folha", criadoPor: POR });
    await expect(regularizar({ reconhecimentoId: rec.reconhecimentoId })).rejects.toThrow(/é da natureza 11130311, e a decisão do município para este imposto é 11130341/);
    await expect(regularizar({ motivo: "curto" })).rejects.toThrow(/pelo menos 10 caracteres/);
    expect(await prisma.apropriacaoDaConsignacaoPropria.count()).toBe(0);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });
});
