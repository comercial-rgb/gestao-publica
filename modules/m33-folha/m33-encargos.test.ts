import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { registrarMovimentoDotacao } from "../m05-despesa/dotacao-razao.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha, lancarNaFolha } from "./servico.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha } from "./apropriacao.js";
import { certificarFolha, designarNaFolha } from "./certificacao.js";
import { anularEmpenhoParcial } from "../m05-despesa/anulacao-parcial.js";
import { baixarGuiaDeRecolhimento, cancelarGuiaDeRecolhimento, guiasEObrigacoesDaFolha, registrarGuiaDeRecolhimento } from "./recolhimento.js";
import { pagar } from "../m05-despesa/servico-bloco2.js";
import { roteiroPagamento } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import {
  ajustarEncargosDaFolha,
  apropriarEncargosDaFolha,
  apurarEncargosDaFolha,
  aprovarVersaoDoEncargo,
  cadastrarComponenteDeEncargo,
  cadastrarGrupoDosEncargos,
  cadastrarVersaoDoEncargo,
  certificarEncargosDaFolha,
  encargosDaFolha,
  liquidarEncargosDaFolha,
  retratoDosEncargos,
} from "./encargos-servico.js";
import { elegibilidadeParaAjustarEncargos, elegibilidadeParaApropriarEncargos, elegibilidadeParaCertificarEncargos, elegibilidadeParaLiquidarEncargos } from "./encargos.js";

/**
 * ═══ OS ENCARGOS DO EMPREGADOR, CONTRA O BANCO — PROFUNDIDADE ═══
 *
 * FIXTURE N=2: dois vínculos RGPS, dois componentes RGPS (patronal 20% e RAT 1,5%, SINTÉTICOS) e um
 * RPPS sem ninguém do regime; duas fichas de encargos para a retomada por grupo; duas apurações para
 * a retificação. Os esperados são contas feitas à mão, com a conta ao lado.
 *
 *   MAT-A: vencimento 3000,00 + horas extras 500,00 → base 3500,00 → patronal 700,00, RAT 52,50
 *   MAT-B: vencimento 2000,00 + horas extras 300,00 → base 2300,00 → patronal 460,00, RAT 34,50
 *   total 1247,00 (patronal 1160,00; RAT 87,00)
 *
 * O que este arquivo existe para impedir: patronal que muda o contracheque; desconto do servidor
 * empenhado como despesa; parâmetro ausente virando zero; o atesto salarial valendo pelos encargos;
 * retry que empenha de novo; retificação que empenha o total em vez da diferença.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const RH = "contabilidade@cg.pb.gov.br";
const APROVADOR = "juridico@cg.pb.gov.br";
const ATESTADOR = "gabinete@cg.pb.gov.br";
const LIQUIDANTE = "despesa@cg.pb.gov.br";

const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const DATA_EMPENHO = D(2026, 5, 30);
const DATA_ATESTO = D(2026, 6, 2);

let folhaId = "";
let rubricaVenc = "";
let rubricaHext = "";
let rubricaGrat = "";
let pessoaAtestador = "";
let instituto = "";
let compPatr = "";
let compRat = "";

async function pessoa(documento: string, nome: string, tipo: "FISICA" | "JURIDICA" = "FISICA"): Promise<string> {
  return (await prisma.pessoa.create({ data: { documento, tipo, criadoPor: RH, versoes: { create: { nome, criadoPor: RH } } }, select: { id: true } })).id;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.enteConfig.create({ data: { id: "unico", codigoIbge: "2504009", poderOrgao: "10131", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", nome: "Municipio de Teste", cnpj: "08993917000146", conferidoPor: "TESTE", conferidoEm: D(2026, 1, 1) } });
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Credito disponivel", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Credito empenhado a liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Credito liquidado a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr", codigo: "8.2.1.1.1.00.00", nome: "DDR disponivel", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-ddr-emp", codigo: "8.2.1.1.2.01.00", nome: "DDR comprometida por empenho", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr-liq", codigo: "8.2.1.1.3.01.00", nome: "DDR comprometida por liquidacao", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-pessoal", codigo: "3.1.1.1.1.01.00", nome: "Vencimentos (fixture)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-pessoal-pagar", codigo: "2.1.1.1.1.01.01", nome: "Salarios a pagar (fixture)", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      // As contas dos ENCARGOS — de fixture: a escolha real é do contador do ente, pelo grupo.
      { id: "c-vpd-encargos", codigo: "3.1.2.1.1.01.00", nome: "Encargos patronais (fixture)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-encargos-pagar", codigo: "2.1.1.4.1.01.00", nome: "Encargos sociais a pagar (fixture)", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-sintetica", codigo: "3.1.2.0.0.00.00", nome: "Sintetica (fixture)", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
      // V7 M1 U3 — o pagamento dos encargos (para provar o "já pago" do ajuste para baixo).
      { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Credito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr-uti", codigo: "8.2.1.1.4.01.00", nome: "DDR utilizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos (fixture)", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administracao", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.createMany({ data: [{ id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" }, { id: "aca2", codigo: "2002", descricao: "B", tipo: "ATIVIDADE" }] });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos" },
      { id: "nd-13", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "13", codigoCompleto: "319013", descricao: "Obrigacoes patronais" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb-1", codigo: "CC-ENC", descricao: "Movimento (fixture)", fonteId: "fonte-500" } });
  const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", fonteId: "fonte-500" };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-venc", numero: 1, naturezaDespesaId: "nd-11", valorDotado: "500000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-encargos", numero: 2, naturezaDespesaId: "nd-13", valorDotado: "500000.00" });
  // A segunda ficha de encargos é CURTA (50,00): é ela que interrompe a retomada por grupo.
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-encargos-curta", numero: 3, acaoId: "aca2", naturezaDespesaId: "nd-13", valorDotado: "50.00" });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 5, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: RH });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: RH });
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  instituto = await pessoa("11222333000181", "Instituto de Previdencia (fixture)", "JURIDICA");
  pessoaAtestador = await pessoa("28625006871", "Carla Atestadora");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
  await prisma.vinculoUsuarioPessoa.create({ data: { usuarioId: u.id, pessoaId: pessoaAtestador, tipo: "VINCULO", motivo: "fixture", criadoPor: "TESTE" } });

  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: RH });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: RH });
  const v1 = (await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: RH })).vinculoId;
  const v2 = (await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "2000.00", criadoPor: RH })).vinculoId;

  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: RH });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "10000.00", aliquota: "0" }, { ordem: 2, ate: null, aliquota: "0.15", parcelaADeduzir: "1500.00" }], criadoPor: RH });
  rubricaVenc = (await cadastrarRubrica(prisma, { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: RH })).rubricaId;
  rubricaGrat = (await cadastrarRubrica(prisma, { codigo: "GRAT", descricao: "Gratificacoes", tipo: "PROVENTO", natureza: "GRATIFICACOES_DO_VINCULO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 2, fundamentacaoLegal: "fixture", criadoPor: RH })).rubricaId;
  rubricaHext = (await cadastrarRubrica(prisma, { codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: RH })).rubricaId;
  await cadastrarRubrica(prisma, { codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: RH });
  await cadastrarRubrica(prisma, { codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: RH });
  await lancarNaFolha(prisma, { vinculoId: v1, rubricaId: rubricaHext, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "500.00", criadoPor: RH });
  await lancarNaFolha(prisma, { vinculoId: v2, rubricaId: rubricaHext, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "300.00", criadoPor: RH });

  folhaId = (await abrirFolha(prisma, { competencia: "2026-05", criadoPor: RH })).folhaId;
  await calcularFolha(prisma, { folhaId, criadoPor: RH });
  await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
    codigo: "FOLHA-VENC", descricao: "Vencimentos", fichaId: "ficha-venc", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP",
    porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaGrat, rubricaHext], criadoPor: RH,
  });
  await fecharFolha(prisma, { folhaId, criadoPor: RH });
  await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });

  compPatr = (await cadastrarComponenteDeEncargo(prisma, { codigo: "RGPS-PATRONAL", descricao: "Cota patronal RGPS (sintetica)", tipo: "PREVIDENCIA_PATRONAL", regime: "RGPS", criadoPor: RH })).componenteId;
  compRat = (await cadastrarComponenteDeEncargo(prisma, { codigo: "RGPS-RAT", descricao: "RAT (sintetico)", tipo: "RISCO_AMBIENTAL_DO_TRABALHO", regime: "RGPS", criadoPor: RH })).componenteId;
  await cadastrarComponenteDeEncargo(prisma, { codigo: "RPPS-PATRONAL", descricao: "Patronal RPPS (sintetica)", tipo: "PREVIDENCIA_PATRONAL", regime: "RPPS", criadoPor: RH });
}

async function versaoAprovada(componenteId: string, aliquota: string, inicio = "2026-01"): Promise<string> {
  const { versaoId } = await cadastrarVersaoDoEncargo(prisma, { componenteId, competenciaInicio: inicio, aliquota, fundamentacaoLegal: "perfil SINTETICO de teste", sintetica: true, rubricaIds: [rubricaVenc, rubricaHext], criadoPor: RH });
  await aprovarVersaoDoEncargo(prisma, { versaoId, criadoPor: APROVADOR });
  return versaoId;
}

async function grupoUnico(): Promise<string> {
  return (await cadastrarGrupoDosEncargos(prisma, {
    codigo: "ENCARGOS", descricao: "Encargos patronais", fichaId: "ficha-encargos", serie: "FE", credorId: instituto, tipoEmpenho: "ORDINARIO",
    categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contaVariacaoId: "c-vpd-encargos", contaObrigacaoId: "c-encargos-pagar", componenteIds: [compPatr, compRat], criadoPor: RH,
  })).grupoId;
}

async function designarParaEncargos(): Promise<void> {
  await designarNaFolha(prisma, { atribuicao: "CERTIFICAR_ENCARGOS_DA_FOLHA", pessoaId: pessoaAtestador, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 77/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: RH });
}

async function fotografiaDaFolhaSalarial() {
  const c = await prisma.calculoDaFolha.findMany({ where: { folhaId }, select: { sha256: true, totalLiquido: true } });
  const cc = await prisma.contracheque.findMany({ where: { calculo: { folhaId } }, orderBy: { vinculoId: "asc" }, select: { sha256: true, liquido: true, totalDescontos: true } });
  const emp = await prisma.empenhoDaFolha.findMany({ orderBy: { empenhoId: "asc" }, select: { empenhoId: true, valor: true } });
  return JSON.stringify({ c, cc, emp });
}

beforeEach(semear, 60_000);

describe("(1) parâmetros: cadastro, aprovação por outra pessoa, e a base só de provento", () => {
  it("quem cadastra não aprova; desconto não compõe a base; versão com o mesmo início é ambígua", async () => {
    const { versaoId } = await cadastrarVersaoDoEncargo(prisma, { componenteId: compPatr, competenciaInicio: "2026-01", aliquota: "0.20", fundamentacaoLegal: "perfil SINTETICO", sintetica: true, rubricaIds: [rubricaVenc], criadoPor: RH });
    await expect(aprovarVersaoDoEncargo(prisma, { versaoId, criadoPor: RH })).rejects.toThrow(/AUTOAPROVACAO-DO-ENCARGO/);
    const prev = await prisma.rubrica.findUniqueOrThrow({ where: { codigo: "PREV" }, select: { id: true } });
    await expect(cadastrarVersaoDoEncargo(prisma, { componenteId: compRat, competenciaInicio: "2026-01", aliquota: "0.015", fundamentacaoLegal: "perfil SINTETICO", sintetica: true, rubricaIds: [prev.id], criadoPor: RH })).rejects.toThrow(/RUBRICA-DE-DESCONTO-NA-BASE-DO-ENCARGO/);
    await expect(cadastrarVersaoDoEncargo(prisma, { componenteId: compPatr, competenciaInicio: "2026-01", aliquota: "0.21", fundamentacaoLegal: "perfil SINTETICO", sintetica: true, rubricaIds: [rubricaVenc], criadoPor: RH })).rejects.toThrow(/VERSAO-AMBIGUA/);
    expect(await prisma.aprovacaoDoEncargo.count()).toBe(0);
  });
});

describe("(2) a apuração sobre a folha fechada", () => {
  it("calcula os DOIS vínculos × DOIS componentes contra números à mão, e o RPPS é NÃO APLICÁVEL", async () => {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    const antes = await fotografiaDaFolhaSalarial();
    const r = await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    expect(r.numero).toBe(1);
    expect(r.completa).toBe(true);
    expect(r.total.toFixed(2)).toBe("1247.00"); // 700 + 52,50 + 460 + 34,50
    expect(r.porComponente.map((p) => `${p.codigo}=${p.total}/${p.calculados}/${p.naoAplicaveis}`)).toEqual(["RGPS-PATRONAL=1160.00/2/0", "RGPS-RAT=87.00/2/0", "RPPS-PATRONAL=0.00/0/2"]);
    expect(r.complementar).toBe(false);
    // ⚠️ A FOLHA SALARIAL NÃO MUDOU: cálculo, contracheques (sha e líquido) e empenhos salariais.
    expect(await fotografiaDaFolhaSalarial()).toBe(antes);
  });

  it("PARÂMETRO AUSENTE: a apuração é gravada INCOMPLETA, e o atesto e o empenho recusam com o motivo", async () => {
    await versaoAprovada(compPatr, "0.20");
    const r = await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    expect(r.completa).toBe(false);
    expect(r.total.toFixed(2)).toBe("1160.00");
    await designarParaEncargos();
    await expect(certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(/APURACAO-INCOMPLETA/);
    await grupoUnico();
    await expect(apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH })).rejects.toThrow(/APURACAO-INCOMPLETA/);
    expect(await prisma.empenhoDosEncargos.count()).toBe(0);
    // Aprovada a versão que faltava, a apuração nº 2 fica completa — a nº 1 continua no histórico.
    await versaoAprovada(compRat, "0.015");
    const r2 = await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    expect([r2.numero, r2.completa, r2.total.toFixed(2)]).toEqual([2, true, "1247.00"]);
    expect((await encargosDaFolha(prisma, folhaId)).comparativo.find((c) => c.codigo === "RGPS-RAT")).toEqual({ codigo: "RGPS-RAT", anterior: "0.00", vigente: "87.00", diferenca: "87.00" });
  });

  it("SEM MUDANÇA não gera versão; DUAS apurações simultâneas gravam UMA", async () => {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    const rs = await Promise.allSettled([apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH }), apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH })]);
    expect(rs.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recusa = rs.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    expect(String(recusa?.reason)).toMatch(/APURACAO-CONCORRENTE|APURACAO-SEM-MUDANCA/);
    expect(await prisma.apuracaoDeEncargos.count()).toBe(1);
    await expect(apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH })).rejects.toThrow(/APURACAO-SEM-MUDANCA/);
  });

  it("a folha já ATESTADA antes dos encargos: a apuração nasce COMPLEMENTAR, e o atesto salarial não a certifica", async () => {
    await designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaAtestador, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 45/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: RH });
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    const r = await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    expect(r.complementar).toBe(true);
    // Designada para a FOLHA, não para os ENCARGOS: a atribuição é outra.
    await expect(certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(/SEM-DESIGNACAO-VIGENTE/);
    expect(await prisma.certificacaoDosEncargos.count()).toBe(0);
  });

  it("sem a ação APURAR_ENCARGOS_DA_FOLHA não apura — e diz qual crachá falta", async () => {
    await prisma.usuario.upsert({ where: { identificador: "estagiario.rh@cg.pb.gov.br" }, update: {}, create: { identificador: "estagiario.rh@cg.pb.gov.br", nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(apurarEncargosDaFolha(prisma, { folhaId, criadoPor: "estagiario.rh@cg.pb.gov.br" })).rejects.toThrow(/APURAR_ENCARGOS_DA_FOLHA/);
  });
});

describe("(3) atesto, empenho e liquidação dos encargos", () => {
  async function ateOAtesto(): Promise<void> {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    await designarParaEncargos();
  }

  it("quem apurou não certifica; o designado certifica preso ao sha256 da apuração", async () => {
    await ateOAtesto();
    await expect(certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: RH })).rejects.toThrow(/AUTOCERTIFICACAO-DOS-ENCARGOS|SEM-DESIGNACAO/);
    const c = await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    const a = await prisma.apuracaoDeEncargos.findFirstOrThrow({ select: { sha256: true } });
    expect(c.sha256).toBe(a.sha256);
    await expect(certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(/ENCARGOS-JA-CERTIFICADOS/);
  });

  it("componente com valor SEM grupo recusa antes de gravar; com o grupo, UM empenho de 1247,00 — e nenhum desconto do servidor", async () => {
    await ateOAtesto();
    await expect(apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH })).rejects.toThrow(/COMPONENTE-SEM-GRUPO-DE-EMPENHO: RGPS-PATRONAL, RGPS-RAT/);
    expect(await prisma.empenho.count({ where: { fichaId: "ficha-encargos" } })).toBe(0);
    await grupoUnico();
    const r = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    expect([r.empenhados, r.total.toFixed(2)]).toEqual([1, "1247.00"]);
    const emp = await prisma.empenho.findMany({ where: { fichaId: "ficha-encargos" }, select: { numero: true, valor: true, credorCpfCnpj: true } });
    expect(emp.map((e) => `${e.numero}=${e.valor.toFixed(2)}`)).toEqual(["FE/2026-05/ENCARGOS-E1=1247.00"]);
    // A contribuição RETIDA (10% de 3500 + 10% de 2300 = 580,00) NÃO foi empenhada em lugar nenhum.
    const todos = await prisma.empenho.findMany({ select: { valor: true } });
    expect(todos.some((e) => e.valor.toFixed(2) === "580.00" || e.valor.toFixed(2) === "350.00" || e.valor.toFixed(2) === "230.00")).toBe(false);
    const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "ficha-encargos" }, select: { saldoEmpenhado: true } });
    expect(ficha.saldoEmpenhado.toFixed(2)).toBe("1247.00");
    // Reexecutar não duplica.
    const r2 = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH }).catch((e: Error) => e);
    expect(String(r2 instanceof Error ? r2.message : "")).toMatch(/ENCARGOS-JA-EMPENHADOS/);
    expect(await prisma.empenhoDosEncargos.count()).toBe(1);
  });

  it("RETOMADA POR GRUPO: o grupo sem saldo para e diz onde; resolvida a causa, só ele é empenhado", async () => {
    await ateOAtesto();
    await cadastrarGrupoDosEncargos(prisma, { codigo: "ENC-A-RAT", descricao: "RAT", fichaId: "ficha-encargos", serie: "FR", credorId: instituto, tipoEmpenho: "ORDINARIO", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contaVariacaoId: "c-vpd-encargos", contaObrigacaoId: "c-encargos-pagar", componenteIds: [compRat], criadoPor: RH });
    await cadastrarGrupoDosEncargos(prisma, { codigo: "ENC-B-PATR", descricao: "Patronal", fichaId: "ficha-encargos-curta", serie: "FP2", credorId: instituto, tipoEmpenho: "ORDINARIO", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contaVariacaoId: "c-vpd-encargos", contaObrigacaoId: "c-encargos-pagar", componenteIds: [compPatr], criadoPor: RH });
    await expect(apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH })).rejects.toThrow(/EMPENHO-DOS-ENCARGOS-INTERROMPIDO: 1 empenho\(s\).*ENC-B-PATR/s);
    expect((await prisma.empenhoDosEncargos.findMany({ select: { valor: true } })).map((e) => e.valor.toFixed(2))).toEqual(["87.00"]);
    // a causa se resolve: crédito na ficha curta (fixture do crédito adicional)
    await prisma.$transaction((tx) => registrarMovimentoDotacao(tx, { fichaId: "ficha-encargos-curta", tipo: "CREDITO_ADICIONAL", valor: "2000.00", origemTipo: "TESTE", criadoPor: RH, data: D(2026, 5, 2) }));
    const { recalcularCache } = await import("../m05-despesa/adapter-prisma.js");
    await prisma.$transaction((tx) => recalcularCache(tx as never, "ficha-encargos-curta"));
    const r = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    expect([r.empenhados, r.jaExistiam]).toEqual([1, 1]);
    expect((await prisma.empenhoDosEncargos.findMany({ orderBy: { valor: "asc" }, select: { valor: true } })).map((e) => e.valor.toFixed(2))).toEqual(["87.00", "1160.00"]);
  });

  it("RETIFICAÇÃO: nova versão do parâmetro empenha só a DIFERENÇA; redução recusa pedindo anulação", async () => {
    await ateOAtesto();
    await grupoUnico();
    await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    // o patronal passa a 22% a partir de maio (ato corrigido): 3500×0,22 + 2300×0,22 = 770 + 506 = 1276; total 1363,00
    await versaoAprovada(compPatr, "0.22", "2026-05");
    const r2 = await apurarEncargosDaFolha(prisma, { folhaId, motivo: "portaria corrigida", criadoPor: RH });
    expect([r2.numero, r2.total.toFixed(2)]).toEqual([2, "1363.00"]);
    const e2 = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    expect(e2.porGrupo).toEqual([{ codigo: "ENCARGOS", pedido: "1363.00", jaEmpenhado: "1247.00", empenhado: "116.00" }]);
    expect(await prisma.empenhoDosEncargos.count()).toBe(2);
    // e a REDUÇÃO: o RAT corrigido para 0,5% a partir de maio
    await versaoAprovada(compRat, "0.005", "2026-05"); // RAT 0,5%: 17,50 + 11,50 = 29,00 → total 1305,00 < 1363,00
    await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    // V7 M1 U3: a redução NÃO é empenho negativo — apropriar diz que não há o que empenhar, e o ato é o ajuste.
    await expect(apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH })).rejects.toThrow(/ENCARGOS-JA-EMPENHADOS/);
    expect(await prisma.empenhoDosEncargos.count()).toBe(2);
  });

  it("LIQUIDAÇÃO: sem atesto dos encargos recusa; certificada, liquida com as contas do grupo, sem estoque; quem certificou não liquida", async () => {
    await ateOAtesto();
    await grupoUnico();
    await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    await expect(liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE })).rejects.toThrow(/ENCARGOS-NAO-CERTIFICADOS/);
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(/AUTOLIQUIDACAO-DOS-ENCARGOS/);
    const antes = await fotografiaDaFolhaSalarial();
    const r = await liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE });
    expect([r.liquidadas, r.pendentes, r.total.toFixed(2)]).toEqual([1, 0, "1247.00"]);
    const liq = await prisma.liquidacao.findFirstOrThrow({ where: { liquidacaoDosEncargos: { isNot: null } }, select: { id: true, responsavelAtesto: true, notaFiscalNum: true } });
    expect(liq.responsavelAtesto).toBe("Carla Atestadora (Portaria 77/2026)");
    expect(liq.notaFiscalNum).toBeNull();
    const partidas = await prisma.partidaContabil.findMany({ where: { lancamento: { origemTipo: "LIQUIDACAO" } }, select: { tipo: true, subsistema: true, conta: { select: { codigo: true } } } });
    expect(partidas.filter((p) => p.subsistema === "PATRIMONIAL").map((p) => `${p.tipo}:${p.conta.codigo}`).sort()).toEqual(["CREDITO:2.1.1.4.1.01.00", "DEBITO:3.1.2.1.1.01.00"]);
    expect(await prisma.movimentoAlmoxarifado.count()).toBe(0);
    expect(await fotografiaDaFolhaSalarial()).toBe(antes);
    const r2 = await liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE }).catch((e: Error) => e);
    expect(r2 instanceof Error ? r2.message : "").toMatch(/ENCARGOS-JA-LIQUIDADOS/);
    expect(await prisma.liquidacaoDosEncargos.count()).toBe(1);
  });

  it("PARIDADE: o retrato projeta o que o serviço faz, estado a estado", async () => {
    await ateOAtesto();
    const cod = (e: { situacao: string; codigo?: string }) => (e.situacao === "ELEGIVEL" ? "ELEGIVEL" : e.codigo);
    let r = await retratoDosEncargos(prisma, folhaId, RH, { consultarDesignacao: true });
    expect(cod(elegibilidadeParaCertificarEncargos(r!.estado, r!.ator))).toBe("AUTOCERTIFICACAO-DOS-ENCARGOS");
    r = await retratoDosEncargos(prisma, folhaId, ATESTADOR, { consultarDesignacao: true });
    expect(cod(elegibilidadeParaCertificarEncargos(r!.estado, r!.ator))).toBe("ELEGIVEL");
    // sem grupo: a tela trava apropriar com o MESMO código que o serviço recusa
    expect(cod(elegibilidadeParaApropriarEncargos(r!.estado))).toBe("COMPONENTE-SEM-GRUPO-DE-EMPENHO");
    await expect(apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH })).rejects.toThrow(/COMPONENTE-SEM-GRUPO-DE-EMPENHO/);
    expect(cod(elegibilidadeParaLiquidarEncargos(r!.estado, r!.ator))).toBe("ENCARGOS-NAO-CERTIFICADOS");
    await expect(liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE })).rejects.toThrow(/ENCARGOS-NAO-CERTIFICADOS/);
    await grupoUnico();
    await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    r = await retratoDosEncargos(prisma, folhaId, RH, { consultarDesignacao: false });
    expect(cod(elegibilidadeParaApropriarEncargos(r!.estado))).toBe("ENCARGOS-JA-EMPENHADOS");
    const antesDoAtesto = r!.versao;
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    r = await retratoDosEncargos(prisma, folhaId, LIQUIDANTE, { consultarDesignacao: false });
    expect(r!.versao).not.toBe(antesDoAtesto);
    expect(cod(elegibilidadeParaLiquidarEncargos(r!.estado, r!.ator))).toBe("ELEGIVEL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (6) V7 M1 U3 — O AJUSTE PARA BAIXO, com os fatos posteriores
// ═══════════════════════════════════════════════════════════════════════════════

describe("(6) ajuste para baixo: empenhado, liquidado não pago e já pago", () => {
  const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.1.4.1.01.00", disponibilidade: "1.1.1.1.2.00.00" });
  const MOTIVO = "Portaria que corrigiu o RAT de maio";

  async function empenhado1247(): Promise<void> {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    await designarParaEncargos();
    await grupoUnico();
    await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
  }
  /** RAT 0,5% a partir de maio: 17,50 + 11,50 = 29,00 → total 1189,00 (redução de 58,00). */
  async function reduzirRat(): Promise<void> {
    await versaoAprovada(compRat, "0.005", "2026-05");
    await apurarEncargosDaFolha(prisma, { folhaId, motivo: "RAT corrigido", criadoPor: RH });
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
  }
  const liquidoDaFicha = async () => (await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "ficha-encargos" }, select: { saldoEmpenhado: true } })).saldoEmpenhado.toFixed(2);

  it("EMPENHADO NÃO LIQUIDADO: anula pelo M05 só o excedente; retomar não anula de novo; novo AUMENTO empenha só o que falta sobre o LÍQUIDO", async () => {
    await empenhado1247();
    await reduzirRat();
    const r = await ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH });
    expect(r.porGrupo).toEqual([{ codigo: "ENCARGOS", apurado: "1189.00", empenhadoAntes: "1247.00", anuladoDeLiquidacao: "0.00", anuladoDeEmpenho: "58.00", restituicaoRegistrada: "0.00" }]);
    expect(await liquidoDaFicha()).toBe("1189.00");
    const anul = await prisma.empenho.findMany({ where: { anulacaoParcialDeId: { not: null } }, select: { valor: true, lancamentoId: true } });
    expect(anul.map((a) => a.valor.toFixed(2))).toEqual(["58.00"]);
    expect(anul[0]?.lancamentoId).not.toBeNull();
    // A memória da apuração anterior continua como estava.
    expect((await prisma.apuracaoDeEncargos.findMany({ orderBy: { numero: "asc" }, select: { total: true } })).map((a) => a.total.toFixed(2))).toEqual(["1247.00", "1189.00"]);
    // RETOMADA: ajustar de novo não tem o que fazer — e diz.
    await expect(ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH })).rejects.toThrow(/SEM-REDUCAO-A-AJUSTAR/);
    expect(await prisma.empenho.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(1);
    // NOVO AUMENTO: patronal 22% → 1276 + 29 = 1305; empenha 116,00 sobre 1189 (não 58 + 116, não 1305).
    await versaoAprovada(compPatr, "0.22", "2026-05");
    await apurarEncargosDaFolha(prisma, { folhaId, motivo: "patronal corrigido", criadoPor: RH });
    const e = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    expect(e.porGrupo).toEqual([{ codigo: "ENCARGOS", pedido: "1305.00", jaEmpenhado: "1189.00", empenhado: "116.00" }]);
    expect(await liquidoDaFicha()).toBe("1305.00");
  });

  it("LIQUIDADO NÃO PAGO: anula a liquidação pelo M05 e depois o empenho; o liquidado e o empenhado líquidos batem com a apuração", async () => {
    await empenhado1247();
    await liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE });
    await reduzirRat();
    const r = await ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH });
    expect(r.porGrupo[0]).toMatchObject({ anuladoDeLiquidacao: "58.00", anuladoDeEmpenho: "58.00", restituicaoRegistrada: "0.00" });
    expect((await prisma.ajusteDosEncargos.findMany({ orderBy: { tipo: "asc" }, select: { tipo: true, valor: true } })).map((a) => `${a.tipo}=${a.valor.toFixed(2)}`)).toEqual(["ANULACAO_DE_LIQUIDACAO=58.00", "ANULACAO_DE_EMPENHO=58.00"]);
    expect(await liquidoDaFicha()).toBe("1189.00");
    // A liquidação original continua lá (a anulação é fato novo), valendo menos.
    expect(await prisma.liquidacao.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(1);
  });

  it("JÁ PAGO: nada se anula; fica a RESTITUIÇÃO A PROVIDENCIAR — uma só, mesmo repetindo", async () => {
    await empenhado1247();
    await liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE });
    const liq = await prisma.liquidacaoDosEncargos.findFirstOrThrow({ select: { liquidacaoId: true } });
    await pagar({ liquidacaoId: liq.liquidacaoId, numero: "PG-ENC-1", valor: "1247.00", data: D(2026, 6, 5), contaBancaria: "CC-ENC", fonteId: "fonte-500", historico: "Recolhimento dos encargos (fixture)", criadoPor: RH }, R_PAG, criarM05DepsComContratos(prisma));
    await reduzirRat();
    const r = await ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH });
    expect(r.porGrupo[0]).toMatchObject({ anuladoDeLiquidacao: "0.00", anuladoDeEmpenho: "0.00", restituicaoRegistrada: "58.00" });
    expect(await prisma.empenho.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(0);
    expect(await prisma.liquidacao.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(0);
    const r2 = await ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH });
    expect([r2.atos, r2.reconhecidos]).toEqual([0, 1]);
    expect(await prisma.ajusteDosEncargos.count({ where: { tipo: "RESTITUICAO_A_PROVIDENCIAR" } })).toBe(1);
  });

  it("CONCORRÊNCIA: dois ajustes simultâneos produzem UMA anulação e UM rastro", async () => {
    await empenhado1247();
    await reduzirRat();
    const rs = await Promise.allSettled([1, 2].map(() => ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH })));
    expect(rs.some((x) => x.status === "fulfilled")).toBe(true);
    expect(await prisma.empenho.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(1);
    expect(await prisma.ajusteDosEncargos.count()).toBe(1);
    expect(await liquidoDaFicha()).toBe("1189.00");
  });

  it("RESPOSTA PERDIDA: a anulação do M05 foi gravada e o rastro não — o ajuste RECONHECE e não anula de novo", async () => {
    await empenhado1247();
    await reduzirRat();
    const elo = await prisma.empenhoDosEncargos.findFirstOrThrow({ select: { empenhoId: true } });
    const apuracao = await prisma.apuracaoDeEncargos.findFirstOrThrow({ orderBy: { numero: "desc" }, select: { numero: true } });
    // o "primeiro envio": o M05 comitou a anulação com o número determinístico, e a resposta se perdeu
    await anularEmpenhoParcial({ originalId: elo.empenhoId, numero: `FE/2026-05/ENCARGOS-AE${apuracao.numero}-${elo.empenhoId.slice(-6)}`, valor: "58.00", data: DATA_ATESTO, motivo: "primeiro envio sem resposta", criadoPor: RH }, criarM05DepsComContratos(prisma));
    const r = await ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH });
    // o reenvio: RECONHECE o ato já gravado (rastro com a anulação) e não anula de novo.
    expect([r.atos, r.reconhecidos]).toEqual([0, 1]);
    expect(await prisma.empenho.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(1);
    expect((await prisma.ajusteDosEncargos.findFirstOrThrow({ select: { tipo: true, valor: true, anulacaoDeEmpenhoId: true } }))).toMatchObject({ tipo: "ANULACAO_DE_EMPENHO", anulacaoDeEmpenhoId: expect.any(String) });
    // e um terceiro envio não tem o que fazer — e diz.
    await expect(ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH })).rejects.toThrow(/SEM-REDUCAO-A-AJUSTAR/);
    expect(await liquidoDaFicha()).toBe("1189.00");
  });

  it("EXERCÍCIO ENCERRADO: o M05 recusa nomeando; nada é anulado e a folha não é dada como corrigida", async () => {
    await empenhado1247();
    await reduzirRat();
    const ex = await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2026 }, select: { id: true } });
    await prisma.encerramentoExercicio.create({ data: { exercicioId: ex.id, encerradoPor: "TESTE" } });
    await expect(ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH })).rejects.toThrow(/AJUSTE-DOS-ENCARGOS-INTERROMPIDO: 0 ato.*ENCARGOS.*ENCERRADO.*NÃO está corrigida/s);
    expect(await prisma.empenho.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(0);
    expect(await prisma.ajusteDosEncargos.count()).toBe(0);
  });

  it("PARIDADE E SEGREGAÇÃO: a barra projeta o ajuste; quem certificou não ajusta; sem certificação da apuração nova, trava", async () => {
    await empenhado1247();
    await versaoAprovada(compRat, "0.005", "2026-05");
    await apurarEncargosDaFolha(prisma, { folhaId, motivo: "RAT corrigido", criadoPor: RH });
    let r = await retratoDosEncargos(prisma, folhaId, RH, { consultarDesignacao: false });
    const cod = (e: { situacao: string; codigo?: string }) => (e.situacao === "ELEGIVEL" ? "ELEGIVEL" : e.codigo);
    expect(cod(elegibilidadeParaAjustarEncargos(r!.estado, r!.ator))).toBe("ENCARGOS-NAO-CERTIFICADOS");
    await expect(ajustarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, motivo: MOTIVO, criadoPor: RH })).rejects.toThrow(/ENCARGOS-NAO-CERTIFICADOS/);
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    r = await retratoDosEncargos(prisma, folhaId, ATESTADOR, { consultarDesignacao: false });
    expect(cod(elegibilidadeParaAjustarEncargos(r!.estado, r!.ator))).toBe("AUTOAJUSTE-DOS-ENCARGOS");
    r = await retratoDosEncargos(prisma, folhaId, RH, { consultarDesignacao: false });
    expect(cod(elegibilidadeParaAjustarEncargos(r!.estado, r!.ator))).toBe("ELEGIVEL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (7) V7 M1 U3.2 — A GUIA DE RECOLHIMENTO: documento do emissor, registrado e baixado
// ═══════════════════════════════════════════════════════════════════════════════

describe("(7) guia de recolhimento: apuração, obrigação, guia e pagamento separados", () => {
  const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.1.4.1.01.00", disponibilidade: "1.1.1.1.2.00.00" });
  const PDF = new TextEncoder().encode("%PDF-1.4 guia do emissor (fixture)");
  async function liquidado(): Promise<{ grupoId: string; liquidacaoId: string }> {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    await designarParaEncargos();
    const grupoId = await grupoUnico();
    await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: RH });
    await certificarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await liquidarEncargosDaFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: LIQUIDANTE });
    return { grupoId, liquidacaoId: (await prisma.liquidacaoDosEncargos.findFirstOrThrow({ select: { liquidacaoId: true } })).liquidacaoId };
  }
  const guia = (grupoId: string, extra: Record<string, unknown> = {}) => ({
    folhaId, grupoId, destinatarioId: instituto, natureza: "Contribuição patronal e RAT — RGPS", identificador: "GPS-2026-05-0001",
    principal: "1247.00", componentes: [], total: "1247.00", arquivo: { nomeOriginal: "guia.pdf", mimeType: "application/pdf", conteudo: PDF }, criadoPor: RH, ...extra,
  });

  it("antes da liquidação não há obrigação; total divergente, vencimento sem fundamento e destinatário alheio recusam", async () => {
    await versaoAprovada(compPatr, "0.20");
    await versaoAprovada(compRat, "0.015");
    await apurarEncargosDaFolha(prisma, { folhaId, criadoPor: RH });
    const grupoId = await grupoUnico();
    await expect(registrarGuiaDeRecolhimento(prisma, guia(grupoId))).rejects.toThrow(/SEM-OBRIGACAO-LIQUIDADA/);
    await expect(registrarGuiaDeRecolhimento(prisma, guia(grupoId, { componentes: [{ rotulo: "Juros", valor: "10.00" }] }))).rejects.toThrow(/GUIA-TOTAL-DIVERGENTE/);
    await expect(registrarGuiaDeRecolhimento(prisma, guia(grupoId, { vencimento: "2026-06-20" }))).rejects.toThrow(/vencimento e fundamento do vencimento vêm juntos/);
    const outro = await pessoa("11444777000161", "Outro fundo (fixture)", "JURIDICA");
    await expect(registrarGuiaDeRecolhimento(prisma, guia(grupoId, { destinatarioId: outro }))).rejects.toThrow(/GUIA-DE-OUTRO-DESTINATARIO|SEM-OBRIGACAO-LIQUIDADA/);
    expect(await prisma.guiaDeRecolhimento.count()).toBe(0);
  });

  it("registrada com o arquivo do emissor; duplicada recusa; a baixa liga ao PAGAMENTO do M05; baixada não cancela; o mapa separa os quatro", async () => {
    const { grupoId, liquidacaoId } = await liquidado();
    const g = await registrarGuiaDeRecolhimento(prisma, guia(grupoId, { componentes: [{ rotulo: "Atualização", valor: "3.00" }], total: "1250.00", vencimento: "2026-06-20", fundamentoDoVencimento: "Guia do emissor, campo vencimento" }));
    expect((await prisma.anexo.findUniqueOrThrow({ where: { id: g.anexoId }, select: { guiaDeRecolhimentoId: true } })).guiaDeRecolhimentoId).toBe(g.guiaId);
    await expect(registrarGuiaDeRecolhimento(prisma, guia(grupoId))).rejects.toThrow(/GUIA-DUPLICADA/);
    // Receber a guia não pagou nada.
    let mapa = await guiasEObrigacoesDaFolha(prisma, folhaId);
    expect(mapa[0]).toMatchObject({ grupo: "ENCARGOS", liquidado: "1247.00", pago: "0.00" });
    expect(mapa[0]?.guias[0]).toMatchObject({ situacao: "RECEBIDA", total: "1250.00", vencimento: "2026-06-20" });
    await expect(baixarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, pagamentoId: "nao-existe", observacao: "Tentativa", criadoPor: RH })).rejects.toThrow(/PAGAMENTO-DE-OUTRA-OBRIGACAO/);
    const pg = await pagar({ liquidacaoId, numero: "PG-ENC-1", valor: "1247.00", data: D(2026, 6, 5), contaBancaria: "CC-ENC", fonteId: "fonte-500", historico: "Recolhimento dos encargos (fixture)", criadoPor: RH }, R_PAG, criarM05DepsComContratos(prisma));
    const b = await baixarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, pagamentoId: pg.pagamentoId, observacao: "Pago pela ordem do dia 05/06", criadoPor: RH });
    expect(b.divergencia.toFixed(2)).toBe("3.00");
    await expect(baixarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, pagamentoId: pg.pagamentoId, observacao: "De novo", criadoPor: RH })).rejects.toThrow(/GUIA-JA-BAIXADA|BAIXA-DUPLICADA/);
    await expect(cancelarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, motivo: "Guia substituída pelo emissor", criadoPor: RH })).rejects.toThrow(/GUIA-BAIXADA-NAO-CANCELA/);
    mapa = await guiasEObrigacoesDaFolha(prisma, folhaId);
    expect(mapa[0]).toMatchObject({ liquidado: "1247.00", pago: "1247.00" });
    expect(mapa[0]?.guias[0]?.situacao).toBe("BAIXADA");
  });

  it("guia recebida pode ser cancelada — uma vez; cancelada não baixa", async () => {
    const { grupoId, liquidacaoId } = await liquidado();
    const g = await registrarGuiaDeRecolhimento(prisma, guia(grupoId));
    await cancelarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, motivo: "Emitida com competência errada", criadoPor: RH });
    await expect(cancelarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, motivo: "Segunda vez sem sentido", criadoPor: RH })).rejects.toThrow(/GUIA-JA-CANCELADA/);
    const pg = await pagar({ liquidacaoId, numero: "PG-ENC-2", valor: "100.00", data: D(2026, 6, 5), contaBancaria: "CC-ENC", fonteId: "fonte-500", historico: "Parcial (fixture)", criadoPor: RH }, R_PAG, criarM05DepsComContratos(prisma));
    await expect(baixarGuiaDeRecolhimento(prisma, { guiaId: g.guiaId, pagamentoId: pg.pagamentoId, observacao: "Tentativa", criadoPor: RH })).rejects.toThrow(/GUIA-CANCELADA/);
    expect((await guiasEObrigacoesDaFolha(prisma, folhaId))[0]?.guias[0]?.situacao).toBe("CANCELADA");
  });
});
