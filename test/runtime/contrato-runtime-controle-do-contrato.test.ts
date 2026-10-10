import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { criarFichaDeTeste } from "../ficha-teste.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../../modules/m05-despesa/dominio.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { anularLiquidacao, liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { anularLiquidacaoParcial, estornarAnulacaoParcial } from "../../modules/m05-despesa/anulacao-parcial.js";
import { declararRoteiroPatrimonial } from "../../modules/m01-core-contabil/roteiro-patrimonial-declarado.js";
import { cadastrarContrato, cadastrarProcesso, estornarMovimentoContratual, homologarProcesso, registrarAditivo } from "../../modules/m11-licitacoes/contratos.js";
import { controleContabilDoContrato, estornarControleDoContrato, lancarControleDoContrato } from "../../modules/m11-licitacoes/controle-contabil-do-contrato.js";
import { controleDoContratoParaUsuario } from "../../modules/m11-licitacoes/conferencia-do-controle.js";
import type { M05Deps } from "../../modules/m05-despesa/ports.js";

/**
 * ═══ O CONTROLE CONTÁBIL DO CONTRATO NO RAZÃO, PELO PAPEL DE RUNTIME (V39-R2: R2-008 a 013) ═══
 *
 * As contas são semeadas pelo teste com os CÓDIGOS do controle de contratos de serviços do PCASP federal (os mesmos do
 * plano carregado nas bases de demonstração, conferidos ali pelo percurso); o ROTEIRO é declarado pelo serviço da
 * operação, como na tela — nenhum roteiro é inserido por fora.
 *   REGISTRO   D 7.1.2.3.1.02.00 / C 8.1.2.3.1.02.01 (a executar);  ACRESCIMO idem;  SUPRESSAO o inverso
 *   EXECUCAO   D 8.1.2.3.1.02.01 / C 8.1.2.3.1.02.02 (executados)
 *
 * Contas feitas antes, com dois contratos (N=2):
 *   CT-A: registro 10.000; acréscimo 2.000; supressão 500; acréscimo de 300 estornado; liquidação 1.000 com DUAS glosas
 *         vivas (300 e 200), uma glosa desfeita (a de 200), e a anulação parcial do que restou (700) →
 *         a executar = 10.000 + 2.000 − 500 + (300 − 300) − (1.000 − 300 − 700) = 11.500,00.
 *   CT-B: registro 5.000 → a executar 5.000,00 (nada do CT-A vaza para ele).
 * Cada teste semeia a base inteira: rodam sozinhos, em qualquer ordem.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => {
  await dono.$disconnect();
  await app.$disconnect();
});

const POR = "contratos.rt-controle@teste.local";
const FISCAL = "fiscal.rt-controle@teste.local";
const EX = anoCivil(new Date());
const HOJE = new Date(`${diaCivil(new Date())}T15:00:00.000Z`);
const INICIO = new Date(`${EX}-01-02T15:00:00.000Z`);
const FIM = new Date(`${EX}-12-30T15:00:00.000Z`);
const C = { disponivel: "6.2.2.1.1.00.00", empenhado: "6.2.2.1.3.01.00", liquidado: "6.2.2.1.3.03.00", fornecedor: "2.1.3.1.1.00.00", vpd: "3.3.2.1.1.01.00" };
const K = { obrigacao: "7.1.2.3.1.02.00", aExecutar: "8.1.2.3.1.02.01", executados: "8.1.2.3.1.02.02", outraExecutados: "8.1.2.3.1.04.02" };
const FUNDAMENTO = "MCASP, Parte V — controle das obrigações contratuais nas classes 7 e 8, contas do plano carregado.";
const negado = /permission denied|permissão negada/i;
const R_EMP = roteiroEmpenho({ creditoDisponivel: C.disponivel, creditoEmpenhado: C.empenhado });
const R_LIQ = roteiroLiquidacao({ variacaoDiminutiva: C.vpd, obrigacaoAPagar: C.fornecedor, creditoEmpenhado: C.empenhado, creditoLiquidado: C.liquidado });

let processoId = "";
let deps: M05Deps;

const roteiro = (chave: string, d: string, c: string, historico = `Controle do contrato — ${chave.toLowerCase()}`) =>
  declararRoteiroPatrimonial(app, { familia: "CONTRATO", chave, contaDebitoCodigo: d, contaCreditoCodigo: c, historicoPadrao: historico, fundamento: FUNDAMENTO, criadoPor: POR });
const todosOsRoteiros = async (): Promise<void> => {
  await roteiro("REGISTRO", K.obrigacao, K.aExecutar);
  await roteiro("ACRESCIMO", K.obrigacao, K.aExecutar);
  await roteiro("SUPRESSAO", K.aExecutar, K.obrigacao);
  await roteiro("EXECUCAO", K.aExecutar, K.executados);
};
const contrato = async (numero: string, valor: string): Promise<string> =>
  (await cadastrarContrato(app, { numeroContrato: numero, processoId, contratadoDocumento: "12345678000195", contratadoNome: "Manutec Serviços LTDA", valorInicial: valor, vigenciaInicio: INICIO, vigenciaFimInicial: FIM, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR })).contratoId;
const aditivo = (contratoId: string, tipo: "ACRESCIMO_VALOR" | "SUPRESSAO_VALOR", valor: string, n: string) =>
  registrarAditivo(app, { contratoId, tipo, valor, data: HOJE, numeroAditivo: n, motivo: "Ajuste quantitativo do objeto por necessidade da administração", criadoPor: POR });
const empenho = async (contratoId: string, numero: string, valor: string): Promise<string> =>
  (await empenhar({ fichaId: "F1", numero, tipo: "GLOBAL", valor, data: HOJE, credorCpfCnpj: "12345678000195", historico: "Empenho do contrato", contratoId, criadoPor: POR }, R_EMP, deps)).empenhoId;
const liquidacao = async (empenhoId: string, numero: string, valor: string): Promise<string> =>
  (await liquidar({ empenhoId, numero, valor, data: HOJE, responsavelAtesto: "Fiscal do contrato", historico: "Serviço do mês", criadoPor: POR }, R_LIQ, deps)).liquidacaoId;

/** Saldo (débitos − créditos) de uma conta nas partidas dos lançamentos de controle de UM contrato, em Decimal. */
async function saldoNoContrato(contratoId: string, codigo: string): Promise<string> {
  const ps = await dono.partidaContabil.findMany({ where: { conta: { codigo }, lancamento: { controleDeContrato: { contratoId } } }, select: { tipo: true, valor: true } });
  return ps.reduce((t, p) => (p.tipo === "DEBITO" ? t.plus(p.valor.toFixed(2)) : t.minus(p.valor.toFixed(2))), new Decimal(0)).toFixed(2);
}

beforeEach(async () => {
  await limparBanco(dono);
  const perfil = async (nome: string, ident: string, acoes: readonly string[]): Promise<void> => {
    const p = await dono.perfil.create({ data: { nome, descricao: "rt", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
    const u = await dono.usuario.create({ data: { identificador: ident, nome: ident, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  };
  await perfil("RT-CONTROLE-CONTRATO", POR, ["CADASTRAR_PROCESSO", "HOMOLOGAR_PROCESSO", "CADASTRAR_CONTRATO", "REGISTRAR_ADITIVO", "ESTORNAR_MOVIMENTO_CONTRATUAL", "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", "CONSULTAR_LICITACOES", "EMPENHAR", "LIQUIDAR", "ANULAR_LIQUIDACAO", "ANULAR_LIQUIDACAO_PARCIAL", "ESTORNAR_ANULACAO_PARCIAL"]);
  // o fiscal: nenhuma ação de licitação nem financeira — só a designação (que este teste não precisa criar para a recusa)
  await perfil("RT-SO-FISCAL", FISCAL, ["REGISTRAR_MEDICAO_DE_OBRA"]);
  await dono.contaPcasp.createMany({
    data: [
      { codigo: C.disponivel, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.empenhado, nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.liquidado, nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.fornecedor, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.vpd, nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: K.obrigacao, nome: "Contratos de serviços", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { codigo: K.aExecutar, nome: "Contratos de serviços a executar", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { codigo: K.executados, nome: "Contratos de serviços executados", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { codigo: K.outraExecutados, nome: "Contratos de fornecimento executados", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
    ],
  });
  await dono.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await dono.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await dono.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await dono.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await dono.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await dono.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await dono.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(dono, {
    id: "F1", exercicio: EX, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "f500", valorDotado: "100000.00",
  });
  processoId = (await cadastrarProcesso(app, { numeroProcesso: "RT-CTR/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Manutenção predial continuada", valorLicitado: "30000.00", criadoPor: POR })).processoId;
  await homologarProcesso(app, { processoId, data: new Date(`${EX}-01-01T15:00:00.000Z`), criadoPor: POR });
  deps = criarM05DepsComContratos(app);
}, 180_000);

describe("controle contábil do contrato pelo papel de runtime", () => {
  it("sem roteiro: o contrato é cadastrado, nada se lança, e a leitura diz o motivo e os eventos que faltam", async () => {
    const id = await contrato("CT-SEM", "1000.00");
    const c = await controleContabilDoContrato(app, id);
    expect([c.linhas.length, c.controleAberto, c.motivoDoControleFechado]).toEqual([0, false, "SEM_ROTEIRO_DO_REGISTRO"]);
    expect(c.eventosSemRoteiro).toEqual(["REGISTRO", "ACRESCIMO", "SUPRESSAO", "EXECUCAO"]);
    expect(await dono.lancamentoContabil.count({ where: { origemTipo: { startsWith: "CONTRATO_" } } })).toBe(0);
    // declarado o roteiro DEPOIS, o contrato antigo continua fechado: o acréscimo e a execução dele não lançam
    await todosOsRoteiros();
    await aditivo(id, "ACRESCIMO_VALOR", "100.00", "1º TA");
    await liquidacao(await empenho(id, "NE-SEM", "500.00"), "NL-SEM", "200.00");
    const d = await controleContabilDoContrato(app, id);
    expect([d.linhas.length, d.controleAberto, d.motivoDoControleFechado, d.aExecutar]).toEqual([0, false, "ANTERIOR_AO_ROTEIRO", "0.00"]);
  }, 180_000);

  it("registro, aditivos, estorno, execução com duas glosas e anulação — pelas contas do roteiro e invertendo as do original", async () => {
    await todosOsRoteiros();
    const a = await contrato("CT-A", "10000.00");
    const b = await contrato("CT-B", "5000.00");
    await aditivo(a, "ACRESCIMO_VALOR", "2000.00", "1º TA");
    await aditivo(a, "SUPRESSAO_VALOR", "500.00", "2º TA");
    const errado = await aditivo(a, "ACRESCIMO_VALOR", "300.00", "3º TA");
    await estornarMovimentoContratual(app, { movimentoId: errado.movimentoId, data: HOJE, motivo: "Aditivo registrado com o valor de outro contrato", criadoPor: POR });

    const e = await empenho(a, "NE-CT-A", "5000.00");
    const l1 = await liquidacao(e, "NL-1", "1000.00");
    const g1 = await anularLiquidacaoParcial({ originalId: l1, numero: "NL-1-AP1", valor: "300.00", data: HOJE, motivo: "glosa de serviço não comprovado", criadoPor: POR }, deps);
    const g2 = await anularLiquidacaoParcial({ originalId: l1, numero: "NL-1-AP2", valor: "200.00", data: HOJE, motivo: "glosa de material não entregue", criadoPor: POR }, deps);
    expect((await controleContabilDoContrato(app, a)).aExecutar).toBe("11000.00"); // 11.500 − (1.000 − 300 − 200)
    await estornarAnulacaoParcial({ nivel: "LIQUIDACAO", anulacaoId: g2.anulacaoId, numero: "NL-1-AP2-E", data: HOJE, motivo: "glosa desfeita com a comprovação apresentada", criadoPor: POR }, deps);
    expect((await controleContabilDoContrato(app, a)).aExecutar).toBe("10800.00"); // glosa de 200 desfeita: executado volta a 700
    // com glosa viva, o M05 não anula a liquidação inteira: o que resta (700) sai por mais uma anulação parcial
    await anularLiquidacaoParcial({ originalId: l1, numero: "NL-1-AP3", valor: "700.00", data: HOJE, motivo: "anulação do restante por erro de competência", criadoPor: POR }, deps);
    const c = await controleContabilDoContrato(app, a);
    expect(c.aExecutar).toBe("11500.00");
    expect(c.linhas.map((x) => [x.evento, x.valor, x.efeito])).toEqual([
      ["REGISTRO", "10000.00", "10000.00"], ["ACRESCIMO", "2000.00", "2000.00"], ["SUPRESSAO", "500.00", "500.00"],
      ["ACRESCIMO", "300.00", "0.00"], ["ESTORNO", "300.00", null],
      ["EXECUCAO", "1000.00", "0.00"], ["ESTORNO", "300.00", null], ["ESTORNO", "200.00", null], ["ESTORNO", "200.00", null], ["ESTORNO", "700.00", null],
    ]);
    // o razão: o elo do lançamento (estornoDeId) só no estorno único e total — o do acréscimo de 300; os parciais, não
    const ligados = await dono.lancamentoContabil.count({ where: { origemTipo: "CONTRATO_ESTORNO", estornoDeId: { not: null } } });
    expect(ligados).toBe(2); // o do acréscimo de 300 e o da glosa de 200 desfeita (estorno total do estorno)
    expect(await saldoNoContrato(a, K.aExecutar)).toBe("-11500.00");
    expect(await saldoNoContrato(a, K.executados)).toBe("0.00");
    expect(await saldoNoContrato(a, K.obrigacao)).toBe("11500.00");
    expect((await controleContabilDoContrato(app, b)).aExecutar).toBe("5000.00");
    expect(await saldoNoContrato(b, K.aExecutar)).toBe("-5000.00");
    // conferido contra os fatos: valor atualizado 11.500, liquidado 0 → sem divergência
    const conf = await controleDoContratoParaUsuario(app, POR, a);
    expect("controle" in conf && [conf.controle.esperado, conf.controle.diverge, conf.podeDeclararRoteiro]).toEqual(["11500.00", false, true]);

    // a versão do roteiro fica no fato: execução sob a v2, roteiro trocado para v3, anulação inverte as contas da v2
    expect((await roteiro("EXECUCAO", K.aExecutar, K.outraExecutados, "Execução do contrato (v2)")).versao).toBe(2);
    const l2 = await liquidacao(e, "NL-2", "700.00");
    expect((await roteiro("EXECUCAO", K.aExecutar, K.executados, "Execução do contrato (v3)")).versao).toBe(3);
    expect((await dono.lancamentoDeControleDoContrato.findUniqueOrThrow({ where: { evento_origemId: { evento: "EXECUCAO", origemId: l2 } }, select: { versaoDoRoteiro: true } })).versaoDoRoteiro).toBe(2);
    await anularLiquidacao({ liquidacaoId: l2, numero: "NL-2-AN", data: HOJE, historico: "liquidação anulada por erro de valor", criadoPor: POR }, deps);
    expect(await saldoNoContrato(a, K.outraExecutados)).toBe("0.00");
    expect(await saldoNoContrato(a, K.executados)).toBe("0.00");

    const ps = await dono.partidaContabil.findMany({ where: { lancamento: { controleDeContrato: { contratoId: { in: [a, b] } } } }, select: { subsistema: true } });
    expect(new Set(ps.map((x) => x.subsistema))).toEqual(new Set(["CONTROLE"]));
    await expect(app.lancamentoDeControleDoContrato.updateMany({ where: { contratoId: a }, data: { valor: "1.00" } })).rejects.toThrow(negado);
    await expect(app.lancamentoDeControleDoContrato.deleteMany({ where: { contratoId: a } })).rejects.toThrow(negado);
  }, 240_000);

  it("evento sem roteiro com o controle aberto: o acréscimo não lança, e a divergência com os fatos fica na leitura mesmo depois de declarar o roteiro", async () => {
    await roteiro("REGISTRO", K.obrigacao, K.aExecutar);
    await roteiro("EXECUCAO", K.aExecutar, K.executados);
    const a = await contrato("CT-D", "10000.00");
    await aditivo(a, "ACRESCIMO_VALOR", "5000.00", "1º TA");
    const ler = async () => { const r = await controleDoContratoParaUsuario(app, POR, a); if (!("controle" in r)) throw new Error(r.negado); return r.controle; };
    let c = await ler();
    expect([c.aExecutar, c.esperado, c.diverge]).toEqual(["10000.00", "15000.00", true]);
    await roteiro("ACRESCIMO", K.obrigacao, K.aExecutar);
    c = await ler();
    expect([c.eventosSemRoteiro.includes("ACRESCIMO"), c.aExecutar, c.esperado, c.diverge]).toEqual([false, "10000.00", "15000.00", true]);
  }, 180_000);

  // (contrato de valor zero não se cadastra: o domínio recusa antes; o ramo SEM_VALOR da leitura é defensivo)
  it("leitura: a fiscalização sozinha é recusada pelo motivo", async () => {
    await todosOsRoteiros();
    const a = await contrato("CT-F", "1000.00");
    const r = await controleDoContratoParaUsuario(app, FISCAL, a);
    expect(r).toEqual({ negado: expect.stringMatching(/consulta licitações no ente ou alcança a execução financeira.*a designação na fiscalização não basta/) });
  }, 180_000);

  it("idempotência e estorno acima do que resta: recusados pelo motivo, sem segundo lançamento", async () => {
    await todosOsRoteiros();
    const b = await contrato("CT-B", "5000.00");
    const antes = await dono.lancamentoContabil.count();
    const r = await app.$transaction((tx) => lancarControleDoContrato(tx, { contratoId: b, evento: "REGISTRO", origemId: b, valor: toMoney("5000.00"), dia: diaCivil(HOJE), criadoPor: POR }));
    expect(r.situacao).toBe("JA_LANCADO");
    await expect(app.$transaction((tx) => estornarControleDoContrato(tx, { eventoOriginal: "REGISTRO", origemOriginalId: b, origemDoEstornoId: "estorno-maior", valor: toMoney("5000.01"), dia: diaCivil(HOJE), criadoPor: POR })))
      .rejects.toThrow(/pede R\$ 5\.000,01, mas o lançamento original só tem R\$ 5\.000,00 a estornar/);
    expect(await dono.lancamentoContabil.count()).toBe(antes);
    await expect(dono.$executeRawUnsafe(`INSERT INTO "LancamentoDeControleDoContrato" (id, "contratoId", evento, "origemId", "lancamentoId", valor, "criadoPor") SELECT 'x', '${b}', 'MEDICAO', 'o', id, 1, 't' FROM "LancamentoContabil" LIMIT 1`)).rejects.toThrow(/ck_controle_contabil_do_contrato/);
  }, 180_000);
});
