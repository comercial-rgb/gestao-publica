/**
 * Inicializa o banco de teste do zero:
 *   - aplica migrations do schema public
 *   - aplica seed mínimo (master admin, planos, módulos)
 *
 * Executar antes de rodar a suite. Idempotente.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { hashPassword } from '@saas-municipal/auth'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.test') })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL ausente no .env.test')
  if (!url.includes(':5435')) {
    throw new Error(`Recusando: DATABASE_URL não aponta para porta 5435 (teste): ${url}`)
  }

  console.log('🧪 Bootstrap banco de teste...')

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  const migrationsFolder = resolve(__dirname, '../drizzle/public')
  console.log(`  → migrations de ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })

  const passwordHash = await hashPassword('TestMaster@2026!')

  await client.unsafe(`
    INSERT INTO master_users (email, name, password_hash, role, active)
    VALUES ('test-master@saas.local', 'Test Master', $1, 'super_admin', true)
    ON CONFLICT (email) DO NOTHING
  `, [passwordHash])

  await client.unsafe(`
    INSERT INTO plans (slug, name, description, monthly_price, active) VALUES
      ('teste', 'Plano Teste', 'Plano com todos os módulos', 0, true)
    ON CONFLICT (slug) DO NOTHING
  `)

  await client.unsafe(`
    INSERT INTO modules (slug, name, category, description, active) VALUES
      ('cadastros',         'Cadastros',         'fundacao',  'Pessoas e entidades',            true),
      ('textos_juridicos',  'Textos Jurídicos',  'fundacao',  'Leis, decretos',                 true),
      ('usuarios',          'Usuários',          'fundacao',  'Gestão de usuários',             true),
      ('fiscal',            'Calendário Fiscal', 'fundacao',  'Exercícios e meses',             true),
      ('receitas',          'Receitas',          'registro',  'Arrecadação',                    true),
      ('orcamento',         'Orçamento',         'registro',  'PPA/LOA/Dotações',               true)
    ON CONFLICT (slug) DO NOTHING
  `)

  await client.unsafe(`
    INSERT INTO plan_modules (plan_id, module_id)
    SELECT p.id, m.id FROM plans p CROSS JOIN modules m
    WHERE p.slug = 'teste' AND m.active = true
    ON CONFLICT DO NOTHING
  `)

  await client.end()
  console.log('✓ Banco de teste pronto')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
