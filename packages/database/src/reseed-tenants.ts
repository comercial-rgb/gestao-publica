/**
 * Re-aplica seed baseline (roles, permissions, role_permissions, calendário)
 * em todos os tenants ativos. Idempotente.
 *
 * Uso:
 *   pnpm db:reseed:permissions
 *   pnpm db:reseed:permissions --tenant=slug
 *   pnpm db:reseed:permissions --dry-run
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMasterDatabase } from './client.js'
import { reseedTenantBaseline } from './tenancy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('[ERRO] DATABASE_URL ausente'); process.exit(1) }

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1]

async function main() {
  console.log(`[reseed] Re-seed baseline ${dryRun ? '(DRY-RUN)' : ''}...`)

  const db = createMasterDatabase(DATABASE_URL!)
  const tenants = await db.query.tenants.findMany({
    where: (t, { eq, and, isNull }) =>
      and(eq(t.status, 'active'), isNull(t.deletedAt), tenantArg ? eq(t.slug, tenantArg) : undefined),
  })

  if (tenants.length === 0) { console.log('[AVISO] Nenhum tenant ativo encontrado'); return }
  console.log(`Encontrados ${tenants.length} tenant(s)`)

  for (const tenant of tenants) {
    process.stdout.write(`  → ${tenant.slug}: `)
    if (dryRun) { console.log('(seria re-seedado)'); continue }
    try {
      const r = await reseedTenantBaseline(DATABASE_URL!, tenant.schemaName)
      console.log(`✓ +${r.rolesAdded} roles, +${r.permissionsAdded} permissions, +${r.rolePermissionsAdded} vínculos`)
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`)
    }
  }

  process.exit(0)
}

main()
