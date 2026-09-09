import { lerCredenciais, APP_LEITURA } from "./config.js";

/**
 * MODOS DO CLIENTE BB (M17, S6) — MOCK / SANDBOX / LIVE explícitos (DIRETIVA §4).
 *
 * ⚠️ O MODO QUE A TELA MOSTRA É O MODO QUE EXECUTA. Nunca há fallback silencioso: um SANDBOX sem
 * credencial responde `CREDENTIAL_NOT_CONFIGURED` (nomeado), não vira MOCK por baixo dos panos.
 *
 *   · MOCK    — fixtures SPEC_BB (o caminho da S-massa). Nenhuma chamada externa. Sempre disponível.
 *   · SANDBOX — homologação REAL do BB. Exige credencial (BB_APP_A_*). Sem ela: CREDENTIAL_NOT_CONFIGURED.
 *   · LIVE    — produção. BLOQUEADO nesta missão (nenhuma chamada financeira real — DIRETIVA §4).
 */

export type ModoBb = "MOCK" | "SANDBOX" | "LIVE";

export type EstadoConexao = "DISPONIVEL" | "CREDENTIAL_NOT_CONFIGURED" | "BLOQUEADO";

export interface EstadoModoBb {
  readonly modo: ModoBb;
  readonly estado: EstadoConexao;
  readonly mensagem: string;
}

/** As credenciais de homologação estão configuradas? (env BB_APP_A_* presentes.) */
export function credencialBbConfigurada(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    lerCredenciais(APP_LEITURA, env);
    return true;
  } catch {
    return false;
  }
}

/**
 * O estado de um modo — o que o card do BB (F3) e o `testConnection` mostram. Sem efeito colateral,
 * sem chamada externa: só decide o que ESTE modo faria agora.
 */
export function estadoDoModoBb(modo: ModoBb, env: NodeJS.ProcessEnv = process.env): EstadoModoBb {
  switch (modo) {
    case "MOCK":
      return { modo, estado: "DISPONIVEL", mensagem: "Fixtures SPEC_BB — leitura sintética, sem chamada externa." };
    case "SANDBOX":
      return credencialBbConfigurada(env)
        ? { modo, estado: "DISPONIVEL", mensagem: "Homologação do BB — credencial presente; leitura real ativável." }
        : { modo, estado: "CREDENTIAL_NOT_CONFIGURED", mensagem: "SANDBOX exige credencial (BB_APP_A_*) — ainda não configurada. Sem fallback para MOCK." };
    case "LIVE":
      return { modo, estado: "BLOQUEADO", mensagem: "LIVE (produção) bloqueado nesta missão — nenhuma chamada financeira real (DIRETIVA §4)." };
  }
}

/** testConnection por modo — o mesmo estado, na forma que a UI chama ao clicar "testar". */
export function testConnectionBb(modo: ModoBb, env: NodeJS.ProcessEnv = process.env): EstadoModoBb {
  return estadoDoModoBb(modo, env);
}

// ── MÁSCARAS (DIRETIVA §4) — agência/conta MASCARADAS na UI e no log; o dado cru fica no banco. ──

/** Agência mascarada: mostra os 2 primeiros e o último dígito (ex.: "1234" → "12••4"). */
export function mascararAgencia(agencia: string | null | undefined): string {
  const s = (agencia ?? "").trim();
  if (s.length <= 3) return s.replace(/./g, "•");
  return `${s.slice(0, 2)}${"•".repeat(Math.max(1, s.length - 3))}${s.slice(-1)}`;
}

/** Conta mascarada: só os 2 últimos dígitos visíveis (ex.: "12345-6" → "••••••6"... na verdade "•••••56"). */
export function mascararConta(conta: string | null | undefined): string {
  const s = (conta ?? "").trim();
  if (s.length <= 2) return s.replace(/./g, "•");
  return `${"•".repeat(s.length - 2)}${s.slice(-2)}`;
}
