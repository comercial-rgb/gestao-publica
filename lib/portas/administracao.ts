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
import {
  concederAcaoAoPerfil,
  criarPerfil,
  revogarAcaoDoPerfil,
} from "../../modules/m16-travamento/servico-perfis";
import { TODAS_AS_ACOES } from "../../modules/m16-travamento/acoes";
import { AREA_DA_ACAO } from "./navegacao-permissoes";
import { AREAS } from "../navegacao";

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
  /**
   * O id da unidade — o que o botão "revogar" precisa.
   *
   * ⚠️ É SEPARADO DO CÓDIGO de propósito: o código é o que a pessoa lê ("01001"), e o id é o
   * que identifica a linha. Revogar pelo código obrigaria o servidor a reencontrar a unidade
   * a cada clique, e duas unidades de códigos parecidos são um erro de digitação de distância.
   */
  readonly unidadeOrcId: string | null;
}
export interface PerfilAdmin {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly permissoes: readonly PermissaoAdmin[];
}

export async function listarPerfis(): Promise<readonly PerfilAdmin[]> {
  const ps = await cliente().perfil.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      descricao: true,
      permissoes: { select: { acao: true, unidadeOrcId: true, unidadeOrc: { select: { codigo: true } } } },
    },
  });
  return ps.map((p) => ({
    id: p.id, nome: p.nome, descricao: p.descricao,
    permissoes: p.permissoes
      .map((perm) => ({ acao: perm.acao, unidadeOrc: perm.unidadeOrc?.codigo ?? null, unidadeOrcId: perm.unidadeOrcId }))
      .sort((a, b) => a.acao.localeCompare(b.acao)),
  }));
}

/** Uma unidade gestora, para o recorte opcional da concessão (TR 6.5). */
export interface UnidadeParaConcessao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}
export async function listarUnidadesParaConcessao(): Promise<readonly UnidadeParaConcessao[]> {
  const us = await cliente().unidadeOrcamentaria.findMany({
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, descricao: true },
  });
  return us;
}

/** As ações do censo, agrupadas pela área em que elas aparecem no menu. */
export interface GrupoDeAcoes {
  readonly slug: string;
  readonly rotulo: string;
  readonly acoes: readonly string[];
}

/**
 * O ROL DE AÇÕES QUE A TELA OFERECE — agrupado por área, nunca numa lista só.
 *
 * ⚠️ SÃO MAIS DE DUZENTAS AÇÕES. Um `select` com todas elas, ordenadas alfabeticamente,
 * seria um formulário bonito e inútil: quem administra procura "o que a tesouraria faz",
 * não uma palavra que já sabe escrever. O agrupamento é o mesmo da barra lateral, e vem do
 * MESMO mapa que decide a visibilidade do menu — não há segunda régua.
 *
 * `transversal` é grupo de verdade e não gaveta de sobra: anexar arquivo e preencher campo
 * adicional acontecem DENTRO de outras áreas, e nenhuma delas abre tela própria.
 */
export function acoesDoCensoPorArea(): readonly GrupoDeAcoes[] {
  const porArea = new Map<string, string[]>();
  for (const acao of TODAS_AS_ACOES) {
    const destino = AREA_DA_ACAO[acao];
    const lista = porArea.get(destino) ?? [];
    lista.push(acao);
    porArea.set(destino, lista);
  }

  const grupos: GrupoDeAcoes[] = [];
  for (const area of AREAS) {
    const acoes = porArea.get(area.slug);
    if (acoes === undefined || acoes.length === 0) continue;
    grupos.push({ slug: area.slug, rotulo: area.rotulo, acoes: [...acoes].sort() });
  }
  const transversais = porArea.get("transversal");
  if (transversais !== undefined && transversais.length > 0) {
    grupos.push({ slug: "transversal", rotulo: "Transversal (dentro de outras áreas)", acoes: [...transversais].sort() });
  }
  return grupos;
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

// ═══════════════════════════════════════════════════════════════════════════
// OS PERFIS (ENT06 item 1) — criar o crachá, e mudar o que ele abre
//
// ⚠️ ATÉ AQUI NÃO HAVIA CAMINHO NENHUM. O censo ganhava ações a cada lote, e os perfis de
// uma instalação já existente continuavam com as antigas: a tela nova não aparecia para
// ninguém, sem erro e sem log. Ver `deriva-de-perfil.ts`, que mede a distância.
// ═══════════════════════════════════════════════════════════════════════════

export async function criarPerfilAdmin(input: {
  readonly nome: string;
  readonly descricao: string;
}): Promise<{ readonly perfilId: string }> {
  return comEscritaAutenticada("CRIAR_PERFIL", async (criadoPor) =>
    criarPerfil(cliente(), { nome: input.nome, descricao: input.descricao, criadoPor })
  );
}

export async function concederAcaoAoPerfilAdmin(input: {
  readonly perfilId: string;
  readonly acao: string;
  readonly unidadeOrcId: string | null;
}): Promise<void> {
  await comEscritaAutenticada("CONCEDER_ACAO_A_PERFIL", async (criadoPor) =>
    concederAcaoAoPerfil(cliente(), { ...input, criadoPor })
  );
}

export async function revogarAcaoDoPerfilAdmin(input: {
  readonly perfilId: string;
  readonly acao: string;
  readonly unidadeOrcId: string | null;
}): Promise<void> {
  await comEscritaAutenticada("REVOGAR_ACAO_DE_PERFIL", async (criadoPor) =>
    revogarAcaoDoPerfil(cliente(), { ...input, criadoPor })
  );
}
