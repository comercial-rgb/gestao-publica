/**
 * Logger simples estruturado (JSON em prod, texto em dev).
 *
 * Nao usa biblioteca externa pra evitar dep extra.
 * Se monorepo ja tiver pino/winston, substituir por isso.
 */

import { config } from '../config.js'

const NIVEIS = { error: 0, warn: 1, info: 2, debug: 3 } as const
type Nivel = keyof typeof NIVEIS

const nivelAtual = NIVEIS[config.LOG_LEVEL]

function deveLogar(nivel: Nivel): boolean {
  return NIVEIS[nivel] <= nivelAtual
}

function log(nivel: Nivel, msg: string, meta?: Record<string, unknown>): void {
  if (!deveLogar(nivel)) return

  if (config.NODE_ENV === 'production') {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: nivel,
        workerId: config.WORKER_ID,
        msg,
        ...meta,
      }),
    )
  } else {
    const prefixo = `[${nivel.toUpperCase()}] ${new Date().toISOString()}`
    if (meta) {
      console.log(prefixo, msg, meta)
    } else {
      console.log(prefixo, msg)
    }
  }
}

export const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
}
