/**
 * Script CLI pra seedar tabelas publicas de folha.
 *
 * Uso:
 *   pnpm -C packages/database db:seed:folha:publico
 *   pnpm -C packages/database db:seed:folha:publico --check  # so conta o que ja tem
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { seedFolhaPublico } from './seeds/folha-publico.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/saas_municipal'

const checkOnly = process.argv.includes('--check')

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 })
  const db = drizzle(client)

  if (checkOnly) {
    const inss = await db.execute(sql`SELECT COUNT(*)::int as total FROM public.inss_tabelas WHERE oficial = true`)
    const irrf = await db.execute(sql`SELECT COUNT(*)::int as total FROM public.irrf_tabelas WHERE oficial = true`)
    const sf = await db.execute(sql`SELECT COUNT(*)::int as total FROM public.salario_familia_tabelas WHERE oficial = true`)

    console.log('[check] Estado atual das tabelas oficiais:')
    console.log(`   INSS:            ${(inss[0] as Record<string, unknown>).total} tabelas`)
    console.log(`   IRRF:            ${(irrf[0] as Record<string, unknown>).total} tabelas`)
    console.log(`   Salario-familia: ${(sf[0] as Record<string, unknown>).total} tabelas`)
    await client.end()
    return
  }

  console.log('[seed] Aplicando seed de tabelas publicas (INSS, IRRF, Salario-familia) 2020-2026...')
  const inicio = Date.now()

  const resultado = await seedFolhaPublico(db)

  const duracao = ((Date.now() - inicio) / 1000).toFixed(2)
  console.log(`\n[OK] Concluido em ${duracao}s:`)
  console.log(`   ${resultado.inssCriadas} tabelas INSS criadas`)
  console.log(`   ${resultado.irrfCriadas} tabelas IRRF criadas`)
  console.log(`   ${resultado.salarioFamiliaCriadas} tabelas Salario-familia criadas`)
  console.log('\n[AVISO] Revise os valores marcados como "// VERIFICAR" nos seeds')
  console.log('   antes de subir pra producao. Sao anos anteriores a 2024 sem confirmacao.')

  await client.end()
}

main().catch((err) => {
  console.error('[ERRO] Falha no seed:', err)
  process.exit(1)
})
