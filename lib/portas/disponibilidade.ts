import { createHash } from "node:crypto";
import type { Elegibilidade } from "../../packages/contracts/index.js";
import type { DisponibilidadeDaAcao } from "../molde/tipos.js";

/**
 * A PONTE entre o predicado do domínio (`Elegibilidade`) e a apresentação do molde.
 *
 * ⚠️ NENHUMA REGRA AQUI — só tradução. Quem diz se cabe é o domínio; quem diz se pode é o
 * `PermissaoDePerfil`. Esta função não tem como errar a regra porque não a conhece.
 */
export function apresentar(e: Elegibilidade, providenciaHref?: string): DisponibilidadeDaAcao {
  if (e.situacao === "ELEGIVEL") return { apresentacao: "disponivel" };
  if (e.situacao === "NAO_APLICAVEL") return { apresentacao: "nao-aplicavel", motivo: e.motivo };
  return {
    apresentacao: "bloqueada",
    motivo: e.motivo,
    ...(e.providencia !== undefined ? { providencia: e.providencia } : {}),
    ...(providenciaHref !== undefined ? { providenciaHref } : {}),
  };
}

/**
 * A impressão do estado que decide a disponibilidade. Curta de propósito: não é integridade, é
 * detector de "a tela está velha".
 */
export function versaoDoEstado(partes: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex").slice(0, 16);
}

export class RegistroMudouError extends Error {
  constructor(oQue: string) {
    super(
      `REGISTRO-MUDOU: ${oQue} mudou desde que esta tela foi aberta — outra aba ou outra pessoa praticou um ato sobre ele. ` +
        `Recarregue para ver a situação atual antes de repetir. Este envio não chegou a ser executado.`
    );
    this.name = "RegistroMudouError";
  }
}
