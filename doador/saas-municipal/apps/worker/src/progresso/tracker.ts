/**
 * Rastreador de progresso de jobs.
 *
 * 2 responsabilidades:
 *   1. Persiste em folha_progresso (DB do tenant)
 *   2. Publica updates no Redis pub/sub pra WebSocket
 *
 * Canal Redis: folha:progresso:{folhaId}
 */

import { eq } from 'drizzle-orm'
import { folhaProgresso } from '@saas-municipal/database/schema/folha-calculo'
import { redisPubSub } from '../connection.js'
import { logger } from '../utils/logger.js'
import { config } from '../config.js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>

export type StatusProgresso = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO' | 'CANCELADO'

export type ProgressoUpdate = {
  status?: StatusProgresso
  progressoPercentual?: number
  totalItens?: number
  itensProcessados?: number
  itensComErro?: number
  mensagemAtual?: string
  erros?: Array<{ vinculoId: string; mensagem: string; stack?: string }>
}

export class ProgressoTracker {
  private folhaProgressoId: string | null = null
  private erros: Array<{ vinculoId: string; mensagem: string; stack?: string }> = []
  private contadores = {
    totalItens: 0,
    itensProcessados: 0,
    itensComErro: 0,
  }

  constructor(
    private tenantDb: Db,
    private folhaId: string,
    private jobId: string,
    private tipoJob: string,
  ) {}

  /**
   * Inicia o tracking: cria registro em folha_progresso + publica inicio.
   */
  async iniciar(totalItens: number): Promise<void> {
    this.contadores.totalItens = totalItens

    const rows = await this.tenantDb
      .insert(folhaProgresso)
      .values({
        folhaId: this.folhaId,
        jobId: this.jobId,
        tipoJob: this.tipoJob,
        status: 'PROCESSANDO',
        progressoPercentual: 0,
        totalItens,
        itensProcessados: 0,
        itensComErro: 0,
        mensagemAtual: 'Iniciando processamento',
        iniciadoEm: new Date(),
        workerId: config.WORKER_ID,
      })
      .returning({ id: folhaProgresso.id })

    this.folhaProgressoId = rows[0]!.id

    await this.publicarProgresso({
      status: 'PROCESSANDO',
      progressoPercentual: 0,
      totalItens,
      itensProcessados: 0,
      itensComErro: 0,
      mensagemAtual: 'Iniciando processamento',
    })

    logger.info(`Progresso iniciado`, {
      folhaId: this.folhaId,
      jobId: this.jobId,
      totalItens,
    })
  }

  /**
   * Marca N itens como processados (incrementa contadores).
   */
  async incrementarProcessados(quantidade = 1, mensagem?: string): Promise<void> {
    this.contadores.itensProcessados += quantidade
    await this.flushProgresso(mensagem)
  }

  /**
   * Registra erro num item (continua processamento).
   */
  async registrarErroItem(
    vinculoId: string,
    erro: Error | string,
  ): Promise<void> {
    const msg = erro instanceof Error ? erro.message : erro
    const stack = erro instanceof Error ? erro.stack : undefined

    this.erros.push({ vinculoId, mensagem: msg, stack })
    this.contadores.itensComErro++

    logger.warn(`Erro processando item`, {
      folhaId: this.folhaId,
      vinculoId,
      erro: msg,
    })

    await this.flushProgresso(`Erro em ${vinculoId}: ${msg}`)
  }

  /**
   * Marca job como concluido (status final + 100%).
   */
  async concluir(mensagem = 'Concluido'): Promise<void> {
    if (!this.folhaProgressoId) return

    const concluidoEm = new Date()

    await this.tenantDb
      .update(folhaProgresso)
      .set({
        status: 'CONCLUIDO',
        progressoPercentual: 100,
        itensProcessados: this.contadores.itensProcessados,
        itensComErro: this.contadores.itensComErro,
        erros: this.erros.length > 0 ? this.erros : null,
        mensagemAtual: mensagem,
        concluidoEm,
      })
      .where(eq(folhaProgresso.id, this.folhaProgressoId))

    await this.publicarProgresso({
      status: 'CONCLUIDO',
      progressoPercentual: 100,
      itensProcessados: this.contadores.itensProcessados,
      itensComErro: this.contadores.itensComErro,
      mensagemAtual: mensagem,
      erros: this.erros,
    })

    logger.info(`Job concluido`, {
      folhaId: this.folhaId,
      jobId: this.jobId,
      itensProcessados: this.contadores.itensProcessados,
      itensComErro: this.contadores.itensComErro,
    })
  }

  /**
   * Marca job como falho (erro bloqueante).
   */
  async falhar(mensagem: string, erro?: Error): Promise<void> {
    if (!this.folhaProgressoId) return

    const errosFinal = erro
      ? [...this.erros, { vinculoId: 'JOB', mensagem: erro.message, stack: erro.stack }]
      : this.erros

    await this.tenantDb
      .update(folhaProgresso)
      .set({
        status: 'ERRO',
        mensagemAtual: mensagem,
        erros: errosFinal.length > 0 ? errosFinal : null,
        concluidoEm: new Date(),
      })
      .where(eq(folhaProgresso.id, this.folhaProgressoId))

    await this.publicarProgresso({
      status: 'ERRO',
      mensagemAtual: mensagem,
      erros: errosFinal,
    })

    logger.error(`Job falhou`, {
      folhaId: this.folhaId,
      jobId: this.jobId,
      mensagem,
      erro: erro?.message,
    })
  }

  // ============================================================
  // Privados
  // ============================================================

  private async flushProgresso(mensagem?: string): Promise<void> {
    if (!this.folhaProgressoId) return

    const pct = this.contadores.totalItens > 0
      ? Math.floor((this.contadores.itensProcessados * 100) / this.contadores.totalItens)
      : 0

    await this.tenantDb
      .update(folhaProgresso)
      .set({
        progressoPercentual: pct,
        itensProcessados: this.contadores.itensProcessados,
        itensComErro: this.contadores.itensComErro,
        mensagemAtual: mensagem ?? 'Processando...',
      })
      .where(eq(folhaProgresso.id, this.folhaProgressoId))

    await this.publicarProgresso({
      progressoPercentual: pct,
      itensProcessados: this.contadores.itensProcessados,
      itensComErro: this.contadores.itensComErro,
      mensagemAtual: mensagem,
    })
  }

  private async publicarProgresso(update: ProgressoUpdate): Promise<void> {
    const canal = `folha:progresso:${this.folhaId}`
    try {
      await redisPubSub.publish(
        canal,
        JSON.stringify({
          folhaId: this.folhaId,
          jobId: this.jobId,
          timestamp: new Date().toISOString(),
          ...update,
        }),
      )
    } catch (err) {
      logger.warn(`Falha ao publicar progresso`, { canal, erro: String(err) })
    }
  }
}
