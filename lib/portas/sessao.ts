import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cliente, PortaSemBancoError } from "./cliente";
import {
  autenticar,
  ehFalhaDeCredencial,
  revogarSessao,
  validarSessao,
  type Identidade,
} from "../../modules/m16-travamento/autenticacao";
import {
  comOperacaoRegistrada,
  criarRegistroDeOperacaoPrisma,
  ESCOPO_DO_ENTE_UNICO,
  telemetriaNoConsole,
} from "../../modules/m16-travamento/operacao";
import { exigirAcaoEmAlgumEscopo } from "../../modules/m16-travamento/autorizacao";
import { comandoDoFormulario } from "./comando";
import { exigirModuloParaEscrita } from "./licenciamento";

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
 * operação em DUAS fases (RegistroDeOperacao, TR 6.3 — orquestração V3, 4.3): a tentativa antes do
 * ato, o SUCESSO dentro da transação do fato (pelo funil) e a conclusão depois, como telemetria.
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

  // ⚠️ AS TRÊS SEPARAÇÕES DA ORQUESTRAÇÃO V3 (4.3), aplicadas ao login:
  //   · credencial errada ou cadeado -> mensagem única "usuário ou senha inválidos" (o
  //     domínio já é de timing uniforme) e a NEGAÇÃO registrada, fora de qualquer tx;
  //   · falha de INFRAESTRUTURA (banco, auditoria da tentativa) -> NÃO vira "senha
  //     inválida": o serviço está indisponível, e é isso que o operador lê;
  //   · o registro de SUCESSO é telemetria: se falhar depois de o cookie existir, o login
  //     continua válido — antes, a falha do log derrubava um login que já tinha acontecido.
  let sessao: Awaited<ReturnType<typeof autenticar>>;
  try {
    sessao = await autenticar(cliente(), { identificador: input.identificador, senha: input.senha, ...(ip !== undefined ? { ip } : {}), ...(agente !== undefined ? { agente } : {}) });
  } catch (e) {
    if (!ehFalhaDeCredencial(e)) {
      telemetriaNoConsole({ fase: "ERRO", operacaoId: "-", usuarioIdent: input.identificador, acao: "LOGIN", causa: e });
      return { ok: false, erro: "Não foi possível verificar as credenciais agora: o serviço está indisponível. Tente novamente em instantes." };
    }
    try {
      await registro.registrar({ usuarioIdent: input.identificador, acao: "LOGIN", ip, agente, resultado: "NEGADO", detalhe: e instanceof Error ? e.message : String(e) });
    } catch (causa) {
      telemetriaNoConsole({ fase: "NEGADO", operacaoId: "-", usuarioIdent: input.identificador, acao: "LOGIN", causa });
    }
    return { ok: false, erro: "Usuário ou senha inválidos." };
  }

  (await cookies()).set(COOKIE, sessao.token, { httpOnly: true, secure: SECURE, sameSite: "lax", expires: sessao.expiraEm, path: "/" });
  try {
    await registro.registrar({ usuarioIdent: input.identificador, acao: "LOGIN", ip, agente, resultado: "SUCESSO" });
  } catch (causa) {
    telemetriaNoConsole({ fase: "CONCLUIDA", operacaoId: "-", usuarioIdent: input.identificador, acao: "LOGIN", causa });
  }
  return { ok: true };
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
export async function comEscritaAutenticada<T>(
  acao: string,
  ato: (criadoPor: string) => Promise<T>,
  opcoes?: {
    /** Um chamador que NÃO é formulário (job, rota) declara por que não há chave. Vai para a auditoria. */
    readonly semChave?: string;
  }
): Promise<T> {
  const ident = await exigirSessao();

  // ⚠️ O GATE DE LICENCIAMENTO, ANTES DO ATO E ANTES DO REGISTRO DE TENTATIVA (V10 T1).
  //
  // Ele é a QUARTA pergunta, anterior às outras três (permissão, escopo, período): "este
  // módulo foi contratado por esta implantação?". Mora aqui, no funil único de escrita, e não
  // em cada tela, porque a enumeração de sítios é o defeito que este repositório já pagou
  // para aprender — "uma estimativa de dez virou cinquenta e sete".
  //
  // ⚠️ E ELE NÃO CONFUNDE LICENÇA COM BANCO FORA: a recusa comercial e a indisponibilidade são
  // erros de classes diferentes (`lib/portas/licenciamento.ts`), porque pedem providências
  // diferentes — uma é do comercial, a outra é do suporte técnico.
  await exigirModuloParaEscrita(acao);

  const { ip, agente } = await contexto();
  // ⚠️ A CHAVE E O FINGERPRINT VÊM DO COMANDO DO FORMULÁRIO (lib/portas/comando.ts). Sem chave o
  // envelope RECUSA (sessão noturna V4, 3) — salvo o motivo declarado em `semChave`. O ESCOPO
  // vem daqui (do servidor), nunca do cliente; o REPLAY revalida a ação antes de revelar a referência.
  const comando = comandoDoFormulario();
  return comOperacaoRegistrada(
    criarRegistroDeOperacaoPrisma(cliente()),
    {
      usuarioIdent: ident.identificador,
      acao,
      ip,
      agente,
      escopo: escopoDoComando(),
      chave: comando?.chave ?? null,
      fingerprint: comando?.fingerprint ?? null,
      semChave: opcoes?.semChave,
      revalidar: () => exigirAcaoEmAlgumEscopo(cliente(), ident.identificador, acao),
    },
    () => ato(ident.identificador)
  );
}

/**
 * O ESCOPO DO COMANDO — o ente. Enquanto o ente não é cadastro, é o ente único (`ENTE_ESCOPO`
 * do ambiente, ou o valor padrão). Quando município/entidade existirem, vêm da membership
 * resolvida no servidor — nunca da URL, do cabeçalho ou do formulário.
 */
export function escopoDoComando(): string {
  const env = process.env["ENTE_ESCOPO"]?.trim();
  return env !== undefined && env !== "" ? env : ESCOPO_DO_ENTE_UNICO;
}

export type { Identidade };
