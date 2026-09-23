import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { exigirTipoAtivo } from "./extraorcamentario.js";
import { listarTiposConsignacao } from "./consultas.js";
import {
  cadastrarTipoDeConsignacao,
  decisaoVigente,
  desativarTipoDeConsignacao,
  redefinirContaDaConsignacao,
} from "./servico-tipos-de-consignacao.js";

/**
 * ═══ O CADASTRO DOS TIPOS DE CONSIGNAÇÃO (V11 V8.3), CONTRA BANCO ═══
 *
 * Este arquivo prova o que fecha `CONSIGNACAO-CONTA-SINTETICA`. A pendência dizia — e continua
 * verdadeiro — que escolher entre as trinta analíticas sob "CONSIGNAÇÕES" é classificação
 * contábil do ente, e que inventá-la seria inventar norma da STN. O que estava errado era que **o
 * ente não tinha onde decidir**: `TipoConsignacao` só nascia por seed e por teste.
 *
 * O que se afirma aqui:
 *   · a conta SINTÉTICA é recusada, e a recusa LISTA as analíticas — quem escolhe precisa ver as
 *     opções, não só ouvir "não" (t2). Foi a falta disso que manteve a pendência aberta;
 *   · a conta fora do PASSIVO é recusada por NATUREZA, não por preferência (t3);
 *   · a decisão é append-only e a VIGENTE manda sobre a coluna antiga (t5, t6);
 *   · um tipo anterior ao cadastro continua funcionando pela coluna — a novidade não apaga o que
 *     já estava semeado (t7);
 *   · desativar impede movimento novo e NÃO apaga saldo (t8).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CONTABIL = "contabil@cg.pb.gov.br";
const SEM_CRACHA = "so.paga@cg.pb.gov.br";

/** Contas do PCASP oficial — a sintética e duas analíticas reais sob ela. */
const SINTETICA = "2.1.8.8.1.01.00";
const ANALITICA_INSS = "2.1.8.8.1.01.01";
const ANALITICA_IRRF = "2.1.8.8.1.01.02";
const DESPESA = "3.3.3.1.1.01.01";

const FUNDAMENTO = "Plano de contas do ente, quadro das consignacoes previdenciarias, item 4.2.";

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
      // ⚠️ A SINTÉTICA COM DUAS FILHAS — é o cenário exato da pendência: o plano oficial tem a
      // conta que o seed mínimo usava, e ela não recebe partida.
      { id: "c-sint", codigo: SINTETICA, nome: "CONSIGNACOES", naturezaSaldo: "CREDORA", nivel: 6, analitica: false },
      { id: "c-inss", codigo: ANALITICA_INSS, nome: "INSS A RECOLHER", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { id: "c-irrf", codigo: ANALITICA_IRRF, nome: "IRRF A RECOLHER", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { id: "c-desp", codigo: DESPESA, nome: "VPD DE DEPRECIACAO", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
    ],
    skipDuplicates: true,
  });
  await usuarioComPerfil(CONTABIL, "CONTABILIDADE", ["GERIR_TIPOS_DE_CONSIGNACAO"]);
  await usuarioComPerfil(SEM_CRACHA, "SO_PAGA", ["PAGAR"]);
}

beforeEach(semear, 120_000);

const cadastrar = (p: { codigo?: string; conta?: string; por?: string; fundamento?: string } = {}) =>
  cadastrarTipoDeConsignacao(prisma, {
    codigo: p.codigo ?? "INSS",
    descricao: "Retencao previdenciaria - INSS",
    contaPassivoCodigo: p.conta ?? ANALITICA_INSS,
    fundamento: p.fundamento ?? FUNDAMENTO,
    criadoPor: p.por ?? CONTABIL,
  });

describe("o ente escolhe a conta — e o sistema confere a escolha", () => {
  it("t1: cadastra o tipo com a analítica, e a decisão nasce junto, na MESMA transação", async () => {
    const { tipoId } = await cadastrar();

    const t = await prisma.tipoConsignacao.findUniqueOrThrow({
      where: { id: tipoId },
      select: { codigo: true, ativo: true, contaPassivo: { select: { codigo: true } } },
    });
    expect(t.codigo).toBe("INSS");
    expect(t.contaPassivo?.codigo).toBe(ANALITICA_INSS);

    // ⚠️ O FATO EXISTE, com o PORQUÊ. É ele que responde "desde quando o INSS ia para esta conta?"
    const d = await decisaoVigente(prisma as never, tipoId);
    expect(d?.ativo).toBe(true);
    expect(d?.contaPassivoCodigo).toBe(ANALITICA_INSS);
    expect(d?.fundamento).toBe(FUNDAMENTO);
    expect(d?.criadoPor).toBe(CONTABIL);
  });

  it("t2: a conta SINTÉTICA é recusada — e a recusa LISTA as analíticas sob ela", async () => {
    // ⚠️ ESTE É O TESTE DA PENDÊNCIA. Recusar sem dizer o que existe embaixo devolve a pessoa ao
    // ponto de partida, e foi assim que a escolha ficou pendente por vários lotes.
    await expect(cadastrar({ conta: SINTETICA })).rejects.toThrow(
      new RegExp(`SINTÉTICA[\\s\\S]*${ANALITICA_INSS} INSS A RECOLHER[\\s\\S]*${ANALITICA_IRRF} IRRF A RECOLHER`)
    );
    expect(await prisma.tipoConsignacao.count()).toBe(0);
  });

  it("t3: conta fora do PASSIVO é recusada por NATUREZA — retenção vira DÍVIDA", async () => {
    await expect(cadastrar({ conta: DESPESA })).rejects.toThrow(/não é do PASSIVO[\s\S]*erro de natureza/);
    expect(await prisma.tipoConsignacao.count()).toBe(0);
  });

  it("t4: conta inexistente, fundamento curto e código repetido são recusados, e nada é gravado", async () => {
    await expect(cadastrar({ conta: "9.9.9.9.9.99.99" })).rejects.toThrow(/não existe no plano/);
    await expect(cadastrar({ fundamento: "porque sim" })).rejects.toThrow();

    await cadastrar();
    await expect(cadastrar()).rejects.toThrow(/Já existe o tipo[\s\S]*partiriam o saldo do consignatário/);
    expect(await prisma.tipoConsignacao.count()).toBe(1);
  });
});

describe("a decisão é append-only, e a vigente manda", () => {
  it("t5: redefinir cria fato NOVO, a anterior PERMANECE, e a leitura passa a usar a nova", async () => {
    const { tipoId } = await cadastrar();
    expect((await exigirTipoAtivo(prisma as never, tipoId)).contaPassivo).toBe(ANALITICA_INSS);

    const r = await redefinirContaDaConsignacao(prisma, {
      tipoId,
      contaPassivoCodigo: ANALITICA_IRRF,
      fundamento: "Orientacao do TCE-PB no oficio 12/2026: a retencao passa a ser classificada aqui.",
      criadoPor: CONTABIL,
    });
    expect(r.anterior).toBe(ANALITICA_INSS);

    // ⚠️ A VIGENTE MANDA SOBRE A COLUNA. A coluna `contaPassivoId` continua com a antiga — e é de
    // propósito: ela é o que os leitores anteriores à V8.3 usam, e reescrevê-la exigiria UPDATE
    // num cadastro que o papel de runtime não pode alterar.
    expect((await exigirTipoAtivo(prisma as never, tipoId)).contaPassivo).toBe(ANALITICA_IRRF);

    // E o HISTÓRICO continua legível: duas decisões, com os dois fundamentos.
    const todas = await prisma.decisaoDoTipoDeConsignacao.findMany({
      where: { tipoId }, orderBy: { criadoEm: "asc" },
      select: { fundamento: true, contaPassivo: { select: { codigo: true } } },
    });
    expect(todas.map((d) => d.contaPassivo?.codigo)).toEqual([ANALITICA_INSS, ANALITICA_IRRF]);
    expect(todas[1]?.fundamento).toContain("TCE-PB");
  });

  it("t6: redecidir a MESMA conta é recusado — não é fato novo", async () => {
    const { tipoId } = await cadastrar();
    await expect(
      redefinirContaDaConsignacao(prisma, {
        tipoId, contaPassivoCodigo: ANALITICA_INSS,
        fundamento: "Mesma conta, sem mudanca nenhuma no plano do ente.", criadoPor: CONTABIL,
      })
    ).rejects.toThrow(/já vai para/);
    expect(await prisma.decisaoDoTipoDeConsignacao.count({ where: { tipoId } })).toBe(1);
  });

  it("t7: tipo ANTERIOR ao cadastro continua valendo pela coluna — a novidade não apaga o semeado", async () => {
    // ⚠️ O CASO DO SEED. Sem esta queda para a coluna antiga, todo tipo já semeado pararia de
    // funcionar no dia em que a V8.3 subisse — e a retenção sumiria de instalações que estavam boas.
    const antigo = await prisma.tipoConsignacao.create({
      data: { codigo: "ISS", descricao: "ISS retido", contaPassivoId: "c-irrf", criadoPor: "SEED" },
      select: { id: true },
    });
    expect(await decisaoVigente(prisma as never, antigo.id)).toBeNull();
    expect((await exigirTipoAtivo(prisma as never, antigo.id)).contaPassivo).toBe(ANALITICA_IRRF);
  });

  it("t8: desativar impede movimento NOVO — e a decisão diz por quê", async () => {
    const { tipoId } = await cadastrar();
    await desativarTipoDeConsignacao(prisma, {
      tipoId, fundamento: "O municipio deixou de reter esta rubrica a partir da competencia 2027-01.",
      criadoPor: CONTABIL,
    });

    await expect(exigirTipoAtivo(prisma as never, tipoId)).rejects.toThrow(/está INATIVO/);
    const d = await decisaoVigente(prisma as never, tipoId);
    expect(d?.ativo).toBe(false);
    expect(d?.contaPassivoCodigo).toBeNull();
    expect(d?.fundamento).toContain("deixou de reter");

    await expect(
      desativarTipoDeConsignacao(prisma, { tipoId, fundamento: "De novo, sem motivo novo nenhum.", criadoPor: CONTABIL })
    ).rejects.toThrow(/já está desativada/);

    // ⚠️ E REATIVAR É REDEFINIR A CONTA: o tipo volta com uma decisão contábil explícita, nunca
    // "voltando ao que era" — o que era pode não valer mais.
    await redefinirContaDaConsignacao(prisma, {
      tipoId, contaPassivoCodigo: ANALITICA_INSS,
      fundamento: "O municipio voltou a reter a rubrica; conta confirmada com a contabilidade.",
      criadoPor: CONTABIL,
    });
    expect((await exigirTipoAtivo(prisma as never, tipoId)).contaPassivo).toBe(ANALITICA_INSS);
  });
});

describe("a autorização", () => {
  it("t9: quem PAGA não reclassifica o passivo do município — e a recusa NOMEIA a ação", async () => {
    // ⚠️ A SEGREGAÇÃO É O MOTIVO DE A AÇÃO SER PRÓPRIA. Juntar isto a `PAGAR` daria a quem executa
    // o poder de mudar onde a dívida do município nasce, no meio de um pagamento.
    await expect(cadastrar({ por: SEM_CRACHA })).rejects.toThrow(/GERIR_TIPOS_DE_CONSIGNACAO/);
    expect(await prisma.tipoConsignacao.count()).toBe(0);

    const { tipoId } = await cadastrar();
    await expect(
      redefinirContaDaConsignacao(prisma, {
        tipoId, contaPassivoCodigo: ANALITICA_IRRF, fundamento: FUNDAMENTO, criadoPor: SEM_CRACHA,
      })
    ).rejects.toThrow(/GERIR_TIPOS_DE_CONSIGNACAO/);
    expect(await prisma.decisaoDoTipoDeConsignacao.count({ where: { tipoId } })).toBe(1);
  });
});

/**
 * ═══ A LISTAGEM QUE O PAGAMENTO CONSULTA ENXERGA A DECISÃO (V11 V8.16) ═══
 *
 * ⚠️ ESTE TESTE NASCE DE UM DEFEITO QUE SÓ O PERCURSO PEGOU. `listarTiposConsignacao` — a função
 * que a TELA DE PAGAMENTO usa para compor a perna do passivo — lia só as colunas antigas. O ente
 * trocava a conta pela tela, a tela de consignações mostrava a nova, e o pagamento compunha na
 * VELHA: "Conta sintética não recebe partida", quatro passos adiante, acusando a tela errada.
 *
 * Duas leituras com critérios diferentes sobre o mesmo dado sempre divergem — e o teste que
 * faltava era justamente o que confronta as duas.
 */
describe("M07 — a decisão do ente alcança a tela de PAGAMENTO", () => {
  it("p1: trocada a conta, a listagem do pagamento devolve a NOVA — não a coluna antiga", async () => {
    const { tipoId } = await cadastrar();
    expect((await listarTiposConsignacao(prisma as never)).find((t) => t.id === tipoId)?.contaPassivoCodigo).toBe(
      ANALITICA_INSS
    );

    await redefinirContaDaConsignacao(prisma, {
      tipoId,
      contaPassivoCodigo: ANALITICA_IRRF,
      fundamento: "Reclassificacao do passivo conforme orientacao do tribunal para o exercicio.",
      criadoPor: CONTABIL,
    });

    const depois = (await listarTiposConsignacao(prisma as never)).find((t) => t.id === tipoId);
    expect(depois?.contaPassivoCodigo).toBe(ANALITICA_IRRF);

    // ⚠️ E A COLUNA ANTIGA CONTINUA COM A PRIMEIRA — é dela que o defeito vinha, e é por isso que
    // a asserção olha as duas: se alguém "consertar" fazendo a decisão reescrever a coluna, o
    // append-only morre e este teste avisa.
    const cru = await prisma.tipoConsignacao.findUniqueOrThrow({
      where: { id: tipoId },
      select: { contaPassivo: { select: { codigo: true } } },
    });
    expect(cru.contaPassivo?.codigo).toBe(ANALITICA_INSS);
  });

  it("p2: desativado pela tela, o tipo some da oferta do pagamento — pela DECISÃO, não pela coluna", async () => {
    const { tipoId } = await cadastrar();
    await desativarTipoDeConsignacao(prisma, {
      tipoId,
      fundamento: "O ente deixou de reter esta consignacao a partir deste exercicio.",
      criadoPor: CONTABIL,
    });
    const t = (await listarTiposConsignacao(prisma as never)).find((x) => x.id === tipoId);
    expect(t?.ativo).toBe(false);
  });
});
