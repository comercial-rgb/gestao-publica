/**
 * Migrate master — aplica as migrations do schema "public" (metadados SaaS).
 *
 * Uso:
 *   pnpm db:migrate
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const __dirname = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(__dirname, '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[ERRO] DATABASE_URL nao definida no .env')
  process.exit(1)
}

const MIGRATIONS_DIR = resolve(__dirname, '../drizzle/public')

async function main() {
  console.log('[migrate] Aplicando migrations no schema public...')
  console.log(`   Migrations: ${MIGRATIONS_DIR}`)

  const client = postgres(DATABASE_URL!, { max: 1 })
  const db = drizzle(client)

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    console.log('[OK] Migrations aplicadas com sucesso.')
  } catch (err) {
    console.error('[ERRO] Falha ao aplicar migrations:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
