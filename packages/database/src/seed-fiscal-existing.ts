/**
 * Popula exercício corrente + 12 meses + permissions fiscais
 * em tenants existentes que foram provisionados antes do B16.
 *
 * Uso: pnpm db:seed:fiscal
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { createMasterDatabase } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) { console.error('❌ DATABASE_URL ausente'); process.exit(1) }

  const db = createMasterDatabase(DATABASE_URL)
  const tenants = await db.query.tenants.findMany({
    where: (t, { eq, and, isNull }) => and(eq(t.status, 'active'), isNull(t.deletedAt)),
  })

  const anoAtual = new Date().getFullYear()
  console.log(`🗓️  Populando exercício ${anoAtual} em ${tenants.length} tenant(s)...`)

  for (const tenant of tenants) {
    const client = postgres(DATABASE_URL, { max: 1 })
    try {
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${tenant.schemaName}", public`)

        await tx.unsafe(`
          INSERT INTO exercicios (ano, data_inicio, data_fim, status)
          VALUES ($1, $2, $3, 'aberto')
          ON CONFLICT (ano) DO NOTHING
        `, [anoAtual, `${anoAtual}-01-01`, `${anoAtual}-12-31`])

        await tx.unsafe(`
          INSERT INTO meses_fiscais (exercicio_id, mes, data_inicio, data_fim, status)
          SELECT e.id, m.mes,
                 make_date(e.ano, m.mes, 1)::date,
                 (make_date(e.ano, m.mes, 1) + interval '1 month' - interval '1 day')::date,
                 'aberto'
          FROM exercicios e CROSS JOIN (SELECT generate_series(1, 12) AS mes) m
          WHERE e.ano = $1
          ON CONFLICT DO NOTHING
        `, [anoAtual])

        await tx.unsafe(`
          INSERT INTO permissions (slug, description, module) VALUES
            ('fiscal:read',              'Visualizar calendário fiscal',    'fiscal'),
            ('fiscal:abrir_exercicio',   'Abrir novo exercício',            'fiscal'),
            ('fiscal:encerrar_exercicio','Encerrar exercício',              'fiscal'),
            ('fiscal:fechar_mes',        'Fechar mês fiscal',               'fiscal'),
            ('fiscal:reabrir_mes',       'Reabrir mês fiscal fechado',      'fiscal'),
            ('fiscal:bloquear_mes',      'Bloquear mês (controladoria)',    'fiscal')
          ON CONFLICT (slug) DO NOTHING;
        `)

        await tx.unsafe(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
          WHERE r.slug = 'admin_municipal'
            AND p.slug LIKE 'fiscal:%'
          ON CONFLICT DO NOTHING;
        `)

        await tx.unsafe(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
          WHERE r.slug = 'gestor_financeiro'
            AND p.slug IN ('fiscal:read','fiscal:fechar_mes')
          ON CONFLICT DO NOTHING;
        `)
      })
      console.log(`  ✓ ${tenant.slug}`)
    } catch (err) {
      console.error(`  ✗ ${tenant.slug}: ${(err as Error).message}`)
    } finally {
      await client.end()
    }
  }

  console.log('Pronto.')
  process.exit(0)
}

main()
