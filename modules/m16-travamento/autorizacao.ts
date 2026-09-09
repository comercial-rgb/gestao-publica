import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { AcaoDoSistema } from "./acoes.js";

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * M16 — AUTORIZAÇÃO. TR 4.55/4.56 · 6.4/6.5.
 *
 * ═══ ⚠️ NEGAR É O PADRÃO. TUDO O MAIS É CONSEQUÊNCIA ═══
 * `autorizar` não devolve `boolean`: ele PASSA ou ESTOURA. Um `boolean` convida ao
 * `if (podeEmpenhar) {...}` — e o dia em que alguém esquecer o `if`, o sistema autoriza em
 * silêncio. Aqui, esquecer a chamada é a única forma de furar a rede — e é por isso que o
 * PILOTO existe, e é por isso que o rollout é rota declarada.
 *
 * As quatro portas fecham, e cada uma com a SUA mensagem (o TCE pergunta "por que ele não
 * conseguiu?", e "acesso negado" não responde):
 *   1. usuário NÃO EXISTE          -> a identidade é falsa;
 *   2. usuário INATIVO             -> a identidade existia e foi revogada;
 *   3. usuário SEM PERFIL          -> ele existe e não recebeu crachá nenhum;
 *   4. perfis SEM A PERMISSÃO      -> tem crachá, mas não este poder (ou não AQUI).
 *
 * ═══ A SEGREGAÇÃO POR UNIDADE GESTORA (6.5) ═══
 * A permissão pode ser GLOBAL (`unidadeOrcId` nulo — "pode isto em qualquer lugar do ente")
 * ou de UMA UG. Quando o serviço informa a UG do fato, a permissão global cobre; a de outra
 * UG, não.
 *
 * ⚠️ E QUANDO O SERVIÇO **NÃO TEM** UG (é o caso do travamento: fechar o mês é do ente
 * inteiro, não da Secretaria de Saúde), só a permissão GLOBAL serve. Uma permissão de UG
 * específica NÃO autoriza um ato que não pertence a UG nenhuma — dar poder de "travar a
 * competência da Saúde" seria inventar um recorte que o TR 4.52 não tem.
 */

export interface Autorizacao {
  readonly usuarioId: string;
  readonly identificador: string;
  /** Por qual perfil ele passou — vai para a auditoria e para o debug. */
  readonly perfil: string;
  /** `null` = a permissão é global (vale em qualquer UG). */
  readonly unidadeOrcId: string | null;
}

/**
 * O USUÁRIO EXISTE E ESTÁ ATIVO? — a pergunta de IDENTIDADE, separada da de PODER.
 *
 * ⚠️ ELA É SEPARADA DE PROPÓSITO, e o funil do razão usa só esta. Ver `lancarNoRazao`: o
 * funil confere QUEM ESTÁ ASSINANDO (a identidade), nunca O QUE ELE PODE (a autorização).
 *
 * Misturá-las poria o funil no negócio de saber que ação cada lançamento representa — e ele
 * não sabe: um `LancamentoContabil` de origem "EMPENHO" chega lá idêntico a um de origem
 * "PAGAMENTO". Quem sabe qual ação está sendo executada é o SERVIÇO, e é lá que a
 * autorização mora.
 */
export async function exigirUsuarioAtivo(
  tx: Tx,
  identificador: string,
  ondeUsado: string
): Promise<{ readonly id: string; readonly identificador: string }> {
  const u = await tx.usuario.findUnique({
    where: { identificador },
    select: { id: true, identificador: true, ativo: true },
  });

  if (u === null) {
    throw new Error(
      `USUÁRIO NÃO CADASTRADO: "${identificador}" (${ondeUsado}). Todo fato deste sistema ` +
        `carrega a identidade de quem o criou, e essa identidade tem de EXISTIR — uma ` +
        `string livre no \`criadoPor\` era um nome que ninguém podia cobrar. Cadastre o ` +
        `usuário (TR 4.55). Nada foi gravado.`
    );
  }
  if (!u.ativo) {
    throw new Error(
      `USUÁRIO INATIVO: "${identificador}" (${ondeUsado}). Ele existe, e o acesso dele foi ` +
        `REVOGADO. Os fatos que ele já criou continuam válidos (o razão é append-only e ` +
        `não se reescreve o passado) — mas ele não cria fatos novos. Nada foi gravado.`
    );
  }
  return { id: u.id, identificador: u.identificador };
}

/**
 * AUTORIZA (ou estoura). O `unidadeOrcId` é o da UG do FATO — omitido quando o ato não
 * pertence a UG nenhuma (ver o cabeçalho).
 */
export async function autorizar(
  tx: Tx,
  identificador: string,
  acao: AcaoDoSistema,
  unidadeOrcId?: string | undefined
): Promise<Autorizacao> {
  const usuario = await exigirUsuarioAtivo(tx, identificador, `ação ${acao}`);

  const vinculos = await tx.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: {
      perfil: {
        select: {
          nome: true,
          permissoes: {
            where: { acao },
            select: { unidadeOrcId: true },
          },
        },
      },
    },
  });

  // ── PORTA 3: sem perfil nenhum ──  (CAUSA 1: o VÍNCULO)
  if (vinculos.length === 0) {
    throw new Error(
      `ACESSO NEGADO — SEM PERFIL: o usuário "${identificador}" existe e está ativo, mas ` +
        `não tem PERFIL nenhum. Ele não pode NADA — e isso é o padrão: no SIAFIC nega-se ` +
        `por omissão, nunca se autoriza por esquecimento (TR 4.56). Vincule-o a um perfil. ` +
        `\n  o que faltou: O VÍNCULO — ele não tem crachá nenhum.` +
        `\n  (ação pedida: ${acao}). Nada foi gravado.`
    );
  }

  // ── PORTA 4: tem perfil, mas nenhum dá ESTA ação (ou não AQUI) ──
  for (const v of vinculos) {
    for (const p of v.perfil.permissoes) {
      // ⚠️ A PERMISSÃO GLOBAL (`unidadeOrcId` nulo) COBRE QUALQUER UG — inclusive o ato
      // que não tem UG. É a concessão explícita: "pode isto em qualquer lugar do ente".
      if (p.unidadeOrcId === null) {
        return {
          usuarioId: usuario.id,
          identificador,
          perfil: v.perfil.nome,
          unidadeOrcId: null,
        };
      }
      // ⚠️ A PERMISSÃO DE UMA UG SÓ COBRE AQUELA UG — e NÃO cobre o ato SEM UG. Um poder
      // de "pagar na Saúde" não autoriza fechar a competência do ente inteiro.
      if (unidadeOrcId !== undefined && p.unidadeOrcId === unidadeOrcId) {
        return {
          usuarioId: usuario.id,
          identificador,
          perfil: v.perfil.nome,
          unidadeOrcId: p.unidadeOrcId,
        };
      }
    }
  }

  const perfis = vinculos.map((v) => v.perfil.nome).join(", ");
  const escopo =
    unidadeOrcId !== undefined
      ? `na unidade gestora ${unidadeOrcId}`
      : `no escopo do ENTE (este ato não pertence a unidade nenhuma — só uma permissão ` +
        `GLOBAL o autoriza)`;

  // ⚠️ AS DUAS ÚLTIMAS CAUSAS SÃO DIFERENTES, E CONFUNDI-LAS CUSTA CARO.
  //
  // "Não tem permissão" responde à pergunta errada. Quando o TCE — ou o próprio servidor, às
  // 17h de um dia de fechamento — pergunta POR QUE ele não conseguiu, há duas respostas
  // possíveis, e elas pedem PROVIDÊNCIAS OPOSTAS:
  //   · O PERFIL NÃO TEM A AÇÃO  -> o crachá dele não concede isto em lugar nenhum. Quem
  //     resolve é o administrador, concedendo a ação ao perfil;
  //   · O PERFIL TEM A AÇÃO, MAS NOUTRA UG -> ele PODE fazer isto — só não AQUI. Quem resolve
  //     é o administrador, estendendo o escopo. É outro pedido, para outra pessoa.
  // Mandar as duas com o mesmo texto faz o servidor pedir a coisa errada, e o administrador
  // conceder poder a mais (a saída fácil é dar a permissão global e acabar com o incômodo — e
  // aí a segregação 6.5 morre em silêncio, por atrito de mensagem).
  const ondeEleTem = vinculos
    .flatMap((v) => v.perfil.permissoes)
    .map((p) => p.unidadeOrcId)
    .filter((ug): ug is string => ug !== null);

  const oQueFaltou =
    ondeEleTem.length === 0
      ? `A AÇÃO — nenhum dos perfis dele concede ${acao}, em unidade nenhuma. Não é ` +
        `escopo: é a ação. Conceda ${acao} ao perfil (TR 4.56).`
      : `O ESCOPO — ele TEM a ação ${acao}, mas só em: ${[...new Set(ondeEleTem)].join(", ")}. ` +
        `Não é a ação: é ONDE. A segregação por unidade gestora (TR 6.5) é o ponto — uma ` +
        `permissão de UMA unidade não vale nas outras, nem no ato do ente.`;

  throw new Error(
    `ACESSO NEGADO: o usuário "${identificador}" não tem permissão para ${acao} ${escopo}.\n` +
      `  perfis do usuário: ${perfis}\n` +
      `  o que faltou: ${oQueFaltou}\n` +
      `  (TR 4.56 · segregação de funções 6.4/6.5). Nada foi gravado.`
  );
}
