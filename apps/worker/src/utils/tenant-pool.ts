/**
 * Cache de pools de conexao PG por tenant.
 *
 * Mantem UM pool por (slug do tenant + schema), reutilizado entre jobs.
 * Evita custo de criar/destruir pool a cada job.
 *
 * Cleanup: pools inativos por mais de IDLE_TIMEOUT_MS sao fechados.
 */

import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 min sem uso -> fecha

type TenantPoolEntry = {
  sql: postgres.Sql
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PostgresJsDatabase<any>
  slug: string
  lastUsedAt: number
}

class TenantPoolManager {
  private pools = new Map<string, TenantPoolEntry>()
  private cleanupTimer: NodeJS.Timeout | null = null

  /**
   * Obtem (ou cria) um pool para o tenant.
   *
   * IMPORTANTE: connectionString deve incluir search_path correto:
   *   postgres://user:pass@host:port/db?search_path=tenant_slug,public
   */
  get(connectionString: string, slug: string): TenantPoolEntry {
    const key = `${slug}::${connectionString}`
    const existing = this.pools.get(key)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const sql = postgres(connectionString, {
      max: 15, // pool size por tenant
      idle_timeout: 20,
      connect_timeout: 10,
    })

    const entry: TenantPoolEntry = {
      sql,
      db: drizzle(sql),
      slug,
      lastUsedAt: Date.now(),
    }

    this.pools.set(key, entry)
    this.scheduleCleanup()

    return entry
  }

  /**
   * Fecha todos os pools.
   */
  async closeAll(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    await Promise.allSettled(
      Array.from(this.pools.values()).map((p) => p.sql.end({ timeout: 5 })),
    )
    this.pools.clear()
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const agora = Date.now()
      for (const [key, entry] of this.pools.entries()) {
        if (agora - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
          entry.sql.end({ timeout: 5 }).catch((err) => {
            console.error(`[TenantPool] erro fechando pool ${entry.slug}:`, err)
          })
          this.pools.delete(key)
        }
      }
    }, 60 * 1000) // verifica a cada 1 min
    // Nao bloqueia processo encerrar
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }
}

export const tenantPool = new TenantPoolManager()
