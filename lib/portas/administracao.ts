import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { definirSenha } from "../../modules/m16-travamento/autenticacao";
import {
  ativarUsuario,
  concederPerfil,
  criarUsuario,
  inativarUsuario,
  resetarSenha,
  revogarPerfil,
} from "../../modules/m16-travamento/servico-usuarios";

/**
 * PORTA — ADMINISTRAÇÃO (usuários, perfis/permissões, troca da própria senha).
 *
 * Leitura do quadro de acesso (TR 4.55/4.56): quem são os usuários, que perfis existem e quais
 * ações cada perfil concede. A escrita da 7.14: criar usuário, conceder/revogar perfil,
 * ativar/inativar e resetar senha — cada uma `comEscritaAutenticada` com a SUA ação do censo (a
 * separação da administração, do 6.4). O ato nasce no DOMÍNIO (`servico-usuarios.ts`); a porta só
 * resolve o `criadoPor` real e encaminha.
 */

export { PortaSemBancoError };

export interface UsuarioAdmin {
  readonly id: string;
  readonly identificador: string;
  readonly nome: string;
  readonly ativo: boolean;
  readonly perfis: readonly string[];
  /** Os vínculos com id — o que o botão "revogar" precisa (perfil por perfil). */
  readonly vinculos: readonly { readonly perfilId: string; readonly nome: string }[];
}

export async function listarUsuarios(): Promise<readonly UsuarioAdmin[]> {
  const us = await cliente().usuario.findMany({
    orderBy: { identificador: "asc" },
    select: { id: true, identificador: true, nome: true, ativo: true, vinculos: { select: { perfilId: true, perfil: { select: { nome: true } } } } },
  });
  return us.map((u) => ({
    id: u.id,
    identificador: u.identificador,
    nome: u.nome,
    ativo: u.ativo,
    perfis: u.vinculos.map((v) => v.perfil.nome),
    vinculos: u.vinculos.map((v) => ({ perfilId: v.perfilId, nome: v.perfil.nome })),
  }));
}

/** Os perfis existentes (id + nome) — o vocabulário do select de conceder/revogar. */
export interface PerfilOpcao {
  readonly id: string;
  readonly nome: string;
}
export async function listarPerfisOpcoes(): Promise<readonly PerfilOpcao[]> {
  const ps = await cliente().perfil.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  return ps.map((p) => ({ id: p.id, nome: p.nome }));
}

export interface PermissaoAdmin {
  readonly acao: string;
  /** null = todas as UGs (concessão global). */
  readonly unidadeOrc: string | null;
}
export interface PerfilAdmin {
  readonly nome: string;
  readonly descricao: string;
  readonly permissoes: readonly PermissaoAdmin[];
}

export async function listarPerfis(): Promise<readonly PerfilAdmin[]> {
  const ps = await cliente().perfil.findMany({
    orderBy: { nome: "asc" },
    select: { nome: true, descricao: true, permissoes: { select: { acao: true, unidadeOrc: { select: { codigo: true } } } } },
  });
  return ps.map((p) => ({
    nome: p.nome, descricao: p.descricao,
    permissoes: p.permissoes.map((perm) => ({ acao: perm.acao, unidadeOrc: perm.unidadeOrc?.codigo ?? null })).sort((a, b) => a.acao.localeCompare(b.acao)),
  }));
}

/**
 * TROCAR A PRÓPRIA SENHA — escrita autenticada. Derruba TODAS as sessões do usuário (o domínio),
 * então quem troca é deslogado. Devolve quantas sessões caíram (para a UI mostrar o efeito).
 */
export async function trocarPropriaSenha(senhaNova: string): Promise<{ readonly sessoesRevogadas: number }> {
  return comEscritaAutenticada("TROCAR_SENHA", async (criadoPor) => {
    const u = await cliente().usuario.findUniqueOrThrow({ where: { identificador: criadoPor }, select: { id: true } });
    const r = await definirSenha(cliente(), { usuarioId: u.id, senha: senhaNova, criadoPor });
    return { sessoesRevogadas: r.sessoesRevogadas };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ESCRITAS DA ADMINISTRAÇÃO (7.14) — cada uma cobra a SUA ação do censo
// ═══════════════════════════════════════════════════════════════════════════

/** Cria um usuário. Devolve a senha inicial para a UI exibir UMA vez — ela NÃO vai para o log. */
export async function criarUsuarioAdmin(input: {
  readonly nome: string;
  readonly email: string;
  readonly senhaInicial: string;
  readonly perfilId?: string | undefined;
}): Promise<{ readonly usuarioId: string }> {
  return comEscritaAutenticada("CRIAR_USUARIO", async (criadoPor) =>
    criarUsuario(cliente(), {
      nome: input.nome,
      email: input.email,
      senhaInicial: input.senhaInicial,
      ...(input.perfilId !== undefined ? { perfilId: input.perfilId } : {}),
      criadoPor,
    })
  );
}

export async function concederPerfilAdmin(input: { readonly usuarioId: string; readonly perfilId: string }): Promise<void> {
  await comEscritaAutenticada("CONCEDER_PERFIL", async (criadoPor) => concederPerfil(cliente(), { ...input, criadoPor }));
}

export async function revogarPerfilAdmin(input: { readonly usuarioId: string; readonly perfilId: string }): Promise<void> {
  await comEscritaAutenticada("REVOGAR_PERFIL", async (criadoPor) => revogarPerfil(cliente(), { ...input, criadoPor }));
}

export async function ativarUsuarioAdmin(input: { readonly usuarioId: string }): Promise<void> {
  await comEscritaAutenticada("ATIVAR_USUARIO", async (criadoPor) => ativarUsuario(cliente(), { ...input, criadoPor }));
}

export async function inativarUsuarioAdmin(input: { readonly usuarioId: string }): Promise<{ readonly sessoesRevogadas: number }> {
  return comEscritaAutenticada("INATIVAR_USUARIO", async (criadoPor) => inativarUsuario(cliente(), { ...input, criadoPor }));
}

export async function resetarSenhaAdmin(input: { readonly usuarioId: string; readonly senhaTemporaria: string }): Promise<{ readonly sessoesRevogadas: number }> {
  return comEscritaAutenticada("RESETAR_SENHA", async (criadoPor) =>
    resetarSenha(cliente(), { usuarioId: input.usuarioId, senhaTemporaria: input.senhaTemporaria, criadoPor })
  );
}
