import { fixturasDaRota } from "./fixtures-poc.js";
import type { RotaTce } from "./contrato.js";

/**
 * GATEWAY DA API DE CONSULTA TCE (M19, S4) — SEPARADO do Captura 2.0 (submissão): outra API, outro
 * contrato, outro cliente. Modos MOCK/SANDBOX/LIVE explícitos.
 *
 * ⚠️ O modo que a tela mostra é o que executa — nunca fallback. TOKEN SÓ POR CONFIGURAÇÃO: sem token,
 * SANDBOX/LIVE respondem `CREDENTIAL_NOT_CONFIGURED` (nomeado). MOCK devolve fixtures sintéticas
 * conformes ao schema oficial (validadas em teste — DIRETIVA §3).
 */

export type ModoTce = "MOCK" | "SANDBOX" | "LIVE";

export class TceCredentialNotConfiguredError extends Error {
  readonly codigo = "CREDENTIAL_NOT_CONFIGURED";
  constructor(readonly modo: ModoTce) {
    super(
      `CREDENTIAL_NOT_CONFIGURED: a API de consulta do TCE no modo ${modo} exige token (por configuração ` +
        `segura), ainda não fornecido. Não há fallback para MOCK — o modo que executa é o que a tela mostra.`
    );
  }
}

export interface ParamsConsulta {
  readonly codUnidadeGestora: string;
  readonly dataMinima?: string;
  readonly dataMaxima?: string;
  readonly exercicio?: number;
}

export interface RespostaConsulta {
  readonly modo: ModoTce;
  readonly rota: RotaTce;
  readonly registros: readonly Record<string, unknown>[];
}

export interface OpcoesGateway {
  /** O token da API TCE está configurado? (só por config; default false). */
  readonly tokenConfigurado?: boolean;
}

export interface GatewayTce {
  readonly modo: ModoTce;
  consultar(rota: RotaTce, params: ParamsConsulta): Promise<RespostaConsulta>;
}

export function criarGatewayTce(modo: ModoTce, opts: OpcoesGateway = {}): GatewayTce {
  return {
    modo,
    async consultar(rota, params): Promise<RespostaConsulta> {
      if (modo === "MOCK") {
        return { modo, rota, registros: fixturasDaRota(rota, params.codUnidadeGestora) };
      }
      // SANDBOX / LIVE — só com token (por configuração). Aqui seria a chamada real ao endpoint do
      // OpenAPI; sem token, erro nomeado (nunca MOCK). LIVE segue bloqueado nesta missão.
      if (opts.tokenConfigurado !== true) throw new TceCredentialNotConfiguredError(modo);
      throw new TceCredentialNotConfiguredError(modo);
    },
  };
}

/** O estado de um modo, para o card/testConnection (sem chamada externa). */
export function estadoDoModoTce(modo: ModoTce, tokenConfigurado = false): { modo: ModoTce; disponivel: boolean; mensagem: string } {
  if (modo === "MOCK") return { modo, disponivel: true, mensagem: "Fixtures sintéticas conformes ao schema oficial — sem chamada externa." };
  if (modo === "LIVE") return { modo, disponivel: false, mensagem: "LIVE bloqueado nesta missão." };
  return tokenConfigurado
    ? { modo, disponivel: true, mensagem: "Token presente — consulta real ativável." }
    : { modo, disponivel: false, mensagem: "SANDBOX exige token (por configuração) — ainda não fornecido. Sem fallback para MOCK." };
}
