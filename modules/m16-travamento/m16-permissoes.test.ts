import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_CONTROLE, PERFIL_EXECUCAO } from "../../test/usuarios-teste.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { autorizar, exigirUsuarioAtivo } from "./autorizacao.js";
import { destravar, travar } from "./servico.js";

/**
 * M16 — USUÁRIOS, PERFIS E PERMISSÕES. TR 4.55/4.56 · segregação 6.4/6.5.
 *
 * ═══ OS ATORES ═══
 *   EXECUTORA  perfil EXECUCAO  — empenha, liquida, paga. NÃO trava nem destrava.
 *   FISCAL     perfil CONTROLE  — trava, destrava, apura, encerra. NÃO empenha.
 *   ORFAO      SEM perfil       — existe, e não pode NADA.
 *   REVOGADO   perfil EXECUCAO, mas INATIVO.
 *   FANTASMA   não existe no cadastro.
 *
 * ⚠️ É a segregação do 6.4, e ela tem uma razão: **quem empenha não pode fechar o mês em
 * que empenhou.** Se pudesse, o executor cometeria o erro, fecharia a competência e o
 * controle interno encontraria o período trancado com o erro dentro.
 *
 * ═══ AS QUATRO PORTAS (t2), e cada uma com a SUA mensagem ═══
 *   FANTASMA  -> "USUÁRIO NÃO CADASTRADO"   (a identidade é falsa)
 *   REVOGADO  -> "USUÁRIO INATIVO"          (existia, e foi revogada)
 *   ORFAO     -> "ACESSO NEGADO — SEM PERFIL" (existe, sem crachá nenhum)
 *   EXECUTORA -> "ACESSO NEGADO: ... TRAVAR_COMPETENCIA" (tem crachá, não este poder)
 *
 * "Acesso negado" seco não responde ao TCE quando ele pergunta POR QUE alguém não conseguiu.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const EXECUTORA = "executora@cg.pb.gov.br";
const FISCAL = "fiscal@cg.pb.gov.br";
const ORFAO = "orfao@cg.pb.gov.br";
const REVOGADO = "revogado@cg.pb.gov.br";
const FANTASMA = "fantasma@cg.pb.gov.br";

const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";

async function vincular(identificador: string, perfil: string): Promise<void> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { identificador },
    select: { id: true },
  });
  const p = await prisma.perfil.findUniqueOrThrow({
    where: { nome: perfil },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" },
  });
}

async function semear(): Promise<void> {
  await limparBanco(prisma); // já semeia perfis + as identidades das fixtures

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });

  await prisma.usuario.createMany({
    data: [
      { identificador: EXECUTORA, nome: "Executora", criadoPor: "TESTE" },
      { identificador: FISCAL, nome: "Fiscal", criadoPor: "TESTE" },
      { identificador: ORFAO, nome: "Órfão", criadoPor: "TESTE" },
      { identificador: REVOGADO, nome: "Revogado", ativo: false, criadoPor: "TESTE" },
    ],
  });
  await vincular(EXECUTORA, PERFIL_EXECUCAO);
  await vincular(FISCAL, PERFIL_CONTROLE);
  await vincular(REVOGADO, PERFIL_EXECUCAO);
  // ORFAO fica SEM perfil — de propósito.
}

/** Um lançamento mínimo pelo funil, com um autor. */
const lancarPor = (criadoPor: string, dia = "2026-05-10T12:00:00Z") =>
  prisma.$transaction((tx) =>
    lancarNoRazao(tx, {
      numeroControle: `TESTE-${criadoPor}-${dia}`,
      dataTransacao: new Date(dia),
      historico: "lançamento de teste",
      origemTipo: "TESTE",
      criadoPor,
      partidas: [
        { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
        { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
      ],
    })
  );

describe("M16 — usuários, perfis e permissões (TR 4.55/4.56)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 / t6 — O PILOTO: travar exige permissão, e a segregação 6.4 é REAL.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1/t6: o FISCAL trava; a EXECUTORA NÃO — e nada é gravado quando é negado", async () => {
    // ⚠️ A EXECUTORA EMPENHA, mas NÃO FECHA O MÊS EM QUE EMPENHOU. É o 6.4, e é o ponto.
    await expect(
      travar(prisma, { competencia: "2026-05", criadoPor: EXECUTORA })
    ).rejects.toThrow(/ACESSO NEGADO: o usuário "executora@cg\.pb\.gov\.br"/);
    await expect(
      travar(prisma, { competencia: "2026-05", criadoPor: EXECUTORA })
    ).rejects.toThrow(/não tem permissão para TRAVAR_COMPETENCIA/);
    // ...e a mensagem diz QUAL crachá ele tem, para que se saiba o que pedir.
    await expect(
      travar(prisma, { competencia: "2026-05", criadoPor: EXECUTORA })
    ).rejects.toThrow(/perfis do usuário: EXECUCAO/);

    // ⚠️ ZERO ESCRITA — a trava negada não deixa evento nenhum.
    expect(await prisma.movimentoTravamento.count()).toBe(0);
    // ...e a competência SEGUE ABERTA (a negação não travou por acidente).
    await expect(lancarPor(EXECUTORA)).resolves.toBeDefined();

    // ═══ O FISCAL TRAVA ═══
    const t = await travar(prisma, { competencia: "2026-05", criadoPor: FISCAL });
    expect(t.escopo).toBe("GLOBAL");
    expect(await prisma.movimentoTravamento.count()).toBe(1);

    // E o travamento do bloco 1 continua funcionando POR BAIXO — a EXECUTORA é barrada.
    await expect(lancarPor(EXECUTORA, "2026-05-20T12:00:00Z")).rejects.toThrow(
      /COMPETÊNCIA TRAVADA/
    );

    // ⚠️ E O DESTRAVAR — o ato que o controle interno mais vai querer explicado — também
    // é do CONTROLE, e também exige motivo.
    await expect(
      destravar(prisma, {
        competencia: "2026-05",
        motivo: "reabertura para corrigir a classificacao de maio",
        criadoPor: EXECUTORA,
      })
    ).rejects.toThrow(/não tem permissão para DESTRAVAR_COMPETENCIA/);

    await expect(
      destravar(prisma, {
        competencia: "2026-05",
        motivo: "reabertura para corrigir a classificacao de maio",
        criadoPor: FISCAL,
      })
    ).resolves.toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — NEGAR POR PADRÃO: as quatro portas, com quatro mensagens.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: fantasma, inativo, sem perfil e sem a permissão — QUATRO mensagens distintas", async () => {
    // (1) a identidade é FALSA
    await expect(
      autorizar(prisma, FANTASMA, "TRAVAR_COMPETENCIA")
    ).rejects.toThrow(/USUÁRIO NÃO CADASTRADO: "fantasma@cg\.pb\.gov\.br"/);

    // (2) a identidade existia e foi REVOGADA — e os fatos dele CONTINUAM válidos
    await expect(
      autorizar(prisma, REVOGADO, "EMPENHAR")
    ).rejects.toThrow(/USUÁRIO INATIVO: "revogado@cg\.pb\.gov\.br"/);
    await expect(
      autorizar(prisma, REVOGADO, "EMPENHAR")
    ).rejects.toThrow(/Os fatos que ele já criou continuam válidos/);

    // (3) existe, ativo, e SEM CRACHÁ NENHUM. Ele não pode NADA — e isso é o padrão.
    await expect(
      autorizar(prisma, ORFAO, "EMPENHAR")
    ).rejects.toThrow(/ACESSO NEGADO — SEM PERFIL/);
    await expect(
      autorizar(prisma, ORFAO, "EMPENHAR")
    ).rejects.toThrow(/nega-se por omissão, nunca se autoriza por esquecimento/);

    // (4) tem crachá, mas não ESTE poder
    await expect(
      autorizar(prisma, EXECUTORA, "TRAVAR_COMPETENCIA")
    ).rejects.toThrow(/ACESSO NEGADO: .* não tem permissão para TRAVAR_COMPETENCIA/);

    // ...e o caminho FELIZ devolve por qual perfil ele passou (auditoria).
    const ok = await autorizar(prisma, EXECUTORA, "EMPENHAR");
    expect(ok.perfil).toBe(PERFIL_EXECUCAO);
    expect(ok.unidadeOrcId).toBeNull(); // permissão GLOBAL
  });

  it("t2b: a segregação é MÚTUA — o FISCAL não empenha", async () => {
    // ⚠️ O CONTRAPESO SÓ É CONTRAPESO SE PESAR DOS DOIS LADOS. Um "controle" que também
    // executa é só um usuário com mais poder — e a segregação do 6.4 vira decoração.
    await expect(autorizar(prisma, FISCAL, "EMPENHAR")).rejects.toThrow(
      /não tem permissão para EMPENHAR/
    );
    await expect(autorizar(prisma, FISCAL, "PAGAR")).rejects.toThrow(
      /não tem permissão para PAGAR/
    );
    // ...mas ele TRAVA.
    await expect(
      autorizar(prisma, FISCAL, "TRAVAR_COMPETENCIA")
    ).resolves.toMatchObject({ perfil: PERFIL_CONTROLE });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — O FUNIL confere a IDENTIDADE (não a autorização).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: lançamento com autor NÃO CADASTRADO rejeita (zero escrita); INATIVO rejeita; ATIVO passa", async () => {
    const antes = await prisma.lancamentoContabil.count();

    // ⚠️ A CURA DA PENDÊNCIA DE a4f2bd6: o `criadoPor` era string livre — um nome que
    // ninguém podia cobrar.
    await expect(lancarPor(FANTASMA)).rejects.toThrow(
      /USUÁRIO NÃO CADASTRADO: "fantasma@cg\.pb\.gov\.br"/
    );
    await expect(lancarPor(REVOGADO)).rejects.toThrow(/USUÁRIO INATIVO/);

    // ⚠️ ZERO ESCRITA — nem lançamento, nem partidas.
    expect(await prisma.lancamentoContabil.count()).toBe(antes);
    expect(await prisma.partidaContabil.count()).toBe(0);

    // ⚠️ E O ÓRFÃO **PASSA** NO FUNIL — porque o funil confere IDENTIDADE, não PODER.
    // Ele existe e está ativo. Quem barraria o ato dele é o `autorizar` do SERVIÇO — e é
    // por isso que os dois são separados: o funil não sabe que ação um lançamento
    // representa (um `LancamentoContabil` de empenho chega lá idêntico ao de um pagamento).
    await expect(lancarPor(ORFAO)).resolves.toBeDefined();
    expect(await prisma.lancamentoContabil.count()).toBe(antes + 1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — usuarioAlvo FANTASMA: a pendência de a4f2bd6, curada.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: travar com usuarioAlvo INEXISTENTE rejeita nomeando — antes, travava NINGUÉM em silêncio", async () => {
    // ⚠️ ERA ESTE O FURO: `usuarioAlvo` era uma string livre comparada com outra string
    // livre. Um typo — "alicce@" — gravava o evento, a tela dizia "maio travado para a
    // alice", e a alice CONTINUAVA LANÇANDO. O sistema mentia, e ninguém percebia.
    await expect(
      travar(prisma, {
        competencia: "2026-05",
        usuarioAlvo: FANTASMA,
        criadoPor: FISCAL,
      })
    ).rejects.toThrow(/USUÁRIO NÃO CADASTRADO: "fantasma@cg\.pb\.gov\.br"/);
    await expect(
      travar(prisma, {
        competencia: "2026-05",
        usuarioAlvo: FANTASMA,
        criadoPor: FISCAL,
      })
    ).rejects.toThrow(/alvo do TRAVAR de competência/);

    // ⚠️ E NADA FOI GRAVADO — a trava mentirosa não existe.
    expect(await prisma.movimentoTravamento.count()).toBe(0);

    // Com um alvo REAL, a trava por usuário funciona (e é a do bloco 1).
    await travar(prisma, {
      competencia: "2026-05",
      usuarioAlvo: EXECUTORA,
      criadoPor: FISCAL,
    });
    await expect(lancarPor(EXECUTORA, "2026-05-15T12:00:00Z")).rejects.toThrow(
      /COMPETÊNCIA TRAVADA/
    );
    // ...e o ÓRFÃO, que não é o alvo, segue lançando.
    await expect(lancarPor(ORFAO, "2026-05-15T12:00:00Z")).resolves.toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1b — A SEGREGAÇÃO POR UNIDADE GESTORA (6.5).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1b: permissão de UMA UG cobre só ela — e NÃO cobre o ato que não tem UG", async () => {
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    const saude = await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-saude", codigo: "01004", descricao: "Saúde", orgaoId: "org-01" },
      select: { id: true },
    });
    const educacao = await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-educ", codigo: "01003", descricao: "Educação", orgaoId: "org-01" },
      select: { id: true },
    });

    // Um perfil que PAGA, mas SÓ na Saúde.
    const perfil = await prisma.perfil.create({
      data: {
        nome: "TESOURARIA_SAUDE",
        descricao: "Paga — só na unidade da Saúde (TR 6.5).",
        criadoPor: "TESTE",
        permissoes: {
          create: [{ acao: "PAGAR", unidadeOrcId: saude.id, criadoPor: "TESTE" }],
        },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({
      data: { identificador: "tes.saude@cg.pb.gov.br", nome: "Tesouraria Saúde", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" },
    });

    const IDENT = "tes.saude@cg.pb.gov.br";

    // ── PAGA na Saúde ──
    await expect(
      autorizar(prisma, IDENT, "PAGAR", saude.id)
    ).resolves.toMatchObject({ perfil: "TESOURARIA_SAUDE", unidadeOrcId: saude.id });

    // ── NÃO paga na Educação ──
    await expect(autorizar(prisma, IDENT, "PAGAR", educacao.id)).rejects.toThrow(
      /não tem permissão para PAGAR na unidade gestora uo-educ/
    );

    // ⚠️ E NÃO AUTORIZA O ATO **SEM UG**. "Poder pagar na Saúde" não é "poder fechar a
    // competência do ente inteiro" — travar não pertence a unidade nenhuma, e só uma
    // permissão GLOBAL o autoriza. Dar poder de "travar a competência da Saúde" seria
    // inventar um recorte que o TR 4.52 não tem.
    await expect(autorizar(prisma, IDENT, "TRAVAR_COMPETENCIA")).rejects.toThrow(
      /no escopo do ENTE .*só uma permissão GLOBAL o autoriza/s
    );

    // ...e o FISCAL, que tem permissão GLOBAL, paga em QUALQUER unidade — a global cobre
    // qualquer UG. (Ele não tem PAGAR; use a EXECUTORA, que tem, e é global.)
    await expect(
      autorizar(prisma, EXECUTORA, "PAGAR", educacao.id)
    ).resolves.toMatchObject({ unidadeOrcId: null });
  });

  it("t2c: `exigirUsuarioAtivo` é a IDENTIDADE, e ela não olha perfil nenhum", async () => {
    // O órfão não pode NADA — mas ele EXISTE. É essa a pergunta que o funil faz.
    await expect(exigirUsuarioAtivo(prisma, ORFAO, "teste")).resolves.toMatchObject({
      identificador: ORFAO,
    });
    await expect(exigirUsuarioAtivo(prisma, REVOGADO, "teste")).rejects.toThrow(/INATIVO/);
    await expect(exigirUsuarioAtivo(prisma, FANTASMA, "teste")).rejects.toThrow(
      /NÃO CADASTRADO/
    );
  });
});
