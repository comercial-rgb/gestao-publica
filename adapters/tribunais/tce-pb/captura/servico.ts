import { createHash, randomUUID } from "node:crypto";
import { autorizarNo } from "../../../../modules/m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../../../../modules/m16-travamento/acoes.js";
import { criarRegistroDeOperacaoPrisma } from "../../../../modules/m16-travamento/operacao.js";
import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { montarEnvelope } from "./dto-captura.js";
import { validarEnvelopeCaptura, type EntidadeCaptura, type ViolacaoCaptura } from "./validacao-captura.js";
import { criarTransporte, CredentialNotConfiguredError, type EstadoCaptura, type ModoCaptura } from "./estado.js";

/**
 * SUBMISSÃO CAPTURA 2.0 (F3) — orquestra: elementos → envelope → VALIDA (schema oficial) → TRANSPORTE
 * → ESTADO, e PERSISTE a execução (ExecucaoCaptura) + o log (RegistroDeOperacao). É MUTAÇÃO — censo
 * M16 (ação SUBMETER_CAPTURA).
 *
 * ⚠️ O ESTADO É O QUE ACONTECEU, sem fingimento (DIRETIVA §2/§7):
 *   · violação de schema        → REJECTED_LOCAL (nem submete).
 *   · MOCK, limpo               → SIMULATED, com simulationId INTERNO (uuid). Sem protocolo/recibo.
 *   · SANDBOX/LIVE sem credencial→ fica em VALIDATED_LOCAL e devolve CREDENTIAL_NOT_CONFIGURED
 *                                 (NUNCA cai em MOCK; o modo que executa é o que a tela mostra).
 */

export interface SubmeterCapturaInput {
  readonly entidade: EntidadeCaptura;
  /** Os elementos JÁ mapeados para o formato Captura (a porta os produz do DTO da S1). */
  readonly elementos: readonly Record<string, unknown>[];
  readonly modo: ModoCaptura;
  readonly criadoPor: string;
  /** ISO sem "Z" (o schema exige `.\d{3,6}$`). Injetável para determinismo; default = agora. */
  readonly timestamp?: string;
  readonly correlationId?: string;
  /** SANDBOX/LIVE: se a credencial está configurada (default false → CREDENTIAL_NOT_CONFIGURED). */
  readonly credencialConfigurada?: boolean;
}

export interface ResultadoSubmissao {
  readonly correlationId: string;
  readonly estado: EstadoCaptura;
  readonly modo: ModoCaptura;
  readonly quantidadeElementos: number;
  readonly hashPayload: string;
  readonly simulationId: string | null;
  readonly violacoes: readonly ViolacaoCaptura[];
  /** Presente só quando SANDBOX/LIVE bateu em CREDENTIAL_NOT_CONFIGURED. */
  readonly credencialNaoConfigurada?: string;
}

function agoraIso(): string {
  // ISO sem o "Z" — o schema do TCE quer `...:ss.mmm` (3-6 casas), não o sufixo UTC.
  return new Date().toISOString().replace("Z", "");
}

export async function submeterCaptura(prisma: PrismaClient, input: SubmeterCapturaInput): Promise<ResultadoSubmissao> {
  const timestamp = input.timestamp ?? agoraIso();
  const correlationId = input.correlationId ?? randomUUID();
  const envelope = montarEnvelope(input.elementos, timestamp);
  const hashPayload = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");

  // (1) VALIDA contra o schema OFICIAL.
  const violacoes = validarEnvelopeCaptura(input.entidade, envelope);

  // (2) ESTADO + transporte (fora do banco — puro).
  let estado: EstadoCaptura;
  let simulationId: string | null = null;
  let credencialNaoConfigurada: string | undefined;

  if (violacoes.length > 0) {
    estado = "REJECTED_LOCAL";
  } else {
    try {
      const r = await criarTransporte(input.modo, { credencialConfigurada: input.credencialConfigurada === true }).submeter(correlationId);
      simulationId = r.simulationId; // só MOCK chega aqui
      estado = "SIMULATED";
    } catch (e) {
      if (e instanceof CredentialNotConfiguredError) {
        estado = "VALIDATED_LOCAL"; // validado, mas SANDBOX/LIVE não transmitiu — sem fallback p/ MOCK
        credencialNaoConfigurada = e.codigo;
      } else {
        throw e;
      }
    }
  }

  // (3) PERSISTE a execução + o log, na mesma transação, com a autorização antes.
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, input.criadoPor, ACAO_DO_SERVICO.submeterCaptura, "ENTE");
    await tx.execucaoCaptura.create({
      data: {
        correlationId, entidade: input.entidade, modo: input.modo, estado,
        quantidadeElementos: input.elementos.length, hashPayload, simulationId, violacoes: violacoes.length,
        criadoPor: input.criadoPor,
      },
    });
    await criarRegistroDeOperacaoPrisma(tx).registrar({
      usuarioIdent: input.criadoPor,
      acao: "SUBMETER_CAPTURA",
      resultado: estado === "REJECTED_LOCAL" ? "ERRO" : "SUCESSO",
      detalhe: `captura ${input.entidade} modo=${input.modo} estado=${estado} qtd=${input.elementos.length} corr=${correlationId}${credencialNaoConfigurada !== undefined ? ` (${credencialNaoConfigurada})` : ""}`,
    });
  });

  return {
    correlationId, estado, modo: input.modo, quantidadeElementos: input.elementos.length,
    hashPayload, simulationId, violacoes,
    ...(credencialNaoConfigurada !== undefined ? { credencialNaoConfigurada } : {}),
  };
}
