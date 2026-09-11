/**
 * Cliente Drizzle base + factory de conexão por tenant.
 *
 * Padrão:
 *   - createMasterDatabase(): conecta no schema "public" (metadados SaaS)
 *   - createTenantDatabase(schemaName): conecta com search_path = "<tenant>, public"
 *
 * Cache de conexões por schema é mantido em memória para evitar
 * abrir-fechar pool a cada request. Usa postgres.js (driver leve).
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as publicSchema from './schema/public.js'
import * as tenantSchema from './schema/tenant.js'

// ─────────────────────────────────────────────────────────────
// MASTER (schema public)
// ─────────────────────────────────────────────────────────────

let masterClient: postgres.Sql | null = null
let masterDb: ReturnType<typeof buildMasterDb> | null = null

function buildMasterDb(client: postgres.Sql) {
  return drizzle(client, { schema: publicSchema, casing: 'snake_case' })
}

export function createMasterDatabase(connectionString: string) {
  if (!masterDb) {
    masterClient = postgres(connectionString, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    })
    masterDb = buildMasterDb(masterClient)
  }
  return masterDb
}

export async function closeMasterDatabase() {
  if (masterClient) {
    await masterClient.end()
    masterClient = null
    masterDb = null
  }
}

// ─────────────────────────────────────────────────────────────
// TENANT (schema dinâmico)
// ─────────────────────────────────────────────────────────────

type TenantDb = ReturnType<typeof buildTenantDb>

interface TenantConnection {
  client: postgres.Sql
  db: TenantDb
}

const tenantPool = new Map<string, TenantConnection>()

function buildTenantDb(client: postgres.Sql) {
  return drizzle(client, { schema: tenantSchema, casing: 'snake_case' })
}

/**
 * Cria (ou reusa) uma conexão Drizzle para um schema de tenant específico.
 * O search_path garante que queries sem schema qualificado caiam no schema certo.
 */
export function createTenantDatabase(connectionString: string, schemaName: string): TenantDb {
  const cached = tenantPool.get(schemaName)
  if (cached) return cached.db

  const client = postgres(connectionString, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    // search_path resolve nomes de tabelas sem schema explícito
    connection: {
      search_path: `${schemaName}, public`,
    },
  })

  const db = buildTenantDb(client)
  tenantPool.set(schemaName, { client, db })
  return db
}

/**
 * Fecha e remove uma conexão de tenant do pool.
 * Útil quando uma tenant é arquivada/deletada.
 */
export async function closeTenantDatabase(schemaName: string) {
  const cached = tenantPool.get(schemaName)
  if (cached) {
    await cached.client.end()
    tenantPool.delete(schemaName)
  }
}

/**
 * Fecha TODAS as conexões (master + tenants). Usar no shutdown da app.
 */
export async function closeAllConnections() {
  await closeMasterDatabase()
  await Promise.all(
    [...tenantPool.values()].map(({ client }) => client.end()),
  )
  tenantPool.clear()
}
