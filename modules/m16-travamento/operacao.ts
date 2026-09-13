import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "./autorizacao.js";

/**
 * M16 — O REGISTRO DE OPERAÇÃO. TR 6.1 (registro), 6.2 (resultado), 6.3 (LOCAL da operação).
 *
 * ═══ O QUE O RAZÃO **NÃO PODE** REGISTRAR, POR CONSTRUÇÃO ═══
 * O razão já responde QUEM (`criadoPor`) e QUANDO (`dataTransacao`, `criadoEm`) — para os fatos
 * que ACONTECERAM. Duas coisas ficam fora dele, e nenhuma por descuido:
 *
 *   1. **DE ONDE** (ip, agente). Um `LancamentoContabil` é um fato CONTÁBIL; o IP de quem o
 *      digitou não é dado contábil. Ele é dado de ACESSO — e mora aqui.
 *   2. **O QUE FOI NEGADO.** Quando a autorização recusa, NÃO HÁ FATO — mas a TENTATIVA
 *      existiu, e ela é o que o controle interno mais procura. Sem este registro, o sistema
 *      protege e não conta a ninguém que protegeu.
 *
 * ═══ ORQUESTRAÇÃO V3 (4.3) — A RESPOSTA VERDADEIRA, E O DEFEITO QUE ELA CORRIGE ═══
 * O envelope antigo gravava UMA linha DEPOIS do ato e RE-LANÇAVA qualquer falha — inclusive
 * a falha do próprio registro. Duas consequências, reproduzidas em `m16-operacao.test.ts`:
 *
 *   · o ato CONCLUÍA (transação commitada), o registro de sucesso falhava, e a interface
 *     recebia ERRO. O operador repetia o comando — e o fato financeiro nascia duas vezes;
 *   · a negação era registrada e, se o registro falhasse, o erro que subia era o do LOG
 *     ("cannot insert…"), e não o "ACESSO NEGADO" que explica o que aconteceu.
 *
 * O registro passa a ter TRÊS naturezas, separadas porque pedem garantias opostas:
 *
 *   1. **O fato e a auditoria autoritativa de sucesso, na MESMA transação real.** A linha
 *      `SUCESSO` é gravada pelo FUNIL (`lancarNoRazao`), dentro da transação do fato, com o
 *      `lancamentoId`. Se a transação cai, ela cai junto; se commita, ela commita junto. Não
 *      há transação de fachada por fora dos adapters: o funil já recebe a `tx` de todo
 *      serviço, e é por isso que o comando corrente viaja por `AsyncLocalStorage` — sem mudar
 *      a assinatura de 76 serviços.
 *   2. **A tentativa negada, registrada FORA da transação** — para sobreviver ao rollback que
 *      a própria negação provoca. Se esse registro falhar, quem sobe é o ERRO ORIGINAL, e a
 *      falha do registro vai para a telemetria.
 *   3. **A telemetria posterior** (`CONCLUIDA`, com a referência do resultado; `NEGADO`;
 *      `ERRO`) nunca altera o resultado persistido: falhou o registro depois de o fato
 *      commitar, o chamador recebe o resultado do mesmo jeito, e a falha vai para a
 *      telemetria. Indisponibilidade de auditoria não vira "erro no empenho".
 *
 * ═══ AS LINHAS, APPEND-ONLY, POR COMANDO ═══
 *   INICIADA  — antes do ato, fora da tx. Carrega chave e fingerprint. É a tentativa.
 *   SUCESSO   — dentro da tx do fato, pelo funil, uma por lançamento (`lancamentoId`).
 *   CONCLUIDA — depois da tx, com `resultadoRef` (JSON curto) para o replay responder.
 *   NEGADO / ERRO — depois, fora da tx, com o detalhe.
 * Nenhuma linha é atualizada: o papel de runtime só tem INSERT nesta tabela, e o
 * `operacaoId` liga as conclusões à tentativa.
 *
 * ═══ O REPLAY IDEMPOTENTE — resposta perdida não duplica fato financeiro ═══
 * Com `chave` (o formulário a manda) e `fingerprint` (o sha256 do comando canônico), o
 * mesmo comando repetido pelo MESMO usuário na MESMA ação encontra a conclusão anterior e
 * é recusado nomeando — `ComandoJaConcluidoError`, com a referência do resultado — sem
 * executar o ato de novo. A mesma chave com OUTRO fingerprint é outro comando (o operador
 * corrigiu um campo depois de um erro de validação) e executa. Sem chave, não há replay.
 *
 * ⚠️ A JANELA QUE SOBRA, dita: um comando SEM lançamento (cadastro) cuja linha CONCLUIDA
 * falhou não deixa `SUCESSO` (o funil não passou) — o replay não o encontra e o repete.
 * É cadastro, não dinheiro; para o dinheiro, o funil fecha a janela.
 */

export type ResultadoDeOperacao = "INICIADA" | "SUCESSO" | "CONCLUIDA" | "NEGADO" | "ERRO";

export interface OperacaoRegistrada {
  /** O identificador do usuário — texto, não FK: um token forjado também se registra. */
  readonly usuarioIdent: string;
  /**
   * A ação tentada. String livre de propósito: cabem tanto as `AcaoDoSistema` do censo (EMPENHAR,
   * PAGAR) quanto os atos da própria borda (LOGIN, LOGOUT). Um log que RECUSA o que ainda não
   * classificou é um log que perde justamente o evento novo — que é sempre o mais interessante.
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

export interface ConclusaoAnterior {
  readonly operacaoId: string | null;
  readonly resultado: ResultadoDeOperacao;
  readonly fingerprint: string | null;
  readonly resultadoRef: string | null;
  readonly criadoEm: Date;
}

export interface RegistroDeOperacaoPort {
  /** Grava uma linha e devolve o id dela. */
  registrar(op: OperacaoRegistrada, agora?: Date): Promise<string>;
  /**
   * A conclusão anterior de um comando com chave (SUCESSO ou CONCLUIDA), se houver — a
   * pergunta do replay. `null` quando nunca concluiu.
   */
  conclusaoAnterior(p: {
    readonly usuarioIdent: string;
    readonly acao: string;
    readonly chave: string;
  }): Promise<ConclusaoAnterior | null>;
}

export function criarRegistroDeOperacaoPrisma(
  prisma: PrismaClient | Tx
): RegistroDeOperacaoPort {
  return {
    async registrar(op, agora = new Date()): Promise<string> {
      const r = await (prisma as Tx).registroDeOperacao.create({
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
    async conclusaoAnterior(p): Promise<ConclusaoAnterior | null> {
      const r = await (prisma as Tx).registroDeOperacao.findFirst({
        where: {
          usuarioIdent: p.usuarioIdent,
          acao: p.acao,
          chave: p.chave,
          resultado: { in: ["SUCESSO", "CONCLUIDA"] },
        },
        // CONCLUIDA tem a referência do resultado; SUCESSO só prova que o fato commitou.
        orderBy: [{ criadoEm: "desc" }],
        select: { operacaoId: true, resultado: true, fingerprint: true, resultadoRef: true, criadoEm: true },
      });
      return r === null ? null : { ...r, resultado: r.resultado as ResultadoDeOperacao };
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
  readonly chave: string | null;
  readonly fingerprint: string | null;
}

const contextoDoComando = new AsyncLocalStorage<ComandoCorrente>();

/** O comando em execução neste fluxo assíncrono — `undefined` fora de um envelope. */
export function comandoCorrente(): ComandoCorrente | undefined {
  return contextoDoComando.getStore();
}

/**
 * A LINHA `SUCESSO`, NA TRANSAÇÃO DO FATO — chamada pelo funil (`lancarNoRazao`), com a
 * `tx` que o serviço lhe passou. Uma por lançamento. Fora de um envelope não faz nada:
 * seeds, jobs e testes que chamam o funil direto não são comandos de usuário.
 */
export async function registrarSucessoNaTransacao(
  tx: Tx,
  lancamentoId: string,
  agora: Date = new Date()
): Promise<void> {
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
}

// ═══════════════════════════════════════════════════════════════════════════
// OS ERROS NOMEADOS DA BORDA
// ═══════════════════════════════════════════════════════════════════════════

/** O mesmo comando (chave + fingerprint) já concluiu: a resposta se perdeu, o fato não. */
export class ComandoJaConcluidoError extends Error {
  constructor(
    readonly acao: string,
    readonly concluidoEm: Date,
    readonly resultadoRef: string | null
  ) {
    super(
      `COMANDO JÁ CONCLUÍDO: este mesmo comando (${acao}) foi recebido e concluído em ` +
        `${concluidoEm.toISOString()}${resultadoRef !== null ? ` — referência ${resultadoRef}` : ""}. ` +
        `A resposta anterior se perdeu, mas o fato foi gravado UMA vez e não será repetido. ` +
        `Recarregue a lista para vê-lo. Nada foi gravado de novo.`
    );
    this.name = "ComandoJaConcluidoError";
  }
}

/** O registro INICIADA não pôde ser gravado — a auditoria está indisponível ANTES do ato. */
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
  readonly fase: "CONCLUIDA" | "NEGADO" | "ERRO";
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
function referenciaDe(r: unknown): string | null {
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
  /** A chave de idempotência do comando (do formulário). Sem ela, sem replay. */
  readonly chave?: string | null | undefined;
  readonly fingerprint?: string | null | undefined;
}

/**
 * O ENVELOPE DA BORDA — em duas fases, com a resposta verdadeira.
 *
 * 1. Replay: com chave, procura a conclusão anterior do MESMO comando (mesmo fingerprint) e
 *    recusa nomeando, sem executar. Fingerprint diferente = outro comando.
 * 2. INICIADA, fora da tx. Se falhar, `AuditoriaIndisponivelError` — o ato não roda.
 * 3. O ato, dentro do contexto do comando: o funil grava SUCESSO na transação do fato.
 * 4. CONCLUIDA (ou NEGADO/ERRO), fora da tx. Se falhar: telemetria, e o resultado (ou o erro
 *    ORIGINAL) segue intacto para o chamador.
 */
export async function comOperacaoRegistrada<T>(
  porta: RegistroDeOperacaoPort,
  contexto: ContextoDoEnvelope,
  ato: () => Promise<T>,
  agora?: Date,
  telemetria: Telemetria = telemetriaNoConsole
): Promise<T> {
  const chave = contexto.chave ?? null;
  const fingerprint = contexto.fingerprint ?? null;

  // ── 1. O REPLAY ──
  if (chave !== null) {
    const anterior = await porta.conclusaoAnterior({
      usuarioIdent: contexto.usuarioIdent,
      acao: contexto.acao,
      chave,
    });
    if (anterior !== null && anterior.fingerprint === fingerprint) {
      throw new ComandoJaConcluidoError(contexto.acao, anterior.criadoEm, anterior.resultadoRef);
    }
  }

  // ── 2. A TENTATIVA, ANTES DO ATO ──
  let operacaoId: string;
  try {
    operacaoId = await porta.registrar(
      { ...contexto, chave, fingerprint, resultado: "INICIADA" },
      agora
    );
  } catch (causa) {
    throw new AuditoriaIndisponivelError(contexto.acao, causa);
  }

  const comando: ComandoCorrente = {
    operacaoId,
    usuarioIdent: contexto.usuarioIdent,
    acao: contexto.acao,
    chave,
    fingerprint,
  };

  // ── 3. O ATO, no contexto do comando ──
  let resultado: T;
  try {
    resultado = await contextoDoComando.run(comando, ato);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    const fase = ehNegacao(mensagem) ? "NEGADO" : "ERRO";
    // ── 4b. A NEGAÇÃO (ou o erro), FORA da tx — e o erro ORIGINAL é o que sobe ──
    try {
      await porta.registrar(
        { ...contexto, chave, fingerprint, operacaoId, resultado: fase, detalhe: mensagem },
        agora
      );
    } catch (causa) {
      telemetria({ fase, operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, causa });
    }
    throw e;
  }

  // ── 4a. A CONCLUSÃO, FORA da tx — e o resultado segue intacto mesmo que ela falhe ──
  try {
    await porta.registrar(
      {
        ...contexto,
        chave,
        fingerprint,
        operacaoId,
        resultado: "CONCLUIDA",
        resultadoRef: referenciaDe(resultado),
      },
      agora
    );
  } catch (causa) {
    telemetria({ fase: "CONCLUIDA", operacaoId, usuarioIdent: contexto.usuarioIdent, acao: contexto.acao, causa });
  }
  return resultado;
}
