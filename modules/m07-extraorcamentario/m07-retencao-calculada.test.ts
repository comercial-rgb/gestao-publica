import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  avaliarRetencoesDoPagamento,
  perfilFiscalVigente,
  prepararRetencoesCalculadas,
  registrarPerfilFiscal,
  type DadosFiscaisDaOperacao,
} from "./retencao-calculada.js";
import { redefinirContaDaConsignacao } from "./servico-tipos-de-consignacao.js";

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

const conta = (id: string, codigo: string, nat: "DEVEDORA" | "CREDORA") => ({ id, codigo, nome: codigo, naturezaSaldo: nat, nivel: 5, analitica: true });
const CONTAS = [
  conta("c-caixa", CAIXA, "DEVEDORA"), conta("c-forn", FORNECEDOR, "CREDORA"), conta("c-ir", P_IR, "CREDORA"),
  conta("c-inss", P_INSS, "CREDORA"), conta("c-iss", P_ISS, "CREDORA"), conta("c-vpd", VPD, "DEVEDORA"),
  conta("c-disp", C_DISPONIVEL, "CREDORA"), conta("c-emp", C_EMPENHADO, "CREDORA"), conta("c-liq", C_LIQUIDADO, "CREDORA"), conta("c-pago", C_PAGO, "CREDORA"),
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

  it("retém IR 48,00 + INSS 110,00 + ISS 50,00 de 1.000,00: caixa sai por 792,00, três ingressos e a memória de cada um", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos });

    const pag = await prisma.pagamento.findUniqueOrThrow({ where: { id: r.pagamentoId } });
    expect(pag.valor.toFixed(2)).toBe("1000.00");
    const movs = await prisma.movimentoExtraorcamentario.findMany({ where: { pagamentoId: r.pagamentoId }, include: { tipoConsignacao: true } });
    expect(Object.fromEntries(movs.map((m) => [m.tipoConsignacao.codigo, m.valor.toFixed(2)]))).toEqual({ IRRF: "48.00", INSS: "110.00", ISS: "50.00" });
    expect(movs.find((m) => m.tipoConsignacao.codigo === "INSS")!.credorConsignatario).toBe("Previdência Social");
    expect(movs.find((m) => m.tipoConsignacao.codigo === "IRRF")!.credorConsignatario).toBe("PREFEITURA MUNICIPAL DE ESPERANCA");

    const calc = await prisma.calculoDaRetencao.findMany({ where: { pagamentoId: r.pagamentoId }, orderBy: { tributo: "asc" } });
    expect(calc.map((c) => [c.tributo, c.resultado, c.valor.toFixed(2), c.base?.toFixed(2), c.aliquota?.toString()])).toEqual([
      ["IRRF", "RETIDO", "48.00", "1000.00", "0.048"],
      ["INSS", "RETIDO", "110.00", "1000.00", "0.11"],
      ["ISS", "RETIDO", "50.00", "1000.00", "0.05"],
    ]);
    for (const c of calc) expect(movs.map((m) => m.id)).toContain(c.movimentoId);
    expect(calc.find((c) => c.tributo === "ISS")!.fundamento).toMatch(/art\. 58, III/);

    const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: r.lancamentoId }, include: { partidas: { include: { conta: true } } } });
    const valor = (codigo: string) => l.partidas.filter((x) => x.conta.codigo === codigo).map((x) => `${x.tipo} ${x.valor.toFixed(2)}`);
    expect(valor(CAIXA)).toEqual(["CREDITO 792.00"]);
    expect(valor(P_IR)).toEqual(["CREDITO 48.00"]);
    expect(valor(P_INSS)).toEqual(["CREDITO 110.00"]);
    expect(valor(P_ISS)).toEqual(["CREDITO 50.00"]);
    expect(valor(FORNECEDOR)).toEqual(["DEBITO 1000.00"]);
  });

  it("optante do Simples: IR e INSS não retidos (com o motivo gravado), ISS pela alíquota do documento", async () => {
    await perfil({ optanteSimplesNacional: true });
    const op = { ...OPERACAO, iss: { ...OPERACAO.iss, aliquotaDoSimplesNoDocumento: new Decimal("0.0201") } };
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: op });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos });
    const calc = await prisma.calculoDaRetencao.findMany({ where: { pagamentoId: r.pagamentoId }, orderBy: { tributo: "asc" } });
    expect(calc.map((c) => [c.tributo, c.resultado, c.valor.toFixed(2), c.movimentoId === null])).toEqual([
      ["IRRF", "NAO_RETIDO", "0.00", true],
      ["INSS", "NAO_RETIDO", "0.00", true],
      ["ISS", "RETIDO", "20.10", false],
    ]);
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
    await expect(prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO })).rejects.toThrow(/IRRF — O fornecedor não tem perfil fiscal.*INSS — .*ISS — /);
    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("memória que não casa com a retenção derruba o pagamento inteiro", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO });
    const adulterada = p.calculos.map((c) => (c.tributo === "INSS" ? { ...c, valor: toMoney("100.00") } : c));
    await expect(pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: adulterada })).rejects.toThrow(/INSS \(100\.00\) não casa/);
    const semCalculoDoISS = p.calculos.filter((c) => c.tributo !== "ISS");
    await expect(pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: semCalculoDoISS })).rejects.toThrow(/sem o cálculo que as justifica/);
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
    expect(await prisma.calculoDaRetencao.count()).toBe(0);
  });

  it("anular o pagamento estorna as retenções; a memória do cálculo continua como registro do que foi feito", async () => {
    await perfil();
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO });
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos });
    await anularPagamento({ pagamentoId: r.pagamentoId, numero: "NP-1-ANUL", data: new Date("2026-03-05T12:00:00Z"), historico: "Anulação do pagamento", criadoPor: POR }, deps);
    const estornos = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } });
    expect(estornos).toBe(3);
    expect(await prisma.calculoDaRetencao.count({ where: { pagamentoId: r.pagamentoId } })).toBe(3);
  });
});

describe("V24 — recusas que dependem do cadastro", { timeout: 60000 }, () => {
  afterAll(async () => prisma.$disconnect());

  it("tributo retido sem tipo de consignação cadastrado é recusado nomeando o tipo", async () => {
    await semear(false);
    const deps = criarM05Deps(prisma);
    const liq = await empenharELiquidar(deps);
    await perfil();
    await expect(prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO })).rejects.toThrow(/tipo de consignação ISS não está cadastrado/);
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
    const p = await prepararRetencoesCalculadas(prisma, { liquidacaoId: liq, valorDoPagamento: toMoney("1000.00"), data: DATA_PGTO, operacao: OPERACAO });
    expect(p.retencoes.find((r) => r.tipoConsignacaoId === inss.id)?.contaConsignacaoAPagar).toBe("2.1.8.8.1.01.99");
    const r = await pagar(pgto(liq), R_PAGAMENTO, deps, { contaDisponibilidade: CAIXA, retencoes: p.retencoes, calculos: p.calculos });
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
