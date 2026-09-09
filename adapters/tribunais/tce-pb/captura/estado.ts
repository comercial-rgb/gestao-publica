import { randomUUID } from "node:crypto";

/**
 * CAPTURA 2.0 — MÁQUINA DE ESTADOS + TRANSPORTE (F3).
 *
 * DRAFT → VALIDATED_LOCAL → SUBMITTED_MOCK → SIMULATED (terminal). O caminho de validação que falha
 * termina em REJECTED_LOCAL. NÃO EXISTE estado "ACEITO"/"TRANSMITIDO" — o mock NUNCA finge aceitação
 * externa (DIRETIVA §2/§7).
 *
 * ⚠️ O MOCK gera só um `simulationId` INTERNO (uuid). É PROIBIDO qualquer campo chamado
 * protocolo/recibo/aceite — isso só existe com resposta real do TCE.
 *
 * ⚠️ SANDBOX e LIVE são modos CONFIGURÁVEIS. Sem credencial, respondem `CREDENTIAL_NOT_CONFIGURED`
 * (erro NOMEADO) — NUNCA um fallback silencioso para MOCK. O modo que a tela mostra é o modo que
 * executou; um SANDBOX que caísse em MOCK faria a UI mentir sobre o modo.
 */

export type ModoCaptura = "MOCK" | "SANDBOX" | "LIVE";

export type EstadoCaptura = "DRAFT" | "VALIDATED_LOCAL" | "REJECTED_LOCAL" | "SUBMITTED_MOCK" | "SIMULATED";

/** Estados terminais — dali não se transiciona. */
export const ESTADOS_TERMINAIS: ReadonlySet<EstadoCaptura> = new Set<EstadoCaptura>(["SIMULATED", "REJECTED_LOCAL"]);

export class CredentialNotConfiguredError extends Error {
  readonly codigo = "CREDENTIAL_NOT_CONFIGURED";
  constructor(readonly modo: ModoCaptura) {
    super(
      `CREDENTIAL_NOT_CONFIGURED: o modo ${modo} exige credencial/endpoint do TCE, ainda não configurados. ` +
        `A submissão NÃO cai em MOCK silenciosamente — o modo que executa é o modo que a tela mostra. ` +
        `Configure a credencial (sem mudar código) para ativar ${modo}.`
    );
  }
}

/** O que um transporte devolve ao submeter (MOCK). SEM protocolo/recibo/aceite — só id interno. */
export interface ResultadoTransporte {
  readonly modo: ModoCaptura;
  /** Identificador INTERNO da simulação (uuid) — nunca um protocolo do TCE. */
  readonly simulationId: string;
}

export interface Transporte {
  readonly modo: ModoCaptura;
  submeter(correlationId: string): Promise<ResultadoTransporte>;
}

export interface OpcoesTransporte {
  /** Gerador de uuid — injetável para o teste ser determinístico. */
  readonly novoId?: () => string;
  /** Config de credencial por modo. SANDBOX/LIVE sem credencial → CREDENTIAL_NOT_CONFIGURED. */
  readonly credencialConfigurada?: boolean;
}

/** Fábrica de transporte por modo. MOCK sempre funciona; SANDBOX/LIVE exigem credencial. */
export function criarTransporte(modo: ModoCaptura, opts: OpcoesTransporte = {}): Transporte {
  const novoId = opts.novoId ?? randomUUID;
  return {
    modo,
    async submeter(): Promise<ResultadoTransporte> {
      if (modo === "MOCK") return { modo, simulationId: novoId() };
      // SANDBOX / LIVE — sem credencial, erro NOMEADO. Nunca fallback para MOCK.
      if (opts.credencialConfigurada !== true) throw new CredentialNotConfiguredError(modo);
      // Com credencial: o transporte real seria aqui (bloqueado — falta o OpenAPI de endpoints, ver
      // MANIFEST pendentes). Enquanto isso, mesmo com credencial, SANDBOX/LIVE não têm rota real.
      throw new CredentialNotConfiguredError(modo);
    },
  };
}

/** A transição de validação: DRAFT → VALIDATED_LOCAL (limpo) ou REJECTED_LOCAL (com violações). */
export function transicaoValidacao(estado: EstadoCaptura, limpo: boolean): EstadoCaptura {
  if (estado !== "DRAFT") throw new Error(`Captura: validar só a partir de DRAFT (estado atual: ${estado}).`);
  return limpo ? "VALIDATED_LOCAL" : "REJECTED_LOCAL";
}

/** A transição de submissão MOCK: VALIDATED_LOCAL → SUBMITTED_MOCK → SIMULATED (terminal). */
export function transicaoSubmissaoMock(estado: EstadoCaptura): EstadoCaptura {
  if (estado !== "VALIDATED_LOCAL") {
    throw new Error(`Captura: submeter só a partir de VALIDATED_LOCAL (estado atual: ${estado}).`);
  }
  return "SIMULATED";
}
