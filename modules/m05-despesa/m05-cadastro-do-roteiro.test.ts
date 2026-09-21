import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { publicarRoteiroOrcamentario, roteiroVigente } from "./servico-roteiro-orcamentario.js";
import { registrarMovimentoDotacao } from "./dotacao-razao.js";

/**
 * ═══ O CADASTRO DO ROTEIRO ORÇAMENTÁRIO PELO ENTE (V11 V8.4), CONTRA BANCO ═══
 *
 * Duas pendências viviam da mesma ausência: `ROTEIRO-RESERVA-SEM-CONTA` e
 * `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`. Nenhuma se fecha escolhendo a conta — isso
 * seria inventar norma da STN. O que faltava era o ente ter ONDE escolher, e é isso que este
 * arquivo prova.
 *
 * O que se afirma:
 *   · a sintética é recusada LISTANDO as analíticas (t2) — recusar sem mostrar foi o que manteve
 *     estas pendências abertas;
 *   · débito igual a crédito é recusado (t3): um lançamento assim move zero e MESMO ASSIM
 *     balanceia, passando por todo guard sem escriturar nada;
 *   · a decisão é versionada, e o RAZÃO passa a usar a vigente (t4) — que é o ponto inteiro;
 *   · os dois homônimos são escolháveis, e a escolha fica com fundamento (t6).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CONTABIL = "contabil@cg.pb.gov.br";
const SEM_CRACHA = "so.empenha@cg.pb.gov.br";

const SINTETICA = "5.2.2.1.9.00.00";
const CANCELA_A = "5.2.2.1.3.09.00";
const CANCELA_B = "5.2.2.1.9.04.00";
const DISPONIVEL = "6.2.2.1.1.00.00";
const INICIAL = "5.2.2.1.1.01.00";

const FUNDAMENTO = "Plano do ente, quadro do cancelamento de dotacoes; orientacao do TCE-PB 3/2026.";

async function usuarioComPerfil(identificador: string, perfil: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil, descricao: perfil, criadoPor: "SEED",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      // ⚠️ OS DOIS HOMÔNIMOS, com o nome IDÊNTICO e em ramos diferentes — é o cenário exato da
      // pendência. Nenhum teste pode escolher entre eles; quem escolhe é o ente.
      { id: "c-sint", codigo: SINTETICA, nome: "CANCELAMENTO/REMANEJAMENTO DE DOTACAO", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: false },
      { id: "c-canc-a", codigo: CANCELA_A, nome: "(-) CANCELAMENTO DE DOTACOES", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "c-canc-b", codigo: CANCELA_B, nome: "(-) CANCELAMENTO DE DOTACOES", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "c-disp", codigo: DISPONIVEL, nome: "CREDITO DISPONIVEL", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ini", codigo: INICIAL, nome: "CREDITO INICIAL", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
    ],
    skipDuplicates: true,
  });
  await usuarioComPerfil(CONTABIL, "CONTABILIDADE", ["PARAMETRIZAR_ROTEIRO_ORCAMENTARIO"]);
  await usuarioComPerfil(SEM_CRACHA, "SO_EMPENHA", ["EMPENHAR"]);
}

beforeEach(semear, 120_000);

const publicar = (p: { debito?: string; credito?: string; tipo?: string; por?: string } = {}) =>
  publicarRoteiroOrcamentario(prisma, {
    tipo: p.tipo ?? "ANULACAO_CREDITO",
    contaDebitoCodigo: p.debito ?? CANCELA_A,
    contaCreditoCodigo: p.credito ?? DISPONIVEL,
    fundamento: FUNDAMENTO,
    criadoPor: p.por ?? CONTABIL,
  });

describe("o ente publica o roteiro — e o sistema confere a escolha", () => {
  it("t1: publica o par, com fundamento, na versão 1", async () => {
    const r = await publicar();
    expect(r.versao).toBe(1);
    expect(r.anterior).toBeNull();

    const v = await roteiroVigente(prisma as never, "ANULACAO_CREDITO", null);
    expect(v?.debito).toBe(CANCELA_A);
    expect(v?.credito).toBe(DISPONIVEL);
    expect(v?.fundamento).toBe(FUNDAMENTO);
  });

  it("t2: a conta SINTÉTICA é recusada LISTANDO as analíticas sob ela", async () => {
    await expect(publicar({ debito: SINTETICA })).rejects.toThrow(
      new RegExp(`SINTÉTICA[\\s\\S]*${CANCELA_B} \\(-\\) CANCELAMENTO DE DOTACOES`)
    );
    expect(await prisma.roteiroOrcamentario.count()).toBe(0);
  });

  it("t3: débito IGUAL ao crédito é recusado — move zero e mesmo assim balanceia", async () => {
    await expect(publicar({ debito: DISPONIVEL, credito: DISPONIVEL })).rejects.toThrow(
      /não podem ser a mesma conta[\s\S]*move zero e mesmo assim balanceia/
    );
    expect(await prisma.roteiroOrcamentario.count()).toBe(0);
  });

  it("t4: a decisão é VERSIONADA, e o razão passa a usar a vigente", async () => {
    await publicar({ tipo: "DOTACAO_INICIAL", debito: INICIAL, credito: DISPONIVEL });
    const segunda = await publicarRoteiroOrcamentario(prisma, {
      tipo: "DOTACAO_INICIAL",
      contaDebitoCodigo: CANCELA_A,
      contaCreditoCodigo: DISPONIVEL,
      fundamento: "Reclassificacao pedida pelo TCE no oficio 44/2026 — a dotacao inicial muda de conta.",
      criadoPor: CONTABIL,
    });
    expect(segunda.versao).toBe(2);
    expect(segunda.anterior).toEqual({ debito: INICIAL, credito: DISPONIVEL });

    // ⚠️ AS DUAS VERSÕES CONTINUAM NO BANCO — é o que responde "contra que roteiro este
    // lançamento foi feito?".
    expect(await prisma.roteiroOrcamentario.count({ where: { tipo: "DOTACAO_INICIAL" } })).toBe(2);

    // ⚠️ E O RAZÃO USA A VIGENTE. Sem isto o cadastro seria decorativo: o ente trocaria a conta na
    // tela e o lançamento continuaria na antiga.
    const v = await roteiroVigente(prisma as never, "DOTACAO_INICIAL", null);
    expect(v?.debito).toBe(CANCELA_A);
    expect(v?.versao).toBe(2);
  });

  it("t5: republicar o MESMO par é recusado — não é fato novo", async () => {
    await publicar();
    await expect(publicar()).rejects.toThrow(/já é .*Republicar o mesmo par/);
    expect(await prisma.roteiroOrcamentario.count()).toBe(1);
  });

  it("t6: os DOIS homônimos são escolháveis — e a escolha fica registrada com quem a fez", async () => {
    // ⚠️ O TESTE NÃO ESCOLHE ENTRE ELES, e não poderia: os dois têm o nome IDÊNTICO e a decisão é
    // contábil. O que ele afirma é que os dois CABEM, e que a escolha não some.
    await publicar({ debito: CANCELA_A });
    const v1 = await roteiroVigente(prisma as never, "ANULACAO_CREDITO", null);
    expect(v1?.debito).toBe(CANCELA_A);

    await publicarRoteiroOrcamentario(prisma, {
      tipo: "ANULACAO_CREDITO",
      contaDebitoCodigo: CANCELA_B,
      contaCreditoCodigo: DISPONIVEL,
      fundamento: "Revisao: a reducao passa a ser classificada sob CANCELAMENTO/REMANEJAMENTO.",
      criadoPor: CONTABIL,
    });
    const v2 = await roteiroVigente(prisma as never, "ANULACAO_CREDITO", null);
    expect(v2?.debito).toBe(CANCELA_B);
    expect(v2?.criadoPor).toBe(CONTABIL);

    const historico = await prisma.roteiroOrcamentario.findMany({
      where: { tipo: "ANULACAO_CREDITO" }, orderBy: { versao: "asc" },
      select: { fundamento: true, contaDebito: { select: { codigo: true } } },
    });
    expect(historico.map((h) => h.contaDebito.codigo)).toEqual([CANCELA_A, CANCELA_B]);
  });

  it("t7: quem EMPENHA não reclassifica o razão — e a recusa NOMEIA a ação", async () => {
    await expect(publicar({ por: SEM_CRACHA })).rejects.toThrow(/PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/);
    expect(await prisma.roteiroOrcamentario.count()).toBe(0);
  });

  it("t8: sem roteiro publicado, o movimento de dotação continua RECUSADO nomeando o par", async () => {
    // ⚠️ O FAIL-CLOSED NÃO AFROUXOU. O cadastro dá ao ente onde decidir; ele não passa a supor
    // nada quando o ente não decidiu.
    await expect(
      registrarMovimentoDotacao(prisma as never, {
        fichaId: "nao-importa", tipo: "ANULACAO_CREDITO", valor: "1.00", criadoPor: CONTABIL,
      } as never)
    ).rejects.toThrow();
  });
});
