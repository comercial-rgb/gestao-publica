import { z } from "zod";

/**
 * M16 — TRAVAMENTO DE COMPETÊNCIA. DOMÍNIO PURO (sem I/O).
 *
 * TR 4.52 (travamento mensal ou por data) · TR 4.53 (bloqueio de lançamentos por período)
 * · TR 4.54 (bloqueio/desbloqueio por usuário).
 *
 * ═══ OS TRÊS REQUISITOS SÃO **UM** MODELO ═══
 * Parecem três coisas e são uma só: uma JANELA de datas (do fato), um ESCOPO (todo mundo
 * ou um usuário) e um SENTIDO (travar ou destravar).
 *
 *   4.52 mensal      -> janela = 1º ao último dia do mês, escopo GLOBAL
 *   4.52 "por data"  -> janela = intervalo arbitrário,     escopo GLOBAL
 *   4.53 por período -> idem (é o mesmo fato, com outro nome no TR)
 *   4.54 por usuário -> qualquer janela, escopo = UM USUÁRIO
 *
 * Três tabelas seriam três verdades sobre "este fato pode ser lançado?" — e o dia em que
 * discordassem, ninguém saberia qual delas o sistema obedeceu. Uma tabela, um `estaTravado`.
 *
 * ═══ ESTADO **DERIVADO**, NUNCA FLAG ═══
 * Não existe coluna `travado` em lugar nenhum. A trava é o que os EVENTOS append-only
 * dizem: destravar não APAGA a trava — acrescenta um `DESTRAVAR`. O histórico fica, com
 * motivo e autor, que é exatamente o que o TCE pergunta ("quem reabriu março, e por quê?").
 * É o mesmo desenho do encerramento do exercício (M08) e do estorno do razão (M01).
 */

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA
// ═══════════════════════════════════════════════════════════════════════════

const RE_COMPETENCIA = /^(\d{4})-(\d{2})$/;

/**
 * A janela MENSAL de uma competência "YYYY-MM": do 1º dia 00:00:00.000 ao último instante
 * do mês.
 *
 * ⚠️ O ÚLTIMO INSTANTE É `23:59:59.999`, e o milissegundo importa. Um fato gravado às
 * 23:59:59.500 de 31 de janeiro É de janeiro. Cortar em `23:59:59.000` deixaria uma fresta
 * de um segundo por onde passa exatamente o lançamento que alguém tentou esconder no fim do
 * mês travado.
 */
export function janelaDaCompetencia(competencia: string): {
  readonly inicio: Date;
  readonly fim: Date;
} {
  const m = RE_COMPETENCIA.exec(competencia);
  if (m === null) {
    throw new Error(
      `Competência "${competencia}" inválida — o formato é YYYY-MM (ex.: 2026-01).`
    );
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Competência "${competencia}": o mês ${mes} não existe.`);
  }
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)),
    fim: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
  };
}

/** Como a janela aparece nas mensagens de erro — a data do FATO, não a da digitação. */
export function descreverJanela(inicio: Date, fim: Date): string {
  const d = (x: Date): string =>
    `${String(x.getUTCDate()).padStart(2, "0")}/` +
    `${String(x.getUTCMonth() + 1).padStart(2, "0")}/` +
    `${x.getUTCFullYear()}`;
  return `${d(inicio)} a ${d(fim)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS EVENTOS
// ═══════════════════════════════════════════════════════════════════════════

export type TipoMovimentoTravamentoRepo = "TRAVAR" | "DESTRAVAR";

/** O que um evento precisa ter para a derivação decidir. */
export interface EventoDeTravamento {
  readonly id: string;
  readonly tipo: TipoMovimentoTravamentoRepo;
  readonly janelaInicio: Date;
  readonly janelaFim: Date;
  /** `null` = GLOBAL. Preenchido = a trava é SÓ daquele usuário (TR 4.54). */
  readonly usuarioAlvo: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface Travamento {
  readonly eventoId: string;
  readonly janelaInicio: Date;
  readonly janelaFim: Date;
  readonly escopo: "GLOBAL" | "USUARIO";
  /** Quem TRAVOU (o autor do evento) — não o autor do lançamento barrado. */
  readonly travadoPor: string;
  readonly usuarioAlvo: string | null;
}

/**
 * ⚠️ A DERIVAÇÃO — e a PRECEDÊNCIA é a parte que se erra.
 *
 * Duas regras, nesta ordem:
 *
 *   1. O ESCOPO **USUÁRIO** VENCE O GLOBAL. Se existe qualquer evento cujo `usuarioAlvo` é
 *      o autor do lançamento e cuja janela cobre o fato, é ELE que decide — os globais nem
 *      são olhados. É o que o TR 4.54 pede: "bloqueio/DESBLOQUEIO por usuário". O
 *      desbloqueio individual só faz sentido se puder vencer um travamento geral (é
 *      exatamente o caso "o mês está fechado, mas a contadora precisa corrigir um erro").
 *
 *   2. DENTRO DE CADA ESCOPO, O **ÚLTIMO** EVENTO VENCE. Append-only: destravar não apaga a
 *      trava, acrescenta um evento. Quem decide é o mais recente cuja janela cobre o fato.
 *
 * ═══ EXEMPLOS (e o terceiro é o que este desenho existe para acertar) ═══
 *
 *   (a) TRAVAR global 2026-01                     -> fato de 15/01 de QUALQUER autor: TRAVADO
 *   (b) TRAVAR global 2026-01 · DESTRAVAR global  -> fato de 15/01: destravado (o último vence)
 *   (c) TRAVAR global 2026-01 · DESTRAVAR alice   -> fato de 15/01 da ALICE: **destravado**
 *                                                    fato de 15/01 do BOB:   **travado**
 *   (d) DESTRAVAR global · TRAVAR alice           -> alice TRAVADA, o resto livre
 *
 * ⚠️ NÃO É "o mais restritivo vence". Se fosse, o (c) travaria a alice também — e o
 * desbloqueio por usuário do 4.54 não serviria para nada. E não é "o mais recente vence,
 * ponto": se fosse, um TRAVAR global posterior apagaria o desbloqueio da alice, e ela seria
 * barrada no meio da correção que alguém autorizou.
 *
 * SEM EVENTO NENHUM = DESTRAVADO. O sistema nasce aberto; travar é um ATO.
 */
export function derivarTravamento(
  eventos: readonly EventoDeTravamento[],
  dataTransacao: Date,
  autorDoLancamento: string
): Travamento | null {
  const cobre = (e: EventoDeTravamento): boolean =>
    e.janelaInicio <= dataTransacao && dataTransacao <= e.janelaFim;

  // ⚠️ ORDENAÇÃO ESTÁVEL: `criadoEm` e, no empate, o `id`. Dois eventos gravados no MESMO
  // milissegundo (o teste de concorrência os produz) não podem tornar a derivação um
  // sorteio — o sistema tem de responder a MESMA coisa toda vez que a pergunta for feita.
  const maisRecente = (a: EventoDeTravamento, b: EventoDeTravamento): number =>
    a.criadoEm.getTime() !== b.criadoEm.getTime()
      ? b.criadoEm.getTime() - a.criadoEm.getTime()
      : b.id.localeCompare(a.id);

  const doUsuario = eventos
    .filter((e) => e.usuarioAlvo === autorDoLancamento && cobre(e))
    .sort(maisRecente);

  // Regra 1: se o usuário tem evento próprio, os globais NÃO são olhados.
  const decisivos =
    doUsuario.length > 0
      ? doUsuario
      : eventos.filter((e) => e.usuarioAlvo === null && cobre(e)).sort(maisRecente);

  const decisor = decisivos[0];
  if (decisor === undefined || decisor.tipo === "DESTRAVAR") return null;

  return {
    eventoId: decisor.id,
    janelaInicio: decisor.janelaInicio,
    janelaFim: decisor.janelaFim,
    escopo: decisor.usuarioAlvo === null ? "GLOBAL" : "USUARIO",
    travadoPor: decisor.criadoPor,
    usuarioAlvo: decisor.usuarioAlvo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OS INPUTS
// ═══════════════════════════════════════════════════════════════════════════

const zJanela = z
  .object({
    /** Uma competência "YYYY-MM" (o mensal do 4.52) — ou o par de datas, abaixo. */
    competencia: z.string().optional(),
    janelaInicio: z.coerce.date().optional(),
    janelaFim: z.coerce.date().optional(),
  })
  .refine(
    (d) =>
      (d.competencia !== undefined) !==
      (d.janelaInicio !== undefined && d.janelaFim !== undefined),
    {
      message:
        'Informe OU uma `competencia` ("YYYY-MM", o travamento mensal do TR 4.52) OU o par ' +
        "`janelaInicio`/`janelaFim` (o travamento por data). Os dois juntos seriam duas " +
        "janelas para o mesmo evento, e o sistema teria de escolher uma — coisa que ele " +
        "não vai fazer.",
    }
  );

export const zTravarInput = z
  .object({
    /** `null`/ausente = GLOBAL. Preenchido = só aquele usuário (TR 4.54). */
    usuarioAlvo: z.string().min(1).optional(),
    /** No TRAVAR o motivo é OPCIONAL — fechar o mês é o curso normal das coisas. */
    motivo: z.string().trim().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .and(zJanela);

export const zDestravarInput = z
  .object({
    usuarioAlvo: z.string().min(1).optional(),
    /**
     * ⚠️ NO DESTRAVAR O MOTIVO É **OBRIGATÓRIO**, e a assimetria é deliberada. Fechar o mês
     * é rotina; REABRIR um mês fechado é o ato que o controle interno vai querer explicado.
     * O append-only guarda o motivo para sempre — e é ele que responde ao TCE a pergunta
     * "quem reabriu março, e por quê?".
     */
    motivo: z
      .string()
      .trim()
      .min(10, "O motivo do DESTRAVAMENTO precisa de ao menos 10 caracteres — reabrir um período fechado é o ato que o controle interno vai querer explicado."),
    criadoPor: z.string().min(1),
  })
  .and(zJanela);

export type TravarInput = z.input<typeof zTravarInput>;
export type DestravarInput = z.input<typeof zDestravarInput>;

/** Resolve a janela (competência mensal OU intervalo) e valida a ordem. */
export function resolverJanela(d: {
  readonly competencia?: string | undefined;
  readonly janelaInicio?: Date | undefined;
  readonly janelaFim?: Date | undefined;
}): { readonly inicio: Date; readonly fim: Date } {
  if (d.competencia !== undefined) return janelaDaCompetencia(d.competencia);

  const inicio = d.janelaInicio!;
  const fim = d.janelaFim!;
  if (fim < inicio) {
    throw new Error(
      `Janela invertida: início ${inicio.toISOString()} depois do fim ${fim.toISOString()}.`
    );
  }
  return { inicio, fim };
}
