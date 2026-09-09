import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { z } from "zod";
import { ACAO_DO_SERVICO } from "./acoes.js";
import { autorizar } from "./autorizacao.js";
import { definirSenha, revogarSessoesNaTx } from "./autenticacao.js";
import { exigirSenhaAceitavel } from "./credenciais.js";

/**
 * M16 — ADMINISTRAÇÃO DE USUÁRIOS (TR 4.55/4.56). Criar, vincular perfil, ativar/inativar, resetar.
 *
 * ═══ A FAMÍLIA ADMINISTRACAO — E ELA COBRA O CENSO (7.14) ═══
 * Estes seis atos cobram a SUA ação do censo (`CRIAR_USUARIO`, `CONCEDER_PERFIL`, …) como toda
 * mutação do sistema: `autorizar(prisma, criadoPor, ACAO_DO_SERVICO.x)` é a primeira instrução
 * depois do Zod. Quem administra usuários NÃO é quem executa despesa — a separação do 6.4, agora
 * também para o cadastro de quem pode o quê. O ente concede cada ação átomo a átomo; nada entra por
 * herança (o teste de não-herança prova).
 *
 * Foi a 7.14 que fechou a pendência `AUTORIZACAO-ADMIN-SEM-CENSO` da 7.13: a exceção de schema
 * daquela sessão pôs os 6 valores no enum `AcaoDoSistema`, e aí `autorizar` passou a ter o que
 * cobrar. Sem UG: administrar usuário é ato do ENTE, não de uma secretaria (como o travamento) —
 * só a permissão GLOBAL serve.
 *
 * ═══ REUSO, NÃO DUPLICAÇÃO ═══
 * A senha passa por `definirSenha` (o mesmo scrypt e a mesma revogação de sessões do bootstrap e da
 * troca-a-própria). `resetarSenha` é uma casca nomeada sobre ele. Nada de hash reescrito aqui.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zEmail = z.string().trim().min(1, "O email (identificador) é obrigatório");
const zNome = z.string().trim().min(1, "O nome é obrigatório");
const zAtor = z.string().min(1);

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR USUÁRIO
// ═══════════════════════════════════════════════════════════════════════════

const zCriarUsuarioInput = z.object({
  nome: zNome,
  email: zEmail,
  senhaInicial: z.string(),
  /** Perfil inicial — opcional. Um usuário sem perfil existe, mas não pode nada (o padrão nega). */
  perfilId: z.string().min(1).optional(),
  criadoPor: zAtor,
});
export type CriarUsuarioInput = z.input<typeof zCriarUsuarioInput>;

/**
 * Cria um usuário (identidade = email único), com senha inicial ≥12 e, se informado, um perfil.
 * Email duplicado é erro NOMEADO, não uma violação de unicidade crua do banco.
 */
export async function criarUsuario(
  prisma: PrismaClient,
  input: CriarUsuarioInput
): Promise<{ readonly usuarioId: string }> {
  const d = zCriarUsuarioInput.parse(input);

  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.criarUsuario);

  // A senha, fail-fast: não se cria um usuário para descobrir DEPOIS que a senha é curta.
  exigirSenhaAceitavel(d.senhaInicial);

  const jaExiste = await prisma.usuario.findUnique({ where: { identificador: d.email }, select: { id: true } });
  if (jaExiste !== null) {
    throw new Error(
      `EMAIL JÁ CADASTRADO: já existe usuário com o identificador "${d.email}". O email é a ` +
        `IDENTIDADE — dois usuários com o mesmo identificador seriam dois \`criadoPor\` que o TCE ` +
        `não conseguiria distinguir. Nada foi gravado.`
    );
  }

  if (d.perfilId !== undefined) {
    const perfil = await prisma.perfil.findUnique({ where: { id: d.perfilId }, select: { id: true } });
    if (perfil === null) {
      throw new Error(`PERFIL INEXISTENTE: não há perfil com id "${d.perfilId}". Nada foi gravado.`);
    }
  }

  const usuario = await prisma.usuario.create({
    data: { identificador: d.email, nome: d.nome, ativo: true, criadoPor: d.criadoPor },
    select: { id: true },
  });

  if (d.perfilId !== undefined) {
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: d.perfilId, criadoPor: d.criadoPor },
    });
  }

  // O hash do bootstrap/troca-a-própria — não um scrypt de segunda classe.
  await definirSenha(prisma, { usuarioId: usuario.id, senha: d.senhaInicial, criadoPor: d.criadoPor });

  return { usuarioId: usuario.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCEDER / REVOGAR PERFIL — conceder = create, revogar = DELETE (o vínculo não tem revogação)
// ═══════════════════════════════════════════════════════════════════════════

const zVinculoInput = z.object({
  usuarioId: z.string().min(1),
  perfilId: z.string().min(1),
  criadoPor: zAtor,
});
export type VinculoPerfilInput = z.input<typeof zVinculoInput>;

async function exigirUsuarioEPerfil(prisma: Tx, usuarioId: string, perfilId: string): Promise<void> {
  const [u, p] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } }),
    prisma.perfil.findUnique({ where: { id: perfilId }, select: { id: true } }),
  ]);
  if (u === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${usuarioId}". Nada foi gravado.`);
  if (p === null) throw new Error(`PERFIL INEXISTENTE: não há perfil com id "${perfilId}". Nada foi gravado.`);
}

/** Concede um perfil. Conceder o JÁ concedido é erro nomeado — não silêncio (a lição do módulo). */
export async function concederPerfil(prisma: PrismaClient, input: VinculoPerfilInput): Promise<{ readonly vinculoId: string }> {
  const d = zVinculoInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.concederPerfil);
  await exigirUsuarioEPerfil(prisma, d.usuarioId, d.perfilId);

  const ja = await prisma.vinculoUsuarioPerfil.findUnique({
    where: { usuarioId_perfilId: { usuarioId: d.usuarioId, perfilId: d.perfilId } },
    select: { id: true },
  });
  if (ja !== null) {
    throw new Error(
      `PERFIL JÁ CONCEDIDO: o usuário já tem este perfil. Conceder de novo não faria nada — e um ` +
        `"nada" silencioso esconderia um engano (o admin achou que concedeu outro). Nada foi gravado.`
    );
  }

  const v = await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: d.usuarioId, perfilId: d.perfilId, criadoPor: d.criadoPor },
    select: { id: true },
  });
  return { vinculoId: v.id };
}

/** Revoga um perfil (DELETE do vínculo). Revogar o que não tem é erro nomeado. */
export async function revogarPerfil(prisma: PrismaClient, input: VinculoPerfilInput): Promise<void> {
  const d = zVinculoInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.revogarPerfil);

  const vinculo = await prisma.vinculoUsuarioPerfil.findUnique({
    where: { usuarioId_perfilId: { usuarioId: d.usuarioId, perfilId: d.perfilId } },
    select: { id: true },
  });
  if (vinculo === null) {
    throw new Error(
      `PERFIL NÃO CONCEDIDO: o usuário NÃO tem este perfil — não há o que revogar. Revogar um ` +
        `vínculo que não existe "com sucesso" faria o admin crer que tirou um poder que o usuário ` +
        `nunca teve. Nada foi gravado.`
    );
  }
  // ⚠️ DELETE, não revogação: o `VinculoUsuarioPerfil` não tem campo de revogação (ver o schema). A
  // concessão é o fato; sua ausência é a revogação. O `criadoPor` do vínculo apagado já foi auditado.
  await prisma.vinculoUsuarioPerfil.delete({ where: { id: vinculo.id } });
}

// ═══════════════════════════════════════════════════════════════════════════
// ATIVAR / INATIVAR — inativar revoga TODAS as sessões do alvo, e não se inativa a si mesmo
// ═══════════════════════════════════════════════════════════════════════════

const zAlvoInput = z.object({ usuarioId: z.string().min(1), criadoPor: zAtor });
export type AlvoUsuarioInput = z.input<typeof zAlvoInput>;

/** Reativa um usuário. Ativar o já-ativo é erro nomeado. */
export async function ativarUsuario(prisma: PrismaClient, input: AlvoUsuarioInput): Promise<void> {
  const d = zAlvoInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.ativarUsuario);

  const alvo = await prisma.usuario.findUnique({ where: { id: d.usuarioId }, select: { ativo: true } });
  if (alvo === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${d.usuarioId}". Nada foi gravado.`);
  if (alvo.ativo) throw new Error(`USUÁRIO JÁ ATIVO: nada a fazer. Nada foi gravado.`);

  await prisma.usuario.update({ where: { id: d.usuarioId }, data: { ativo: true } });
}

/**
 * Inativa um usuário e DERRUBA TODAS as sessões dele, na MESMA transação — inativo não fica logado.
 * Inativar a si mesmo é erro nomeado: o último admin não se tranca fora do sistema.
 */
export async function inativarUsuario(
  prisma: PrismaClient,
  input: AlvoUsuarioInput,
  agora: Date = new Date()
): Promise<{ readonly sessoesRevogadas: number }> {
  const d = zAlvoInput.parse(input);
  const ator = await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.inativarUsuario);

  if (ator.usuarioId === d.usuarioId) {
    throw new Error(
      `AUTO-INATIVAÇÃO RECUSADA: você não pode inativar a si mesmo. Se o último administrador se ` +
        `inativasse, o sistema ficaria sem ninguém que possa reativá-lo — a porta trancada por ` +
        `dentro, com a chave do lado de fora. Peça a outro administrador. Nada foi gravado.`
    );
  }

  const alvo = await prisma.usuario.findUnique({ where: { id: d.usuarioId }, select: { ativo: true } });
  if (alvo === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${d.usuarioId}". Nada foi gravado.`);
  if (!alvo.ativo) throw new Error(`USUÁRIO JÁ INATIVO: nada a fazer. Nada foi gravado.`);

  // ⚠️ UM FATO, NÃO DOIS: inativar e derrubar as sessões na mesma transação (a doutrina do
  // `definirSenha`). Se a segunda perna falhasse, o usuário estaria inativo com sessões vivas.
  return prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: d.usuarioId }, data: { ativo: false } });
    const sessoesRevogadas = await revogarSessoesNaTx(tx, d.usuarioId, "usuário inativado", d.criadoPor, agora);
    return { sessoesRevogadas };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RESETAR SENHA (o 4.55) — casca nomeada sobre `definirSenha`
// ═══════════════════════════════════════════════════════════════════════════

const zResetarSenhaInput = z.object({
  usuarioId: z.string().min(1),
  senhaTemporaria: z.string(),
  criadoPor: zAtor,
});
export type ResetarSenhaInput = z.input<typeof zResetarSenhaInput>;

/**
 * O admin define uma senha temporária ≥12 para o alvo e DERRUBA as sessões DO ALVO (não as suas).
 *
 * ⚠️ `definirSenha` revoga as sessões do `usuarioId` (o alvo) — nunca as do `criadoPor` (o admin).
 * É exatamente o que o 4.55 pede: o admin entrega a senha nova e segue logado para atender o próximo.
 */
export async function resetarSenha(
  prisma: PrismaClient,
  input: ResetarSenhaInput
): Promise<{ readonly sessoesRevogadas: number }> {
  const d = zResetarSenhaInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.resetarSenha);

  const alvo = await prisma.usuario.findUnique({ where: { id: d.usuarioId }, select: { id: true } });
  if (alvo === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${d.usuarioId}". Nada foi gravado.`);

  const r = await definirSenha(prisma, { usuarioId: d.usuarioId, senha: d.senhaTemporaria, criadoPor: d.criadoPor });
  return { sessoesRevogadas: r.sessoesRevogadas };
}
