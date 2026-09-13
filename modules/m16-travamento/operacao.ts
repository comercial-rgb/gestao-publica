import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "./autorizacao.js";

/**
 * M16 — O REGISTRO DE OPERAÇÃO E O CONTRATO DE COMANDO. TR 6.1 (registro), 6.2 (resultado),
 * 6.3 (LOCAL da operação).
 *
 * ═══ O QUE O RAZÃO **NÃO PODE** REGISTRAR, POR CONSTRUÇÃO ═══
 * O razão já responde QUEM (`criadoPor`) e QUANDO (`dataTransacao`, `criadoEm`) — para os fatos
 * que ACONTECERAM. Duas coisas ficam fora dele, e nenhuma por descuido:
 *
 *   1. **DE ONDE** (ip, agente). Um `LancamentoContabil` é um fato CONTÁBIL; o IP de quem o
 *      digitou não é dado contábil. Ele é dado de ACESSO — e mora aqui.
 *   2. **O QUE FOI NEGADO.** Quando a autorização recusa, NÃO HÁ FATO — mas a TENTATIVA
 *      existiu, e ela é o que o controle interno mais procura.
 *
 * ═══ AS TRÊS NATUREZAS DO REGISTRO (orquestração V3, 4.3) ═══
 *   1. **O fato e a auditoria autoritativa de sucesso, na MESMA transação real.** A linha
 *      `SUCESSO` é gravada pelo FUNIL (`lancarNoRazao`), dentro da transação do fato.
 *   2. **A tentativa negada, registrada FORA da transação** — para sobreviver ao rollback. Se
 *      esse registro falhar, quem sobe é o ERRO ORIGINAL.
 *   3. **A telemetria posterior** (`CONCLUIDA`, `NEGADO`, `ERRO`, `REPLAY`) nunca altera o
 *      resultado persistido: indisponibilidade de auditoria não vira "erro no empenho".
 *
 * ═══ SESSÃO NOTURNA V4 (3) — O CONTRATO DE COMANDO, E O QUE ELE CORRIGE ═══
 * A auditoria do snapshot 77cbcc9 executou o envelope anterior com portas em memória e
 * reproduziu (achados A01 e A02):
 *   · duas chamadas CONCORRENTES idênticas executaram o ato duas vezes — a consulta "já
 *     concluiu?" seguida do INSERT de INICIADA não era uma reserva atômica;
 *   · um ato NÃO contábil concluído cuja linha CONCLUIDA falhou foi executado de novo na
 *     repetição — o replay só enxergava o SUCESSO do funil;
 *   · A → B → A com a mesma chave executou três vezes — "outro fingerprint é outro comando"
 *     perdia a proteção da primeira repetição de A;
 *   · o replay devolvia a referência anterior SEM revalidar a autorização.
 *
 * O contrato que vale agora — uma chave é UMA INTENÇÃO IMUTÁVEL no escopo (ente, usuário, ação):
 *   · mesma chave + mesmo comando: mesmo resultado (a referência estável), sem novo efeito;
 *   · mesma chave + OUTRO comando: CONFLITO explícito — nova intenção recebe nova chave;
 *   · requisições concorrentes: UM efeito — a reserva é adquirida por INSERT sob índice único
 *     (`ComandoDeBorda`), e quem perde a corrida recebe "em andamento" ou o replay;
 *   · queda antes do commit: a reserva fica RESERVADO e, passado o prazo de abandono, a
 *     mesma intenção é RETOMADA — o detentor tardio, se ainda vivo, é derrubado na conclusão
 *     dentro da transação (`concluirComandoNaTransacao` recusa concluir uma reserva que já
 *     não é dele, e a transação do fato tardio cai);
 *   · commit concluído e resposta perdida: o replay recupera a referência (tipada: lançamento
 *     ou resultado do ato — nunca um id de lançamento fingindo ser o id do recurso);
 *   · permissão revogada: o replay REVALIDA a ação (e o usuário) antes de revelar a referência;
 *   · erro sem commit: a reserva é LIBERADA e a repetição legítima executa;
 *   · falha no log posterior: o resultado segue intacto e a reserva CONCLUÍDA (pelo funil,
 *     na tx do fato; ou pelo próprio ato, com `concluirComandoNaTransacao`) responde o replay.
 *
 * ⚠️ A JANELA QUE SOBRA, dita: um ato SEM lançamento que NÃO conclui a reserva dentro da
 * própria transação e cuja conclusão posterior falha fica RESERVADO. A repetição imediata
 * recebe "em andamento" (não duplica); só depois do PRAZO DE ABANDONO a intenção é retomada e
 * o ato repete. Fechar a janela é chamar `concluirComandoNaTransacao` dentro da transação do
 * ato — o funil já faz isso por todo fato contábil.
 *
 * ⚠️ SEM CHAVE não há reserva. O envelope RECUSA por padrão (`ComandoSemChaveError`): um
 * formulário enviado antes da hidratação chega sem chave e recebe uma mensagem clara. Um
 * chamador que não é formulário (job, rota) declara `semChave` com o motivo, e o motivo vai
 * para a linha INICIADA — degradação nomeada, nunca silenciosa.
 */

export type ResultadoDeOperacao = "INICIADA" | "SUCESSO" | "CONCLUIDA" | "NEGADO" | "ERRO" | "REPLAY";

export type EstadoDoComando = "RESERVADO" | "CONCLUIDO" | "LIBERADO";

/** O escopo quando o ente ainda não é cadastro: um só, do servidor, nunca do cliente. */
export const ESCOPO_DO_ENTE_UNICO = "ente";

/**
 * O PRAZO DE ABANDONO de uma reserva: passado ele sem conclusão nem liberação, a mesma
 * intenção pode ser retomada por outra tentativa. Longo o bastante para uma virada de
 * competência; curto o bastante para o operador não ficar preso a uma queda do servidor.
 */
export const PRAZO_DE_ABANDONO_MS = 15 * 60 * 1000;

export interface OperacaoRegistrada {
  /** O identificador do usuário — texto, não FK: um token forjado também se registra. */
  readonly usuarioIdent: string;
  /**
   * A ação tentada. String livre de propósito: cabem tanto as `AcaoDoSistema` do censo (EMPENHAR,
   * PAGAR) quanto os atos da própria borda (LOGIN, LOGOUT).
   */
  readonly acao: string;
  /** TR 6.3 — o LOCAL. Nulos são legítimos (um job interno não tem IP). */
  readonly ip?: string | undefined;
  readonly agente?: string | undefined;
  readonly resultado: ResultadoDeOperacao;
  /** A mensagem da negação, quando houve. É ela que responde "por quê". */
  readonly detalhe?: string | undefined;
  readonly chave?: string | null | undefined;
  readonly fingerprint?: string | null | undefined;
  readonly operacaoId?: string | null | undefined;
  readonly lancamentoId?: string | null | undefined;
  readonly resultadoRef?: string | null | undefined;
}

/** A reserva como está no banco — o que o perdedor da corrida lê. */
export interface ReservaDoComando {
  readonly id: string;
  readonly escopo: string;
  readonly usuarioIdent: string;
  readonly acao: string;
  readonly chave: string;
  readonly fingerprint: string;
  readonly estado: EstadoDoComando;
  readonly operacaoId: string;
  readonly tentativas: number;
  readonly reservadoEm: Date;
  readonly concluidoEm: Date | null;
  readonly tipoDoResultado: string | null;
  readonly resultadoRef: string | null;
}

export type ResultadoDaReserva =
  | { readonly adquirida: true; readonly id: string }
  | { readonly adquirida: false; readonly existente: ReservaDoComando };

export interface RegistroDeOperacaoPort {
  /** Grava uma linha de auditoria (append-only) e devolve o id dela. */
  registrar(op: OperacaoRegistrada, agora?: Date): Promise<string>;
  /**
   * A RESERVA ATÔMICA: insere a intenção sob o índice único ou devolve a existente. É a
   * primitiva que faz duas requisições concorrentes produzirem UM efeito.
   */
  reservar(
    p: {
      readonly escopo: string;
      readonly usuarioIdent: string;
      readonly acao: string;
      readonly chave: string;
      readonly fingerprint: string;
      readonly operacaoId: string;
    },
    agora: Date
  ): Promise<ResultadoDaReserva>;
  /**
   * RETOMA uma reserva LIBERADA, ou RESERVADA e abandonada (reservada antes de
   * `abandonadaAntesDe`). Guardada pelo `operacaoId` que se leu: só um retomador vence.
   */
  retomar(
    p: {
      readonly id: string;
      readonly operacaoIdAnterior: string;
      readonly operacaoId: string;
      readonly abandonadaAntesDe: Date | null;
    },
    agora: Date
  ): Promise<boolean>;
  /** CONCLUI a reserva desta operação (fora da tx — telemetria). `false` se ela já não é dela. */
  concluir(
    p: { readonly operacaoId: string; readonly tipoDoResultado: string; readonly resultadoRef: string | null },
    agora: Date
  ): Promise<boolean>;
  /** LIBERA a reserva desta operação depois de um erro sem commit. `false` se já não é dela. */
  liberar(p: { readonly operacaoId: string }, agora: Date): Promise<boolean>;
}

export function criarRegistroDeOperacaoPrisma(prisma: PrismaClient | Tx): RegistroDeOperacaoPort {
  const db = prisma as Tx;
  return {
    async registrar(op, agora = new Date()): Promise<string> {
      const r = await db.registroDeOperacao.create({
        data: {
          usuarioIdent: op.usuarioIdent,
          acao: op.acao,
          ip: op.ip ?? null,
          agente: op.agente ?? null,
          resultado: op.resultado,
          detalhe: op.detalhe ?? null,
          chave: op.chave ?? null,
          fingerprint: op.fingerprint ?? null,
          operacaoId: op.operacaoId ?? null,
          lancamentoId: op.lancamentoId ?? null,
          resultadoRef: op.resultadoRef ?? null,
          criadoEm: agora,
        },
        select: { id: true },
      });
      return r.id;
    },

    async reservar(p, agora): Promise<ResultadoDaReserva> {
      try {
        const r = await db.comandoDeBorda.create({
          data: { ...p, estado: "RESERVADO", reservadoEm: agora, criadoEm: agora },
          select: { id: true },
        });
        return { adquirida: true, id: r.id };
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
      }
      // Perdeu a corrida (ou a intenção já existia): lê quem detém.
      const existente = await db.comandoDeBorda.findUnique({
        where: {
          escopo_usuarioIdent_acao_chave: {
            escopo: p.escopo,
            usuarioIdent: p.usuarioIdent,
            acao: p.acao,
            chave: p.chave,
          },
        },
      });
      if (existente === null) {
        throw new Error(
          `RESERVA INCONSISTENTE: o INSERT do comando ${p.acao}/${p.chave} colidiu, mas a linha não está lá para ser lida.`
        );
      }
      return { adquirida: false, existente: { ...existente, estado: existente.estado as EstadoDoComando } };
    },

    async retomar(p, agora): Promise<boolean> {
      const r = await db.comandoDeBorda.updateMany({
        where: {
          id: p.id,
          operacaoId: p.operacaoIdAnterior,
          OR: [
            { estado: "LIBERADO" },
            ...(p.abandonadaAntesDe !== null
              ? [{ estado: "RESERVADO" as const, reservadoEm: { lt: p.abandonadaAntesDe } }]
              : []),
          ],
        },
        data: { estado: "RESERVADO", operacaoId: p.operacaoId, reservadoEm: agora, tentativas: { increment: 1 } },
      });
      return r.count === 1;
    },

    async concluir(p, agora): Promise<boolean> {
      // Reserva ainda aberta desta operação: conclui. Já concluída (pelo funil, na tx do fato):
      // só refina a referência para a do resultado do ato — o `concluidoEm` é o do fato.
      const aberta = await db.comandoDeBorda.updateMany({
        where: { operacaoId: p.operacaoId, estado: "RESERVADO" },
        data: { estado: "CONCLUIDO", concluidoEm: agora, tipoDoResultado: p.tipoDoResultado, resultadoRef: p.resultadoRef },
      });
      if (aberta.count === 1) return true;
      const refinada = await db.comandoDeBorda.updateMany({
        where: { operacaoId: p.operacaoId, estado: "CONCLUIDO" },
        data: { tipoDoResultado: p.tipoDoResultado, resultadoRef: p.resultadoRef },
      });
      return refinada.count === 1;
    },

    async liberar(p, _agora): Promise<boolean> {
      const r = await db.comandoDeBorda.updateMany({
        where: { operacaoId: p.operacaoId, estado: "RESERVADO" },
        data: { estado: "LIBERADO" },
      });
      return r.count === 1;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O COMANDO CORRENTE — o contexto que atravessa o ato até o funil
// ═══════════════════════════════════════════════════════════════════════════

export interface ComandoCorrente {
  readonly operacaoId: string;
  readonly usuarioIdent: string;
  readonly acao: string;
  readonly escopo: string;
  readonly chave: string | null;
  readonly fingerprint: string | null;
}

const contextoDoComando = new AsyncLocalStorage<ComandoCorrente>();

/** O comando em execução neste fluxo assíncrono — `undefined` fora de um envelope. */
export function comandoCorrente(): ComandoCorrente | undefined {
  return contextoDoComando.getStore();
}

/** Executa `corpo` como se fosse o ato de `comando` — para testes que simulam um detentor tardio. */
export function comoComandoCorrente<T>(comando: ComandoCorrente, corpo: () => Promise<T>): Promise<T> {
  return contextoDoComando.run(comando, corpo);
}

/** A reserva desta operação foi retomada por outra tentativa: o fato tardio NÃO pode commitar. */
export class ComandoRetomadoError extends Error {
  constructor(acao: string, operacaoId: string) {
    super(
      `COMANDO RETOMADO: a reserva de ${acao} (operação ${operacaoId}) já não pertence a esta tentativa — ` +
        `outra a retomou depois do prazo de abandono. Esta transação NÃO é gravada, para que o fato não nasça duas vezes.`
    );
    this.name = "ComandoRetomadoError";
  }
}

/**
 * CONCLUI A RESERVA DENTRO DA TRANSAÇÃO DO FATO — o que fecha a janela "commitou e o log
 * posterior falhou": se a transação cai, a conclusão cai junto; se commita, o replay já tem
 * a referência. O funil chama com `tipoDoResultado = "lancamento"`; um ato sem lançamento
 * chama com `"resultado"` e a sua própria referência. Fora de um comando com chave não faz
 * nada. Se a reserva já não é desta operação (retomada), ESTOURA — e derruba a transação.
 */
export async function concluirComandoNaTransacao(
  tx: Tx,
  tipoDoResultado: "lancamento" | "resultado",
  resultadoRef: string | null,
  agora: Date = new Date()
): Promise<void> {
  const comando = comandoCorrente();
  if (comando === undefined || comando.chave === null) return;
  const aberta = await tx.comandoDeBorda.updateMany({
    where: { operacaoId: comando.operacaoId, estado: "RESERVADO" },
    data: { estado: "CONCLUIDO", concluidoEm: agora, tipoDoResultado, resultadoRef },
  });
  if (aberta.count === 1) return;
  // Já concluída por esta mesma operação (dois lançamentos no mesmo ato): a primeira referência fica.
  const minha = await tx.comandoDeBorda.count({ where: { operacaoId: comando.operacaoId, estado: "CONCLUIDO" } });
  if (minha === 1) return;
  throw new ComandoRetomadoError(comando.acao, comando.operacaoId);
}

/**
 * A LINHA `SUCESSO`, NA TRANSAÇÃO DO FATO — chamada pelo funil (`lancarNoRazao`), com a
 * `tx` que o serviço lhe passou. Uma por lançamento. Fora de um envelope não faz nada:
 * seeds, jobs e testes que chamam o funil direto não são comandos de usuário.
 */
export async function registrarSucessoNaTransacao(tx: Tx, lancamentoId: string, agora: Date = new Date()): Promise<void> {
  const comando = comandoCorrente();
  if (comando === undefined) return;
  await tx.registroDeOperacao.create({
    data: {
      usuarioIdent: comando.usuarioIdent,
      acao: comando.acao,
      resultado: "SUCESSO",
      chave: comando.chave,
      fingerprint: comando.fingerprint,
      operacaoId: comando.operacaoId,
      lancamentoId,
      criadoEm: agora,
    },
    select: { id: true },
  });
  await concluirComandoNaTransacao(tx, "lancamento", lancamentoId, agora);
}

// ═══════════════════════════════════════════════════════════════════════════
// OS ERROS NOMEADOS DA BORDA
// ═══════════════════════════════════════════════════════════════════════════

/** O mesmo comando (chave + fingerprint) já concluiu: a resposta se perdeu, o fato não. */
export class ComandoJaConcluidoError extends Error {
  constructor(
    readonly acao: string,
    readonly concluidoEm: Date,
    readonly tipoDoResultado: string | null,
    readonly resultadoRef: string | null
  ) {
    const ref =
      resultadoRef !== null
        ? ` — ${tipoDoResultado === "lancamento" ? "lançamento" : "referência"} ${resultadoRef}`
        : "";
    super(
      `COMANDO JÁ CONCLUÍDO: este mesmo comando (${acao}) foi recebido e concluído em ` +
        `${concluidoEm.toISOString()}${ref}. ` +
        `A resposta anterior se perdeu, mas o fato foi gravado UMA vez e não será repetido. ` +
        `Recarregue a lista para vê-lo. Nada foi gravado de novo.`
    );
    this.name = "ComandoJaConcluidoError";
  }
}

/** A mesma chave chegou com OUTRO comando: a intenção mudou, e intenção nova pede chave nova. */
export class ComandoEmConflitoError extends Error {
  constructor(readonly acao: string) {
    super(
      `COMANDO EM CONFLITO: esta chave de comando (${acao}) já identifica OUTRO conteúdo. Uma chave é uma ` +
        `intenção só — para enviar um comando diferente, recarregue o formulário e envie de novo. Nada foi gravado.`
    );
    this.name = "ComandoEmConflitoError";
  }
}

/** O mesmo comando está em execução por outra requisição (ou o detentor caiu há pouco). */
export class ComandoEmAndamentoError extends Error {
  constructor(readonly acao: string, readonly reservadoEm: Date) {
    super(
      `COMANDO EM ANDAMENTO: este mesmo comando (${acao}) já está sendo executado desde ` +
        `${reservadoEm.toISOString()}. Aguarde e recarregue a lista — se ele concluiu, o resultado está lá; ` +
        `se falhou, o formulário aceita o reenvio. Nada foi gravado por esta tentativa.`
    );
    this.name = "ComandoEmAndamentoError";
  }
}

/** O comando chegou sem chave de idempotência — e o chamador não declarou por quê. */
export class ComandoSemChaveError extends Error {
  constructor(readonly acao: string) {
    super(
      `COMANDO SEM CHAVE: a página ainda não tinha terminado de carregar quando este comando (${acao}) foi ` +
        `enviado, e sem a chave o sistema não consegue garantir que ele não se repita. Recarregue a página e ` +
        `envie de novo. Nada foi gravado.`
    );
    this.name = "ComandoSemChaveError";
  }
}

/** O registro INICIADA (ou a reserva) não pôde ser gravado — a auditoria está indisponível ANTES do ato. */
export class AuditoriaIndisponivelError extends Error {
  constructor(acao: string, causa: unknown) {
    super(
      `AUDITORIA INDISPONÍVEL: não foi possível registrar a tentativa de ${acao} antes de ` +
        `executá-la (${causa instanceof Error ? causa.message : String(causa)}). O ato não foi ` +
        `iniciado — um comando sem tentativa registrada seria um fato sem rastro. Tente de novo.`
    );
    this.name = "AuditoriaIndisponivelError";
  }
}

/** Uma falha de registro POSTERIOR ao ato — vai para a telemetria, nunca para o usuário. */
export interface FalhaDeTelemetria {
  readonly fase: "CONCLUIDA" | "NEGADO" | "ERRO" | "REPLAY" | "LIBERAR";
  readonly operacaoId: string;
  readonly usuarioIdent: string;
  readonly acao: string;
  readonly causa: unknown;
}

export type Telemetria = (falha: FalhaDeTelemetria) => void;

/** A telemetria padrão: o console do servidor. Não lança, nunca. */
export const telemetriaNoConsole: Telemetria = (f) => {
  const causa = f.causa instanceof Error ? f.causa.message : String(f.causa);
  console.error(
    `[operacao] registro ${f.fase} FALHOU para ${f.acao} de ${f.usuarioIdent} (operação ${f.operacaoId}): ${causa}`
  );
};

/** NEGADO × ERRO — a distinção que o controle interno filtra. */
export function ehNegacao(mensagem: string): boolean {
  return (
    mensagem.includes("ACESSO NEGADO") ||
    mensagem.includes("USUÁRIO INATIVO") ||
    mensagem.includes("USUÁRIO NÃO CADASTRADO")
  );
}

/** A referência do resultado, curta e serializável — ou nula quando não dá para resumir. */
export function referenciaDe(r: unknown): string | null {
  if (r === undefined || r === null) return null;
  if (typeof r === "string" || typeof r === "number" || typeof r === "boolean") return String(r).slice(0, 200);
  try {
    const json = JSON.stringify(r);
    return json.length <= 400 ? json : json.slice(0, 397) + "...";
  } catch {
    return null;
  }
}

export interface ContextoDoEnvelope {
  readonly usuarioIdent: string;
  readonly acao: string;
  readonly ip?: string | undefined;
  readonly agente?: string | undefined;
  /** O escopo do comando (o ente). Do servidor. Default: o ente único. */
  readonly escopo?: string | undefined;
  /** A chave de idempotência do comando (do formulário). Sem ela, o envelope recusa — salvo `semChave`. */
  readonly chave?: string | null | undefined;
  readonly fingerprint?: string | null | undefined;
  /**
   * O motivo declarado de um comando SEM chave (um chamador que não é formulário). Vai para a
   * linha INICIADA. Sem isto, chave ausente é recusa (`ComandoSemChaveError`).
   */
  readonly semChave?: string | undefined;
  /**
   * REVALIDA a autorização antes de revelar um replay: o usuário ainda existe, está ativo e
   * ainda tem a ação. Estoura com a mensagem de negação. Sem ela, o replay não revela nada
   * (fail-closed) — só diz que o comando já foi recebido.
   */
  readonly revalidar?: (() => Promise<void>) | undefined;
}

/**
 * O ENVELOPE DA BORDA — em duas fases, com a reserva atômica e a resposta verdadeira.
 *
 * 1. INICIADA, fora da tx. Se falhar, `AuditoriaIndisponivelError` — o ato não roda.
 * 2. A RESERVA (com chave): INSERT sob índice único. Perdeu? conflito, replay (revalidado),
 *    em andamento, ou retomada (liberada / abandonada).
 * 3. O ato, dentro do contexto do comando: o funil (ou o ato) conclui a reserva na tx do fato.
 * 4. CONCLUIDA (ou NEGADO/ERRO) fora da tx; a reserva é concluída (se o funil não o fez) ou
 *    liberada. Se falhar: telemetria, e o resultado (ou o erro ORIGINAL) segue intacto.
 */
export async function comOperacaoRegistrada<T>(
  porta: RegistroDeOperacaoPort,
  contexto: ContextoDoEnvelope,
  ato: () => Promise<T>,
  agora: Date = new Date(),
  telemetria: Telemetria = telemetriaNoConsole
): Promise<T> {
  const chave = contexto.chave ?? null;
  const fingerprint = contexto.fingerprint ?? null;
  const escopo = contexto.escopo ?? ESCOPO_DO_ENTE_UNICO;
  const base = { usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, ip: contexto.ip, agente: contexto.agente };

  // ── 1. A TENTATIVA, ANTES DE TUDO ──
  let operacaoId: string;
  try {
    operacaoId = await porta.registrar(
      {
        ...base,
        chave,
        fingerprint,
        resultado: "INICIADA",
        detalhe: chave === null && contexto.semChave !== undefined ? `sem chave: ${contexto.semChave}` : undefined,
      },
      agora
    );
  } catch (causa) {
    throw new AuditoriaIndisponivelError(contexto.acao, causa);
  }

  const registrarDepois = async (
    fase: "CONCLUIDA" | "NEGADO" | "ERRO" | "REPLAY",
    detalhe: string | undefined,
    resultadoRef: string | null = null
  ): Promise<void> => {
    try {
      await porta.registrar({ ...base, chave, fingerprint, operacaoId, resultado: fase, detalhe, resultadoRef }, agora);
    } catch (causa) {
      telemetria({ fase, operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, causa });
    }
  };

  // ── 2. A RESERVA ──
  if (chave === null) {
    if (contexto.semChave === undefined) {
      const e = new ComandoSemChaveError(contexto.acao);
      await registrarDepois("ERRO", e.message);
      throw e;
    }
  } else {
    if (fingerprint === null) {
      const e = new Error(`COMANDO SEM FINGERPRINT: a chave ${chave} de ${contexto.acao} chegou sem o resumo do conteúdo.`);
      await registrarDepois("ERRO", e.message);
      throw e;
    }
    let reserva: ResultadoDaReserva;
    try {
      reserva = await porta.reservar({ escopo, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, chave, fingerprint, operacaoId }, agora);
    } catch (causa) {
      throw new AuditoriaIndisponivelError(contexto.acao, causa);
    }
    if (!reserva.adquirida) {
      const ex = reserva.existente;
      if (ex.fingerprint !== fingerprint) {
        const e = new ComandoEmConflitoError(contexto.acao);
        await registrarDepois("ERRO", e.message);
        throw e;
      }
      if (ex.estado === "CONCLUIDO") {
        // ⚠️ REVALIDA ANTES DE REVELAR: a sessão válida não substitui a ação.
        if (contexto.revalidar !== undefined) {
          try {
            await contexto.revalidar();
          } catch (e) {
            const mensagem = e instanceof Error ? e.message : String(e);
            await registrarDepois(ehNegacao(mensagem) ? "NEGADO" : "ERRO", `replay recusado: ${mensagem}`);
            throw e;
          }
        }
        const e = new ComandoJaConcluidoError(
          contexto.acao,
          ex.concluidoEm ?? ex.reservadoEm,
          contexto.revalidar !== undefined ? ex.tipoDoResultado : null,
          contexto.revalidar !== undefined ? ex.resultadoRef : null
        );
        await registrarDepois("REPLAY", e.message, ex.resultadoRef);
        throw e;
      }
      const abandonadaAntesDe = new Date(agora.getTime() - PRAZO_DE_ABANDONO_MS);
      const retomavel = ex.estado === "LIBERADO" || ex.reservadoEm < abandonadaAntesDe;
      if (!retomavel) {
        const e = new ComandoEmAndamentoError(contexto.acao, ex.reservadoEm);
        await registrarDepois("ERRO", e.message);
        throw e;
      }
      let retomou: boolean;
      try {
        retomou = await porta.retomar(
          { id: ex.id, operacaoIdAnterior: ex.operacaoId, operacaoId, abandonadaAntesDe: ex.estado === "LIBERADO" ? null : abandonadaAntesDe },
          agora
        );
      } catch (causa) {
        throw new AuditoriaIndisponivelError(contexto.acao, causa);
      }
      if (!retomou) {
        const e = new ComandoEmAndamentoError(contexto.acao, ex.reservadoEm);
        await registrarDepois("ERRO", e.message);
        throw e;
      }
    }
  }

  const comando: ComandoCorrente = { operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, escopo, chave, fingerprint };

  // ── 3. O ATO, no contexto do comando ──
  let resultado: T;
  try {
    resultado = await contextoDoComando.run(comando, ato);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    const fase = ehNegacao(mensagem) ? "NEGADO" : "ERRO";
    // ── 4b. A NEGAÇÃO (ou o erro), FORA da tx — e o erro ORIGINAL é o que sobe ──
    await registrarDepois(fase, mensagem);
    if (chave !== null) {
      try {
        await porta.liberar({ operacaoId }, agora);
      } catch (causa) {
        telemetria({ fase: "LIBERAR", operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, causa });
      }
    }
    throw e;
  }

  // ── 4a. A CONCLUSÃO, FORA da tx — e o resultado segue intacto mesmo que ela falhe ──
  const ref = referenciaDe(resultado);
  if (chave !== null) {
    try {
      await porta.concluir({ operacaoId, tipoDoResultado: "resultado", resultadoRef: ref }, agora);
    } catch (causa) {
      telemetria({ fase: "CONCLUIDA", operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, causa });
    }
  }
  await registrarDepois("CONCLUIDA", undefined, ref);
  return resultado;
}
