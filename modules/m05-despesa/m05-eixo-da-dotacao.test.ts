import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { CONTA_CREDITO_DISPONIVEL, semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import {
  CONTA_DOTACAO_POR_FONTE_ANULACAO,
  CONTA_DOTACAO_POR_FONTE_EXCESSO,
  CONTA_DOTACAO_POR_FONTE_OPERACAO_CREDITO,
  CONTA_DOTACAO_POR_FONTE_SUPERAVIT,
} from "../m01-core-contabil/roteiros.js";
import { registrarMovimentoDotacao } from "./dotacao-razao.js";
import {
  eixoVigente,
  politicaVigente,
  publicarPoliticaDaDotacaoAdicional,
  publicarRoteiroDaDotacaoPorFonte,
} from "./servico-dotacao-por-fonte.js";

/**
 * ═══ O EIXO DA DOTAÇÃO ADICIONAL (V11 V8.9), CONTRA BANCO ═══
 *
 * `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`. No plano oficial, `5.2.2.1.2` (por tipo de crédito) e
 * `5.2.2.1.3` (por fonte) são IRMÃS sob `5.2.2.1 DOTAÇÃO ORÇAMENTÁRIA` e descrevem o MESMO
 * crédito por eixos diferentes. O sistema só lançava na `.2`, e a `.3` ficava vazia em qualquer
 * demonstrativo que a lesse.
 *
 * ⚠️ POR QUE NÃO SE LANÇA NAS DUAS, E ESTE ARQUIVO PROVA: a perna de CRÉDITO é a mesma nos dois
 * eixos — o crédito disponível. Lançar os dois creditaria o disponível DUAS VEZES pelo mesmo
 * decreto, e o ente poderia empenhar o dobro do que a lei autorizou. Cada par é balanceado, então
 * NENHUM guard de balanceamento veria isso. `t1` mede o crédito disponível e exige que ele tenha
 * subido UMA vez por crédito.
 *
 * ⚠️ FIXTURE N=2: dois créditos de ORIGENS diferentes. Com um só, um roteiro partido por origem e
 * um roteiro único se comportariam igual.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const CONTABIL = "contabil@cg.pb.gov.br";
const SEM_CRACHA = "so.empenha.eixo@cg.pb.gov.br";
const FUNDAMENTO = "Orientacao do TCE-PB para o exercicio; plano de contas do ente, quadro 3.";

const debitosDa = async (fichaId: string): Promise<readonly string[]> =>
  (
    await prisma.partidaContabil.findMany({
      where: { fichaId, tipo: "DEBITO" },
      select: { conta: { select: { codigo: true } } },
      orderBy: { id: "asc" },
    })
  ).map((p) => p.conta.codigo);

/** Quanto o CRÉDITO DISPONÍVEL recebeu — a conta que o empenho consome. */
async function creditadoNoDisponivel(fichaId: string): Promise<string> {
  const r = await prisma.partidaContabil.aggregate({
    where: { fichaId, tipo: "CREDITO", conta: { codigo: CONTA_CREDITO_DISPONIVEL } },
    _sum: { valor: true },
  });
  return (r._sum.valor ?? 0).toString();
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    exercicio: 2026, id: "ficha-a", numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "10000.00",
  });

  // ⚠️ AS CONTAS DO RAMO `.3` VÊM DAS CONSTANTES DO DOMÍNIO, não de literais escritos aqui: é o
  // mesmo dono que o seed de produção usa. Um código digitado num teste é norma inventada dentro
  // do teste — e foi assim que uma sintética virou o "crédito empenhado" de facto do repositório.
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: CONTA_DOTACAO_POR_FONTE_SUPERAVIT, nome: "Superavit financeiro de exercicio anterior", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: CONTA_DOTACAO_POR_FONTE_EXCESSO, nome: "Excesso de arrecadacao", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: CONTA_DOTACAO_POR_FONTE_ANULACAO, nome: "Anulacao de dotacao", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: CONTA_DOTACAO_POR_FONTE_OPERACAO_CREDITO, nome: "Operacoes de credito", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
    skipDuplicates: true,
  });

  const p = await prisma.perfil.create({
    data: {
      nome: "CONTABILIDADE", descricao: "CONTABILIDADE", criadoPor: "SEED",
      permissoes: { create: [{ acao: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO" as never, criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: CONTABIL, nome: CONTABIL, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });

  // ⚠️ O ATOR DA NEGATIVA É CRIADO AQUI, COM O CRACHÁ ERRADO — e não escolhido entre os que o
  // `limparBanco` semeia. MEDIDO: a primeira versão de t8 usou o usuário do orçamento e ficou
  // VERDE por acidente... ao contrário: ela ficou VERMELHA porque aquele usuário TEM a ação. Um
  // teste de autorização que não sabe qual é o crachá do seu ator não prova nada.
  const semCracha = await prisma.perfil.create({
    data: {
      nome: "SO_EMPENHA", descricao: "SO_EMPENHA", criadoPor: "SEED",
      permissoes: { create: [{ acao: "EMPENHAR" as never, criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u2 = await prisma.usuario.create({
    data: { identificador: SEM_CRACHA, nome: SEM_CRACHA, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u2.id, perfilId: semCracha.id, criadoPor: "SEED" } });
}

beforeEach(semear, 120_000);

const publicarPorFonte = (origem: string, debito: string) =>
  publicarRoteiroDaDotacaoPorFonte(prisma, {
    origem: origem as never,
    contaDebitoCodigo: debito,
    contaCreditoCodigo: CONTA_CREDITO_DISPONIVEL,
    fundamento: FUNDAMENTO,
    criadoPor: CONTABIL,
  });

const adotarPorFonte = () =>
  publicarPoliticaDaDotacaoAdicional(prisma, { eixo: "POR_FONTE", fundamento: FUNDAMENTO, criadoPor: CONTABIL });

const creditar = (origem: string | null, valor: string) =>
  prisma.$transaction((tx) =>
    registrarMovimentoDotacao(tx, {
      fichaId: "ficha-a",
      tipo: "CREDITO_ADICIONAL",
      tipoCredito: "SUPLEMENTAR",
      valor,
      origemTipo: "TESTE",
      criadoPor: POR,
      data: new Date("2026-05-02T12:00:00Z"),
      ...(origem === null ? {} : { origemDoRecurso: origem as never }),
    })
  );

describe("o eixo da dotação adicional é UM, e é o ente que o escolhe", () => {
  it("t1 — sob POR FONTE, origens diferentes debitam contas diferentes E o disponível sobe UMA vez por crédito", async () => {
    await semearRoteiroOrcamentario(prisma);
    await publicarPorFonte("EXCESSO_ARRECADACAO", CONTA_DOTACAO_POR_FONTE_EXCESSO);
    await publicarPorFonte("OPERACAO_CREDITO", CONTA_DOTACAO_POR_FONTE_OPERACAO_CREDITO);
    await adotarPorFonte();

    await creditar("EXCESSO_ARRECADACAO", "1000.00");
    await creditar("OPERACAO_CREDITO", "2000.00");

    // [0] é a DOTACAO_INICIAL da ficha; [1] e [2] são os dois créditos.
    const [, excesso, operacao] = await debitosDa("ficha-a");
    expect(excesso).toBe(CONTA_DOTACAO_POR_FONTE_EXCESSO);
    expect(operacao).toBe(CONTA_DOTACAO_POR_FONTE_OPERACAO_CREDITO);
    expect(operacao).not.toBe(excesso);

    // ⚠️ A AFIRMAÇÃO QUE NENHUM GUARD DE BALANCEAMENTO FARIA. 10.000 da LOA + 1.000 + 2.000.
    // Se o sistema lançasse os DOIS eixos, este número seria 16.000 e todo lançamento continuaria
    // balanceado — o ente poderia empenhar o dobro do que a lei autorizou.
    expect(Number(await creditadoNoDisponivel("ficha-a"))).toBe(13000);
  });

  it("t2 — o MESMO crédito muda de ramo quando o eixo muda: é o eixo que manda", async () => {
    await semearRoteiroOrcamentario(prisma);
    await publicarPorFonte("EXCESSO_ARRECADACAO", CONTA_DOTACAO_POR_FONTE_EXCESSO);

    // Sem política publicada, vale o herdado: o ramo por TIPO.
    await creditar("EXCESSO_ARRECADACAO", "1000.00");
    const [, porTipo] = await debitosDa("ficha-a");

    await adotarPorFonte();
    await creditar("EXCESSO_ARRECADACAO", "1000.00");
    const [, , porFonte] = await debitosDa("ficha-a");

    expect(porTipo).not.toBe(CONTA_DOTACAO_POR_FONTE_EXCESSO);
    expect(porFonte).toBe(CONTA_DOTACAO_POR_FONTE_EXCESSO);
  });

  it("t3 — sob POR FONTE, origem SEM roteiro é recusada nomeando-a, e nada é gravado", async () => {
    await semearRoteiroOrcamentario(prisma);
    await adotarPorFonte();
    const antes = await prisma.movimentoDotacao.count();

    await expect(creditar("SUPERAVIT_FINANCEIRO", "1000.00")).rejects.toThrow(
      /ROTEIRO POR FONTE NÃO PARAMETRIZADO para a origem SUPERAVIT_FINANCEIRO/
    );
    expect(await prisma.movimentoDotacao.count()).toBe(antes);
  });

  it("t3b — CONTRAPROVA: sob o eixo HERDADO, a mesma origem sem roteiro por fonte passa", async () => {
    // Sem esta, t3 ficaria verde com uma leitura que recusa tudo — e recusar tudo não classifica
    // coisa nenhuma.
    await semearRoteiroOrcamentario(prisma);
    await creditar("SUPERAVIT_FINANCEIRO", "1000.00");
    expect((await debitosDa("ficha-a")).length).toBe(2);
  });

  it("t4 — sob POR FONTE, movimento SEM a origem é recusado ANTES de gravar", async () => {
    await semearRoteiroOrcamentario(prisma);
    await publicarPorFonte("EXCESSO_ARRECADACAO", CONTA_DOTACAO_POR_FONTE_EXCESSO);
    await adotarPorFonte();
    const antes = await prisma.movimentoDotacao.count();

    await expect(creditar(null, "1000.00")).rejects.toThrow(/CRÉDITO ADICIONAL SEM A ORIGEM DO RECURSO/);
    expect(await prisma.movimentoDotacao.count()).toBe(antes);
  });

  it("t5 — ausência de política NÃO é o mesmo que decisão: a leitura distingue as duas", async () => {
    // ⚠️ É A DIFERENÇA QUE A TELA MOSTRA. "O ente decidiu assim" e "ninguém decidiu e ficou assim"
    // são lidos de formas diferentes numa prestação de contas; colapsar os dois no mesmo valor
    // apagaria a pergunta.
    expect(await politicaVigente(prisma as never)).toBeNull();
    expect(await eixoVigente(prisma as never)).toBe("POR_TIPO_DE_CREDITO");

    await adotarPorFonte();
    expect((await politicaVigente(prisma as never))?.eixo).toBe("POR_FONTE");
    expect(await eixoVigente(prisma as never)).toBe("POR_FONTE");
  });

  it("t6 — republicar o MESMO eixo é recusado; trocar cria VERSÃO nova", async () => {
    await adotarPorFonte();
    await expect(adotarPorFonte()).rejects.toThrow(/Republicar a mesma decisão não é um fato novo/);

    const volta = await publicarPoliticaDaDotacaoAdicional(prisma, {
      eixo: "POR_TIPO_DE_CREDITO", fundamento: FUNDAMENTO, criadoPor: CONTABIL,
    });
    expect(volta.versao).toBe(2);
    expect(volta.anterior).toBe("POR_FONTE");
    // ⚠️ APPEND-ONLY: as duas decisões continuam no banco. "Sob que política este lançamento foi
    // feito?" tem de ter resposta.
    expect(await prisma.politicaDaDotacaoAdicional.count()).toBe(2);
  });

  it("t7 — e o piso do fundamento é do BANCO também, não só do zod", async () => {
    // ⚠️ "porque sim" tem DEZ caracteres e passaria por um `min(10)` — foi medido na V8.3, com
    // essas palavras. Quem escreve direto no modelo (um seed, um script) não passa pelo zod.
    await expect(
      prisma.politicaDaDotacaoAdicional.create({
        data: { eixo: "POR_FONTE", fundamento: "porque sim", versao: 1, criadoPor: CONTABIL },
      })
    ).rejects.toThrow(/ck_politica_dotacao_fundamento_nao_vazio/);
  });

  it("t8 — sem autorização, ninguém publica o eixo", async () => {
    await expect(
      publicarPoliticaDaDotacaoAdicional(prisma, { eixo: "POR_FONTE", fundamento: FUNDAMENTO, criadoPor: SEM_CRACHA })
    ).rejects.toThrow();
    expect(await prisma.politicaDaDotacaoAdicional.count()).toBe(0);
  });
});
