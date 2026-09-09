import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { exigirUsuarioAtivo, type Tx } from "./autorizacao.js";
import {
  conferirSenha,
  exigirSenhaAceitavel,
  gerarHashDeSenha,
  gerarToken,
  hashDoToken,
  HASH_INEXISTENTE,
} from "./credenciais.js";

/**
 * M16 — AUTENTICAÇÃO. TR 4.55 · 6.1-6.3.
 *
 * ═══ ONDE ISTO SE ENCAIXA — E A LACUNA QUE ELE FECHA ═══
 * O bloco 2 cadastrou IDENTIDADES; o bloco 3 amarrou PERMISSÕES a elas. Os dois assumiam uma
 * coisa que ninguém tinha provado: que o `criadoPor` que chega no serviço é **mesmo** de quem
 * ele diz ser. Era uma identidade AFIRMADA — cadastrada, mas afirmada. Quem escrevesse
 * `criadoPor: "prefeito@cg.pb.gov.br"` era o prefeito, e todo o edifício de permissões do bloco
 * 3 (perfis, unidades, segregação) apoiava-se nessa palavra.
 *
 * A autenticação é o que troca uma AFIRMAÇÃO por uma PROVA: quem tem o token, provou a senha.
 *
 * ═══ ⚠️ A FRONTEIRA, E ELA É O DESENHO INTEIRO ═══
 * A autenticação é da **BORDA**, e o domínio NÃO a conhece. Os 76 serviços continuam recebendo
 * `criadoPor: string` — exatamente como hoje, sem uma linha mudada. Quem faz a troca é a borda:
 *
 *     token  ──► validarSessao(token)  ──► identificador  ──► criadoPor do serviço
 *
 * Enfiar o token na assinatura dos 76 serviços contaminaria o núcleo com um detalhe de
 * TRANSPORTE (hoje HTTP; amanhã, sabe-se lá) e obrigaria cada teste de negócio a fabricar uma
 * sessão para empenhar 1.000 reais. O domínio fala de identidade; a borda fala de credencial.
 *
 * ⚠️ APERTO FUTURO, NOMEADO: `sessaoId` no `LancamentoContabil` amarraria cada fato do razão à
 * sessão que o gerou (e, por ela, ao IP). É ADITIVO e tem UM ponto de entrada — o funil
 * (`lancarNoRazao`), que já é o gargalo por onde tudo passa. Não nasce aqui porque exige coluna
 * + migração + decidir o que fazer com os fatos que a borda não gerou (seeds, backfills, jobs).
 * PENDÊNCIA NOMEADA (6.3-sessao-no-razao).
 */

// ═══════════════════════════════════════════════════════════════════════════
// AS CONSTANTES DO CADEADO — nomeadas, não espalhadas em números mágicos.
// ═══════════════════════════════════════════════════════════════════════════

/** Falhas que fecham o cadeado. */
export const FALHAS_ATE_O_CADEADO = 5;

/** A janela em que elas contam. 15 minutos. */
export const JANELA_DO_CADEADO_MS = 15 * 60 * 1000;

/** Quanto vale uma sessão. 8 horas — um turno de trabalho. */
export const VALIDADE_DA_SESSAO_MS = 8 * 60 * 60 * 1000;

export interface Identidade {
  readonly usuarioId: string;
  readonly identificador: string;
}

export interface SessaoCriada {
  readonly sessaoId: string;
  /**
   * ⚠️ O TOKEN EM CLARO — E ELE APARECE **UMA ÚNICA VEZ**, AQUI.
   *
   * Não é recuperável depois: o banco guarda só o SHA-256 dele. Quem perder o token perde a
   * sessão e faz outra — que é exatamente o comportamento desejado, e o que garante que um dump
   * do banco não entrega sessão nenhuma.
   */
  readonly token: string;
  readonly expiraEm: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// definirSenha
// ═══════════════════════════════════════════════════════════════════════════

const zDefinirSenhaInput = z.object({
  usuarioId: z.string().min(1),
  senha: z.string(),
  criadoPor: z.string().min(1),
});
export type DefinirSenhaInput = z.input<typeof zDefinirSenhaInput>;

/**
 * DEFINE (ou TROCA) a senha. Grava um EVENTO — a vigente passa a ser esta.
 *
 * ⚠️ E DERRUBA TODAS AS SESSÕES DO USUÁRIO, NA MESMA TRANSAÇÃO.
 *
 * É a razão de ser da troca de senha no dia mau: se a senha vazou, quem a roubou provavelmente
 * JÁ ESTÁ dentro, com uma sessão viva. Trocar a senha e deixar as sessões de pé seria trancar a
 * porta com o ladrão na sala — ele continuaria trabalhando com o token que já tem, e a troca de
 * senha daria à vítima a sensação de ter resolvido.
 *
 * ⚠️ PENDÊNCIA NOMEADA (4.55-reset-de-senha): **quem** pode definir a senha de OUTRO usuário
 * ainda não é uma permissão do censo. Ela NÃO nasceu aqui de propósito — uma ação nova cairia,
 * por herança, no perfil EXECUCAO das fixtures (que recebe `TODAS_AS_ACOES` menos as de
 * CONTROLE), e todo executor passaria a poder trocar a senha alheia. Isso é decisão de ESCOPO
 * (do ente), não de código, e merece o seu próprio bloco.
 */
export async function definirSenha(
  prisma: PrismaClient,
  input: DefinirSenhaInput,
  agora: Date = new Date()
): Promise<{ readonly credencialId: string; readonly sessoesRevogadas: number }> {
  const d = zDefinirSenhaInput.parse(input);
  exigirSenhaAceitavel(d.senha);

  // O scrypt roda FORA da transação: são ~91 ms, e segurar uma conexão do pool durante eles
  // seria pagar com o banco por um custo que é de CPU.
  const hashString = await gerarHashDeSenha(d.senha);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({
      where: { id: d.usuarioId },
      select: { id: true, identificador: true },
    });
    if (usuario === null) {
      throw new Error(
        `USUÁRIO NÃO CADASTRADO: não existe usuário com id "${d.usuarioId}". Uma credencial ` +
          `sem dono é uma senha que ninguém pode usar e ninguém pode revogar. Nada foi gravado.`
      );
    }

    const credencial = await tx.credencialDeUsuario.create({
      data: { usuarioId: usuario.id, hashString, criadoPor: d.criadoPor },
      select: { id: true },
    });

    const sessoesRevogadas = await revogarSessoesNaTx(
      tx,
      usuario.id,
      "troca de senha",
      d.criadoPor,
      agora
    );

    return { credencialId: credencial.id, sessoesRevogadas };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// autenticar
// ═══════════════════════════════════════════════════════════════════════════

const zAutenticarInput = z.object({
  identificador: z.string().min(1),
  senha: z.string(),
  /** TR 6.3 — o LOCAL. Ausentes num job interno; presentes quando vêm da borda. */
  ip: z.string().optional(),
  agente: z.string().optional(),
});
export type AutenticarInput = z.input<typeof zAutenticarInput>;

/**
 * ⚠️ A MENSAGEM ÚNICA DA FALHA — e ela é a MESMA para "não existe" e para "senha errada".
 *
 * Dizer "usuário não encontrado" entrega ao atacante metade do trabalho: ele varre a lista de
 * e-mails do município e separa quem tem conta de quem não tem, para só então concentrar a força
 * bruta. A mensagem é uma só, e o TEMPO também é (ver `HASH_INEXISTENTE`) — as duas portas de
 * vazamento fecham juntas, porque fechar uma só não fecha nada.
 */
const CREDENCIAIS_INVALIDAS =
  "CREDENCIAIS INVÁLIDAS: identificador ou senha incorretos. (A mensagem é a MESMA para " +
  "usuário inexistente e senha errada — de propósito: distingui-las diria a quem varre a " +
  "lista de e-mails do município quais deles têm conta.)";

/**
 * AUTENTICA. Devolve a sessão (com o token em claro, uma vez) ou ESTOURA.
 *
 * A ordem é deliberada:
 *   1. o CADEADO primeiro — derivado das tentativas, antes de gastar 91 ms de scrypt;
 *   2. a senha — e o scrypt roda nos DOIS caminhos (existe / não existe);
 *   3. a TENTATIVA é gravada nos DOIS desfechos, antes de responder;
 *   4. só então a sessão nasce.
 */
export async function autenticar(
  prisma: PrismaClient,
  input: AutenticarInput,
  agora: Date = new Date()
): Promise<SessaoCriada> {
  const d = zAutenticarInput.parse(input);

  // ── 1. O CADEADO, DERIVADO. Sem flag, sem contador: uma CONSULTA aos fatos. ──
  const desde = new Date(agora.getTime() - JANELA_DO_CADEADO_MS);
  const falhasRecentes = await prisma.tentativaDeLogin.count({
    where: {
      identificador: d.identificador,
      sucesso: false,
      criadoEm: { gte: desde, lte: agora },
    },
  });

  if (falhasRecentes >= FALHAS_ATE_O_CADEADO) {
    // ⚠️ A TENTATIVA BLOQUEADA **TAMBÉM** É REGISTRADA, e isso tem uma consequência que é
    // preciso dizer: a janela DESLIZA. Quem continua martelando mantém o próprio cadeado
    // fechado — que é o comportamento certo contra a força bruta. O usuário legítimo, esse,
    // precisa PARAR por 15 minutos; tentar de novo reinicia a contagem dele.
    //
    // A alternativa (não registrar) daria ao atacante tentativas grátis e invisíveis, e o log
    // do 6.3 teria um buraco exatamente no momento mais interessante para o controle interno.
    await prisma.tentativaDeLogin.create({
      data: {
        identificador: d.identificador,
        sucesso: false,
        ip: d.ip ?? null,
        criadoEm: agora,
      },
    });

    const minutos = Math.round(JANELA_DO_CADEADO_MS / 60000);
    throw new Error(
      `ACESSO BLOQUEADO: houve ${falhasRecentes} tentativas falhas para "${d.identificador}" ` +
        `nos últimos ${minutos} minutos, e o cadeado fechou (limite: ${FALHAS_ATE_O_CADEADO}). ` +
        `Aguarde ${minutos} minutos SEM TENTAR — cada nova tentativa reinicia a janela. ` +
        `O cadeado não é uma flag: ele é DERIVADO das tentativas registradas, e elas ficam no ` +
        `log para o controle interno ler (TR 6.1-6.3).`
    );
  }

  // ── 2. A SENHA. O scrypt roda nos DOIS caminhos — ver `HASH_INEXISTENTE`. ──
  const usuario = await prisma.usuario.findUnique({
    where: { identificador: d.identificador },
    select: {
      id: true,
      identificador: true,
      ativo: true,
      credenciais: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { hashString: true },
      },
    },
  });

  // A credencial VIGENTE é a ÚLTIMA (append-only — ver o schema). Sem usuário, ou sem
  // credencial nenhuma, cai no hash falso: o relógio não distingue os casos.
  const hashAlvo = usuario?.credenciais[0]?.hashString ?? HASH_INEXISTENTE;
  const senhaConfere = await conferirSenha(d.senha, hashAlvo);

  // ⚠️ O usuário INATIVO não entra — mas o caminho é o mesmo, e o scrypt já rodou. Revogar o
  // acesso de um demitido e deixá-lo autenticar seria devolver-lhe a chave da porta de entrada.
  const ok = senhaConfere && usuario !== null && usuario.ativo;

  // ── 3. A TENTATIVA, GRAVADA — nos dois desfechos, ANTES de responder. ──
  // Inclusive para usuário que NÃO EXISTE, com o identificador DIGITADO: é assim que se vê,
  // no log, alguém varrendo nomes de usuário.
  await prisma.tentativaDeLogin.create({
    data: {
      identificador: d.identificador,
      sucesso: ok,
      ip: d.ip ?? null,
      criadoEm: agora,
    },
  });

  if (!ok) throw new Error(CREDENCIAIS_INVALIDAS);

  // ── 4. A SESSÃO. O token vai em claro para o chamador; o banco guarda o HASH. ──
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_SESSAO_MS);

  const sessao = await prisma.sessaoAberta.create({
    data: {
      usuarioId: usuario!.id,
      tokenHash: hashDoToken(token),
      expiraEm,
      ip: d.ip ?? null,
      agente: d.agente ?? null,
      criadoEm: agora,
    },
    select: { id: true },
  });

  return { sessaoId: sessao.id, token, expiraEm };
}

// ═══════════════════════════════════════════════════════════════════════════
// validarSessao — a DERIVAÇÃO. É esta que a borda chama a cada requisição.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Esta sessão vale?" — e a resposta é DERIVADA, nunca lida de uma flag:
 *   · o hash do token existe?
 *   · `agora` ainda não passou de `expiraEm`?
 *   · não há `SessaoRevogada` apontando para ela?
 *   · o usuário continua ATIVO?
 *
 * Devolve a IDENTIDADE — e é ela que a borda põe no `criadoPor` do serviço. É aqui que o token
 * vira identidade, e é o único lugar onde isso acontece.
 */
export async function validarSessao(
  prisma: Tx,
  token: string,
  agora: Date = new Date()
): Promise<Identidade> {
  const sessao = await prisma.sessaoAberta.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: {
      id: true,
      expiraEm: true,
      revogacao: { select: { motivo: true, criadoEm: true } },
      usuario: { select: { id: true, identificador: true, ativo: true } },
    },
  });

  if (sessao === null) {
    throw new Error(
      `SESSÃO INVÁLIDA: o token não corresponde a sessão nenhuma. (O banco guarda só o HASH do ` +
        `token — um token forjado, ou de uma sessão que nunca existiu, não encontra nada.)`
    );
  }

  if (sessao.revogacao !== null) {
    throw new Error(
      `SESSÃO REVOGADA: ela foi derrubada em ` +
        `${sessao.revogacao.criadoEm.toISOString()} — motivo: "${sessao.revogacao.motivo}". ` +
        `A revogação é um FATO, não um DELETE: a sessão continua no banco, e é por isso que ` +
        `esta mensagem pode dizer QUANDO e POR QUÊ.`
    );
  }

  if (sessao.expiraEm.getTime() <= agora.getTime()) {
    throw new Error(
      `SESSÃO EXPIRADA: ela valia até ${sessao.expiraEm.toISOString()}. A validade é DERIVADA ` +
        `da data — não há flag a virar, e nenhum job precisa passar limpando nada. Autentique-se ` +
        `de novo.`
    );
  }

  if (!sessao.usuario.ativo) {
    throw new Error(
      `USUÁRIO INATIVO: "${sessao.usuario.identificador}" teve o acesso REVOGADO, e a sessão ` +
        `dele morre junto — mesmo que o token ainda não tivesse expirado. Os fatos que ele já ` +
        `criou continuam válidos (o razão é append-only).`
    );
  }

  return {
    usuarioId: sessao.usuario.id,
    identificador: sessao.usuario.identificador,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// revogar
// ═══════════════════════════════════════════════════════════════════════════

/** Revoga UMA sessão, pelo token. É o `logout`. */
export async function revogarSessao(
  prisma: PrismaClient,
  p: { readonly token: string; readonly motivo: string; readonly criadoPor: string }
): Promise<{ readonly sessaoId: string }> {
  if (p.motivo.trim().length === 0) {
    throw new Error(
      `REVOGAÇÃO SEM MOTIVO: toda revogação exige um. "Logout" é motivo; "suspeita de ` +
        `comprometimento" é motivo. Uma revogação sem motivo é uma pergunta sem resposta no ` +
        `dia da auditoria.`
    );
  }

  const sessao = await prisma.sessaoAberta.findUnique({
    where: { tokenHash: hashDoToken(p.token) },
    select: { id: true, revogacao: { select: { id: true } } },
  });
  if (sessao === null) {
    throw new Error(`SESSÃO INVÁLIDA: o token não corresponde a sessão nenhuma.`);
  }
  // Revogar duas vezes não é erro — a segunda é no-op (a unicidade é do banco).
  if (sessao.revogacao !== null) return { sessaoId: sessao.id };

  await prisma.sessaoRevogada.create({
    data: { sessaoId: sessao.id, motivo: p.motivo, criadoPor: p.criadoPor },
  });
  return { sessaoId: sessao.id };
}

/** Revoga TODAS as sessões vivas de um usuário. Usada pela troca de senha. */
export async function revogarTodasDoUsuario(
  prisma: PrismaClient,
  p: {
    readonly usuarioId: string;
    readonly motivo: string;
    readonly criadoPor: string;
  },
  agora: Date = new Date()
): Promise<{ readonly revogadas: number }> {
  const revogadas = await prisma.$transaction((tx) =>
    revogarSessoesNaTx(tx, p.usuarioId, p.motivo, p.criadoPor, agora)
  );
  return { revogadas };
}

/**
 * O CORPO da revogação em massa, JÁ DENTRO de uma transação.
 *
 * Extraído porque a troca de senha precisa rodá-lo na transação DELA: gravar a credencial nova e
 * derrubar as sessões antigas é UM fato, não dois. Se a segunda perna falhasse, a senha estaria
 * trocada e o ladrão continuaria logado — o pior dos dois mundos.
 *
 * ⚠️ Só as VIVAS: revogar de novo o que já foi revogado violaria a unicidade de `sessaoId` — e
 * as expiradas não precisam de revogação (já estão mortas por derivação).
 */
export async function revogarSessoesNaTx(
  tx: Tx,
  usuarioId: string,
  motivo: string,
  criadoPor: string,
  agora: Date
): Promise<number> {
  const vivas = await tx.sessaoAberta.findMany({
    where: {
      usuarioId,
      expiraEm: { gt: agora },
      revogacao: { is: null },
    },
    select: { id: true },
  });
  if (vivas.length === 0) return 0;

  await tx.sessaoRevogada.createMany({
    data: vivas.map((s) => ({ sessaoId: s.id, motivo, criadoPor })),
  });
  return vivas.length;
}

export { exigirUsuarioAtivo };
