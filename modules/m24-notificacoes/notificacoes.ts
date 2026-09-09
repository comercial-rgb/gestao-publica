import type { PrismaClient } from "../../prisma/generated/client/client.js";

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * M24 — NOTIFICAÇÕES. Um serviço, três canais, e só um deles existe.
 *
 * ═══ ⚠️ POR QUE NOTIFICAR NÃO É UMA AÇÃO DO CENSO ═══
 * Notificar não é ato do usuário: é o sistema contando o que aconteceu. Exigir
 * permissão para notificar permitiria a alguém agir SEM avisar ninguém — que é
 * exatamente o oposto do que a notificação existe para garantir. Mesma razão de
 * `comOperacaoRegistrada` (M16) estar fora do censo.
 *
 * ═══ ⚠️ E-MAIL E PUSH NÃO SÃO ENVIADOS — E O REGISTRO DIZ ISSO EM VOZ ALTA ═══
 * Não há provedor configurado, e envio de mensagem externa está fora da autorização
 * de trabalho deste repositório. Então a notificação é GRAVADA com `entregueEm` nulo
 * e o motivo declarado.
 *
 * A tentação seria não gravar nada — e ela é o erro. O dia em que o provedor existir,
 * a fila do que não saiu É a lista de trabalho da integração. Gravar `entregueEm` sem
 * entrega seria pior ainda: um comprovante fabricado, indistinguível do verdadeiro.
 */

export const MOTIVO_CANAL_INDISPONIVEL =
  "Canal sem provedor configurado neste ambiente. A notificação fica REGISTRADA e " +
  "NÃO ENVIADA — ver docs do lote (pendência NOTIFICACAO-EMAIL-PUSH). Nenhuma " +
  "mensagem externa sai deste repositório.";

export interface NotificacaoParaRegistrar {
  /** `identificador` do usuário, ou o contato de um requerente externo. */
  readonly destinatario: string;
  /** "TRAMITE_RECEBIDO", "PARECER_SOLICITADO", "PRAZO_PROXIMO_DO_FIM"... */
  readonly evento: string;
  readonly titulo: string;
  readonly corpo: string;
  /** Rota INTERNA. Nunca URL absoluta — ver o schema. */
  readonly rota?: string | undefined;
  readonly canal?: "SISTEMA" | "EMAIL" | "PUSH" | undefined;
}

/**
 * REGISTRA a notificação. Dentro da transação do fato, de propósito.
 *
 * ⚠️ AQUI É O OPOSTO DO LOG DE OPERAÇÃO, e a diferença é deliberada. O log do M16 fica
 * FORA da transação porque ele tem de sobreviver ao rollback — é a prova de que alguém
 * TENTOU. A notificação tem de morrer com o rollback: avisar "seu processo foi
 * tramitado" sobre um trâmite que não foi gravado é avisar uma mentira.
 */
export async function registrarNotificacao(
  tx: Tx,
  n: NotificacaoParaRegistrar
): Promise<{ readonly id: string }> {
  const canal = n.canal ?? "SISTEMA";

  // ⚠️ SÓ O CANAL INTERNO NASCE ENTREGUE — e ele nasce entregue porque a entrega É a
  // gravação: a notificação de sistema está na caixa do destinatário no instante em
  // que a linha existe. Não há transporte entre uma coisa e outra que possa falhar.
  const entregue = canal === "SISTEMA";

  const criada = await tx.notificacao.create({
    data: {
      destinatario: n.destinatario,
      evento: n.evento,
      titulo: n.titulo,
      corpo: n.corpo,
      rota: n.rota ?? null,
      canal,
      entregueEm: entregue ? new Date() : null,
      motivoIndisponivel: entregue ? null : MOTIVO_CANAL_INDISPONIVEL,
    },
    select: { id: true },
  });
  return { id: criada.id };
}

/**
 * NOTIFICA VÁRIOS DESTINATÁRIOS de uma vez, sem duplicar o mesmo destinatário.
 *
 * ⚠️ A DEDUPLICAÇÃO IMPORTA: quem é ao mesmo tempo o requerente e o responsável de um
 * processo receberia dois avisos idênticos do mesmo trâmite, e o segundo ensina a
 * ignorar o primeiro.
 */
export async function notificarVarios(
  tx: Tx,
  destinatarios: readonly string[],
  n: Omit<NotificacaoParaRegistrar, "destinatario">
): Promise<number> {
  const unicos = [...new Set(destinatarios.filter((d) => d.trim() !== ""))];
  for (const destinatario of unicos) {
    await registrarNotificacao(tx, { ...n, destinatario });
  }
  return unicos.length;
}

/**
 * O ESTADO DOS CANAIS EXTERNOS — o mesmo desenho do envio ao banco do T07.
 *
 * ⚠️ `disponivel` É O LITERAL `false`, NÃO `boolean`. Com o tipo assim, o caminho
 * feliz não compila: ninguém acrescenta um `if (estado.disponivel) enviar()` sem antes
 * apagar o tipo — e apagar um tipo é uma decisão visível na revisão.
 */
export interface EnvioExterno {
  readonly disponivel: false;
  readonly motivo: string;
  readonly detalhe: string;
}

export function estadoDoEnvioExterno(canal: "EMAIL" | "PUSH"): EnvioExterno {
  return {
    disponivel: false,
    motivo: `Canal ${canal} indisponível: nenhum provedor configurado.`,
    detalhe: MOTIVO_CANAL_INDISPONIVEL,
  };
}
