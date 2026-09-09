import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  autenticar,
  definirSenha,
  FALHAS_ATE_O_CADEADO,
  JANELA_DO_CADEADO_MS,
  revogarSessao,
  validarSessao,
  VALIDADE_DA_SESSAO_MS,
} from "./autenticacao.js";
import { autorizar } from "./autorizacao.js";
import {
  comOperacaoRegistrada,
  criarRegistroDeOperacaoPrisma,
} from "./operacao.js";
import { HASH_INEXISTENTE, hashDoToken } from "./credenciais.js";

/**
 * M16 — AUTENTICAÇÃO (TR 4.55) e REGISTRO DE OPERAÇÃO (TR 6.1-6.3).
 *
 * ═══ A LACUNA QUE ESTE BLOCO FECHA ═══
 * O bloco 2 cadastrou identidades; o bloco 3 amarrou permissões a elas. Os dois apoiavam-se numa
 * palavra: o `criadoPor` que o chamador AFIRMAVA. Quem escrevesse `criadoPor: "prefeito@..."`
 * era o prefeito — e todo o edifício da segregação de funções repousava nisso.
 *
 * Aqui a afirmação vira PROVA. E o 6.3 ganha o que o razão, por construção, não pode dar: o
 * LOCAL da operação, e o registro do que foi **NEGADO** (quando a autorização recusa, não há
 * fato — mas houve tentativa, e é ela que o controle interno procura).
 *
 * ⚠️ O RELÓGIO É INJETADO (`agora: Date = new Date()`) — o padrão da casa, o mesmo do M12/M05.
 * Sem ele, testar expiração de sessão exigiria dormir 8 horas, e testar a janela do cadeado,
 * 15 minutos. O tempo é um PARÂMETRO, não uma força da natureza.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ALICE = "alice@cg.pb.gov.br";
const BOB = "bob@cg.pb.gov.br";
const FANTASMA = "fantasma@cg.pb.gov.br";

const SENHA = "orcamento-2026-campina";
const SENHA_ERRADA = "orcamento-2026-campima";

const T0 = new Date("2026-08-10T09:00:00Z");
const mais = (ms: number): Date => new Date(T0.getTime() + ms);

const MINUTO = 60 * 1000;

async function idDe(identificador: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { identificador },
    select: { id: true },
  });
  return u.id;
}

describe("M16 — autenticação e registro de operação (TR 4.55 · 6.1-6.3)", () => {
  beforeEach(async () => {
    // O `limparBanco` já semeia as identidades das fixtures (alice e bob entre elas) — mas
    // SEM credencial nenhuma: um usuário cadastrado que nunca definiu senha não entra.
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — O ROUNDTRIP, e a prova de que o token NÃO está no banco.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: definirSenha + autenticar → sessão; validarSessao devolve a identidade; o token NÃO está no banco", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);

    const sessao = await autenticar(
      prisma,
      { identificador: ALICE, senha: SENHA, ip: "10.0.0.7", agente: "Firefox/128" },
      T0
    );

    expect(sessao.token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes em hex
    expect(sessao.expiraEm).toEqual(new Date(T0.getTime() + VALIDADE_DA_SESSAO_MS));

    // ── É ELA que a borda chama para preencher o `criadoPor` do serviço ──
    const identidade = await validarSessao(prisma, sessao.token, mais(MINUTO));
    expect(identidade.identificador).toBe(ALICE);
    expect(identidade.usuarioId).toBe(aliceId);

    // ═══ ⚠️ O TOKEN EM CLARO NÃO EXISTE NO BANCO — E A PROVA É EM DOIS TEMPOS ═══
    //
    // (1) o que ESTÁ gravado é o SHA-256 dele (a busca por hash acha; a busca pelo token, não).
    const porHash = await prisma.sessaoAberta.findUnique({
      where: { tokenHash: hashDoToken(sessao.token) },
      select: { id: true, ip: true, agente: true },
    });
    expect(porHash).not.toBeNull();
    expect(porHash!.id).toBe(sessao.sessaoId);
    expect(porHash!.ip).toBe("10.0.0.7"); // TR 6.3 — o LOCAL
    expect(porHash!.agente).toBe("Firefox/128");

    // (2) o GREP do token em claro sobre o DUMP da tabela inteira: zero ocorrências.
    //     É a prova que um vazamento de backup teria de derrubar — e não derruba.
    const dump = JSON.stringify(await prisma.sessaoAberta.findMany());
    expect(dump).not.toContain(sessao.token);
    expect(dump).toContain(hashDoToken(sessao.token));

    // ...e a SENHA também não está em lugar nenhum: o que se guarda é o hash autodescritivo.
    const credenciais = JSON.stringify(await prisma.credencialDeUsuario.findMany());
    expect(credenciais).not.toContain(SENHA);
    expect(credenciais).toMatch(/scrypt\$32768\$8\$1\$/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — O CADEADO, DERIVADO das tentativas. Sem flag, sem contador.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: 5 falhas em 15min fecham o cadeado — a 6ª COM A SENHA CERTA é rejeitada; vencida a janela, volta a aceitar", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);

    // ── as 5 falhas, dentro da janela ──
    for (let i = 0; i < FALHAS_ATE_O_CADEADO; i++) {
      await expect(
        autenticar(prisma, { identificador: ALICE, senha: SENHA_ERRADA }, mais(i * MINUTO))
      ).rejects.toThrow(/CREDENCIAIS INVÁLIDAS/);
    }
    expect(
      await prisma.tentativaDeLogin.count({ where: { identificador: ALICE, sucesso: false } })
    ).toBe(5);

    // ── ⚠️ A 6ª, COM A SENHA **CERTA**, É REJEITADA. É o cadeado, e ele nomeia a janela. ──
    // Este é o ponto do teste: não é a senha que está errada — é a PORTA que está fechada.
    await expect(
      autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(6 * MINUTO))
    ).rejects.toThrow(/ACESSO BLOQUEADO/);
    await expect(
      autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(7 * MINUTO))
    ).rejects.toThrow(/nos últimos 15 minutos/);

    // ...e NENHUMA sessão nasceu.
    expect(await prisma.sessaoAberta.count()).toBe(0);

    // ── ⚠️ A JANELA VENCE — e o cadeado abre SOZINHO, porque ele é DERIVADO. ──
    //
    // Não há job de limpeza, não há flag a virar: passadas 15 min sem tentativa, a CONSULTA
    // simplesmente não acha mais falhas na janela. (E repare: o corte é da ÚLTIMA tentativa —
    // as bloqueadas também contam, então quem fica martelando mantém o próprio cadeado fechado.)
    const depois = mais(7 * MINUTO + JANELA_DO_CADEADO_MS + MINUTO);
    const sessao = await autenticar(prisma, { identificador: ALICE, senha: SENHA }, depois);
    expect(sessao.token).toBeDefined();

    // ⚠️ E AS FALHAS **FICAM NO LOG** — o cadeado abriu, a história não sumiu. É isso que um
    // contador zerado teria apagado, e é isso que o controle interno vai querer ler.
    expect(await prisma.tentativaDeLogin.count({ where: { sucesso: false } })).toBe(7);
    expect(await prisma.tentativaDeLogin.count({ where: { sucesso: true } })).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — A VALIDADE É DERIVADA: expiração, revogação, troca de senha.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: sessão expirada é inválida; revogada é inválida COM MOTIVO; trocar a senha derruba TODAS", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);

    // ── (a) EXPIRAÇÃO — nenhum UPDATE aconteceu; é a data que decide ──
    const s1 = await autenticar(prisma, { identificador: ALICE, senha: SENHA }, T0);
    await expect(validarSessao(prisma, s1.token, mais(VALIDADE_DA_SESSAO_MS - MINUTO)))
      .resolves.toMatchObject({ identificador: ALICE });

    await expect(
      validarSessao(prisma, s1.token, mais(VALIDADE_DA_SESSAO_MS + MINUTO))
    ).rejects.toThrow(/SESSÃO EXPIRADA/);

    // A linha continua lá, intacta — expirar não é apagar.
    expect(await prisma.sessaoAberta.count()).toBe(1);

    // ── (b) REVOGAÇÃO — um FATO, e a mensagem diz QUANDO e POR QUÊ ──
    const s2 = await autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(MINUTO));
    await revogarSessao(prisma, {
      token: s2.token,
      motivo: "logout do usuário",
      criadoPor: ALICE,
    });
    await expect(validarSessao(prisma, s2.token, mais(2 * MINUTO))).rejects.toThrow(
      /SESSÃO REVOGADA.*logout do usuário/s
    );

    // ── (c) ⚠️ A TROCA DE SENHA DERRUBA TUDO — o ladrão não fica logado ──
    //
    // É a razão de ser da troca de senha no dia mau: se a senha vazou, quem a roubou já está
    // DENTRO, com sessão viva. Trocar a senha e deixar as sessões de pé seria trancar a porta
    // com o ladrão na sala.
    const s3 = await autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(3 * MINUTO));
    const s4 = await autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(4 * MINUTO));
    await expect(validarSessao(prisma, s3.token, mais(5 * MINUTO))).resolves.toBeDefined();

    const troca = await definirSenha(
      prisma,
      { usuarioId: aliceId, senha: "senha-nova-do-tesouro", criadoPor: ALICE },
      mais(6 * MINUTO)
    );

    // ⚠️ TRÊS, não duas — e a conta merece ser lida devagar, porque ela prova que a revogação
    // olha o RELÓGIO DO ATO, e não o relógio de quem testou:
    //   · s1 CONTINUA VIVA no instante da troca (T0+6min). Ela só expira em T0+8h — o que se
    //     fez lá em cima foi VALIDÁ-LA com um relógio futuro, o que não a mata; a validade é
    //     derivada, e derivar não é mutar. Logo, ela é revogada aqui.
    //   · s2 já estava revogada (não se revoga duas vezes — a unicidade é do banco).
    //   · s3 e s4 estão vivas.
    expect(troca.sessoesRevogadas).toBe(3);

    for (const s of [s3, s4]) {
      await expect(validarSessao(prisma, s.token, mais(7 * MINUTO))).rejects.toThrow(
        /SESSÃO REVOGADA.*troca de senha/s
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — USUÁRIO INEXISTENTE: a MESMA resposta, e a tentativa REGISTRADA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: usuário inexistente devolve a MESMA mensagem que senha errada — e a tentativa fica no log com o identificador digitado", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);

    const erroSenhaErrada = await autenticar(
      prisma,
      { identificador: ALICE, senha: SENHA_ERRADA },
      T0
    ).catch((e: Error) => e.message);

    const erroFantasma = await autenticar(
      prisma,
      { identificador: FANTASMA, senha: SENHA },
      mais(MINUTO)
    ).catch((e: Error) => e.message);

    // ⚠️ IDÊNTICAS, BYTE A BYTE. Uma mensagem que distinguisse os dois casos entregaria ao
    // atacante a lista de quem TEM conta no município — e ele concentraria a força bruta neles.
    expect(erroFantasma).toBe(erroSenhaErrada);
    expect(erroFantasma).toMatch(/CREDENCIAIS INVÁLIDAS/);

    // ⚠️ E A TENTATIVA DO FANTASMA **ESTÁ NO LOG**, com o identificador DIGITADO.
    //
    // É o que permite VER alguém varrendo nomes de usuário. Um `WHERE usuarioId = ...` nunca
    // conseguiria registrar isso — não há usuarioId. Daí o campo ser texto, e não FK.
    const doFantasma = await prisma.tentativaDeLogin.findMany({
      where: { identificador: FANTASMA },
      select: { sucesso: true, identificador: true },
    });
    expect(doFantasma).toHaveLength(1);
    expect(doFantasma[0]!.sucesso).toBe(false);
    expect(doFantasma[0]!.identificador).toBe(FANTASMA);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — A CREDENCIAL É EVENTO: a nova substitui, e a história FICA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: credencial nova substitui a antiga (a velha não autentica mais) — e as DUAS ficam no histórico", async () => {
    const aliceId = await idDe(ALICE);
    const SENHA_NOVA = "a-nova-senha-da-alice";

    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);
    await definirSenha(
      prisma,
      { usuarioId: aliceId, senha: SENHA_NOVA, criadoPor: ALICE },
      mais(MINUTO)
    );

    // ── a VELHA não entra mais (a vigente é a ÚLTIMA) ──
    await expect(
      autenticar(prisma, { identificador: ALICE, senha: SENHA }, mais(2 * MINUTO))
    ).rejects.toThrow(/CREDENCIAIS INVÁLIDAS/);

    // ── a NOVA entra ──
    await expect(
      autenticar(prisma, { identificador: ALICE, senha: SENHA_NOVA }, mais(3 * MINUTO))
    ).resolves.toBeDefined();

    // ⚠️ E AS DUAS ESTÃO NO BANCO — o UPDATE teria APAGADO a evidência do ato anterior.
    //
    // A pergunta do controle interno não é "qual é a senha dele?" (ninguém pode responder) — é
    // "QUEM trocou a senha do tesoureiro na véspera do pagamento, e QUANDO?". Só o append-only
    // responde, e a resposta está aqui: dois eventos, dois autores.
    const historico = await prisma.credencialDeUsuario.findMany({
      where: { usuarioId: aliceId },
      orderBy: { criadoEm: "asc" },
      select: { criadoPor: true, hashString: true },
    });
    expect(historico).toHaveLength(2);
    expect(historico.map((c) => c.criadoPor)).toEqual(["ADMIN", ALICE]);
    // hashes DIFERENTES — e não só porque as senhas são: o salt é novo a cada evento.
    expect(historico[0]!.hashString).not.toBe(historico[1]!.hashString);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — O REGISTRO DE OPERAÇÃO: e ele grava o que o RAZÃO NÃO PODE gravar.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: a porta registra ip/agente/resultado — e o NEGADO da autorização (bloco 3) entra pela MESMA porta", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);
    const porta = criarRegistroDeOperacaoPrisma(prisma);

    // ── (a) o LOGIN, registrado pela borda (é ela quem conhece o IP) ──
    const sessao = await comOperacaoRegistrada(
      porta,
      { usuarioIdent: ALICE, acao: "LOGIN", ip: "10.0.0.7", agente: "Firefox/128" },
      () => autenticar(prisma, { identificador: ALICE, senha: SENHA, ip: "10.0.0.7" }, T0),
      T0
    );
    expect(sessao.token).toBeDefined();

    // ── (b) ⚠️ O **NEGADO** DA AUTORIZAÇÃO — o evento que o razão NUNCA poderia registrar ══
    //
    // A alice existe, está ativa, e NÃO tem perfil nenhum (o `limparBanco` semeia as
    // identidades; este teste não lhe deu crachá). O `autorizar` do bloco 3 recusa — e, por
    // recusar, NÃO GRAVA NADA. "Nada foi gravado" é a promessa, e ela é cumprida.
    //
    // Mas a TENTATIVA existiu. Sem esta porta, o sistema protegeria e não contaria a ninguém que
    // protegeu — e a pergunta do controle interno ("quem tentou pagar fora da sua unidade, às
    // 17h de sexta?") não teria onde ser respondida.
    await prisma.vinculoUsuarioPerfil.deleteMany({ where: { usuarioId: aliceId } });

    await expect(
      comOperacaoRegistrada(
        porta,
        { usuarioIdent: ALICE, acao: "PAGAR", ip: "10.0.0.7", agente: "Firefox/128" },
        () => autorizar(prisma, ALICE, "PAGAR"),
        mais(MINUTO)
      )
    ).rejects.toThrow(/ACESSO NEGADO/); // ⚠️ o envelope RE-LANÇA: ele registra, não engole

    const registros = await prisma.registroDeOperacao.findMany({
      orderBy: { criadoEm: "asc" },
    });
    expect(registros).toHaveLength(2);

    // O LOGIN: sucesso, com o LOCAL (6.3).
    expect(registros[0]).toMatchObject({
      usuarioIdent: ALICE,
      acao: "LOGIN",
      resultado: "SUCESSO",
      ip: "10.0.0.7",
      agente: "Firefox/128",
    });

    // ⚠️ A NEGAÇÃO: quem · quando · DE ONDE · o quê · e POR QUÊ.
    expect(registros[1]).toMatchObject({
      usuarioIdent: ALICE,
      acao: "PAGAR",
      resultado: "NEGADO",
      ip: "10.0.0.7",
    });
    expect(registros[1]!.detalhe).toMatch(/ACESSO NEGADO — SEM PERFIL/);

    // ...e NADA foi gravado pelo ato negado — o log sobrevive ao rollback do fato (é por isso
    // que ele é escrito FORA da transação do ato).
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — TIMING: o caminho "não existe" TRABALHA o mesmo tanto.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: autenticar um usuário INEXISTENTE roda o scrypt (senão o relógio entregaria quem tem conta)", async () => {
    const aliceId = await idDe(ALICE);
    await definirSenha(prisma, { usuarioId: aliceId, senha: SENHA, criadoPor: "ADMIN" }, T0);

    /**
     * ⚠️ A TÉCNICA, DECLARADA: a prova é ESTRUTURAL + uma medição de ORDEM DE GRANDEZA.
     *
     * Uma asserção de tempo fina (`|t1 - t2| < 5ms`) seria FLAKY numa máquina compartilhada — e
     * um teste que pisca é um teste que alguém desliga. O que se afirma aqui é o que importa e é
     * estável: os dois caminhos rodam o scrypt, logo os dois pagam ~91 ms, logo o relógio NÃO
     * DISTINGUE um usuário que existe de um que não existe.
     *
     * O ataque que isto fecha: sem o `HASH_INEXISTENTE`, o caminho "não existe" retornaria em
     * ~1 ms (não achou, saiu) e o "senha errada" em ~91 ms. O atacante varre a lista de e-mails
     * do município e, só pelo relógio, separa quem tem conta — sem precisar de mensagem nenhuma.
     */
    const cronometrar = async (fn: () => Promise<unknown>): Promise<number> => {
      const ini = process.hrtime.bigint();
      await fn().catch(() => undefined);
      return Number(process.hrtime.bigint() - ini) / 1e6;
    };

    const tSenhaErrada = await cronometrar(() =>
      autenticar(prisma, { identificador: ALICE, senha: SENHA_ERRADA }, T0)
    );
    const tInexistente = await cronometrar(() =>
      autenticar(prisma, { identificador: FANTASMA, senha: SENHA }, mais(MINUTO))
    );

    // (1) ESTRUTURAL: o hash falso existe, tem os MESMOS parâmetros do real, e é ele que o
    //     caminho "não existe" usa. Um scrypt com N=2^15 não sai por menos de dezenas de ms.
    expect(HASH_INEXISTENTE).toMatch(/^scrypt\$32768\$8\$1\$/);

    // (2) ORDEM DE GRANDEZA: o caminho do fantasma paga o custo do scrypt — ele NÃO é o retorno
    //     imediato de um `findUnique` que não achou nada (que sairia em milissegundos).
    expect(tInexistente).toBeGreaterThan(30);

    // (3) E OS DOIS ESTÃO NA MESMA ORDEM — nenhum é uma fração do outro. Margem generosa de
    //     propósito: o que se prova é a ausência do canal de tempo, não uma igualdade ao ms.
    const razao = tInexistente / tSenhaErrada;
    expect(razao).toBeGreaterThan(0.4);
    expect(razao).toBeLessThan(2.5);
  });

  it("t7b: o usuário INATIVO não autentica — revogar o acesso do demitido devolve-lhe a chave, se não", async () => {
    const bobId = await idDe(BOB);
    await definirSenha(prisma, { usuarioId: bobId, senha: SENHA, criadoPor: "ADMIN" }, T0);
    await expect(
      autenticar(prisma, { identificador: BOB, senha: SENHA }, T0)
    ).resolves.toBeDefined();

    await prisma.usuario.update({ where: { id: bobId }, data: { ativo: false } });

    await expect(
      autenticar(prisma, { identificador: BOB, senha: SENHA }, mais(MINUTO))
    ).rejects.toThrow(/CREDENCIAIS INVÁLIDAS/);
  });
});
