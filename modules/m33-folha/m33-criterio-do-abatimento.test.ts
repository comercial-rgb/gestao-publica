import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { roteiroPagamento } from "../m05-despesa/dominio.js";
import { anularPagamento, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  calcularFolha,
  fecharFolha,
} from "./servico.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha, AbatimentoSemCriterioDeclaradoError } from "./apropriacao.js";
import { certificarFolha, designarNaFolha, devolverFolhaParaCorrecao, liquidarFolha, retratoDosAtosDaFolha } from "./certificacao.js";
import { elegibilidadeDosAtosDaFolha } from "./elegibilidade.js";
import {
  cadastrarParametroDoDecimoTerceiro,
  criterioDoAbatimentoNoCalculo,
  EstadoPagoNaoVerificavelError,
} from "./decimo-terceiro-servico.js";

/**
 * ═══ M33 / V11 V9.3 — O CRITÉRIO DO ABATIMENTO É DECLARADO PELO ENTE ═══
 *
 * Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ O QUE ESTE ARQUIVO PROVA, E POR QUE ELE EXISTE SEPARADO. Até a V11 V9.2 o motor exigia
 * FECHADO, cravado, com justificativa de ENGENHARIA. A pesquisa da V11 V9.3 encontrou a fonte —
 * Lei 4.749/1965, art. 1º e Decreto 57.155/1965, art. 3º, § 3º mandam compensar o que o empregado
 * "houver RECEBIDO" — e o achado foi o que obrigou a TIRAR o critério do motor em vez de trocá-lo:
 * os dois dispositivos governam o CELETISTA, o ente tem regime plural por exigência do TR, e a lei
 * municipal do estatutário não foi localizada. Nessas condições qualquer valor único no motor é
 * norma inventada.
 *
 * Os casos abaixo precisam do que `m33-decimo-terceiro.test.ts` não monta: FICHA, GRUPO DE
 * EMPENHO, CERTIFICAÇÃO e a cadeia até o PAGAMENTO. Por isso arquivo próprio, com a semente do
 * `m33-certificacao.test.ts` (que é quem já a provava) somada às rubricas do 13º.
 *
 * ⚠️ AS TABELAS E O PARÂMETRO SÃO FIXTURES SINTÉTICAS. Contribuição 10% linear, IRRF zerado, avo
 * de 15 dias, 12 avos, 1ª parcela 50%. Nenhum número aqui afirma norma de ninguém.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

/**
 * ⚠️ AS QUATRO IDENTIDADES SAEM DO CENSO DE `test/usuarios-teste.ts`, E ISSO NÃO É DETALHE.
 *
 * A primeira versão deste arquivo usava `rh@cg.pb.gov.br`, que **não existe no censo** — e os
 * dezessete casos caíram de uma vez no `semear`, com `USUÁRIO NÃO CADASTRADO`. O funil da
 * autorização fez exatamente o que existe para fazer: um `criadoPor` inventado é um nome que
 * ninguém pode cobrar, e ele não passa. Trocar as quatro é o conserto; acrescentar a minha ao
 * censo para o teste passar seria afrouxar a guarda para acomodar a fixture.
 *
 * A SEGREGAÇÃO é o que dita a escolha, não a estética do nome:
 *   · PREPARA calcula (e cadastra o cenário);  · FECHA fecha — e nenhum dos dois certifica;
 *   · ATESTA certifica;                        · PAGA liquida e paga — e não é quem certificou.
 */
const PREPARA = "contabilidade@cg.pb.gov.br";
const FECHA = "tesouraria@cg.pb.gov.br";
const ATESTADOR = "gabinete@cg.pb.gov.br";
const PAGA = "despesa@cg.pb.gov.br";

const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const FICHA = "ficha-folha-13";
const DATA_EMPENHO = D(2026, 6, 30);
const DATA_ATESTO = D(2026, 7, 1);
const DATA_LIQUIDACAO = D(2026, 7, 2);
const DATA_PAGAMENTO = D(2026, 7, 3);

const CAIXA = "1.1.1.1.2.00.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const CONTAS = { contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar" } as const;

const ATO = {
  atoEsfera: "MUNICIPAL",
  atoTipo: "ESTATUTO_DOS_SERVIDORES",
  atoNumero: "1.234",
  atoAno: 2010,
  atoDispositivo: "art. 78, § 2º",
  atoEmenta: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
} as const;

let ids: Record<string, string> = {};
let pessoaAtestador = "";
let vinculo1 = "";
let vinculo2 = "";

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: PREPARA, versoes: { create: { nome, criadoPor: PREPARA } } }, select: { id: true } });
  return p.id;
}

/** Liga a identidade que autentica à pessoa do cadastro — é o que a designação exige. */
async function vincularUsuarioAPessoa(identificador: string, pessoaId: string): Promise<void> {
  const u = await prisma.usuario.upsert({
    where: { identificador },
    create: { identificador, nome: identificador, criadoPor: "TESTE" },
    update: {},
    select: { id: true },
  });
  await prisma.vinculoUsuarioPessoa.create({ data: { usuarioId: u.id, pessoaId, tipo: "VINCULO", motivo: "fixture", criadoPor: "TESTE" } });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.enteConfig.create({ data: { id: "unico", codigoIbge: "2504009", poderOrgao: "10131", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", nome: "Municipio de Teste", cnpj: "08993917000146", conferidoPor: "TESTE", conferidoEm: D(2026, 1, 1) } });

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Caixa e equivalentes", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Credito disponivel", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Credito empenhado a liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Credito liquidado a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Credito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr", codigo: "8.2.1.1.1.00.00", nome: "DDR disponivel", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-ddr-emp", codigo: "8.2.1.1.2.01.00", nome: "DDR comprometida por empenho", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr-liq", codigo: "8.2.1.1.3.01.00", nome: "DDR comprometida por liquidacao", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-pessoal", codigo: "3.1.1.1.1.01.00", nome: "Vencimentos e vantagens fixas - pessoal civil", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-pessoal-pagar", codigo: "2.1.1.1.1.01.01", nome: "Salarios, remuneracoes e beneficios", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
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
  // ⚠️ A CONTA BANCÁRIA EXISTE PORQUE O PAGAMENTO SAI DE ALGUM LUGAR, e o M05 confere isso
  // (TR 5.23: a fonte do pagamento tem de ser a da conta). Faltava na primeira versão deste
  // arquivo e derrubou os três casos do critério PAGO — defeito da fixture, não do produto.
  await prisma.contaBancaria.create({ data: { id: "cb-folha", codigo: "CC-001", descricao: "Movimento", fonteId: "fonte-500" } });
  await criarFichaDeTeste(prisma, {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-11",
    id: FICHA, numero: 1, valorDotado: "500000.00",
  });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: PREPARA });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: PREPARA });

  // ⚠️ CPFs VÁLIDOS, e não "11111111111": aqui o CPF do servidor vira CREDOR do empenho quando o
  // grupo empenha POR SERVIDOR, e um documento inválido derrubaria a fixture por outro motivo.
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  pessoaAtestador = await pessoa("28625006871", "Carla Atestadora");
  await vincularUsuarioAPessoa(ATESTADOR, pessoaAtestador);

  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: PREPARA });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: PREPARA });
  // ⚠️ N=2 E OS DOIS SÃO DIFERENTES DE PROPÓSITO: M-1 tem 12 avos (admitida em 2020) e M-2 tem 9
  // (admitida em 20/03/2026 — março rende 11 dias, abaixo do mínimo de 15). Com um servidor só,
  // "abate o valor certo" passaria por vacuidade contra qualquer implementação de valor fixo.
  vinculo1 = (await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: PREPARA })).vinculoId;
  vinculo2 = (await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2026, 3, 20), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: PREPARA })).vinculoId;

  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: PREPARA });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: PREPARA });

  ids = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "D13", descricao: "13o salario", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "D13ADI", descricao: "Adiantamento do 13o", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "D13ABAT", descricao: "Abatimento do adiantamento do 13o", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
}

/** O grupo que empenha a 1ª parcela. `porServidor` é o eixo de todos os casos do critério PAGO. */
async function grupoDoAdiantamento(porServidor: boolean): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FP-ADI", descricao: "Adiantamento do 13o", fichaId: FICHA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FPA",
      porServidor, ...CONTAS, rubricaIds: [ids["D13ADI"]!], criadoPor: PREPARA,
      ...(porServidor ? {} : { credorId: await pessoa("39053344705", "Sindicato dos Servidores") }),
    })
  ).grupoId;
}

/** O grupo da 2ª parcela — separado, porque uma rubrica pertence a UM grupo só. */
async function grupoDoDecimoTerceiro(): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FP-13", descricao: "13o salario", fichaId: FICHA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP13",
      porServidor: true, ...CONTAS, rubricaIds: [ids["D13"]!], criadoPor: PREPARA,
    })
  ).grupoId;
}

async function parametro(over: Record<string, unknown> = {}): Promise<void> {
  await cadastrarParametroDoDecimoTerceiro(prisma, {
    exercicio: 2026,
    diasMinimosDoAvo: 15,
    avosNoExercicio: 12,
    percentualDaPrimeiraParcela: "0.5",
    baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
    decimoTerceiroSofreContribuicao: true,
    decimoTerceiroSofreIrrf: false,
    rubricaDoDecimoTerceiroId: ids["D13"]!,
    rubricaDoAdiantamentoId: ids["D13ADI"]!,
    rubricaDoAbatimentoId: ids["D13ABAT"]!,
    rubricasDaBase: [ids["VENC"]!],
    ...ATO,
    criadoPor: PREPARA,
    ...over,
  } as Parameters<typeof cadastrarParametroDoDecimoTerceiro>[1]);
}

/**
 * A 1ª parcela, calculada e FECHADA.
 *
 * ── OS NÚMEROS, À MÃO ──
 * M-1 (admitida 01/01/2020): 12 avos → 3.000,00 × 12/12 = 3.000,00 → 1ª parcela 50% = 1.500,00
 * M-2 (admitida 20/03/2026): jan/fev anteriores; março 30−20+1 = 11 dias < 15 → não conta;
 *                            abr..dez = 9 avos → 3.000,00 × 9/12 = 2.250,00 → 1ª parcela 1.125,00
 * Σ da folha de adiantamento = 2.625,00
 */
async function adiantamentoFechado(): Promise<string> {
  const { folhaId } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: PREPARA });
  await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
  await fecharFolha(prisma, { folhaId, criadoPor: FECHA });
  return folhaId;
}

async function designarAtestador(): Promise<void> {
  await designarNaFolha(prisma, {
    atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaAtestador, usuarioIdentificador: ATESTADOR,
    atoDesignacao: "Portaria 45/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: PREPARA,
  });
}

/** Os valores gravados, por matrícula e por código de rubrica — lidos do BANCO. */
async function linhasGravadas(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculo: { folhaId } } },
    select: { valor: true, rubrica: { select: { codigo: true } }, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
  });
  return new Map(linhas.map((l) => [`${l.contracheque.vinculo.matricula}/${l.rubrica.codigo}`, l.valor.toFixed(2)]));
}

async function memoriaDe(folhaId: string, matricula: string): Promise<Record<string, unknown>> {
  const c = await prisma.contracheque.findFirstOrThrow({ where: { calculo: { folhaId }, vinculo: { matricula } }, select: { memoria: true } });
  return c.memoria as Record<string, unknown>;
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// c1 · O CRITÉRIO "PAGO" SÓ SE CADASTRA ONDE O FATO EXISTE
// ═══════════════════════════════════════════════════════════════════════════════

describe("c1 · a verificabilidade do critério PAGO, conferida no CADASTRO", () => {
  /**
   * ⚠️ ESTE É O ACHADO ESTRUTURAL DA RODADA, VIRADO EM GUARDA. Com o empenho ÚNICO do grupo,
   * "quanto foi pago a ESTE servidor" não existe em lugar nenhum do banco: `EmpenhoDaFolha` só
   * carrega `vinculoId` quando o grupo empenha por servidor. Aceitar o critério aqui produziria
   * um parâmetro válido que faria a folha de dezembro recusar por um fato impossível de produzir.
   */
  it("ACUSA: grupo com empenho ÚNICO recusa o critério PAGO nomeando o motivo ESTRUTURAL", async () => {
    await grupoDoAdiantamento(false);
    await expect(parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" })).rejects.toThrow(EstadoPagoNaoVerificavelError);
    await expect(parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" })).rejects.toThrow(/ESTADO-PAGO-NAO-VERIFICAVEL/);
    // ⚠️ O MOTIVO, NÃO SÓ O RESULTADO: "recusou" é compatível com recusar por qualquer coisa.
    await expect(parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" })).rejects.toThrow(/FP-ADI/);
    await expect(parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" })).rejects.toThrow(/porServidor = false/);
    // e a recusa é ANTES da gravação — nada ocupa o número da versão
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  it("ACUSA: rubrica do adiantamento fora de qualquer grupo também recusa PAGO, com outro motivo", async () => {
    await expect(parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" })).rejects.toThrow(/não está em GRUPO DE EMPENHO nenhum/);
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  it("e a POSITIVA: com o grupo POR SERVIDOR, o mesmo cadastro passa e grava o critério", async () => {
    await grupoDoAdiantamento(true);
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" });
    const p = await prisma.parametroDoDecimoTerceiro.findFirstOrThrow({ select: { estadoMinimoDoAdiantamentoParaAbater: true } });
    expect(p.estadoMinimoDoAdiantamentoParaAbater).toBe("PAGO");
  });

  /**
   * ⚠️ NÃO DECLARAR É RESPOSTA LEGÍTIMA, E TEM DE GRAVAR. Se o cadastro exigisse o critério, o
   * ente sem norma levantada ficaria sem poder cadastrar parâmetro nenhum — e aí a lacuna
   * normativa estaria bloqueando a CONSTRUÇÃO, que é o que esta rodada existe para não fazer.
   */
  it("omitir o critério GRAVA, com nulo — a lacuna bloqueia a efetivação, não o cadastro", async () => {
    await parametro();
    const p = await prisma.parametroDoDecimoTerceiro.findFirstOrThrow({ select: { estadoMinimoDoAdiantamentoParaAbater: true } });
    expect(p.estadoMinimoDoAdiantamentoParaAbater).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c2 · O CRITÉRIO CERTIFICADO — inelegível, elegível, e a repetição
// ═══════════════════════════════════════════════════════════════════════════════

describe("c2 · o critério CERTIFICADO", () => {
  it("ACUSA: adiantamento fechado mas NÃO certificado recusa o cálculo do 13º, nomeando o ato do ente", async () => {
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO" });
    await adiantamentoFechado();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-NAO-CERTIFICADO/);
    // o ATO que sustenta a exigência vai na mensagem — é ele que o operador vai conferir
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ESTATUTO_DOS_SERVIDORES 1\.234\/2010/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/PENDENTE/);
    // ⚠️ E NADA FOI GRAVADO: recusar depois de gravar o cálculo deixaria o número consumido.
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O CASO QUE ESTE CRITÉRIO EXISTE PARA PEGAR. Uma folha FECHADA e DEVOLVIDA para correção
   * nunca será liquidada nem paga (`RETIFICACAO-DA-FOLHA`), e até a V11 V9.2 era abatida assim
   * mesmo — em silêncio. A mensagem diz isso por escrito, e não só "não certificada".
   */
  it("ACUSA: adiantamento DEVOLVIDO para correção recusa, e a mensagem diz por que isso importa", async () => {
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO" });
    const adi = await adiantamentoFechado();
    await designarAtestador();
    await devolverFolhaParaCorrecao(prisma, { folhaId: adi, data: DATA_ATESTO, motivo: "divergencia na base", criadoPor: ATESTADOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-NAO-CERTIFICADO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/DEVOLVIDA/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/nunca será liquidada nem paga/);
  });

  it("e a POSITIVA: certificado, o 13º calcula, abate os dois valores DIFERENTES e a memória diz APURACAO", async () => {
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO" });
    const adi = await adiantamentoFechado();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId: adi, data: DATA_ATESTO, criadoPor: ATESTADOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });

    const linhas = await linhasGravadas(folhaId);
    // ⚠️ OS DOIS DIFERENTES, senão "abater um valor fixo" passa: 12 avos contra 9 avos.
    expect(linhas.get("MAT-A/D13")).toBe("3000.00");
    expect(linhas.get("MAT-A/D13ABAT")).toBe("1500.00");
    expect(linhas.get("MAT-B/D13")).toBe("2250.00");
    expect(linhas.get("MAT-B/D13ABAT")).toBe("1125.00");

    const proc = (await memoriaDe(folhaId, "MAT-B"))["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["natureza"]).toBe("APURACAO");
    expect(proc["criterioDeclaradoPeloEnte"]).toBe(true);
    expect(proc["estadoExigidoPeloEnte"]).toBe("CERTIFICADO");
    expect(proc["estadoVerificado"]).toBe("CERTIFICADO");
    expect(proc["fatoVerificado"]).toBe("CERTIFICACAO_DO_CALCULO_DO_ADIANTAMENTO");
    // a frase da SIMULAÇÃO não pode sobrar num cálculo aprovado
    expect(JSON.stringify(proc)).not.toMatch(/SIMULAÇÃO/);
  });

  /**
   * ⚠️ A REPETIÇÃO. Recalcular não é idempotente por desenho (cada cálculo é um fato numerado),
   * mas o RESULTADO tem de ser o mesmo: o abatimento sai do cálculo que fechou o adiantamento, e
   * esse não se move. Um motor que somasse os cálculos, ou que lesse o "último", daria outro
   * número na segunda volta — e a folha fecharia igual.
   */
  it("REPETIÇÃO: recalcular o 13º duas vezes dá o mesmo abatimento, e o fato novo é só o número", async () => {
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO" });
    const adi = await adiantamentoFechado();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId: adi, data: DATA_ATESTO, criadoPor: ATESTADOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    const um = await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
    const dois = await calcularFolha(prisma, { folhaId, criadoPor: PREPARA, motivo: "conferencia" });
    expect(dois.numero).toBe(um.numero + 1);

    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-B/D13ABAT")).toBe("1125.00");
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c3 · O CRITÉRIO PAGO — e o pagamento PARCIAL, que é o caso que ninguém olhava
// ═══════════════════════════════════════════════════════════════════════════════

describe("c3 · o critério PAGO", () => {
  /**
   * Leva a 1ª parcela até o PAGAMENTO, pelo caminho real: apropriar (empenho por servidor),
   * certificar, liquidar pela folha, e então pagar cada liquidação pelo M05.
   *
   * ⚠️ `quanto` É POR MATRÍCULA, para que o caso do PARCIAL não precise de outra fixture.
   */
  async function pagarAdiantamento(adi: string, quanto: Readonly<Record<string, string>>): Promise<void> {
    await apropriarFolha(prisma, { folhaId: adi, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    await designarAtestador();
    await certificarFolha(prisma, { folhaId: adi, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await liquidarFolha(prisma, { folhaId: adi, data: DATA_LIQUIDACAO, criadoPor: FECHA });

    const roteiro = roteiroPagamento({ obrigacaoAPagar: "2.1.1.1.1.01.01", disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });
    const deps = criarM05DepsComContratos(prisma);
    const elos = await prisma.liquidacaoDaFolha.findMany({
      select: { liquidacaoId: true, empenhoDaFolha: { select: { vinculo: { select: { matricula: true } } } } },
    });
    for (const e of elos) {
      const matricula = e.empenhoDaFolha.vinculo?.matricula ?? "";
      const valor = quanto[matricula];
      if (valor === undefined) continue; // não pagar é um estado, e é um dos casos abaixo
      await pagar(
        { liquidacaoId: e.liquidacaoId, numero: `NP-${matricula}`, valor, data: DATA_PAGAMENTO, contaBancaria: "CC-001", fonteId: "fonte-500", historico: "adiantamento do 13o", criadoPor: PAGA },
        roteiro,
        deps
      );
    }
  }

  /**
   * ⚠️ O CASO QUE NINGUÉM TINHA OLHADO, E O NÚMERO É ESCOLHIDO PARA DOER. MAT-B apurou 1.125,00 e
   * recebeu 600,00. Até a V11 V9.2 o motor abatia 1.125,00 de dezembro — descontando 525,00 que
   * nunca saíram em junho, com os totais fechando e nenhuma etapa adiante acusando.
   *
   * ⚠️ E O PAR N=2 É O QUE PROVA QUE A GUARDA É POR SERVIDOR: MAT-A foi paga por inteiro e não é
   * ela que derruba o cálculo. Com um servidor só, "recusou" seria compatível com uma guarda que
   * olha o total da folha.
   */
  it("ACUSA: pagamento PARCIAL não satisfaz o critério, e a recusa nomeia matrícula, apurado e pago", async () => {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" });
    const adi = await adiantamentoFechado();
    await pagarAdiantamento(adi, { "MAT-A": "1500.00", "MAT-B": "600.00" });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-NAO-PAGO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/MAT-B/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/1125\.00 apurados/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/600\.00 pagos/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/PARCIAL não satisfaz/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("ACUSA: liquidado e NÃO pago recusa dizendo que não há pagamento registrado", async () => {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" });
    const adi = await adiantamentoFechado();
    await pagarAdiantamento(adi, {});

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-NAO-PAGO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/nenhum pagamento registrado/);
  });

  it("e a POSITIVA: pago por inteiro nos DOIS, o 13º calcula e a memória diz PAGO", async () => {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" });
    const adi = await adiantamentoFechado();
    await pagarAdiantamento(adi, { "MAT-A": "1500.00", "MAT-B": "1125.00" });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/D13ABAT")).toBe("1500.00");
    expect(linhas.get("MAT-B/D13ABAT")).toBe("1125.00");
    const proc = (await memoriaDe(folhaId, "MAT-B"))["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["estadoVerificado"]).toBe("PAGO");
    expect(proc["fatoVerificado"]).toBe("PAGAMENTO_DO_ADIANTAMENTO_DO_VINCULO");
  });

  /**
   * ⚠️ ESTORNO DO PAGAMENTO DESFAZ O "PAGO", e é `packages/estornaveis` quem manda. Um motor que
   * somasse `Pagamento.valor` cru continuaria achando que a parcela foi paga depois de o dinheiro
   * ter voltado — e abateria de dezembro o que o servidor não tem.
   */
  it("ACUSA: pagamento ESTORNADO deixa de satisfazer o critério — a soma é LÍQUIDA", async () => {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "PAGO" });
    const adi = await adiantamentoFechado();
    await pagarAdiantamento(adi, { "MAT-A": "1500.00", "MAT-B": "1125.00" });

    /**
     * ⚠️ A ANULAÇÃO VAI PELO CAMINHO REAL (`anularPagamento` do M05), e não por um
     * `prisma.pagamento.create` de fixture. Fabricar o fato à mão pularia o razão e provaria a
     * guarda contra um estado que o sistema nunca produz — é o erro de "testar o parser com o
     * próprio parser", aplicado a uma anulação.
     */
    const original = await prisma.pagamento.findFirstOrThrow({ where: { numero: "NP-MAT-B" }, select: { id: true } });
    await anularPagamento(
      { pagamentoId: original.id, numero: "NP-MAT-B-ANUL", data: DATA_PAGAMENTO, historico: "anulacao do adiantamento de MAT-B", criadoPor: PAGA },
      criarM05DepsComContratos(prisma)
    );

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-NAO-PAGO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/MAT-B/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/0\.00 pagos/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c4 · A EFETIVAÇÃO BLOQUEADA — e o que a destrava
// ═══════════════════════════════════════════════════════════════════════════════

describe("c4 · sem critério declarado: simulação, e a apropriação bloqueada", () => {
  async function decimoTerceiroFechadoSemCriterio(): Promise<string> {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro(); // ⚠️ SEM critério — é o estado do ente que não levantou a norma
    await adiantamentoFechado();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
    await fecharFolha(prisma, { folhaId, criadoPor: FECHA });
    return folhaId;
  }

  /**
   * ⚠️ O CÁLCULO SAI — E É ISSO QUE SEPARA "BLOQUEAR A EFETIVAÇÃO" DE "PARALISAR O SISTEMA".
   * A simulação é o que mostra ao ente o que está em jogo quando ele for declarar o critério.
   */
  it("o 13º CALCULA sem critério, e o contracheque se identifica como SIMULAÇÃO", async () => {
    const folhaId = await decimoTerceiroFechadoSemCriterio();
    expect((await linhasGravadas(folhaId)).get("MAT-B/D13ABAT")).toBe("1125.00");

    const proc = (await memoriaDe(folhaId, "MAT-B"))["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["natureza"]).toBe("SIMULACAO");
    expect(proc["criterioDeclaradoPeloEnte"]).toBe(false);
    expect(proc["estadoExigidoPeloEnte"]).toBeNull();
    expect(String(proc["motivo"])).toMatch(/NÃO É APURAÇÃO APROVADA/);
    expect(String(proc["motivo"])).toMatch(/ABATIMENTO-SEM-CRITERIO-DECLARADO/);
  });

  it("ACUSA: a APROPRIAÇÃO recusa, nomeando o total abatido e o que destrava — e nada é gravado", async () => {
    const folhaId = await decimoTerceiroFechadoSemCriterio();
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(AbatimentoSemCriterioDeclaradoError);
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(/ABATIMENTO-SEM-CRITERIO-DECLARADO/);
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(/2625\.00/);
    // ⚠️ E NÃO HÁ SAÍDA POR CONFIRMAÇÃO: a mensagem diz o que destrava, e é um ATO do ente.
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(/Não há dispensa nem confirmação que substitua o ato/);
    // a guarda vem ANTES de gravar: nem a ApropriacaoDaFolha nasce
    expect(await prisma.apropriacaoDaFolha.count({ where: { folhaId } })).toBe(0);
    expect(await prisma.empenho.count()).toBe(0);
  });

  /**
   * ⚠️ O RECORTE: o que fica bloqueado é a folha de 13º QUE ABATEU. A do ADIANTAMENTO, que não
   * abate nada, continua apropriável — senão a lacuna normativa estaria travando a 1ª parcela
   * inteira, que ninguém questionou.
   */
  it("o RECORTE: a folha de ADIANTAMENTO do mesmo exercício continua apropriável", async () => {
    await grupoDoAdiantamento(true);
    await parametro();
    const adi = await adiantamentoFechado();
    const r = await apropriarFolha(prisma, { folhaId: adi, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    expect(r.empenhados).toBe(2);
  });

  it("a BARRA DA TELA diz o mesmo que o caso de uso, com o MESMO código (paridade)", async () => {
    const folhaId = await decimoTerceiroFechadoSemCriterio();
    const r = await retratoDosAtosDaFolha(prisma, folhaId, FECHA, { consultarDesignacao: false, lerDistribuicao: true });
    expect(r).not.toBeNull();
    expect(r!.estado.abatimentoSemCriterioDeclarado).toBe(true);
    const e = elegibilidadeDosAtosDaFolha(r!.estado, r!.ator).apropriar;
    expect(e.situacao).toBe("PRE_CONDICAO");
    expect(e.situacao === "PRE_CONDICAO" ? e.codigo : "").toBe("ABATIMENTO-SEM-CRITERIO-DECLARADO");
  });

  /**
   * ⚠️ DECLARAR SEM RECALCULAR **NÃO** DESTRAVA — e este caso nasceu de uma mutação.
   *
   * Ao preparar a prova por mutação de `criterioDoAbatimentoNoCalculo` (trocar a leitura da
   * MEMÓRIA pela do parâmetro VIGENTE), eu descobri que nenhum caso ficaria vermelho: todos os
   * outros ou não declaram nunca, ou declaram E recalculam, e nos dois as duas leituras coincidem.
   * A distinção só aparece aqui: o ente declara o critério DEPOIS de dezembro ter sido calculado,
   * e não recalcula. Lendo o vigente, a apropriação passaria — efetivando um cálculo que não
   * conferiu nada. Lendo a memória, recusa.
   *
   * **A mutação não achou um defeito; achou um teste que faltava.** É o caso que separa "o ente
   * declarou" de "este cálculo foi feito sob a declaração".
   */
  it("ACUSA: declarar o critério e NÃO recalcular continua bloqueado — a memória manda, não o vigente", async () => {
    const folhaId = await decimoTerceiroFechadoSemCriterio();

    // o ente declara agora, depois de a folha já estar calculada e fechada sem critério
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "FECHADO" });
    expect((await prisma.parametroDoDecimoTerceiro.findFirstOrThrow({ orderBy: { versao: "desc" }, select: { estadoMinimoDoAdiantamentoParaAbater: true } })).estadoMinimoDoAdiantamentoParaAbater).toBe("FECHADO");

    // o CÁLCULO FECHADO continua sendo o que rodou sem conferir nada — e é ele que manda
    const fechado = await prisma.fechamentoDaFolha.findUniqueOrThrow({ where: { folhaId }, select: { calculoId: true } });
    expect((await criterioDoAbatimentoNoCalculo(prisma, fechado.calculoId)).criterioDeclarado).toBeNull();

    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(/ABATIMENTO-SEM-CRITERIO-DECLARADO/);
    expect(await prisma.apropriacaoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ E O QUE DESTRAVA É O ATO, NÃO UM BOTÃO. Declarar o critério na versão seguinte do
   * parâmetro (append-only) e RECALCULAR: o cálculo novo nasce com o critério na memória, e a
   * apropriação passa. Sem o recálculo não passa — e isso é correto, porque o cálculo antigo
   * continua sendo o que rodou sem conferir nada.
   */
  it("DESTRAVA: declarar o critério na versão seguinte e recalcular libera a apropriação", async () => {
    await grupoDoAdiantamento(true);
    await grupoDoDecimoTerceiro();
    await parametro();
    const adi = await adiantamentoFechado();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: PREPARA });
    await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });

    // a versão 2, com o critério — append-only, a anterior continua no histórico
    await parametro({ estadoMinimoDoAdiantamentoParaAbater: "FECHADO" });
    expect(await prisma.parametroDoDecimoTerceiro.count({ where: { exercicio: 2026 } })).toBe(2);

    await calcularFolha(prisma, { folhaId, criadoPor: PREPARA, motivo: "criterio do abatimento declarado pelo ente" });
    await fecharFolha(prisma, { folhaId, criadoPor: FECHA });

    const fechado = await prisma.fechamentoDaFolha.findUniqueOrThrow({ where: { folhaId }, select: { calculoId: true } });
    const criterio = await criterioDoAbatimentoNoCalculo(prisma, fechado.calculoId);
    expect(criterio.abateu).toBe(true);
    expect(criterio.criterioDeclarado).toBe("FECHADO");

    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    expect(r.empenhados).toBe(2);
  });
});
