import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { roteiroPagamento } from "../m05-despesa/dominio.js";
import { anularPagamento, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { classificarRetencaoPropria, irDaFolhaNoPagamento } from "../m07-extraorcamentario/retencao-propria.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha } from "./servico.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha } from "./apropriacao.js";
import { certificarFolha, designarNaFolha, liquidarFolha } from "./certificacao.js";
import { irDaFolhaPendente } from "./ir-da-folha.js";
import { declararConsignacaoDaRubrica, descontosDaFolhaPendentes } from "./descontos-da-folha.js";
import { apropriarCustoDaFolha } from "../m12-relatorios/custos-da-folha.js";
import { registrarMovimentacao } from "../m32-pessoal/servico.js";
import { registrarAgrupamentoDaFolha } from "./agrupamento-no-tribunal.js";
import { cadastrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import { gerarRelacionamentoLiquidacaoAgrupamentoFolha } from "../../adapters/tribunais/tce-pb/sagres/gerador-v26.js";
import { lerFatosLiquidacao } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";

/**
 * V26 — O IR DA FOLHA VIRA RECEITA NO PAGAMENTO (ordem V26, 1.5).
 *
 * Fixture: a mesma cadeia real da folha (calcular, fechar, apropriar, certificar, liquidar) com DUAS matrículas (N=2)
 * e uma tabela de IRRF de fixture (10% numa faixa só, sem dedução) para o IR ser positivo: MAT-A 3.000,00 com
 * contribuição de 10% → base 2.700,00 → IR 270,00; MAT-B 2.000,00 → IR 180,00. A tabela é de TESTE, não a da lei.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PREPARA = "contabilidade@cg.pb.gov.br";
const FECHA = "tesouraria@cg.pb.gov.br";
const ATESTADOR = "gabinete@cg.pb.gov.br";
const PAGA = "despesa@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const JUNHO = "2026-06";
const FICHA = "ficha-folha";
const CAIXA = "1.1.1.1.2.00.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const PESSOAL = "2.1.1.1.1.01.01";
const CRED_IR = "1.1.2.1.1.01.01";
const VPA_IR_PF = "4.1.1.2.1.03.01";
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: PESSOAL, disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });

let liquidacaoDe: Record<string, string> = {};

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: PREPARA }, select: { id: true } });
  await prisma.versaoDePessoa.create({ data: { pessoaId: p.id, nome, criadoPor: PREPARA } });
  return p.id;
}

let rubricaPrev = "";
let rubricaVenc = "";
let rubricaIr = "";
let tipoRpps = "";

async function semear(comDecisao = true, comDescontoDeclarado = true): Promise<void> {
  await limparBanco(prisma);
  await prisma.enteConfig.create({
    data: { id: "unico", codigoIbge: "2506004", poderOrgao: "10131", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", nome: "Municipio de Teste", cnpj: "08993917000146", conferidoPor: "TESTE", conferidoEm: D(2026, 1, 1) },
  });
  const c = (id: string, codigo: string, naturezaSaldo: "DEVEDORA" | "CREDORA") => ({ id, codigo, nome: codigo, naturezaSaldo, nivel: 5, analitica: true });
  await prisma.contaPcasp.createMany({
    data: [
      c("c-caixa", CAIXA, "DEVEDORA"), c("c-disp", "6.2.2.1.1.00.00", "CREDORA"), c("c-emp", "6.2.2.1.3.01.00", "CREDORA"), c("c-liq", C_LIQUIDADO, "CREDORA"), c("c-pago", C_PAGO, "CREDORA"),
      c("c-ddr", "8.2.1.1.1.00.00", "DEVEDORA"), c("c-ddr-emp", "8.2.1.1.2.01.00", "CREDORA"), c("c-ddr-liq", "8.2.1.1.3.01.00", "CREDORA"),
      c("c-vpd-pessoal", "3.1.1.1.1.01.00", "DEVEDORA"), c("c-pessoal-pagar", PESSOAL, "CREDORA"),
      // V26 — o IR do servidor como receita (PCASP do TCE-PB, Pcasp_2025.xlsx).
      c("c-cred-ir", CRED_IR, "DEVEDORA"), c("c-vpa-ir-pf", VPA_IR_PF, "CREDORA"), c("c-ir-passivo", "2.1.8.8.1.01.04", "CREDORA"),
      // V28 — o passivo da previdência do servidor retida (fixture: RPPS do ente).
      c("c-rpps-passivo", "2.1.8.8.1.01.01", "CREDORA"),
      c("c-rar", "6.2.1.1.0.00.00", "DEVEDORA"), c("c-rr", "6.2.1.2.0.00.00", "CREDORA"), c("c-ddr-ord", "7.2.1.1.1.00.00", "DEVEDORA"), c("c-ddr-disp", "8.2.1.1.1.01.00", "CREDORA"),
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administracao", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e vantagens fixas" } });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb-folha", codigo: "CC-001", descricao: "Movimento", fonteId: "fonte-500" } });
  await criarFichaDeTeste(prisma, { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-11", id: FICHA, numero: 1, valorDotado: "500000.00" });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: PREPARA });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: PREPARA });
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  const atestador = await pessoa("28625006871", "Carla Atestadora");
  const u = await prisma.usuario.upsert({ where: { identificador: ATESTADOR }, create: { identificador: ATESTADOR, nome: ATESTADOR, criadoPor: "TESTE" }, update: {}, select: { id: true } });
  await prisma.vinculoUsuarioPessoa.create({ data: { usuarioId: u.id, pessoaId: atestador, tipo: "VINCULO", motivo: "fixture", criadoPor: "TESTE" } });
  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: PREPARA });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: PREPARA });
  await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: PREPARA });
  await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId, lotacaoId, salarioBase: "2000.00", criadoPor: PREPARA });
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: PREPARA });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: PREPARA });
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FP-VENC", descricao: "Vencimentos", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FPM", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [ids["VENC"]!], criadoPor: PREPARA });

  // A decisão do ente para o IR da folha (ementário STN 2026: 1.1.1.3.03.1.1, IR retido — trabalho — principal).
  await prisma.naturezaReceita.create({ data: { codigo: "11130311", descricao: "IRRF - Trabalho - Principal" } });
  await prisma.deParaFonteNaturezaDdr.create({ data: { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "Recursos não vinculados de impostos", versao: 1, criadoPor: PREPARA } });
  await prisma.tipoConsignacao.create({ data: { codigo: "IRRF", descricao: "IR retido", contaPassivoId: "c-ir-passivo", criadoPor: PREPARA } });
  // V28 — a contribuição do servidor é dele, retida e devida ao instituto: declarada para a rubrica PREV.
  const rpps = await prisma.tipoConsignacao.create({ data: { codigo: "RPPS", descricao: "Contribuição do servidor ao RPPS", contaPassivoId: "c-rpps-passivo", criadoPor: PREPARA }, select: { id: true } });
  rubricaPrev = ids["PREV"]!;
  rubricaVenc = ids["VENC"]!;
  rubricaIr = ids["IRRF"]!;
  tipoRpps = rpps.id;
  if (comDescontoDeclarado) await declararConsignacaoDaRubrica(prisma, { rubricaId: ids["PREV"]!, tipoConsignacaoId: rpps.id, credorConsignatario: "Instituto de Previdência do Município", fundamento: "Lei municipal do RPPS (fixture): a contribuição do servidor é retida e repassada ao instituto.", criadoPor: PREPARA });
  if (comDecisao) {
    await classificarRetencaoPropria(prisma, { fato: "IRRF_FOLHA", tipoConsignacaoCodigo: "IRRF", naturezaReceitaCodigo: "11130311", fonteCodigo: "500", contaCreditoCodigo: CRED_IR, contaVpaCodigo: VPA_IR_PF, entidadeTitularId: null, vigenteDesde: D(2026, 1, 1), fundamento: "MCASP 11ª ed., Parte I 3.6.2; ordem V26", criadoPor: PREPARA });
  }

  // A folha de junho até a liquidação, pelo caminho real.
  const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
  await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
  await fecharFolha(prisma, { folhaId, criadoPor: FECHA });
  await apropriarFolha(prisma, { folhaId, dataDoEmpenho: D(2026, 6, 25), criadoPor: FECHA });
  await designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: atestador, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 45/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: PREPARA });
  await certificarFolha(prisma, { folhaId, data: D(2026, 6, 26), criadoPor: ATESTADOR });
  await liquidarFolha(prisma, { folhaId, data: D(2026, 6, 27), criadoPor: FECHA });
  const elos = await prisma.liquidacaoDaFolha.findMany({ select: { liquidacaoId: true, empenhoDaFolha: { select: { vinculo: { select: { matricula: true } } } } } });
  liquidacaoDe = Object.fromEntries(elos.map((e) => [e.empenhoDaFolha.vinculo?.matricula ?? "", e.liquidacaoId]));
}

async function pagarComIr(matricula: string, numero: string, valor: string, dia = 28) {
  const liquidacaoId = liquidacaoDe[matricula]!;
  const ir = await irDaFolhaNoPagamento(prisma, { liquidacaoId, data: D(2026, 6, dia), contaBancariaId: "cb-folha" });
  // V28 — os descontos dos servidores entram como consignação, pela declaração de cada rubrica.
  const descontos = await descontosDaFolhaPendentes(prisma, liquidacaoId);
  const retencoes = (descontos?.porConsignacao ?? []).map((d) => ({ tipoConsignacaoId: d.tipoConsignacaoId, credorConsignatario: d.credorConsignatario, valor: d.valor, contaConsignacaoAPagar: "2.1.8.8.1.01.01" }));
  const proprias = ir?.propria == null ? [] : [ir.propria];
  return pagar(
    { liquidacaoId, numero, valor, data: D(2026, 6, dia), contaBancaria: "CC-001", fonteId: "fonte-500", historico: `Folha de junho ${matricula}`, criadoPor: PAGA },
    R_PAGAMENTO,
    criarM05DepsComContratos(prisma),
    proprias.length === 0 && retencoes.length === 0 ? undefined : { contaDisponibilidade: CAIXA, retencoes, proprias }
  );
}

async function saldoDe(codigo: string): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } } });
  return ps.reduce((s, x) => (x.tipo === "DEBITO" ? s.plus(x.valor.toString()) : s.minus(x.valor.toString())), new Decimal(0)).toFixed(2);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("V26 — o IR do servidor vira receita no pagamento da folha", { timeout: 300000 }, () => {
  beforeEach(async () => semear(), 300000);

  it("o IR de cada contracheque é o do fechamento (N=2): 270,00 e 180,00", async () => {
    const a = await irDaFolhaPendente(prisma, liquidacaoDe["MAT-A"]!);
    const b = await irDaFolhaPendente(prisma, liquidacaoDe["MAT-B"]!);
    expect([a?.total.toFixed(2), b?.total.toFixed(2)]).toEqual(["270.00", "180.00"]);
  });

  it("pagar a folha da MAT-A retém o IR como receita: banco pelo líquido, guia 11130311, elo contracheque → retenção → receita", async () => {
    const r = await pagarComIr("MAT-A", "NP-A", "3000.00");
    // V28 — à mão: 3.000,00 − 300,00 (previdência do servidor, 10%) − 270,00 (IR, 10% de 2.700,00) = 2.430,00.
    expect(await saldoDe(CAIXA)).toBe("-2430.00");
    expect(await saldoDe("2.1.8.8.1.01.01")).toBe("-300.00");
    const elo = await prisma.retencaoPropriaDoPagamento.findFirstOrThrow({ where: { pagamentoId: r.pagamentoId }, include: { receitaArrecadada: { include: { naturezaReceita: true } }, contrachequesDaFolha: { include: { contracheque: { include: { vinculo: true } } } } } });
    expect([elo.fato, elo.valor.toFixed(2), elo.receitaArrecadada.naturezaReceita.codigo, elo.grupoDaFolhaId !== null]).toEqual(["IRRF_FOLHA", "270.00", "11130311", true]);
    expect(elo.contrachequesDaFolha.map((c) => [c.contracheque.vinculo.matricula, c.valor.toFixed(2)])).toEqual([["MAT-A", "270.00"]]);
    expect(await saldoDe(VPA_IR_PF)).toBe("-270.00");
    expect(await saldoDe(CRED_IR)).toBe("0.00");
    expect(await saldoDe(PESSOAL)).toBe("-2000.00"); // a MAT-B ainda a pagar
  });

  it("pagar a folha sem reter o IR é recusado nomeando o valor — e nada é gravado", async () => {
    await expect(
      pagar({ liquidacaoId: liquidacaoDe["MAT-A"]!, numero: "NP-A", valor: "3000.00", data: D(2026, 6, 28), contaBancaria: "CC-001", fonteId: "fonte-500", historico: "Folha", criadoPor: PAGA }, R_PAGAMENTO, criarM05DepsComContratos(prisma))
    ).rejects.toThrow(/folha com 270\.00 de IR dos servidores ainda não retido/);
    expect(await prisma.pagamento.count()).toBe(0);
  });

  it("pagamento parcial: o IR sai uma vez, no primeiro; o segundo paga o resto sem IR; anulado o primeiro, o IR volta a pendente (N=2)", async () => {
    const p1 = await pagarComIr("MAT-A", "NP-A1", "1000.00");
    expect((await irDaFolhaPendente(prisma, liquidacaoDe["MAT-A"]!))?.total.toFixed(2)).toBe("0.00");
    await pagarComIr("MAT-A", "NP-A2", "2000.00", 29);
    expect(await saldoDe(CAIXA)).toBe("-2430.00");
    expect(await prisma.descontoDoContrachequeRetido.count()).toBe(1); // a previdência também sai uma vez só
    expect(await prisma.retencaoPropriaDoPagamento.count()).toBe(1);
    await anularPagamento({ pagamentoId: p1.pagamentoId, numero: "NP-A1-ANUL", data: D(2026, 6, 30), historico: "Pagamento em duplicidade ao servidor", criadoPor: PAGA }, criarM05DepsComContratos(prisma));
    expect((await irDaFolhaPendente(prisma, liquidacaoDe["MAT-A"]!))?.total.toFixed(2)).toBe("270.00");
    // e a previdência volta a pendente, numa geração nova
    expect((await descontosDaFolhaPendentes(prisma, liquidacaoDe["MAT-A"]!))?.itens.map((i) => [i.valor.toFixed(2), i.geracao])).toEqual([["300.00", 2]]);
    expect(await saldoDe(VPA_IR_PF)).toBe("0.00");
  });

  it("sem a decisão do ente para o IR da folha, o pagamento é recusado nomeando o cadastro", async () => {
    await semear(false);
    await expect(irDaFolhaNoPagamento(prisma, { liquidacaoId: liquidacaoDe["MAT-A"]!, data: D(2026, 6, 28), contaBancariaId: "cb-folha" })).rejects.toThrow(
      /IR retido na folha de pagamento: é imposto do próprio município.*Retenções do\s+próprio município/s
    );
  });
});

describe("V26 — o código de agrupamento da folha na liquidação (SAGRES §4.10 e §4.39)", { timeout: 300000 }, () => {
  let ug = "";
  let fora = "";
  beforeEach(async () => {
    await semear();
    await prisma.entidadeContabil.create({ data: { id: "ent-pref", codigo: "0001", criadoPor: PREPARA } });
    await prisma.versaoDaEntidadeContabil.create({ data: { entidadeId: "ent-pref", versao: 1, nome: "Prefeitura", tipoManad: "01", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica", criadoPor: PREPARA } });
    const base = { cnpj: null, vigenteDesde: D(2026, 1, 1), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: PREPARA };
    ug = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201001", nome: "Prefeitura", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref" })).id;
    fora = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201077", nome: "Instituto", naturezaJuridica: "AUTARQUIA_PREVIDENCIARIA", entidadeContabilId: null })).id;
  }, 300000);

  const numeroDe = async (matricula: string): Promise<string> => (await prisma.liquidacao.findUniqueOrThrow({ where: { id: liquidacaoDe[matricula]! }, select: { numero: true } })).numero;
  const registrar = (matricula: string, codigo: string, extra: Partial<{ ugId: string; competencia: string }> = {}) =>
    registrarAgrupamentoDaFolha(prisma, { liquidacaoId: liquidacaoDe[matricula]!, codigo, ugId: ug, competencia: JUNHO, sistemaDeOrigem: "Folha deste sistema", fundamento: "Remessa de pessoal de junho (fixture do teste)", criadoPor: FECHA, ...extra });
  const JUNHO_FIM = new Date(Date.UTC(2026, 5, 30));

  it("sem o código, o §4.39 nomeia as DUAS liquidações (N=2); com uma, só a outra; com as duas, sai um para um, e o §4.10 leva o código", async () => {
    const [a, b] = [await numeroDe("MAT-A"), await numeroDe("MAT-B")];
    await expect(gerarRelacionamentoLiquidacaoAgrupamentoFolha(prisma, { codUnidadeGestora: "201001", competencia: JUNHO_FIM })).rejects.toThrow(new RegExp(`sem o código de agrupamento da folha: liquidação ${[a, b].sort()[0]} .*; liquidação ${[a, b].sort()[1]} `));
    await registrar("MAT-A", "06FPA00001");
    const recusa = await gerarRelacionamentoLiquidacaoAgrupamentoFolha(prisma, { codUnidadeGestora: "201001", competencia: JUNHO_FIM }).then(
      () => "",
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    // Só a liquidação ainda sem código é nomeada; a que já tem não aparece mais.
    expect(recusa).toContain(`da folha: liquidação ${b} (empenho `);
    expect(recusa).toContain(", folha 2026-06). Informe");
    expect(recusa).not.toContain(`liquidação ${a} (`);
    await registrar("MAT-B", "06FPA00002");
    const l = (await gerarRelacionamentoLiquidacaoAgrupamentoFolha(prisma, { codUnidadeGestora: "201001", competencia: JUNHO_FIM })).conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(l.map((x) => [x.length, x.slice(0, 6), x.slice(6, 11), x.slice(25, 35)]).sort()).toEqual([
      [41, "201001", "01001", "06FPA00001"],
      [41, "201001", "01001", "06FPA00002"],
    ]);
    const liq = await lerFatosLiquidacao(prisma, { codUnidadeGestora: "201001", dia: new Date(Date.UTC(2026, 5, 27)) });
    expect(liq.map((x) => x.codAgrupamentoFolha).sort()).toEqual(["06FPA00001", "06FPA00002"]);
  });

  it("um para um e o mês da folha, cada recusa com o motivo; o código não vai a unidade de fora", async () => {
    const a = await numeroDe("MAT-A");
    await expect(registrar("MAT-A", "07FPA00001")).rejects.toThrow(/começa pelo mês 07, e a competência da folha é 2026-06/);
    await expect(registrar("MAT-A", "07FPA00001", { competencia: "2026-07" })).rejects.toThrow(new RegExp(`liquidação ${a} é da folha de 2026-06, não de 2026-07`));
    await expect(registrar("MAT-A", "06FPA0001")).rejects.toThrow(/10 posições/);
    await expect(registrar("MAT-A", "06FPA00001", { ugId: fora })).rejects.toThrow(/201077 é escriturada fora deste sistema/);
    await registrar("MAT-A", "06FPA00001");
    await expect(registrar("MAT-A", "06FPA00009")).rejects.toThrow(new RegExp(`liquidação ${a} já tem o código 06FPA00001`));
    await expect(registrar("MAT-B", "06FPA00001")).rejects.toThrow(new RegExp(`código 06FPA00001 já é da liquidação ${a} em 2026`));
    expect(await prisma.agrupamentoDaFolhaNaLiquidacao.count()).toBe(1);
  });
});

describe("V28 — os descontos dos servidores retidos no pagamento da folha", { timeout: 300000 }, () => {
  beforeEach(async () => semear(), 300000);

  it("pagar retendo o IR e NÃO a previdência é recusado nomeando credor e valores — e nada é gravado", async () => {
    const liquidacaoId = liquidacaoDe["MAT-A"]!;
    const ir = await irDaFolhaNoPagamento(prisma, { liquidacaoId, data: D(2026, 6, 28), contaBancariaId: "cb-folha" });
    await expect(
      pagar(
        { liquidacaoId, numero: "NP-A", valor: "3000.00", data: D(2026, 6, 28), contaBancaria: "CC-001", fonteId: "fonte-500", historico: "Folha", criadoPor: PAGA },
        R_PAGAMENTO,
        criarM05DepsComContratos(prisma),
        { contaDisponibilidade: CAIXA, retencoes: [], proprias: [ir!.propria!] }
      )
    ).rejects.toThrow(/retém 0\.00 para Instituto de Previdência do Município[\s\S]*somam 300\.00/);
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.descontoDoContrachequeRetido.count()).toBe(0);
  });

  it("N=2 servidores: cada liquidação retém o desconto do seu contracheque (300,00 e 200,00), e só ele", async () => {
    await pagarComIr("MAT-A", "NP-A", "3000.00");
    await pagarComIr("MAT-B", "NP-B", "2000.00");
    const elos = await prisma.descontoDoContrachequeRetido.findMany({ include: { contracheque: { include: { vinculo: true } } }, orderBy: { valor: "desc" } });
    expect(elos.map((e) => [e.contracheque.vinculo.matricula, e.valor.toFixed(2), e.geracao])).toEqual([["MAT-A", "300.00", 1], ["MAT-B", "200.00", 1]]);
    expect(await saldoDe("2.1.8.8.1.01.01")).toBe("-500.00");
    // à mão: 2.430,00 + (2.000,00 − 200,00 − 180,00) = 2.430,00 + 1.620,00 = 4.050,00
    expect(await saldoDe(CAIXA)).toBe("-4050.00");
  });

  it("dois pagamentos SIMULTÂNEOS da mesma liquidação — exatamente um retém, e o desconto não sai duas vezes", async () => {
    const r = await Promise.allSettled([pagarComIr("MAT-A", "NP-A1", "1500.00"), pagarComIr("MAT-A", "NP-A2", "1500.00")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.descontoDoContrachequeRetido.count()).toBe(1);
  });

  it("rubrica de desconto sem consignação declarada: o pagamento não é montado, e a recusa nomeia a rubrica", async () => {
    await semear(true, false);
    await expect(descontosDaFolhaPendentes(prisma, liquidacaoDe["MAT-A"]!)).rejects.toThrow(/descontos PREV \(Contribuicao\)[\s\S]*não têm consignação declarada/);
  });

  it("a declaração recusa provento, IR e redeclaração igual, nomeando o motivo; quem não gere consignações não declara", async () => {
    const base = { tipoConsignacaoId: tipoRpps, credorConsignatario: "Instituto de Previdência do Município", fundamento: "Lei municipal do RPPS (fixture), artigo da contribuição.", criadoPor: PREPARA };
    await expect(declararConsignacaoDaRubrica(prisma, { ...base, rubricaId: rubricaVenc })).rejects.toThrow(/é de provento/);
    await expect(declararConsignacaoDaRubrica(prisma, { ...base, rubricaId: rubricaIr })).rejects.toThrow(/IR retido é receita do município/);
    await expect(declararConsignacaoDaRubrica(prisma, { ...base, rubricaId: rubricaPrev })).rejects.toThrow(/já é retida como RPPS/);
    const leitor = "so.consulta.folha@cg.pb.gov.br";
    const perfil = await prisma.perfil.create({ data: { nome: "SO_CONSULTA_FOLHA", descricao: "so consulta", criadoPor: PREPARA, permissoes: { create: [{ acao: "CONSULTAR_FOLHA", criadoPor: PREPARA }] } }, select: { id: true } });
    const u = await prisma.usuario.create({ data: { identificador: leitor, nome: leitor, criadoPor: PREPARA }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: PREPARA } });
    await expect(declararConsignacaoDaRubrica(prisma, { ...base, rubricaId: rubricaPrev, credorConsignatario: "Outro instituto", criadoPor: leitor })).rejects.toThrow(/ACESSO NEGADO[\s\S]*GERIR_TIPOS_DE_CONSIGNACAO/);
    expect(await prisma.consignacaoDaRubrica.count()).toBe(1);
  });
});

describe("V28 — o custo da folha pelo centro de custo de cada vínculo", { timeout: 300000 }, () => {
  async function centros(): Promise<{ edu: string; sau: string; vinculoA: string; vinculoB: string }> {
    await prisma.setor.createMany({
      data: [
        { id: "cc-edu", codigo: "CC-EDU", nome: "Centro de custo Educacao", unidadeOrcId: "uo-01", criadoPor: PREPARA },
        { id: "cc-sau", codigo: "CC-SAU", nome: "Centro de custo Saude", unidadeOrcId: "uo-01", criadoPor: PREPARA },
      ],
    });
    const vs = await prisma.vinculo.findMany({ select: { id: true, matricula: true } });
    const v = Object.fromEntries(vs.map((x) => [x.matricula, x.id]));
    return { edu: "cc-edu", sau: "cc-sau", vinculoA: v["MAT-A"]!, vinculoB: v["MAT-B"]! };
  }
  beforeEach(async () => semear(), 300000);

  it("N=2 vínculos em centros diferentes; a mudança de julho não reescreve junho; repetir não grava de novo", async () => {
    const c = await centros();
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoA, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2026, 1, 1), motivo: "lotacao na educacao", centroDeCustoId: c.edu, criadoPor: PREPARA });
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoB, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2026, 1, 1), motivo: "lotacao na saude", centroDeCustoId: c.sau, criadoPor: PREPARA });
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoA, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2026, 7, 1), motivo: "cessao a saude em julho", centroDeCustoId: c.sau, criadoPor: PREPARA });

    const a = await apropriarCustoDaFolha(prisma, { liquidacaoId: liquidacaoDe["MAT-A"]!, criadoPor: PREPARA });
    const b = await apropriarCustoDaFolha(prisma, { liquidacaoId: liquidacaoDe["MAT-B"]!, criadoPor: PREPARA });
    // à mão: MAT-A 3.000,00 na educação (o centro de 30 de junho), MAT-B 2.000,00 na saúde.
    expect(a.partes.map((x) => [x.centroId, x.valor.toFixed(2)])).toEqual([["cc-edu", "3000.00"]]);
    expect(b.partes.map((x) => [x.centroId, x.valor.toFixed(2)])).toEqual([["cc-sau", "2000.00"]]);

    const de_novo = await apropriarCustoDaFolha(prisma, { liquidacaoId: liquidacaoDe["MAT-A"]!, criadoPor: PREPARA });
    expect([de_novo.novo, de_novo.apropriacaoId]).toEqual([false, a.apropriacaoId]);
    expect(await prisma.apropriacaoDeCusto.count()).toBe(2);
    const porCentro = await prisma.itemDaApropriacaoDeCusto.groupBy({ by: ["centroId"], _sum: { valor: true }, orderBy: { centroId: "asc" } });
    expect(porCentro.map((x) => [x.centroId, x._sum.valor?.toFixed(2)])).toEqual([["cc-edu", "3000.00"], ["cc-sau", "2000.00"]]);
  });

  it("vínculo sem centro de custo na competência: recusa nomeando a matrícula, e nada é gravado", async () => {
    const c = await centros();
    // MAT-B ganha centro só em julho: em junho ela não tinha.
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoB, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2026, 7, 1), motivo: "apropriacao a partir de julho", centroDeCustoId: c.sau, criadoPor: PREPARA });
    await expect(apropriarCustoDaFolha(prisma, { liquidacaoId: liquidacaoDe["MAT-B"]!, criadoPor: PREPARA })).rejects.toThrow(/matrículas MAT-B não têm centro de custo na competência 2026-06/);
    expect(await prisma.apropriacaoDeCusto.count()).toBe(0);
  });

  it("quem não apropria custo não apropria a folha — recusa nomeando a ação", async () => {
    await centros();
    const leitor = "so.consulta.custos@cg.pb.gov.br";
    const perfil = await prisma.perfil.create({ data: { nome: "SO_CONSULTA_CUSTOS", descricao: "so consulta", criadoPor: PREPARA, permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: PREPARA }] } }, select: { id: true } });
    const u = await prisma.usuario.create({ data: { identificador: leitor, nome: leitor, criadoPor: PREPARA }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: PREPARA } });
    await expect(apropriarCustoDaFolha(prisma, { liquidacaoId: liquidacaoDe["MAT-A"]!, criadoPor: leitor })).rejects.toThrow(/ACESSO NEGADO[\s\S]*APROPRIAR_CUSTO/);
    expect(await prisma.apropriacaoDeCusto.count()).toBe(0);
  });
});
