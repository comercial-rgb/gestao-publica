/**
 * Aplica migrations pendentes em TODOS os tenants ativos.
 *
 * Uso:
 *   pnpm db:migrate:tenants               # aplica tudo
 *   pnpm db:migrate:tenants --dry-run     # só mostra o que seria aplicado
 *   pnpm db:migrate:tenants --tenant=slug # só um tenant específico
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMasterDatabase } from './client.js'
import { applyTenantMigrationsIncremental } from './tenancy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[ERRO] DATABASE_URL ausente')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1]

async function main() {
  console.log(`[migrate] Aplicando migrations pendentes ${dryRun ? '(DRY RUN)' : ''}...`)
  const db = createMasterDatabase(DATABASE_URL!)

  const tenants = await db.query.tenants.findMany({
    where: (t, { eq, and, isNull }) =>
      and(
        eq(t.status, 'active'),
        isNull(t.deletedAt),
        tenantArg ? eq(t.slug, tenantArg) : undefined,
      ),
  })

  if (tenants.length === 0) {
    console.log('[AVISO] Nenhum tenant encontrado')
    return
  }

  let totalApplied = 0
  let totalFailed = 0

  for (const tenant of tenants) {
    process.stdout.write(`\n→ ${tenant.slug} (${tenant.schemaName}): `)
    try {
      const result = await applyTenantMigrationsIncremental(DATABASE_URL!, tenant.schemaName, {
        dryRun,
        appliedBy: dryRun ? 'dry-run' : 'cli',
      })
      console.log(
        `✓ ${result.applied.length} aplicadas, ${result.skipped.length} puladas, ${result.failed.length} falhas`,
      )
      if (result.applied.length > 0) {
        console.log(`  Aplicadas: ${result.applied.join(', ')}`)
      }
      if (result.failed.length > 0) {
        result.failed.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`))
      }
      totalApplied += result.applied.length
      totalFailed += result.failed.length
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`)
      totalFailed++
    }
  }

  console.log('\n═══ RESUMO ═══')
  console.log(`Tenants processados: ${tenants.length}`)
  console.log(`Total migrations aplicadas: ${totalApplied}${dryRun ? ' (simulado)' : ''}`)
  console.log(`Falhas: ${totalFailed}`)

  process.exit(totalFailed > 0 ? 1 : 0)
}

main()
