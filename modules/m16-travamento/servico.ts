import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "./acoes.js";
import { autorizar, exigirUsuarioAtivo } from "./autorizacao.js";
import {
  resolverJanela,
  zDestravarInput,
  zTravarInput,
  type DestravarInput,
  type TravarInput,
} from "./dominio.js";

/**
 * M16 — TRAVAR e DESTRAVAR. Dois serviços, um modelo.
 *
 * ═══ ⚠️ NÃO HÁ LOCK AQUI, E ISSO É UMA CONCLUSÃO, NÃO UM ESQUECIMENTO ═══
 * O `ORDEM_DOS_LOCKS` existe para o padrão SOMA-DECIDE-GRAVA: quando duas transações leem
 * o MESMO SALDO, as duas o acham suficiente, e as duas o consomem — e o saldo estoura. Foi
 * assim com a ficha, o contrato, a dívida e a virada do exercício.
 *
 * **O travamento não tem saldo.** Ele não é um recurso consumível: dois `travar()`
 * concorrentes gravam dois eventos, e os dois são válidos (append-only, o mais recente
 * decide). Nada estoura, nada fica negativo. Um lock aqui seria cerimônia — e cerimônia num
 * caminho por onde passa TODO lançamento do sistema custa caro.
 *
 * ═══ A SEMÂNTICA DA CORRIDA `travar()` × `lancarNoRazao()`, E ELA É PROVADA ═══
 * O guard lê a trava e grava o fato na MESMA transação. Sob READ COMMITTED:
 *
 *   · trava COMMITADA ANTES da leitura do guard  -> o lançamento a VÊ e é REJEITADO.
 *     É a garantia que importa, e o teste a prova com 5 lançamentos concorrentes.
 *
 *   · trava commitada DEPOIS da leitura do guard -> aquele lançamento PASSA.
 *     E está CERTO: no instante em que ele foi verificado, a trava não existia. Exigir o
 *     contrário significaria abortar transações já em curso — o que nenhum banco faz sem
 *     serializable, e o preço disso seria pago por todo lançamento do sistema para resolver
 *     uma corrida de milissegundos entre um ato ADMINISTRATIVO (fechar o mês) e um fato que
 *     já estava sendo gravado.
 *
 * O que o travamento promete é: **depois que a trava existe, nada mais entra.** É isso que
 * ele cumpre.
 */

export interface ResultadoTravamento {
  readonly eventoId: string;
  readonly janelaInicio: Date;
  readonly janelaFim: Date;
  readonly escopo: "GLOBAL" | "USUARIO";
}

async function registrar(
  prisma: PrismaClient,
  tipo: "TRAVAR" | "DESTRAVAR",
  // ⚠️ A AÇÃO VEM DE FORA, DO SERVIÇO PÚBLICO — e isso é uma exigência do GREP-TESTE, não
  // estilo. Ele confere que o corpo de `travar` contém `ACAO_DO_SERVICO.travar`: a ação
  // cobrada tem de ser a DAQUELE serviço. Escondida aqui dentro, a chamada existiria e o grep
  // não a veria — e um dia alguém trocaria a ação de um serviço pela do vizinho sem que nada
  // reclamasse.
  acao: AcaoDoSistema,
  d: {
    readonly competencia?: string | undefined;
    readonly janelaInicio?: Date | undefined;
    readonly janelaFim?: Date | undefined;
    readonly usuarioAlvo?: string | undefined;
    readonly motivo?: string | undefined;
    readonly criadoPor: string;
  }
): Promise<ResultadoTravamento> {
  const janela = resolverJanela(d);

  return prisma.$transaction(async (tx) => {
    // ⚠️ O PILOTO DO ENFORCEMENT (TR 4.56). Fechar e — sobretudo — REABRIR um período são
    // atos de CONTROLE, não de execução: quem empenha não deveria poder reabrir o mês em
    // que empenhou. É a segregação do 6.4, e é por isso que o travamento é o piloto.
    //
    // ⚠️ SEM UG: fechar a competência é ato do ENTE, não da Secretaria de Saúde. Só uma
    // permissão GLOBAL o autoriza — ver a nota em `autorizar`.
    await autorizar(tx, d.criadoPor, acao);

    // ⚠️ E O ALVO TEM DE EXISTIR — a CURA da pendência de a4f2bd6.
    //
    // O `usuarioAlvo` era uma string livre comparada com outra string livre (o `criadoPor`
    // do lançamento). Um typo — "alicce@cg.pb.gov.br" — travava ou destravava **NINGUÉM**,
    // e em SILÊNCIO: o evento era gravado, a tela dizia "março travado para a alice", e a
    // alice continuava lançando. Agora o alvo é conferido contra o cadastro.
    if (d.usuarioAlvo !== undefined) {
      await exigirUsuarioAtivo(
        tx,
        d.usuarioAlvo,
        `alvo do ${tipo} de competência`
      );
    }

    const evento = await tx.movimentoTravamento.create({
      data: {
        tipo,
        janelaInicio: janela.inicio,
        janelaFim: janela.fim,
        usuarioAlvo: d.usuarioAlvo ?? null,
        motivo: d.motivo ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return {
      eventoId: evento.id,
      janelaInicio: janela.inicio,
      janelaFim: janela.fim,
      escopo: d.usuarioAlvo === undefined ? "GLOBAL" : "USUARIO",
    };
  });
}

/**
 * TRAVA uma janela. TR 4.52 (mensal ou por data) · 4.53 (por período) · 4.54 (por usuário).
 *
 * `competencia: "2026-01"` -> o mês inteiro. `janelaInicio`/`janelaFim` -> o intervalo.
 * `usuarioAlvo` -> a trava vale SÓ para aquele autor (e vence a global, para ele).
 */
export async function travar(
  prisma: PrismaClient,
  input: TravarInput
): Promise<ResultadoTravamento> {
  return registrar(
    prisma,
    "TRAVAR",
    ACAO_DO_SERVICO.travar,
    zTravarInput.parse(input)
  );
}

/**
 * DESTRAVA uma janela — acrescentando um evento, NUNCA apagando a trava.
 *
 * ⚠️ O MOTIVO É OBRIGATÓRIO (mín. 10 caracteres). Fechar o mês é rotina; REABRIR um mês
 * fechado é o ato que o controle interno vai querer explicado — e o append-only guarda a
 * explicação para sempre, com o nome de quem a deu.
 */
export async function destravar(
  prisma: PrismaClient,
  input: DestravarInput
): Promise<ResultadoTravamento> {
  return registrar(
    prisma,
    "DESTRAVAR",
    ACAO_DO_SERVICO.destravar,
    zDestravarInput.parse(input)
  );
}

export { estaTravado } from "./guard.js";
