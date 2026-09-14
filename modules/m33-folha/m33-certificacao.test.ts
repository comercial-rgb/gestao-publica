import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha, lancarNaFolha } from "./servico.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha, definirContasDaLiquidacaoDoGrupo } from "./apropriacao.js";
import {
  AutocertificacaoError,
  AutoliquidacaoError,
  FolhaNaoApropriadaError,
  FolhaNaoCertificadaError,
  GrupoSemContasDaLiquidacaoError,
  SemDesignacaoVigenteError,
  UsuarioNaoEAPessoaError,
  certificacaoDaFolha,
  certificarFolha,
  designacaoVigenteEm,
  designacoesNaFolha,
  designarNaFolha,
  devolverFolhaParaCorrecao,
  liquidacaoDaFolha,
  liquidarFolha,
  objetoParaCertificar,
  retratoDosAtosDaFolha,
  revogarDesignacaoNaFolha,
  situacaoDaCertificacao,
} from "./certificacao.js";
import { FolhaNaoFechadaError } from "./apropriacao.js";
import { elegibilidadeDosAtosDaFolha, type AcaoDaFolha } from "./elegibilidade.js";

/**
 * ═══ O ATESTO DA FOLHA E A SUA LIQUIDAÇÃO (V6.1 §3) — PROFUNDIDADE ═══
 *
 * A apropriação empenha; liquidar é ato próprio, e o art. 63 da Lei 4.320 exige título
 * comprobatório. Na folha o título é o FECHAMENTO mais a CERTIFICAÇÃO de quem o ente designou.
 *
 * FIXTURE N=2 em tudo que só se manifesta em conjunto: DOIS designados (titular e substituto),
 * DOIS servidores, DOIS grupos de empenho (um por servidor, um único), DUAS fichas.
 *
 * O que este arquivo existe para impedir:
 *  · que a folha seja liquidada sem atesto, ou com o atesto de OUTRO cálculo;
 *  · que quem preparou a folha a certifique, e que quem certificou a liquide;
 *  · que uma designação vencida, revogada ou de outro usuário sirva de lastro;
 *  · que a retomada de uma liquidação interrompida DUPLIQUE a obrigação;
 *  · que a folha meio liquidada seja apresentada como liquidada;
 *  · que o manifesto do atesto mude quando o objeto não mudou — e que NÃO mude quando mudou.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

/** Quatro papéis, quatro identidades — é a segregação que este arquivo prova. */
const PREPARADOR = "contabilidade@cg.pb.gov.br";
const ATESTADOR = "gabinete@cg.pb.gov.br";
const SUBSTITUTO = "juridico@cg.pb.gov.br";
const LIQUIDANTE = "despesa@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";

const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const FICHA = "ficha-folha";
const FICHA_CURTA = "ficha-curta";
const DATA_EMPENHO = D(2026, 5, 30);
const DATA_ATESTO = D(2026, 6, 2);
const DATA_LIQUIDACAO = D(2026, 6, 3);
const CONTAS = { contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar" } as const;

let folhaId = "";
let rubricaVenc = "";
let rubricaGrat = "";
let rubricaHext = "";
let credorId = "";
let pessoaAtestador = "";
let pessoaSubstituto = "";

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: PREPARADOR, versoes: { create: { nome, criadoPor: PREPARADOR } } }, select: { id: true } });
  return p.id;
}

/** Liga a identidade que autentica à pessoa do cadastro — é o que a designação exige. */
async function vincularUsuarioAPessoa(identificador: string, pessoaId: string): Promise<void> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador }, select: { id: true } });
  await prisma.vinculoUsuarioPessoa.create({ data: { usuarioId: u.id, pessoaId, tipo: "VINCULO", motivo: "fixture", criadoPor: "TESTE" } });
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
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e vantagens fixas" },
      { id: "nd-13", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "13", codigoCompleto: "319013", descricao: "Obrigacoes patronais" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-11" };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA, numero: 1, valorDotado: "500000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_CURTA, numero: 2, naturezaDespesaId: "nd-13", valorDotado: "500000.00" });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 5, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: PREPARADOR });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: PREPARADOR });
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  credorId = await pessoa("39053344705", "Sindicato dos Servidores");
  pessoaAtestador = await pessoa("28625006871", "Carla Atestadora");
  pessoaSubstituto = await pessoa("21050549040", "Davi Substituto");
  await vincularUsuarioAPessoa(ATESTADOR, pessoaAtestador);
  await vincularUsuarioAPessoa(SUBSTITUTO, pessoaSubstituto);

  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: PREPARADOR });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: PREPARADOR });
  const v1 = (await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: PREPARADOR })).vinculoId;
  const v2 = (await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "2000.00", criadoPor: PREPARADOR })).vinculoId;

  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: PREPARADOR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "10000.00", aliquota: "0" }, { ordem: 2, ate: null, aliquota: "0.15", parcelaADeduzir: "1500.00" }], criadoPor: PREPARADOR });
  rubricaVenc = (await cadastrarRubrica(prisma, { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: PREPARADOR })).rubricaId;
  rubricaGrat = (await cadastrarRubrica(prisma, { codigo: "GRAT", descricao: "Gratificacoes", tipo: "PROVENTO", natureza: "GRATIFICACOES_DO_VINCULO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 2, fundamentacaoLegal: "fixture", criadoPor: PREPARADOR })).rubricaId;
  rubricaHext = (await cadastrarRubrica(prisma, { codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: PREPARADOR })).rubricaId;
  await cadastrarRubrica(prisma, { codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: PREPARADOR });
  await cadastrarRubrica(prisma, { codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: PREPARADOR });
  // ⚠️ OS DOIS VÍNCULOS RECEBEM A RUBRICA DO GRUPO ÚNICO. Sem valor, a parcela dele é zero e o
  // grupo não gera empenho nenhum — a fixture N=2 dos grupos passaria por vacuidade.
  await lancarNaFolha(prisma, { vinculoId: v1, rubricaId: rubricaHext, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "500.00", criadoPor: PREPARADOR });
  await lancarNaFolha(prisma, { vinculoId: v2, rubricaId: rubricaHext, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "300.00", criadoPor: PREPARADOR });

  folhaId = (await abrirFolha(prisma, { competencia: "2026-05", criadoPor: PREPARADOR })).folhaId;
  await calcularFolha(prisma, { folhaId, criadoPor: PREPARADOR });
}

async function grupoPorServidor(): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FOLHA-VENC", descricao: "Vencimentos e vantagens fixas", fichaId: FICHA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP",
      porServidor: true, ...CONTAS, rubricaIds: [rubricaVenc], criadoPor: PREPARADOR,
    })
  ).grupoId;
}

/** O segundo grupo: um empenho ÚNICO, noutra ficha — a fixture N=2 da retomada por grupo. */
async function grupoUnico(contas: { contaVariacaoId: string; contaObrigacaoId: string } = { ...CONTAS }): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FOLHA-GRAT", descricao: "Gratificacoes", fichaId: FICHA_CURTA,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "GLOBAL", serie: "FG",
      porServidor: false, credorId, ...contas, rubricaIds: [rubricaGrat, rubricaHext], criadoPor: PREPARADOR,
    })
  ).grupoId;
}

async function designarAtestador(p?: { readonly quem?: string; readonly pessoaId?: string; readonly inicio?: Date; readonly fim?: Date }): Promise<string> {
  return (
    await designarNaFolha(prisma, {
      atribuicao: "CERTIFICAR_FOLHA",
      pessoaId: p?.pessoaId ?? pessoaAtestador,
      usuarioIdentificador: p?.quem ?? ATESTADOR,
      atoDesignacao: "Portaria 45/2026",
      vigenciaInicio: p?.inicio ?? D(2026, 1, 1),
      ...(p?.fim === undefined ? {} : { vigenciaFim: p.fim }),
      criadoPor: PREPARADOR,
    })
  ).designacaoId;
}

/** Fecha, aprova os grupos e empenha — o estado de onde a certificação parte. */
async function ateAApropriacao(): Promise<void> {
  await grupoPorServidor();
  await grupoUnico();
  await fecharFolha(prisma, { folhaId, criadoPor: PREPARADOR });
  await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: PREPARADOR });
}

beforeEach(semear);

describe("(1) a vigência da designação — derivação, nunca coluna", () => {
  it("vale do início ao fim, inclusive, e a revogação corta a partir do DIA do efeito", () => {
    const d = { vigenciaInicio: D(2026, 3, 1), vigenciaFim: D(2026, 3, 31), revogacao: null };
    expect(designacaoVigenteEm(d, D(2026, 2, 28))).toBe(false);
    expect(designacaoVigenteEm(d, D(2026, 3, 1))).toBe(true);
    expect(designacaoVigenteEm(d, D(2026, 3, 31))).toBe(true);
    expect(designacaoVigenteEm(d, D(2026, 4, 1))).toBe(false);

    const revogada = { vigenciaInicio: D(2026, 3, 1), vigenciaFim: null, revogacao: { dataEfeito: D(2026, 3, 10) } };
    expect(designacaoVigenteEm(revogada, D(2026, 3, 9))).toBe(true);
    // ⚠️ NO DIA DO EFEITO ELA JÁ NÃO VALE — e essa borda é a diferença entre "revogada hoje"
    // significar "não atesta hoje" e significar "ainda atesta hoje".
    expect(designacaoVigenteEm(revogada, D(2026, 3, 10))).toBe(false);
  });

  it("sem fim, vale para a frente", () => {
    const d = { vigenciaInicio: D(2026, 1, 1), vigenciaFim: null, revogacao: null };
    expect(designacaoVigenteEm(d, D(2030, 12, 31))).toBe(true);
  });
});

describe("(2) a situação da certificação — o último fato daquele cálculo", () => {
  const em = (min: number): Date => new Date(Date.UTC(2026, 5, 2, 12, min));
  it("pendente sem fato; certificada e devolvida pelo ÚLTIMO; e a de OUTRO cálculo não alcança este", () => {
    expect(situacaoDaCertificacao([], "calc-1")).toBe("PENDENTE");
    expect(situacaoDaCertificacao([{ tipo: "CERTIFICACAO", calculoId: "calc-1", criadoEm: em(0) }], "calc-1")).toBe("CERTIFICADA");
    expect(
      situacaoDaCertificacao(
        [
          { tipo: "DEVOLUCAO", calculoId: "calc-1", criadoEm: em(0) },
          { tipo: "CERTIFICACAO", calculoId: "calc-1", criadoEm: em(5) },
        ],
        "calc-1"
      )
    ).toBe("CERTIFICADA");
    expect(
      situacaoDaCertificacao(
        [
          { tipo: "CERTIFICACAO", calculoId: "calc-1", criadoEm: em(0) },
          { tipo: "DEVOLUCAO", calculoId: "calc-1", criadoEm: em(5) },
        ],
        "calc-1"
      )
    ).toBe("DEVOLVIDA");
    // ⚠️ O CASO QUE A RETIFICAÇÃO VAI PRODUZIR: há atesto, mas de outro objeto.
    expect(situacaoDaCertificacao([{ tipo: "CERTIFICACAO", calculoId: "calc-1", criadoEm: em(0) }], "calc-2")).toBe("SUPERADA");
  });
});

describe("(3) designar — quem o ente pôs, e o que o cadastro recusa", () => {
  it("designa, e a leitura diz que vigora hoje, com o ato e o responsável", async () => {
    await designarAtestador();
    const ds = await designacoesNaFolha(prisma, DATA_ATESTO);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.responsavel).toBe("Carla Atestadora");
    expect(ds[0]?.usuario).toBe(ATESTADOR);
    expect(ds[0]?.atoDesignacao).toBe("Portaria 45/2026");
    expect(ds[0]?.vigenteHoje).toBe(true);
  });

  it("recusa designar um usuário que NÃO é aquela pessoa — o atesto ficaria com dois nomes", async () => {
    await expect(
      designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaSubstituto, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 9/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: PREPARADOR })
    ).rejects.toThrow(UsuarioNaoEAPessoaError);
    expect(await prisma.designacaoNaFolha.count()).toBe(0);
  });

  it("recusa o ato de designação vazio — atesto sem fundamento não é atesto", async () => {
    await expect(
      designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaAtestador, usuarioIdentificador: ATESTADOR, atoDesignacao: "  ", vigenciaInicio: D(2026, 1, 1), criadoPor: PREPARADOR })
    ).rejects.toThrow();
    expect(await prisma.designacaoNaFolha.count()).toBe(0);
  });

  it("recusa a vigência invertida, nomeando as duas datas", async () => {
    await expect(designarAtestador({ inicio: D(2026, 5, 1), fim: D(2026, 4, 1) })).rejects.toThrow(/VIGENCIA-INVERTIDA/);
    expect(await prisma.designacaoNaFolha.count()).toBe(0);
  });

  it("sem a ação, não designa — e nada é gravado", async () => {
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(
      designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaAtestador, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 1/2026", vigenciaInicio: D(2026, 1, 1), criadoPor: SEM_PODER })
    ).rejects.toThrow(/DESIGNAR_NA_FOLHA/);
    expect(await prisma.designacaoNaFolha.count()).toBe(0);
  });

  it("revogar é FATO, não apagar: a designação continua, e a leitura mostra a data do efeito", async () => {
    const id = await designarAtestador();
    await revogarDesignacaoNaFolha(prisma, { designacaoId: id, dataEfeito: D(2026, 6, 1), motivo: "exoneracao", criadoPor: PREPARADOR });
    expect(await prisma.designacaoNaFolha.count()).toBe(1);
    const ds = await designacoesNaFolha(prisma, DATA_ATESTO);
    expect(ds[0]?.revogadaEm).not.toBeNull();
    expect(ds[0]?.vigenteHoje).toBe(false);
    // E a segunda revogação recusa, em vez de empilhar duas verdades.
    await expect(revogarDesignacaoNaFolha(prisma, { designacaoId: id, dataEfeito: D(2026, 7, 1), motivo: "de novo", criadoPor: PREPARADOR })).rejects.toThrow(/DESIGNACAO-JA-REVOGADA/);
  });
});

describe("(4) certificar — o atesto, com designação vigente e segregação", () => {
  it("recusa a folha ABERTA: só o cálculo congelado se certifica", async () => {
    await designarAtestador();
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(FolhaNaoFechadaError);
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("recusa SEM designação vigente, dizendo ao administrador o que falta", async () => {
    await ateAApropriacao();
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(SemDesignacaoVigenteError);
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("recusa com a designação VENCIDA no dia do ato — e aceita no último dia dela", async () => {
    await ateAApropriacao();
    await designarAtestador({ inicio: D(2026, 1, 1), fim: D(2026, 6, 1) });
    // ⚠️ O RELÓGIO DO SERVIDOR NO ÚLTIMO DIA DA DESIGNAÇÃO (V6.2): desde que o ato novo exige a
    // designação vigente também HOJE, o "aceita no último dia" só se prova com hoje dentro dela.
    // Só `Date` é falseado — o banco e os timers seguem reais.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(D(2026, 6, 1).getTime() + 3 * 3600_000) });
    try {
      await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(SemDesignacaoVigenteError);
      // ⚠️ A MESMA DESIGNAÇÃO, UM DIA ANTES: se este segundo ramo não passasse, o teste acima
      // estaria verde por a folha não certificar NUNCA — e não por causa da vigência.
      const ok = await certificarFolha(prisma, { folhaId, data: D(2026, 6, 1), criadoPor: ATESTADOR });
      expect(ok.certificacaoId).not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("recusa com a designação REVOGADA antes do ato", async () => {
    await ateAApropriacao();
    const id = await designarAtestador();
    await revogarDesignacaoNaFolha(prisma, { designacaoId: id, dataEfeito: D(2026, 6, 1), motivo: "exoneracao", criadoPor: PREPARADOR });
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(SemDesignacaoVigenteError);
  });

  it("recusa a designação de OUTRO usuário — designar Carla não autoriza o Davi", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: SUBSTITUTO })).rejects.toThrow(SemDesignacaoVigenteError);
  });

  it("o SUBSTITUTO designado certifica com o PRÓPRIO nome e o PRÓPRIO ato", async () => {
    await ateAApropriacao();
    const titular = await designarAtestador();
    await designarNaFolha(prisma, {
      atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaSubstituto, usuarioIdentificador: SUBSTITUTO,
      atoDesignacao: "Portaria 46/2026 (substituicao)", vigenciaInicio: D(2026, 6, 1), substitutoDeId: titular, criadoPor: PREPARADOR,
    });
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: SUBSTITUTO });
    const lida = await certificacaoDaFolha(prisma, folhaId);
    expect(lida?.situacao).toBe("CERTIFICADA");
    expect(lida?.fatos[0]?.responsavel).toBe("Davi Substituto");
    expect(lida?.fatos[0]?.ato).toBe("Portaria 46/2026 (substituicao)");
    expect(lida?.fatos[0]?.criadoPor).toBe(SUBSTITUTO);
  });

  it("recusa a AUTOCERTIFICAÇÃO de quem preparou a folha, nomeando o que ele fez", async () => {
    await ateAApropriacao();
    // Designar o PRÓPRIO preparador: o cadastro aceita (é ato do ente), o ATO recusa.
    const pPrep = await pessoa("62881744078", "Elis Preparadora");
    await vincularUsuarioAPessoa(PREPARADOR, pPrep);
    await designarAtestador({ quem: PREPARADOR, pessoaId: pPrep });
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: PREPARADOR })).rejects.toThrow(AutocertificacaoError);
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: PREPARADOR })).rejects.toThrow(/fechou esta folha/);
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("sem a ação CERTIFICAR_FOLHA não certifica, mesmo com designação vigente", async () => {
    await ateAApropriacao();
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    const pEst = await pessoa("15350946056", "Fabio Estagiario");
    await vincularUsuarioAPessoa(SEM_PODER, pEst);
    await designarAtestador({ quem: SEM_PODER, pessoaId: pEst });
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: SEM_PODER })).rejects.toThrow(/CERTIFICAR_FOLHA/);
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("certifica uma vez, e recusa a segunda", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(/FOLHA-JA-CERTIFICADA/);
    expect(await prisma.certificacaoDaFolha.count()).toBe(1);
  });
});

describe("(4b) o ato NOVO não se apoia em designação que já deixou de valer (V6.2)", () => {
  it("revogada em 5/6 e registrada DEPOIS: o atesto datado de 2/6 é RECUSADO — sem retroativo", async () => {
    await ateAApropriacao();
    const id = await designarAtestador();
    await revogarDesignacaoNaFolha(prisma, { designacaoId: id, dataEfeito: D(2026, 6, 5), motivo: "exoneracao", criadoPor: PREPARADOR });
    // A data do ato (2/6) está DENTRO da vigência; hoje (relógio real, depois de 5/6) não está.
    await expect(certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR })).rejects.toThrow(SemDesignacaoVigenteError);
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("DUAS designações, nenhuma cobrindo as duas datas: a futura cobre o dia do ato, a vencendo cobre hoje — RECUSA", async () => {
    await ateAApropriacao();
    // relógio em 3/6; ato datado de 12/6. A: começa 10/6 (não vale hoje). B: vale até 5/6 (não vale no ato).
    await designarAtestador({ inicio: D(2026, 6, 10) });
    await designarAtestador({ inicio: D(2026, 1, 1), fim: D(2026, 6, 5) });
    vi.useFakeTimers({ toFake: ["Date"], now: D(2026, 6, 3) });
    try {
      await expect(certificarFolha(prisma, { folhaId, data: D(2026, 6, 12), criadoPor: ATESTADOR })).rejects.toThrow(SemDesignacaoVigenteError);
      expect(await prisma.certificacaoDaFolha.count()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a contraprova: com o relógio em 3/6 (antes do efeito), o MESMO ato passa", async () => {
    await ateAApropriacao();
    const id = await designarAtestador();
    await revogarDesignacaoNaFolha(prisma, { designacaoId: id, dataEfeito: D(2026, 6, 5), motivo: "exoneracao", criadoPor: PREPARADOR });
    vi.useFakeTimers({ toFake: ["Date"], now: D(2026, 6, 3) });
    try {
      const ok = await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
      expect(ok.certificacaoId).not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * ⚠️ PARIDADE ENTRE A BARRA DE AÇÕES E O CASO DE USO (V6.2 U0). Para cada estado real e cada ato,
 * o predicado anuncia ELEGÍVEL ou um código; o serviço é chamado de verdade e tem de concordar —
 * recusar com a mensagem começando pelo MESMO código, ou não recusar pelo estado. Um predicado que
 * dissesse "disponível" onde o serviço recusa (ou o contrário) é a tela prometendo o que não fará.
 */
describe("(4c) paridade: o que a tela anuncia é o que o serviço faz", () => {
  const CODIGO_DAS_CLASSES: Readonly<Record<string, string>> = {
    FolhaNaoFechadaError: "FOLHA-NAO-FECHADA",
    SemDesignacaoVigenteError: "SEM-DESIGNACAO-VIGENTE",
    AutocertificacaoError: "AUTOCERTIFICACAO-DA-FOLHA",
    AutoliquidacaoError: "AUTOLIQUIDACAO-DA-FOLHA",
    FolhaNaoCertificadaError: "FOLHA-NAO-CERTIFICADA",
    FolhaNaoApropriadaError: "FOLHA-NAO-APROPRIADA",
  };

  async function praticar(acao: AcaoDaFolha, quem: string): Promise<string | null> {
    try {
      if (acao === "certificar") await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: quem });
      else if (acao === "devolver") await devolverFolhaParaCorrecao(prisma, { folhaId, data: DATA_ATESTO, motivo: "paridade", criadoPor: quem });
      else if (acao === "liquidar") await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: quem });
      else if (acao === "fechar") await fecharFolha(prisma, { folhaId, criadoPor: quem });
      else if (acao === "calcular") await calcularFolha(prisma, { folhaId, criadoPor: quem });
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return CODIGO_DAS_CLASSES[(e as Error).name] ?? m.split(":")[0] ?? m;
    }
  }

  /** Confere um ato num estado — e desfaz nada: cada `it` parte da semente. */
  async function conferirParidade(acao: AcaoDaFolha, quem: string, esperado: string): Promise<void> {
    const r = await retratoDosAtosDaFolha(prisma, folhaId, quem, { consultarDesignacao: true, lerDistribuicao: true });
    if (r === null) throw new Error("folha sumiu");
    const e = elegibilidadeDosAtosDaFolha(r.estado, r.ator)[acao];
    const anunciado = e.situacao === "ELEGIVEL" ? "ELEGIVEL" : e.codigo;
    // O esperado é escrito à mão — não sai do predicado nem do serviço.
    expect(`${acao}/${quem}: ${anunciado}`).toBe(`${acao}/${quem}: ${esperado}`);
    const recusa = await praticar(acao, quem);
    if (esperado === "ELEGIVEL") expect(`${acao}: ${recusa ?? "praticado"}`).toBe(`${acao}: praticado`);
    else expect(`${acao}: ${recusa}`).toBe(`${acao}: ${esperado}`);
  }

  it("folha ABERTA: certificar e liquidar pedem o fechamento", async () => {
    await designarAtestador();
    await conferirParidade("certificar", ATESTADOR, "FOLHA-NAO-FECHADA");
    await conferirParidade("liquidar", LIQUIDANTE, "FOLHA-NAO-FECHADA");
  });

  it("FECHADA e pendente: sem designação trava; quem fechou trava por segregação; o designado pratica", async () => {
    await ateAApropriacao();
    await conferirParidade("certificar", ATESTADOR, "SEM-DESIGNACAO-VIGENTE");
    await conferirParidade("certificar", PREPARADOR, "AUTOCERTIFICACAO-DA-FOLHA");
    await conferirParidade("liquidar", LIQUIDANTE, "FOLHA-NAO-CERTIFICADA");
    await conferirParidade("fechar", PREPARADOR, "FOLHA-JA-FECHADA");
    await conferirParidade("calcular", PREPARADOR, "FOLHA-FECHADA");
    await designarAtestador();
    await conferirParidade("certificar", ATESTADOR, "ELEGIVEL");
  });

  it("CERTIFICADA: certificar não se aplica mais (mesmo para quem não é designado); quem certificou não liquida", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await conferirParidade("certificar", ATESTADOR, "FOLHA-JA-CERTIFICADA");
    await conferirParidade("liquidar", ATESTADOR, "AUTOLIQUIDACAO-DA-FOLHA");
    await conferirParidade("liquidar", LIQUIDANTE, "ELEGIVEL");
    // Depois de liquidada: devolver não se aplica — e o serviço recusa pelo mesmo código.
    await conferirParidade("devolver", ATESTADOR, "FOLHA-JA-LIQUIDADA");
  });

  it("a versão do retrato MUDA quando um fato decisivo acontece — e não muda quando nada aconteceu", async () => {
    await ateAApropriacao();
    await designarAtestador();
    const a = await retratoDosAtosDaFolha(prisma, folhaId, ATESTADOR, { consultarDesignacao: false, lerDistribuicao: false });
    const b = await retratoDosAtosDaFolha(prisma, folhaId, LIQUIDANTE, { consultarDesignacao: false, lerDistribuicao: false });
    expect(b?.versao).toBe(a?.versao);
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    const c = await retratoDosAtosDaFolha(prisma, folhaId, ATESTADOR, { consultarDesignacao: false, lerDistribuicao: false });
    expect(c?.versao).not.toBe(a?.versao);
  });

  it("apropriação COMPLETA não se oferece de novo; retrato sem a distribuição continua oferecendo (a retomada é segura)", async () => {
    await ateAApropriacao();
    const completo = await retratoDosAtosDaFolha(prisma, folhaId, PREPARADOR, { consultarDesignacao: false, lerDistribuicao: true });
    expect(completo?.estado.empenhosEsperados).toBe(3);
    const e = elegibilidadeDosAtosDaFolha(completo!.estado, completo!.ator).apropriar;
    expect(e.situacao === "ELEGIVEL" ? "ELEGIVEL" : e.codigo).toBe("FOLHA-JA-APROPRIADA");
    // O serviço concorda do jeito dele: reexecutar não grava nada novo.
    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: PREPARADOR });
    expect(r.empenhados).toBe(0);
    expect(r.jaExistiam).toBe(3);
  });
});

describe("(5) o manifesto — o que foi conferido, e a impressão digital DELE", () => {
  it("prende entidade, competência, cálculo, totais, os DOIS vínculos e as DUAS alocações", async () => {
    await ateAApropriacao();
    const o = await objetoParaCertificar(prisma, folhaId);
    expect(o.manifesto.ente.nome).toBe("Municipio de Teste");
    expect(o.manifesto.ente.cnpj).toBe("08993917000146");
    expect(o.manifesto.folha).toEqual({ competencia: "2026-05", tipo: "MENSAL" });
    expect(o.manifesto.vinculos.map((v) => v.matricula)).toEqual(["MAT-A", "MAT-B"]);
    // As duas alocações: o grupo por servidor (dois empenhos) e o único (um).
    expect(o.manifesto.alocacoes.map((a) => a.grupo).sort()).toEqual(["FOLHA-GRAT", "FOLHA-VENC"]);
    const venc = o.manifesto.alocacoes.find((a) => a.grupo === "FOLHA-VENC");
    expect(venc?.empenhos).toBe(2);
    expect(venc?.ficha).toBe(1);
    // A soma das alocações é o BRUTO da folha — nunca o líquido.
    const soma = o.manifesto.alocacoes.reduce((t, a) => t.plus(toMoney(a.valor)), toMoney(0));
    expect(soma.toFixed(2)).toBe(o.manifesto.totais.proventos);
  });

  it("o sha256 é do OBJETO: igual quando nada mudou, diferente quando um valor mudou", async () => {
    await ateAApropriacao();
    const a = await objetoParaCertificar(prisma, folhaId);
    const b = await objetoParaCertificar(prisma, folhaId);
    expect(b.sha256).toBe(a.sha256);

    // ⚠️ A MUTAÇÃO QUE PROVA O INSTRUMENTO. Sem ela, o teste acima passaria com um hash
    // constante — "abc" seria igual a "abc" e o manifesto não prenderia nada.
    const outra = { ...a.manifesto, totais: { ...a.manifesto.totais, liquido: "1.00" } };
    const { sha256Canonico } = await import("./dominio.js");
    expect(sha256Canonico(outra)).not.toBe(a.sha256);
  });

  it("o manifesto NÃO carrega CPF nem dado bancário — ele circula entre contabilidade e controle", async () => {
    await ateAApropriacao();
    const o = await objetoParaCertificar(prisma, folhaId);
    const texto = JSON.stringify(o.manifesto);
    expect(texto).not.toContain("11144477735");
    expect(texto).not.toContain("52998224725");
  });
});

describe("(6) devolver para correção", () => {
  it("devolve com motivo, a situação vira DEVOLVIDA e a liquidação recusa DIZENDO o motivo", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await devolverFolhaParaCorrecao(prisma, { folhaId, data: DATA_ATESTO, motivo: "MAT-B sem a gratificacao de regencia", criadoPor: ATESTADOR });
    const lida = await certificacaoDaFolha(prisma, folhaId);
    expect(lida?.situacao).toBe("DEVOLVIDA");
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(/MAT-B sem a gratificacao de regencia/);
  });

  it("devolver sem motivo não passa", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await expect(devolverFolhaParaCorrecao(prisma, { folhaId, data: DATA_ATESTO, motivo: "  ", criadoPor: ATESTADOR })).rejects.toThrow();
    expect(await prisma.certificacaoDaFolha.count()).toBe(0);
  });

  it("certificar DEPOIS de devolver vale — a trilha guarda os dois fatos, em ordem", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await devolverFolhaParaCorrecao(prisma, { folhaId, data: DATA_ATESTO, motivo: "conferir MAT-B", criadoPor: ATESTADOR });
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    const lida = await certificacaoDaFolha(prisma, folhaId);
    expect(lida?.situacao).toBe("CERTIFICADA");
    expect(lida?.fatos.map((f) => f.tipo)).toEqual(["DEVOLUCAO", "CERTIFICACAO"]);
  });

  it("não devolve o que já foi liquidado — devolver o atesto não desfaz obrigação", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    await expect(devolverFolhaParaCorrecao(prisma, { folhaId, data: DATA_ATESTO, motivo: "mudei de ideia", criadoPor: ATESTADOR })).rejects.toThrow(/FOLHA-JA-LIQUIDADA/);
  });
});

describe("(7) liquidar — a obrigação reconhecida pelo M05", () => {
  it("recusa SEM certificação, e não grava liquidação nenhuma", async () => {
    await ateAApropriacao();
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(FolhaNaoCertificadaError);
    expect(await prisma.liquidacao.count()).toBe(0);
  });

  it("recusa a folha certificada mas NÃO apropriada — obrigação sem crédito que a suporte", async () => {
    await grupoPorServidor();
    await grupoUnico();
    await fecharFolha(prisma, { folhaId, criadoPor: PREPARADOR });
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(FolhaNaoApropriadaError);
  });

  it("recusa a AUTOLIQUIDAÇÃO de quem certificou", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: ATESTADOR })).rejects.toThrow(AutoliquidacaoError);
    expect(await prisma.liquidacao.count()).toBe(0);
  });

  it("liquida os TRÊS empenhos, com o atesto no responsável, e o razão fecha por subsistema", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    const r = await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    expect(r.liquidadas).toBe(3);
    expect(r.jaExistiam).toBe(0);
    expect(r.pendentes).toBe(0);

    const liqs = await prisma.liquidacao.findMany({ select: { numero: true, valor: true, responsavelAtesto: true, notaFiscalNum: true, documentoFiscalId: true, medicaoId: true } });
    expect(liqs).toHaveLength(3);
    // ⚠️ NENHUMA NOTA FISCAL FOI INVENTADA para passar no validador: a folha não tem nota.
    expect(liqs.every((l) => l.notaFiscalNum === null && l.documentoFiscalId === null && l.medicaoId === null)).toBe(true);
    expect(liqs.every((l) => l.responsavelAtesto === "Carla Atestadora (Portaria 45/2026)")).toBe(true);
    // O total liquidado é o BRUTO da folha, e bate com o empenhado.
    const total = liqs.reduce((t, l) => t.plus(toMoney(l.valor)), toMoney(0));
    const empenhado = (await prisma.empenhoDaFolha.findMany({ select: { valor: true } })).reduce((t, e) => t.plus(toMoney(e.valor)), toMoney(0));
    expect(total.toFixed(2)).toBe(empenhado.toFixed(2));

    // O razão: cada liquidação lançou seis pernas, balanceadas por subsistema.
    const partidas = await prisma.partidaContabil.findMany({
      where: { lancamento: { origemTipo: "LIQUIDACAO" } },
      select: { tipo: true, valor: true, conta: { select: { codigo: true } }, subsistema: true },
    });
    expect(partidas).toHaveLength(18);
    for (const sub of ["PATRIMONIAL", "ORCAMENTARIO", "CONTROLE"] as const) {
      const d = partidas.filter((p) => p.subsistema === sub && p.tipo === "DEBITO").reduce((t, p) => t.plus(toMoney(p.valor)), toMoney(0));
      const c = partidas.filter((p) => p.subsistema === sub && p.tipo === "CREDITO").reduce((t, p) => t.plus(toMoney(p.valor)), toMoney(0));
      expect(`${sub}:${d.toFixed(2)}`).toBe(`${sub}:${c.toFixed(2)}`);
    }
    // ⚠️ E A VPD É A DE PESSOAL, não a de serviços de terceiros (3.3.2.1.1.01.00).
    const debitosPatrimoniais = [...new Set(partidas.filter((p) => p.subsistema === "PATRIMONIAL" && p.tipo === "DEBITO").map((p) => p.conta.codigo))];
    expect(debitosPatrimoniais).toEqual(["3.1.1.1.1.01.00"]);
    const creditosPatrimoniais = [...new Set(partidas.filter((p) => p.subsistema === "PATRIMONIAL" && p.tipo === "CREDITO").map((p) => p.conta.codigo))];
    expect(creditosPatrimoniais).toEqual(["2.1.1.1.1.01.01"]);
  });

  it("reexecutar NÃO duplica: a segunda vez reconhece as três e grava zero", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    const r2 = await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    expect(r2.liquidadas).toBe(0);
    expect(r2.jaExistiam).toBe(3);
    expect(await prisma.liquidacao.count()).toBe(3);
    expect(await prisma.liquidacaoDaFolha.count()).toBe(3);
  });

  it("a janela entre o M05 e o elo NÃO duplica: sem o elo, a retomada RECONHECE a liquidação e amarra", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    // Simula a morte do processo DEPOIS do M05 e ANTES do elo: apaga o elo de uma delas.
    const elo = await prisma.liquidacaoDaFolha.findFirstOrThrow({ select: { id: true } });
    await prisma.liquidacaoDaFolha.delete({ where: { id: elo.id } });
    const r = await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    expect(r.liquidadas).toBe(1);
    // ⚠️ E O QUE IMPORTA: continua havendo TRÊS liquidações no M05, não quatro.
    expect(await prisma.liquidacao.count()).toBe(3);
    expect(await prisma.liquidacaoDaFolha.count()).toBe(3);
  });

  it("grupo SEM as contas da liquidação recusa ANTES de gravar qualquer uma — e nomeia o grupo", async () => {
    await grupoPorServidor();
    await grupoUnico();
    // O grupo já existe com as contas; retirá-las é o estado dos grupos cadastrados antes do V6.1.
    await prisma.grupoDeEmpenhoDaFolha.updateMany({ where: { codigo: "FOLHA-GRAT" }, data: { contaVariacaoId: null, contaObrigacaoId: null } });
    await fecharFolha(prisma, { folhaId, criadoPor: PREPARADOR });
    await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: PREPARADOR });
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(GrupoSemContasDaLiquidacaoError);
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(/FOLHA-GRAT/);
    // ⚠️ EFEITO COLATERAL ANTES DA GUARDA: ZERO liquidações — nem as dos grupos completos.
    expect(await prisma.liquidacao.count()).toBe(0);
  });

  it("a leitura da tela separa liquidado de pendente, e nunca chama de liquidada a folha pela metade", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    const antes = await liquidacaoDaFolha(prisma, folhaId);
    expect(antes?.liquidadas).toBe(0);
    expect(antes?.pendentes).toBe(3);
    expect(antes?.total.toFixed(2)).toBe("0.00");

    await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    const depois = await liquidacaoDaFolha(prisma, folhaId);
    expect(depois?.liquidadas).toBe(3);
    expect(depois?.pendentes).toBe(0);
    expect(depois?.linhas.every((l) => l.responsavelAtesto === "Carla Atestadora (Portaria 45/2026)")).toBe(true);
  });

  it("sem a ação LIQUIDAR_FOLHA não liquida, mesmo com a folha certificada", async () => {
    await ateAApropriacao();
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: SEM_PODER })).rejects.toThrow(/LIQUIDAR_FOLHA/);
    expect(await prisma.liquidacao.count()).toBe(0);
  });
});

describe("(8) definir as contas de um grupo antigo — o caminho que a coluna nullable exigiu", () => {
  it("o grupo sem contas recusa a liquidação; definidas as contas, ela passa — e o passado não muda", async () => {
    await ateAApropriacao();
    const grupo = await prisma.grupoDeEmpenhoDaFolha.findFirstOrThrow({ where: { codigo: "FOLHA-GRAT" }, select: { id: true } });
    await prisma.grupoDeEmpenhoDaFolha.update({ where: { id: grupo.id }, data: { contaVariacaoId: null, contaObrigacaoId: null } });
    await designarAtestador();
    await certificarFolha(prisma, { folhaId, data: DATA_ATESTO, criadoPor: ATESTADOR });
    await expect(liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE })).rejects.toThrow(GrupoSemContasDaLiquidacaoError);
    expect(await prisma.liquidacao.count()).toBe(0);

    await definirContasDaLiquidacaoDoGrupo(prisma, { grupoId: grupo.id, ...CONTAS, criadoPor: PREPARADOR });
    const r = await liquidarFolha(prisma, { folhaId, data: DATA_LIQUIDACAO, criadoPor: LIQUIDANTE });
    expect(r.liquidadas).toBe(3);
    expect(r.pendentes).toBe(0);
  });

  it("recusa conta inexistente, e sem a ação não define — nada é gravado nas duas", async () => {
    await grupoPorServidor();
    const grupo = await prisma.grupoDeEmpenhoDaFolha.findFirstOrThrow({ select: { id: true } });
    await expect(definirContasDaLiquidacaoDoGrupo(prisma, { grupoId: grupo.id, contaVariacaoId: "c-nao-existe", contaObrigacaoId: "c-pessoal-pagar", criadoPor: PREPARADOR })).rejects.toThrow(/c-nao-existe/);
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(definirContasDaLiquidacaoDoGrupo(prisma, { grupoId: grupo.id, ...CONTAS, criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA/);
    const depois = await prisma.grupoDeEmpenhoDaFolha.findUniqueOrThrow({ where: { id: grupo.id }, select: { contaVariacaoId: true } });
    expect(depois.contaVariacaoId).toBe("c-vpd-pessoal");
  });
});

describe("(9) o gancho de estoque não dispara em folha", () => {
  it("recusa o grupo apontado para ficha de MATERIAL no CADASTRO, e não na liquidação", async () => {
    await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
    await criarFichaDeTeste(prisma, {
      exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
      programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-30",
      id: "ficha-material", numero: 3, valorDotado: "1000.00",
    });
    await expect(
      cadastrarGrupoDeEmpenhoDaFolha(prisma, {
        codigo: "ERRADO", descricao: "Folha em ficha de material", fichaId: "ficha-material",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS", tipoEmpenho: "ORDINARIO", serie: "FX",
        porServidor: true, ...CONTAS, rubricaIds: [rubricaVenc], criadoPor: PREPARADOR,
      })
    ).rejects.toThrow(/FICHA-DE-MATERIAL-NO-GRUPO-DA-FOLHA/);
    expect(await prisma.grupoDeEmpenhoDaFolha.count()).toBe(0);
  });
});
