import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cliente, PortaSemBancoError } from "./cliente";
import {
  autenticar,
  revogarSessao,
  validarSessao,
  type Identidade,
} from "../../modules/m16-travamento/autenticacao";
import {
  comOperacaoRegistrada,
  criarRegistroDeOperacaoPrisma,
} from "../../modules/m16-travamento/operacao";

/**
 * PORTA — SESSÃO (login, validação request-scoped, logout, escrita autenticada).
 *
 * ═══ O COOKIE É O TOKEN CRU; O BANCO GUARDA SÓ O HASH ═══
 * `siafic_sessao` = o token em claro (httpOnly, sameSite=lax, secure em produção). O domínio guarda
 * só `hashDoToken` — um dump do banco não entrega sessão. Sem token em URL, nunca. O login/logout
 * são ATOS (Server Actions) que escrevem o cookie; a validação (`exigirSessao`) só o LÊ.
 *
 * ═══ criadoPor REAL ═══
 * Toda escrita da UI passa por `comEscritaAutenticada`: exige sessão, injeta o `criadoPor` real (o
 * identificador do usuário logado — o mesmo que o funil e a autorização do M16 cobram) e registra a
 * operação (RegistroDeOperacao, TR 6.3), fora da transação do ato.
 */

const COOKIE = "siafic_sessao";
const SECURE = process.env["NODE_ENV"] === "production";

/** A sessão atual, ou `null` (não redireciona — para o shell exibir o usuário / decidir). */
export async function sessaoAtual(): Promise<Identidade | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token === undefined || token === "") return null;
  try {
    return await validarSessao(cliente(), token);
  } catch (e) {
    if (e instanceof PortaSemBancoError) throw e;
    return null; // token inválido/expirado/revogado: sem sessão.
  }
}

/** Exige sessão: devolve a identidade, ou REDIRECIONA para /login com o retorno. */
export async function exigirSessao(): Promise<Identidade> {
  const ident = await sessaoAtual();
  if (ident === null) {
    const caminho = (await headers()).get("x-pathname") ?? "/";
    redirect(`/login?retorno=${encodeURIComponent(caminho)}`);
  }
  return ident;
}

async function contexto(): Promise<{ ip: string | undefined; agente: string | undefined }> {
  const h = await headers();
  return { ip: h.get("x-forwarded-for") ?? undefined, agente: h.get("user-agent") ?? undefined };
}

/** ENTRAR: autentica, grava o cookie e registra o LOGIN. Falha = mensagem única (o domínio já é
 *  de timing uniforme — a UI não diferencia usuário de senha). */
export async function entrar(input: { readonly identificador: string; readonly senha: string }): Promise<
  { readonly ok: true } | { readonly ok: false; readonly erro: string }
> {
  const { ip, agente } = await contexto();
  const registro = criarRegistroDeOperacaoPrisma(cliente());
  try {
    const sessao = await autenticar(cliente(), { identificador: input.identificador, senha: input.senha, ...(ip !== undefined ? { ip } : {}), ...(agente !== undefined ? { agente } : {}) });
    (await cookies()).set(COOKIE, sessao.token, { httpOnly: true, secure: SECURE, sameSite: "lax", expires: sessao.expiraEm, path: "/" });
    await registro.registrar({ usuarioIdent: input.identificador, acao: "LOGIN", ip, agente, resultado: "SUCESSO" });
    return { ok: true };
  } catch (e) {
    await registro.registrar({ usuarioIdent: input.identificador, acao: "LOGIN", ip, agente, resultado: "NEGADO", detalhe: e instanceof Error ? e.message : String(e) });
    return { ok: false, erro: "Usuário ou senha inválidos." };
  }
}

/** SAIR: revoga a sessão (fato, não delete) e limpa o cookie. */
export async function encerrarSessao(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const ident = await sessaoAtual();
  if (token !== undefined && token !== "") {
    try {
      await revogarSessao(cliente(), { token, motivo: "Logout", criadoPor: ident?.identificador ?? "desconhecido" });
      await criarRegistroDeOperacaoPrisma(cliente()).registrar({ usuarioIdent: ident?.identificador ?? "desconhecido", acao: "LOGOUT", resultado: "SUCESSO" });
    } catch {
      /* token já inválido: nada a revogar. */
    }
  }
  store.delete(COOKIE);
}

/**
 * A ESCRITA AUTENTICADA — a única porta por onde a UI grava. Exige sessão, injeta o `criadoPor`
 * real e registra a operação (SUCESSO/NEGADO/ERRO, fora da tx). Sessão inválida/expirada REDIRECIONA
 * para /login (fail-closed): nenhuma escrita anônima.
 */
export async function comEscritaAutenticada<T>(acao: string, ato: (criadoPor: string) => Promise<T>): Promise<T> {
  const ident = await exigirSessao();
  const { ip, agente } = await contexto();
  return comOperacaoRegistrada(criarRegistroDeOperacaoPrisma(cliente()), { usuarioIdent: ident.identificador, acao, ip, agente }, () => ato(ident.identificador));
}

export type { Identidade };
