import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
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
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha, numeroDoEmpenhoDaFolha } from "./apropriacao.js";
import { certificarFolha, designarNaFolha, liquidarFolha } from "./certificacao.js";
import { revogarVersaoDaRubrica } from "./versao-servico.js";
import {
  cadastrarParametroDoAdiantamentoSalarial,
  EstadoPagoNaoVerificavelNoAdiantamentoSalarialError,
} from "./adiantamento-salarial-servico.js";

/**
 * ═══ M33 / V13 rodada 2 — O VALE ATÉ O PAGAMENTO, E A APROPRIAÇÃO DELE ═══
 *
 * Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ POR QUE ARQUIVO SEPARADO. `m33-adiantamento-salarial.test.ts` prova o motor e o abatimento
 * com a fixture mínima. O critério **PAGO** precisa do que aquela fixture não monta: plano de
 * contas, ficha, conta bancária, grupo de empenho POR SERVIDOR, designação, certificação,
 * liquidação e pagamento pelo M05. É a mesma razão — e a mesma semente — que fez
 * `m33-criterio-do-abatimento.test.ts` nascer separado de `m33-decimo-terceiro.test.ts`.
 *
 * ⚠️ E ELE EXISTE PORQUE A RODADA 1 DECLAROU ESTE CAMINHO **IMPLEMENTADO E NÃO MEDIDO**. Um
 * produto que oferece ao ente a opção "PAGO" sem nenhum caso é um produto que pede ao município
 * que confie num comportamento que ninguém verificou. A pergunta da ordem — *"fechar não é
 * pagar"* — vive exatamente aqui.
 *
 * ⚠️ TODO ESPERADO É CALCULADO À MÃO. A fixture é fechada (contribuição LINEAR de 10%, IRRF
 * zerado, mês fiscal de 30 dias) para que a conta seja conferível de cabeça:
 *
 *   base PROJETADA de 2026-06 = só VENC, 30/30 dias
 *     MAT-A 3.000,00   MAT-B 2.000,00
 *   vale = 40% da base
 *     MAT-A 1.200,00   MAT-B   800,00
 *   mensal de 2026-06, com o vale abatido
 *     MAT-A 3.000,00 − PREV 300,00 − ABATSAL 1.200,00 = 1.500,00
 *     MAT-B 2.000,00 − PREV 200,00 − ABATSAL   800,00 = 1.000,00
 *
 * ⚠️ N=2 COM VALORES DIFERENTES em todo caso, e no caso do pagamento PARCIAL isso é o que separa
 * "a guarda olha o servidor" de "a guarda olha o total da folha".
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

/**
 * ⚠️ AS QUATRO IDENTIDADES SAEM DO CENSO DE `test/usuarios-teste.ts`, e a segregação dita a
 * escolha: PREPARA calcula e cadastra, FECHA fecha e apropria, ATESTADOR certifica, PAGA liquida
 * e paga. Um `criadoPor` inventado não passa pelo funil da autorização — e acrescentá-lo ao censo
 * para o teste passar seria afrouxar a guarda para acomodar a fixture.
 */
const PREPARA = "contabilidade@cg.pb.gov.br";
const FECHA = "tesouraria@cg.pb.gov.br";
const ATESTADOR = "gabinete@cg.pb.gov.br";
const PAGA = "despesa@cg.pb.gov.br";

const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const JUNHO = "2026-06";
const FICHA = "ficha-folha-vale";
/** A ficha de natureza DISTINTA, para o caso em que o vale deixa de duplicar a dotação. */
const FICHA_DO_VALE = "ficha-do-vale";
/** A conta do ramo `1.1.3.1 ADIANTAMENTOS CONCEDIDOS` — procurada no PCASP oficial, não inventada. */
const CONTA_DO_ADIANTAMENTO = "c-adiant-pessoal";
const DATA_EMPENHO = D(2026, 6, 25);
const DATA_ATESTO = D(2026, 6, 26);
const DATA_LIQUIDACAO = D(2026, 6, 27);
const DATA_PAGAMENTO = D(2026, 6, 28);

const CAIXA = "1.1.1.1.2.00.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const CONTAS = { contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar" } as const;

const ATO = {
  atoEsfera: "MUNICIPAL",
  atoTipo: "DECRETO",
  atoNumero: "4.321",
  atoAno: 2020,
  atoDispositivo: "art. 3º, caput",
  atoEmenta: "Dispoe sobre o adiantamento salarial aos servidores do Municipio",
} as const;

let ids: Record<string, string> = {};
let pessoaAtestador = "";

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({
    data: { documento, tipo: "FISICA", criadoPor: PREPARA, versoes: { create: { nome, criadoPor: PREPARA } } },
    select: { id: true },
  });
  return p.id;
}

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

  await prisma.enteConfig.create({
    data: {
      id: "unico", codigoIbge: "2504009", poderOrgao: "10131", tribunalCodigo: "TCE-PB", tribunalUf: "PB",
      planoContasSeed: "pcasp-federal", nome: "Municipio de Teste", cnpj: "08993917000146",
      conferidoPor: "TESTE", conferidoEm: D(2026, 1, 1),
    },
  });

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
      /**
       * ⚠️ V13 rodada 3 — A CONTA DO VALE, E ELA NÃO FOI INVENTADA PARA ESTE TESTE.
       *
       * `1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS` existe no plano oficial do TCE-PB
       * (`docs/oficial/tce-pb/Pcasp_2025.xlsx`, 7.864 contas, sha256 conferido no MANIFEST),
       * analítica e DEVEDORA, sob `1.1.3.1.1.01 ADIANTAMENTOS CONCEDIDOS A PESSOAL`. Fabricar um
       * código aqui seria inventar norma da STN dentro de um teste — foi PROCURADO e ACHADO.
       */
      { id: "c-adiant-pessoal", codigo: "1.1.3.1.1.01.01", nome: "Salarios e ordenados - adiantamentos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administracao", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e vantagens fixas" } });
  /**
   * ⚠️ A SEGUNDA NATUREZA EXISTE PARA O CASO POSITIVO, e o `96` é FIXTURE SINTÉTICA, não afirmação
   * de que o vale se classifica nele. Qual natureza o vale usa — ou se ele é extraorçamentário e
   * não usa nenhuma — é a decisão normativa que esta rodada NÃO tomou
   * (`VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES`). O que o caso positivo prova é a PROPRIEDADE:
   * sendo OUTRA natureza, a dotação de pessoal do mês deixa de ser consumida duas vezes.
   */
  await prisma.naturezaDespesa.create({ data: { id: "nd-96", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "96", codigoCompleto: "319096", descricao: "Ressarcimento de despesas de pessoal requisitado (FIXTURE sintetica)" } });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb-folha", codigo: "CC-001", descricao: "Movimento", fonteId: "fonte-500" } });
  await criarFichaDeTeste(prisma, {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-11",
    id: FICHA, numero: 1, valorDotado: "500000.00",
  });
  await criarFichaDeTeste(prisma, {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-96",
    id: FICHA_DO_VALE, numero: 2, valorDotado: "500000.00",
  });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: PREPARA });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: PREPARA });

  // ⚠️ CPFs VÁLIDOS: aqui o CPF do servidor vira CREDOR do empenho (grupo POR SERVIDOR), e um
  // documento inválido derrubaria a fixture por outro motivo que não o que se quer medir.
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  pessoaAtestador = await pessoa("28625006871", "Carla Atestadora");
  await vincularUsuarioAPessoa(ATESTADOR, pessoaAtestador);

  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: PREPARA });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: PREPARA });
  await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: PREPARA });
  await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId, lotacaoId, salarioBase: "2000.00", criadoPor: PREPARA });

  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: PREPARA });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: PREPARA });

  ids = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "ADSAL", descricao: "Adiantamento salarial", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 12, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "ABATSAL", descricao: "Abatimento do adiantamento salarial", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 96, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: PREPARA });
}

/** O grupo que empenha o VALE. `porServidor` é o eixo de todos os casos do critério PAGO. */
async function grupoDoVale(
  porServidor: boolean,
  over: { readonly fichaId?: string; readonly contaVariacaoId?: string } = {}
): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FP-VALE", descricao: "Adiantamento salarial", fichaId: over.fichaId ?? FICHA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FPV",
      porServidor, ...CONTAS, ...over, rubricaIds: [ids["ADSAL"]!], criadoPor: PREPARA,
      ...(porServidor ? {} : { credorId: await pessoa("39053344705", "Sindicato dos Servidores") }),
    })
  ).grupoId;
}

/** O grupo do vale CONFIGURADO CERTO: ficha de natureza própria e contrapartida no ativo. */
async function grupoDoValeBemConfigurado(): Promise<string> {
  return grupoDoVale(true, { fichaId: FICHA_DO_VALE, contaVariacaoId: CONTA_DO_ADIANTAMENTO });
}

/** O grupo do VENCIMENTO — separado, porque uma rubrica pertence a UM grupo só. */
async function grupoDoVencimento(): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FP-VENC", descricao: "Vencimentos e vantagens fixas", fichaId: FICHA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FPM",
      porServidor: true, ...CONTAS, rubricaIds: [ids["VENC"]!], criadoPor: PREPARA,
    })
  ).grupoId;
}

async function parametroDoVale(over: Record<string, unknown> = {}): Promise<void> {
  await cadastrarParametroDoAdiantamentoSalarial(prisma, {
    competencia: JUNHO,
    percentualDoAdiantamento: "0.40",
    baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES",
    estadoMinimoParaAbater: "FECHADO",
    rubricaDoAdiantamentoId: ids["ADSAL"]!,
    rubricaDoAbatimentoId: ids["ABATSAL"]!,
    // ⚠️ V13 rodada 4 — a conta do ramo `1.1.3.1`, que o cadastro agora EXIGE.
    contaDoAdiantamentoId: CONTA_DO_ADIANTAMENTO,
    ...ATO,
    criadoPor: PREPARA,
    ...over,
  } as Parameters<typeof cadastrarParametroDoAdiantamentoSalarial>[1]);
}

/** O vale de junho, calculado e FECHADO. MAT-A 1.200,00 e MAT-B 800,00 — conferidos à mão. */
async function valeFechado(): Promise<string> {
  const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: PREPARA });
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

/** Empenha o vale (por servidor) e o leva até a LIQUIDAÇÃO — sem pagar. */
async function liquidarVale(vale: string): Promise<void> {
  await apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
  await designarAtestador();
  await certificarFolha(prisma, { folhaId: vale, data: DATA_ATESTO, criadoPor: ATESTADOR });
  await liquidarFolha(prisma, { folhaId: vale, data: DATA_LIQUIDACAO, criadoPor: FECHA });
}

/**
 * Leva o vale até o PAGAMENTO, pelo caminho real. `quanto` é POR MATRÍCULA: a matrícula ausente
 * do mapa simplesmente NÃO é paga, e "não pagar" é um estado — é um dos casos abaixo.
 */
async function pagarVale(vale: string, quanto: Readonly<Record<string, string>>): Promise<void> {
  await liquidarVale(vale);
  const roteiro = roteiroPagamento({ obrigacaoAPagar: "2.1.1.1.1.01.01", disponibilidade: CAIXA, creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO });
  const deps = criarM05DepsComContratos(prisma);
  const elos = await prisma.liquidacaoDaFolha.findMany({
    select: { liquidacaoId: true, empenhoDaFolha: { select: { vinculo: { select: { matricula: true } } } } },
  });
  for (const e of elos) {
    const matricula = e.empenhoDaFolha.vinculo?.matricula ?? "";
    const valor = quanto[matricula];
    if (valor === undefined) continue;
    await pagar(
      { liquidacaoId: e.liquidacaoId, numero: `NP-${matricula}`, valor, data: DATA_PAGAMENTO, contaBancaria: "CC-001", fonteId: "fonte-500", historico: "adiantamento salarial de junho", criadoPor: PAGA },
      roteiro,
      deps
    );
  }
}

async function linhasGravadas(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculo: { folhaId } } },
    select: { valor: true, rubrica: { select: { codigo: true } }, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
  });
  return new Map(linhas.map((l) => [`${l.contracheque.vinculo.matricula}/${l.rubrica.codigo}`, l.valor.toFixed(2)]));
}

async function liquidosGravados(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const cs = await prisma.contracheque.findMany({
    where: { calculo: { folhaId } },
    select: { liquido: true, vinculo: { select: { matricula: true } } },
  });
  return new Map(cs.map((c) => [c.vinculo.matricula, c.liquido.toFixed(2)]));
}

/** A mensal de junho, aberta e calculada. Devolve o id — os casos conferem o que ela gravou. */
async function mensalDeJunho(): Promise<string> {
  const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
  await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
  return folhaId;
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// u1 · A GUARDA 4 PELO CAMINHO `PAGO` — "fechar não é pagar", medido
// ═══════════════════════════════════════════════════════════════════════════════


/** V22: o número gravado é numérico (SAGRES); a identidade do documento mora na reserva do numerador. */
async function identidadeDoNumero(numero: string, especie: "EMPENHO" | "LIQUIDACAO" = "EMPENHO"): Promise<string> {
  expect(numero).toMatch(/^\d{1,7}$/);
  const r = await prisma.numeroReservado.findFirstOrThrow({ where: { numero, especie }, select: { chave: true } });
  return r.chave.slice(r.chave.indexOf("|") + 1);
}

describe("u1 · o critério PAGO do adiantamento salarial", () => {
  /**
   * ⚠️ O LADO POSITIVO PRIMEIRO, E ELE NÃO É FORMALIDADE. Sem ele, todas as recusas abaixo
   * seriam compatíveis com um motor que NUNCA abate sob o critério PAGO — e o produto estaria
   * oferecendo ao ente uma opção que só sabe dizer não.
   */
  it("pago por inteiro: a mensal ABATE, e o contracheque diz qual fato foi verificado", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    expect((await linhasGravadas(vale)).get("MAT-A/ADSAL")).toBe("1200.00");
    expect((await linhasGravadas(vale)).get("MAT-B/ADSAL")).toBe("800.00");

    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    const mensal = await mensalDeJunho();
    const linhas = await linhasGravadas(mensal);
    expect(linhas.get("MAT-A/ABATSAL")).toBe("1200.00");
    expect(linhas.get("MAT-B/ABATSAL")).toBe("800.00");
    // A contribuição continua sobre a remuneração INTEIRA — o abatimento não reduz base.
    expect(linhas.get("MAT-A/PREV")).toBe("300.00");
    const liquidos = await liquidosGravados(mensal);
    expect(liquidos.get("MAT-A")).toBe("1500.00");
    expect(liquidos.get("MAT-B")).toBe("1000.00");

    /**
     * ⚠️ E A LINHA AFIRMA O FATO VERIFICADO, não apenas o exigido. Um contracheque que dissesse
     * "exige PAGO" sem dizer o que se conferiu seria papelada: a marcação existiria e o efeito
     * não. Aqui o desconto se explica sozinho anos depois.
     */
    const l = await prisma.linhaDoContracheque.findFirstOrThrow({
      where: { contracheque: { calculo: { folhaId: mensal } }, rubrica: { codigo: "ABATSAL" } },
      select: { memoria: true },
    });
    expect(l.memoria).toMatch(/ao menos PAGO/);
    expect(l.memoria).toMatch(/verificado: PAGO/);
  });

  /**
   * ⚠️ ESTE É O CASO QUE DÁ NOME À PERGUNTA DA ORDEM. O vale está FECHADO — congelado, íntegro,
   * conferível — e nenhum centavo saiu do caixa. Com o ente exigindo PAGO, abater aqui
   * descontaria do salário de junho um dinheiro que o servidor nunca recebeu.
   */
  it("apenas FECHADO, sem empenho: recusa dizendo que não há empenho por servidor para a matrícula", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    await valeFechado();

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-SALARIAL-NAO-PAGO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/não há empenho por servidor/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("empenhado, certificado e LIQUIDADO, mas não pago: recusa dizendo que não há pagamento registrado", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await liquidarVale(vale);

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-SALARIAL-NAO-PAGO/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/nenhum pagamento registrado/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O PAGAMENTO PARCIAL, E O N=2 É O QUE PROVA QUE A GUARDA É POR SERVIDOR. MAT-A recebeu os
   * 1.200,00 inteiros; MAT-B apurou 800,00 e recebeu 500,00. Uma guarda que olhasse o TOTAL da
   * folha (1.700,00 pagos contra 2.000,00 apurados) também recusaria — e nomearia o total, não a
   * matrícula. Por isso o caso afirma que a recusa nomeia **MAT-B e não MAT-A**.
   */
  it("pagamento PARCIAL não satisfaz, e a recusa nomeia a matrícula certa com os dois valores", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "500.00" });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    const erro = await calcularFolha(prisma, { folhaId, criadoPor: PREPARA }).catch((e: unknown) => e as Error);
    expect(erro).toBeInstanceOf(Error);
    const msg = (erro as Error).message;
    expect(msg).toMatch(/ADIANTAMENTO-SALARIAL-NAO-PAGO/);
    expect(msg).toMatch(/MAT-B/);
    expect(msg).not.toMatch(/MAT-A/);
    expect(msg).toMatch(/800,00/);
    expect(msg).toMatch(/500,00/);
    expect(msg).toMatch(/PARCIAL/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ A SOMA É LÍQUIDA DE ESTORNO, e a anulação vai pelo CAMINHO REAL (`anularPagamento` do
   * M05), não por um `prisma.pagamento.create` de fixture. Fabricar o fato à mão pularia o razão
   * e provaria a fixture, não o produto — um motor que somasse `Pagamento.valor` cru continuaria
   * achando que o vale foi pago depois de o dinheiro ter voltado.
   */
  it("pagamento ESTORNADO deixa de satisfazer o critério", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    const original = await prisma.pagamento.findFirstOrThrow({ where: { numero: "NP-MAT-B" }, select: { id: true } });
    await anularPagamento(
      // ⚠️ `anularPagamento` recebe DOIS argumentos (input, deps) — o roteiro do estorno é
      // derivado do lançamento original pelo próprio M05, e não redeclarado pelo chamador.
      { pagamentoId: original.id, numero: "NP-MAT-B-ANUL", data: DATA_PAGAMENTO, historico: "anulacao do adiantamento salarial de MAT-B", criadoPor: PAGA },
      criarM05DepsComContratos(prisma)
    );

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-SALARIAL-NAO-PAGO[\s\S]*MAT-B/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ A RECUSA NO CADASTRO, e ela é ESTRUTURAL e não normativa: não diz que o ente não pode
   * exigir pagamento — diz que o cadastro que ele tem hoje não sabe responder "esta matrícula
   * recebeu?". Com `porServidor = false` existe UM empenho para o grupo inteiro, com credor
   * declarado, e "quanto saiu para MAT-A" não é representável em lugar nenhum do banco.
   */
  it("o cadastro RECUSA o critério PAGO quando o grupo do vale não empenha por servidor", async () => {
    await grupoDoVale(false);
    await expect(parametroDoVale({ estadoMinimoParaAbater: "PAGO" })).rejects.toThrow(EstadoPagoNaoVerificavelNoAdiantamentoSalarialError);
    await expect(parametroDoVale({ estadoMinimoParaAbater: "PAGO" })).rejects.toThrow(/porServidor = false/);
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });

  it("com o grupo POR SERVIDOR, o mesmo cadastro passa — a recusa acima não passa por vacuidade", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(1);
  });

  /**
   * ⚠️ E A CONFERÊNCIA SE REPETE NO CÁLCULO, fail-closed: entre cadastrar o parâmetro e calcular
   * a mensal passa um mês, e o ente pode ter posto a rubrica do vale noutro grupo. Sem esta
   * segunda conferência, o critério declarado valeria pela memória do dia do cadastro.
   */
  it("o cálculo confere de NOVO: sem grupo nenhum para a rubrica do vale, recusa", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    // O ente tira a rubrica do grupo depois de tudo pronto.
    await prisma.rubricaDoGrupoDeEmpenho.deleteMany({ where: { rubricaId: ids["ADSAL"]! } });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/ADIANTAMENTO-SALARIAL-PAGO-NAO-VERIFICAVEL/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// u1b · NÃO COMPENSAR DUAS VEZES
// ═══════════════════════════════════════════════════════════════════════════════

describe("u1b · o vale se abate UMA vez", () => {
  /**
   * ⚠️ O RECÁLCULO É O CAMINHO EM QUE A DUPLA COMPENSAÇÃO NASCERIA. Um motor que ACUMULASSE o
   * abatimento em vez de recalculá-lo do zero abateria 2.400,00 no segundo cálculo — e a folha
   * fecharia, o líquido sairia 300,00, e nada adiante acusaria.
   *
   * A conta, à mão: o cálculo nº 2 é o nº 1 refeito. MAT-A continua 3.000,00 − 300,00 − 1.200,00.
   */
  it("recalcular a mensal ainda aberta abate o MESMO valor, uma linha só por contracheque", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    const um = await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
    const dois = await calcularFolha(prisma, { folhaId, criadoPor: PREPARA });
    expect(um.numero).toBe(1);
    expect(dois.numero).toBe(2);

    const doSegundo = await prisma.linhaDoContracheque.findMany({
      where: { contracheque: { calculoId: dois.calculoId }, rubrica: { codigo: "ABATSAL" } },
      select: { valor: true, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
    });
    // ⚠️ DUAS LINHAS NO TOTAL, uma por contracheque — e não duas no mesmo.
    expect(doSegundo.length).toBe(2);
    const porMatricula = new Map(doSegundo.map((l) => [l.contracheque.vinculo.matricula, l.valor.toFixed(2)]));
    expect(porMatricula.get("MAT-A")).toBe("1200.00");
    expect(porMatricula.get("MAT-B")).toBe("800.00");

    const cs = await prisma.contracheque.findMany({ where: { calculoId: dois.calculoId }, select: { liquido: true, vinculo: { select: { matricula: true } } } });
    expect(new Map(cs.map((c) => [c.vinculo.matricula, c.liquido.toFixed(2)])).get("MAT-A")).toBe("1500.00");
  });

  /**
   * ═══ ⚠️ O ESTORNO DEPOIS DE A MENSAL JÁ TER ABATIDO — CARACTERIZAÇÃO, NÃO APROVAÇÃO ═══
   *
   * O caso: o vale foi pago, a mensal o abateu e FECHOU, e só então o pagamento do vale é
   * anulado. O servidor ficou sem o vale E com o desconto — o ente lhe deve.
   *
   * O que o sistema faz HOJE, medido aqui:
   *   · a mensal FECHADA não muda (folha fechada não se recalcula — invariante 3, e isso é certo:
   *     a obrigação já reconhecida NÃO desaparece);
   *   · a folha COMPLEMENTAR, que é o instrumento de pagar o que faltou, fica **bloqueada**,
   *     porque ela recalcula o correto e o correto passa pela guarda do critério PAGO, que agora
   *     não se satisfaz.
   *
   * ⚠️ ISSO NÃO É O COMPORTAMENTO DESEJÁVEL, E ESTE CASO NÃO O ABENÇOA. Ele registra o fato para
   * que ele não seja descoberto por um município. A recusa é VERDADEIRA (o vale realmente não
   * está mais pago) e é fail-closed — mas ela fecha justamente a porta da correção. A saída é ato
   * próprio de reposição/reconhecimento, que este sistema não pratica, e improvisá-lo aqui seria
   * inventar ato financeiro. Fica nomeado `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` no MODULO.
   */
  it("CARACTERIZAÇÃO: estorno depois do fechamento não desfaz o abatido, e bloqueia a complementar", async () => {
    await grupoDoValeBemConfigurado();
    await grupoDoVencimento();
    await parametroDoVale({ estadoMinimoParaAbater: "PAGO" });
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    const mensal = await mensalDeJunho();
    await fecharFolha(prisma, { folhaId: mensal, criadoPor: FECHA });
    expect((await linhasGravadas(mensal)).get("MAT-A/ABATSAL")).toBe("1200.00");

    const original = await prisma.pagamento.findFirstOrThrow({ where: { numero: "NP-MAT-A" }, select: { id: true } });
    await anularPagamento(
      { pagamentoId: original.id, numero: "NP-MAT-A-ANUL", data: DATA_PAGAMENTO, historico: "anulacao do vale depois de a mensal ter abatido", criadoPor: PAGA },
      criarM05DepsComContratos(prisma)
    );

    // (1) A OBRIGAÇÃO JÁ RECONHECIDA NÃO DESAPARECE: a folha fechada continua como estava.
    expect((await linhasGravadas(mensal)).get("MAT-A/ABATSAL")).toBe("1200.00");
    expect((await liquidosGravados(mensal)).get("MAT-A")).toBe("1500.00");

    /**
     * ═══ ⚠️ (1b) A DIREÇÃO DA DÍVIDA, MEDIDA — E ELA É O CONTRÁRIO DA INTUIÇÃO ═══
     *
     * A leitura natural de "estorno" é "o servidor recebeu a mais e tem de repor". Aqui é o
     * oposto, e o número prova: a mensal descontou 1.200,00 por um adiantamento cujo pagamento
     * líquido hoje é **ZERO**. O servidor ficou com 1.500,00 e tinha direito a 2.700,00
     * (3.000,00 de bruto menos 300,00 de contribuição) — **O ENTE DEVE 1.200,00 A ELE**.
     *
     * ⚠️ E A DIREÇÃO DECIDE QUAL INSTRUMENTO É LEGÍTIMO, que é a razão de este bloco existir e
     * não ser prosa no MODULO. Se o servidor devesse, o caminho seria reposição ao erário — ato
     * que este sistema não pratica, e ponto final. Como é o ENTE que deve, o instrumento correto
     * é justamente a folha COMPLEMENTAR, que existe para pagar o que faltou — e é ela que a
     * guarda do critério PAGO bloqueia. O beco não é "falta um ato": é "o ato existe e está
     * fechado por uma guarda verdadeira".
     */
    const pagoDe = async (matricula: string): Promise<string> => {
      const ps = await prisma.pagamento.findMany({
        where: { liquidacao: { empenho: { daFolha: { apropriacao: { folhaId: vale }, vinculo: { matricula } } } } },
        select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
      });
      return somaLiquidaEstornaveis(
        ps.map((x) => ({ id: x.id, valor: toMoney(x.valor), estornoDeId: x.estornoDeId, anulacaoParcialDeId: x.anulacaoParcialDeId }))
      ).toFixed(2);
    };
    // ⚠️ POR MATRÍCULA, e não pelo total da folha: o total (800,00, só o de MAT-B) seria
    // compatível com MAT-A ter recebido qualquer coisa. O que prova a direção é o ZERO de MAT-A
    // ao lado do 1.200,00 que a mensal fechada descontou dela.
    expect(await pagoDe("MAT-A")).toBe("0.00");
    expect(await pagoDe("MAT-B")).toBe("800.00");

    // (2) E A COMPLEMENTAR FICA BLOQUEADA — o fato medido, com o motivo verdadeiro nomeado.
    const { folhaId: comp } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL_COMPLEMENTAR", criadoPor: PREPARA });
    const erro = await calcularFolha(prisma, { folhaId: comp, criadoPor: PREPARA }).catch((e: unknown) => e as Error);
    const msg = (erro as Error).message;
    expect(msg).toMatch(/ADIANTAMENTO-SALARIAL-NAO-PAGO/);
    expect(msg).toMatch(/MAT-A/);
    /**
     * ⚠️ (3) E A RECUSA NOMEIA O BECO, em vez de deixar o operador descobri-lo por eliminação.
     * Sem isto ele leria "não há pagamento registrado" numa competência que ele sabe ter pago, e
     * não teria como ligar os dois fatos. A mensagem diz que uma folha FECHADA já abateu, quanto,
     * que o ente deve a diferença, e que o acerto é ato que este sistema não pratica.
     */
    expect(msg).toMatch(/uma folha JÁ FECHADA de 2026-06 abateu 1\.200,00/);
    expect(msg).toMatch(/o ente lhe deve essa diferença/);
    expect(msg).toMatch(/atos próprios que ele não pratica/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: comp } })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// u2 · A GUARDA 5 — a rubrica do abatimento sem versão vigente
// ═══════════════════════════════════════════════════════════════════════════════

describe("u2 · rubrica do abatimento sem versão vigente", () => {
  /**
   * ⚠️ O DANO QUE ELA EVITA É O MAIOR DE TODOS ESTE ARQUIVO: sem a rubrica, o motor mensal não
   * emite a linha, ninguém abate nada, e o ente paga a remuneração INTEIRA a quem já recebeu
   * 40% dela — com a folha fechando e os totais batendo dos dois lados.
   *
   * A versão é REVOGADA pelo caminho real (`revogarVersaoDaRubrica`), e não por um `update` de
   * fixture: revogar é fato, e é o caminho que um ente de verdade percorre ao aposentar a rubrica
   * do ano anterior sem lembrar que o parâmetro ainda aponta para ela.
   */
  it("recusa nomeando a matrícula e a competência, e não grava nada", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    await valeFechado();

    const versao = await prisma.versaoDaRubrica.findFirstOrThrow({ where: { rubricaId: ids["ABATSAL"]! }, select: { id: true } });
    await revogarVersaoDaRubrica(prisma, { versaoId: versao.id, motivo: "rubrica aposentada sem olhar o parametro", revogadoPor: PREPARA });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: PREPARA });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/RUBRICA-DO-ABATIMENTO-SALARIAL-AUSENTE/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: PREPARA })).rejects.toThrow(/MAT-A[\s\S]*2026-06/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("com a versão vigente, a mesma mensal calcula e abate — a recusa acima não passa por vacuidade", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    await valeFechado();
    const mensal = await mensalDeJunho();
    expect((await linhasGravadas(mensal)).get("MAT-A/ABATSAL")).toBe("1200.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// u3 · A APROPRIAÇÃO DA FOLHA DE VALE
// ═══════════════════════════════════════════════════════════════════════════════

describe("u3 · a folha de vale vira despesa pelo caminho de sempre", () => {
  /**
   * ⚠️ A RESPOSTA À PERGUNTA "há algo específico?" É **NÃO** — e o número do empenho é onde isso
   * aparece. Ele ganha o segmento do TIPO (`FPV/2026-06/ADIANTAMENTO_SALARIAL/MAT-A`) porque a
   * V11 V9.3 já tinha pago o defeito de duas folhas de tipos diferentes na mesma competência
   * colidirem no mesmo número: `apropriarFolha` encontrava o empenho da primeira, contava
   * `jaExistiam` e pulava em silêncio, deixando a segunda apropriada com ZERO empenhos.
   */
  it("empenha o BRUTO, um por servidor, com o CPF de cada um e o número com o segmento do tipo", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    const vale = await valeFechado();

    const r = await apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    expect(r.empenhados).toBe(2);
    expect(r.jaExistiam).toBe(0);

    const empenhos = await prisma.empenho.findMany({ orderBy: { numero: "asc" }, select: { numero: true, valor: true, credorCpfCnpj: true } });
    const identidades = await Promise.all(empenhos.map((e) => identidadeDoNumero(e.numero)));
    expect(identidades).toEqual([
      numeroDoEmpenhoDaFolha("FPV", JUNHO, "MAT-A", "ADIANTAMENTO_SALARIAL"),
      numeroDoEmpenhoDaFolha("FPV", JUNHO, "MAT-B", "ADIANTAMENTO_SALARIAL"),
    ]);
    expect(identidades[0]).toBe("FPV/2026-06/ADIANTAMENTO_SALARIAL/MAT-A");
    expect(empenhos[0]!.valor.toFixed(2)).toBe("1200.00");
    expect(empenhos[0]!.credorCpfCnpj).toBe("11144477735");
    expect(empenhos[1]!.valor.toFixed(2)).toBe("800.00");
  });

  it("reexecutar a apropriação não duplica a despesa", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    const vale = await valeFechado();
    const primeira = await apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    const segunda = await apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });
    expect(primeira.empenhados).toBe(2);
    expect(segunda.empenhados).toBe(0);
    expect(segunda.jaExistiam).toBe(2);
    expect(await prisma.empenho.count()).toBe(2);
    expect(await prisma.apropriacaoDaFolha.count({ where: { folhaId: vale } })).toBe(1);
  });

  /**
   * ═══ ⚠️ O QUE ERA CARACTERIZAÇÃO NA RODADA 2 MUDOU DE COR — E ESTA É A EXPLICAÇÃO ═══
   *
   * A rodada 2 deixou aqui um caso que AFIRMAVA o defeito: `4.200,00` empenhados para `3.000,00`
   * de custo, com a nota de que ele ficaria vermelho no dia em que alguém consertasse. O dia
   * chegou, e o caso não foi apagado: ele virou os TRÊS abaixo, que afirmam por que aquilo não
   * acontece mais. Apagar teria perdido a única prova de que o defeito existiu.
   *
   * ⚠️ E O CONSERTO NÃO ESCOLHEU NORMA NENHUMA. Ele fez duas coisas:
   *   · exigiu, do grupo que empenha o vale, uma contrapartida patrimonial do ramo
   *     `1.1.3.1 ADIANTAMENTOS CONCEDIDOS` — conta que foi PROCURADA e ACHADA no plano oficial do
   *     TCE-PB, não inventada (`1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS`);
   *   · recusou a coincidência de NATUREZA DE DESPESA entre o vale e a remuneração do mês, que é
   *     aritmética e não prática: a mesma verba consumindo a mesma dotação duas vezes é engano
   *     sob qualquer das duas práticas conhecidas.
   *
   * O que continua NÃO decidido é se o vale consome dotação, e em qual natureza — e é por isso
   * que a segunda recusa não conserta: ela RECUSA. Pendência
   * `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES`, com as duas opções postas.
   */
  it("RECUSA: o grupo do vale liquidando contra VPD de pessoal reconheceria a despesa duas vezes", async () => {
    // O grupo padrão desta suíte declara `c-vpd-pessoal` — que é o que a rodada 2 media.
    await grupoDoVale(true);
    await parametroDoVale();
    const vale = await valeFechado();

    await expect(apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(
      /CONTRAPARTIDA-DO-VALE-NAO-E-ADIANTAMENTO/
    );
    await expect(apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(
      /1\.1\.3\.1\.1\.01\.01/
    );
    // ⚠️ E NADA FOI GRAVADO — nem empenho, nem o registro do ato de apropriar. A guarda roda antes
    // de qualquer gravação, que é a regra que este repositório já pagou para não repetir.
    expect(await prisma.empenho.count()).toBe(0);
    expect(await prisma.apropriacaoDaFolha.count()).toBe(0);
  });

  /**
   * ⚠️ A RECUSA É SIMÉTRICA, e a simetria é o que a torna uma guarda em vez de um obstáculo de
   * ordem: se ela só olhasse a folha do vale, bastaria apropriar o vale primeiro e a mensal
   * depois para a duplicação voltar pela outra ponta, com os dois atos verdes.
   */
  it("RECUSA nas DUAS pontas: vale e remuneração do mês na MESMA natureza de despesa", async () => {
    await grupoDoVale(true, { contaVariacaoId: CONTA_DO_ADIANTAMENTO }); // conta certa, ficha 319011
    await grupoDoVencimento(); // também 319011
    await parametroDoVale();
    const vale = await valeFechado();

    // (a) apropriando o VALE
    await expect(apropriarFolha(prisma, { folhaId: vale, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(
      /VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO[\s\S]*319011/
    );
    expect(await prisma.empenho.count()).toBe(0);

    // (b) e apropriando a MENSAL — a outra ponta, com o vale sequer empenhado
    const mensal = await mensalDeJunho();
    await fecharFolha(prisma, { folhaId: mensal, criadoPor: FECHA });
    await expect(apropriarFolha(prisma, { folhaId: mensal, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA })).rejects.toThrow(
      /VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO/
    );
    expect(await prisma.empenho.count()).toBe(0);
    expect(await prisma.apropriacaoDaFolha.count()).toBe(0);
  });

  /**
   * ═══ O CASO POSITIVO — E É ELE QUE PROVA QUE AS DUAS RECUSAS NÃO SÃO SÓ "NÃO" ═══
   *
   * A CONTA, À MÃO, para MAT-A em junho, com o vale em natureza própria:
   *   dotação de PESSOAL (319011) consumida .... 3.000,00   (só a mensal)
   *   dotação do vale     (319096) consumida ... 1.200,00   (só o vale)
   *   ──────────────────────────────────────────────────
   *   a remuneração do mês deixa de consumir 4.200,00 de 319011 para 3.000,00 de custo.
   *
   * ⚠️ E O LADO PATRIMONIAL É AFIRMADO PELO EFEITO, no RAZÃO: a liquidação do vale DEBITA
   * `1.1.3.1.1.01.01` e NÃO a VPD de pessoal. Conferir só o empenho provaria metade — a
   * duplicação da rodada 2 era, antes de tudo, despesa patrimonial reconhecida duas vezes.
   */
  it("com a conta do ativo e natureza própria, a dotação de pessoal do mês volta a ser 3.000,00", async () => {
    await grupoDoValeBemConfigurado();
    await grupoDoVencimento();
    await parametroDoVale();
    const vale = await valeFechado();
    await liquidarVale(vale);

    const mensal = await mensalDeJunho();
    await fecharFolha(prisma, { folhaId: mensal, criadoPor: FECHA });
    await apropriarFolha(prisma, { folhaId: mensal, dataDoEmpenho: DATA_EMPENHO, criadoPor: FECHA });

    const porNatureza = async (nd: string): Promise<string> => {
      const es = await prisma.empenho.findMany({ where: { ficha: { naturezaDespesaId: nd } }, select: { valor: true } });
      return es.reduce((acc, e) => acc.plus(new Decimal(e.valor)), new Decimal(0)).toFixed(2);
    };
    // 3.000,00 de MAT-A mais 2.000,00 de MAT-B — a remuneração do mês, UMA vez.
    expect(await porNatureza("nd-11")).toBe("5000.00");
    // 1.200,00 mais 800,00 — o vale, na dotação dele.
    expect(await porNatureza("nd-96")).toBe("2000.00");

    // ── o razão: a liquidação do vale debitou o ATIVO, não a VPD de pessoal ──
    const debitosDoVale = await prisma.partidaContabil.findMany({
      where: {
        subsistema: "PATRIMONIAL",
        tipo: "DEBITO",
        lancamento: { origemTipo: "LIQUIDACAO" },
        conta: { codigo: { in: ["1.1.3.1.1.01.01", "3.1.1.1.1.01.00"] } },
      },
      select: { valor: true, conta: { select: { codigo: true } } },
    });
    const porConta = new Map<string, Decimal>();
    for (const d of debitosDoVale) {
      porConta.set(d.conta.codigo, (porConta.get(d.conta.codigo) ?? new Decimal(0)).plus(new Decimal(d.valor)));
    }
    expect(porConta.get("1.1.3.1.1.01.01")?.toFixed(2)).toBe("2000.00");
    // ⚠️ E A VPD DE PESSOAL NÃO FOI TOCADA PELO VALE: a mensal ainda não liquidou nesta corrida,
    // então qualquer débito nela aqui seria do vale — e é justamente esse que não pode existir.
    expect(porConta.get("3.1.1.1.1.01.00")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cX · CARACTERIZAÇÃO — O RAZÃO DO VALE COMO ELE É HOJE, ANTES DE MUDAR (V13 r4 u2)
//
// ⚠️ ESTE BLOCO NÃO AFIRMA O COMPORTAMENTO DESEJADO. Ele MEDE o atual, porque a decisão de
// produto da rodada 4 — o vale é EXTRAORÇAMENTÁRIO e NÃO empenha — ainda não está construída, e
// caracterizar antes de ampliar é o que o regime de PROFUNDIDADE exige neste módulo.
//
// O que a rodada 4 quer provar um dia: "o razão do vale não toca conta orçamentária nenhuma e
// fecha". Hoje a primeira metade é FALSA por construção — o vale empenha, liquida e paga pela
// cadeia orçamentária inteira. Estes casos registram exatamente ISSO, com número, para que o dia
// em que a cadeia extraorçamentária existir seja um dia em que estes esperados MUDEM DE COR com a
// história visível, e não um dia em que ninguém saiba o que havia antes.
//
// ⚠️ A SEGUNDA METADE — "e fecha" — JÁ É VERDADE, e é medida aqui pela propriedade, não pela
// forma: ΣDÉBITO == ΣCRÉDITO DENTRO DE CADA SUBSISTEMA, para todo lançamento da cadeia do vale.
// Conferir só o total esconde o defeito clássico: uma perna orçamentária a mais compensada por
// uma patrimonial a menos fecha no total e não fecha em nenhum dos dois.
// ═══════════════════════════════════════════════════════════════════════════════

describe("cX · caracterização do razão do vale (estado ANTERIOR à cadeia extraorçamentária)", () => {
  /** Todas as partidas da cadeia do vale, com classe PCASP e subsistema — lidas do BANCO. */
  async function partidasDaCadeiaDoVale(): Promise<
    readonly {
      readonly origem: string;
      readonly subsistema: string;
      readonly tipo: string;
      readonly conta: string;
      readonly classe: string;
      readonly valor: string;
    }[]
  > {
    const ps = await prisma.partidaContabil.findMany({
      select: {
        subsistema: true,
        tipo: true,
        valor: true,
        conta: { select: { codigo: true } },
        lancamento: { select: { origemTipo: true } },
      },
      orderBy: { id: "asc" },
    });
    return ps.map((p) => ({
      origem: p.lancamento.origemTipo,
      subsistema: p.subsistema,
      tipo: p.tipo,
      conta: p.conta.codigo,
      classe: p.conta.codigo.charAt(0),
      valor: new Decimal(p.valor).toFixed(2),
    }));
  }

  /**
   * ⚠️ O ESPERADO É CALCULADO À MÃO: 1.200,00 de MAT-A mais 800,00 de MAT-B = 2.000,00 de vale.
   * Nenhum número aqui sai de somar o que o motor produziu.
   */
  it("cX.1 · HOJE o vale TOCA o orçamentário — e é isto que a decisão da rodada 4 quer eliminar", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    const vale = await valeFechado();
    await liquidarVale(vale);

    const partidas = await partidasDaCadeiaDoVale();
    const porSubsistema = new Map<string, number>();
    for (const p of partidas) porSubsistema.set(p.subsistema, (porSubsistema.get(p.subsistema) ?? 0) + 1);

    // ⚠️ A MEDIÇÃO QUE IMPORTA: existem partidas ORÇAMENTÁRIAS na cadeia do vale. Enquanto este
    // esperado for `true`, a cadeia extraorçamentária NÃO existe — e nenhuma marcação de catálogo
    // pode dizer que existe.
    expect((porSubsistema.get("ORCAMENTARIO") ?? 0) > 0).toBe(true);

    // E as classes de CONTROLE (5 a 8) aparecem, que é a assinatura da execução orçamentária:
    // crédito disponível, empenhado, liquidado. Num vale extraorçamentário nada disto existiria.
    const classes = new Set(partidas.map((p) => p.classe));
    expect([...classes].some((c) => c === "5" || c === "6")).toBe(true);
  });

  /**
   * ⚠️ ESTA É A PROPRIEDADE, E ELA VALE INDEPENDENTE DA DECISÃO DE PRODUTO. Mudar o vale de
   * orçamentário para extraorçamentário muda QUAIS pernas existem; não pode mudar o fato de que
   * cada subsistema fecha. Por isso este caso NÃO deve mudar de cor na rodada que construir a
   * cadeia nova — e se mudar, mudou algo que ninguém pediu.
   */
  it("cX.2 · INVARIANTE 4 · cada subsistema fecha por si, não só o total — vale pago inclusive", async () => {
    await grupoDoValeBemConfigurado();
    await parametroDoVale();
    const vale = await valeFechado();
    await pagarVale(vale, { "MAT-A": "1200.00", "MAT-B": "800.00" });

    const partidas = await partidasDaCadeiaDoVale();
    expect(partidas.length).toBeGreaterThan(0);

    const somas = new Map<string, { d: Decimal; c: Decimal }>();
    for (const p of partidas) {
      const atual = somas.get(p.subsistema) ?? { d: new Decimal(0), c: new Decimal(0) };
      if (p.tipo === "DEBITO") atual.d = atual.d.plus(new Decimal(p.valor));
      else atual.c = atual.c.plus(new Decimal(p.valor));
      somas.set(p.subsistema, atual);
    }

    // ⚠️ AFIRMA A PROPRIEDADE EM TODO SUBSISTEMA PRESENTE, e não numa lista enumerada de nomes.
    // Guarda que enumera formas acha só aquelas formas: se um subsistema novo aparecer na cadeia,
    // ele entra nesta conferência sozinho.
    expect(somas.size).toBeGreaterThan(0);
    for (const [subsistema, { d, c }] of somas) {
      expect(`${subsistema} D=${d.toFixed(2)} C=${c.toFixed(2)}`).toBe(`${subsistema} D=${d.toFixed(2)} C=${d.toFixed(2)}`);
    }

    // E o ATIVO do adiantamento foi debitado pelo vale inteiro — 1.200,00 + 800,00, à mão.
    const noAtivo = partidas.filter((p) => p.conta === "1.1.3.1.1.01.01" && p.tipo === "DEBITO");
    expect(noAtivo.reduce((a, p) => a.plus(new Decimal(p.valor)), new Decimal(0)).toFixed(2)).toBe("2000.00");
  });
});
