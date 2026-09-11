/**
 * Seed de modalidades de aplicacao e fontes de recurso conforme padrao STN.
 * Idempotente via ON CONFLICT.
 *
 * Uso:
 *   pnpm db:seed:orcamento-stn
 *   pnpm db:seed:orcamento-stn --tenant=slug
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { createMasterDatabase } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const MODALIDADES: Array<{ codigo: string; descricao: string }> = [
  { codigo: '10', descricao: 'Transferencias a Uniao' },
  { codigo: '20', descricao: 'Transferencias a Estados e ao Distrito Federal' },
  { codigo: '30', descricao: 'Transferencias a Estados e ao DF - Fundo a Fundo' },
  { codigo: '40', descricao: 'Transferencias a Municipios' },
  { codigo: '41', descricao: 'Transferencias a Municipios - Fundo a Fundo' },
  { codigo: '50', descricao: 'Transferencias a Instituicoes Privadas sem Fins Lucrativos' },
  { codigo: '60', descricao: 'Transferencias a Instituicoes Privadas com Fins Lucrativos' },
  { codigo: '70', descricao: 'Transferencias a Instituicoes Multigovernamentais' },
  { codigo: '71', descricao: 'Transferencias a Consorcios Publicos' },
  { codigo: '72', descricao: 'Execucao Orcamentaria Delegada a Consorcios Publicos' },
  { codigo: '73', descricao: 'Transferencias a Consorcios Publicos - Saude' },
  { codigo: '80', descricao: 'Transferencias ao Exterior' },
  { codigo: '90', descricao: 'Aplicacoes Diretas' },
  { codigo: '91', descricao: 'Aplicacao Direta Decorrente de Operacao entre Orgaos' },
  { codigo: '93', descricao: 'Aplicacao Direta Decorrente de Operacao de Orgaos do mesmo ente' },
  { codigo: '99', descricao: 'A Definir' },
]

const FONTES: Array<{ codigo: string; descricao: string; grupo: string; categoria: string }> = [
  { codigo: '1.500.0000', descricao: 'Recursos Nao Vinculados de Impostos', grupo: '1', categoria: 'Tesouro' },
  { codigo: '1.501.0000', descricao: 'Recursos Nao Vinculados de Impostos - Vinculacao por Determinacao Legal', grupo: '1', categoria: 'Tesouro' },
  { codigo: '1.540.0000', descricao: 'Transferencias do FUNDEB - Impostos e Transferencias de Impostos', grupo: '1', categoria: 'FUNDEB' },
  { codigo: '1.541.0000', descricao: 'Transferencias do FUNDEB - Complementacao da Uniao - VAAF', grupo: '1', categoria: 'FUNDEB' },
  { codigo: '1.542.0000', descricao: 'Transferencias do FUNDEB - Complementacao da Uniao - VAAT', grupo: '1', categoria: 'FUNDEB' },
  { codigo: '1.550.0000', descricao: 'Transferencia do Salario Educacao', grupo: '1', categoria: 'Educacao' },
  { codigo: '1.551.0000', descricao: 'Outros Recursos Vinculados a Educacao', grupo: '1', categoria: 'Educacao' },
  { codigo: '1.600.0000', descricao: 'Transferencias SUS - Bloco de Manutencao', grupo: '1', categoria: 'Saude' },
  { codigo: '1.601.0000', descricao: 'Transferencias SUS - Bloco de Estruturacao', grupo: '1', categoria: 'Saude' },
  { codigo: '1.621.0000', descricao: 'Transferencias Fundo a Fundo de Recursos do FNAS', grupo: '1', categoria: 'Assistencia' },
  { codigo: '1.700.0000', descricao: 'Outras Transferencias de Convenios da Uniao', grupo: '1', categoria: 'Convenios' },
  { codigo: '1.701.0000', descricao: 'Outras Transferencias de Convenios dos Estados', grupo: '1', categoria: 'Convenios' },
  { codigo: '1.750.0000', descricao: 'Royalties / Compensacao Financeira', grupo: '1', categoria: 'Royalties' },
  { codigo: '2.500.0000', descricao: 'Recursos Nao Vinculados - Superavit Financeiro', grupo: '2', categoria: 'Tesouro' },
  { codigo: '2.540.0000', descricao: 'FUNDEB - Superavit Financeiro', grupo: '2', categoria: 'FUNDEB' },
  { codigo: '2.600.0000', descricao: 'SUS - Superavit Financeiro', grupo: '2', categoria: 'Saude' },
  { codigo: '3.500.0000', descricao: 'Operacoes de Credito - Exercicio Corrente', grupo: '3', categoria: 'Credito' },
  { codigo: '9.500.0000', descricao: 'Recursos Condicionados a Aprovacao Legislativa', grupo: '9', categoria: 'Condicionado' },
]

async function seedTenant(connectionString: string, schemaName: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 })
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      for (const m of MODALIDADES) {
        await tx`
          INSERT INTO modalidades_aplicacao (codigo, descricao, tipo, ativo)
          VALUES (${m.codigo}, ${m.descricao}, 'stn', true)
          ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao, tipo = 'stn'
        `
      }

      for (const f of FONTES) {
        await tx`
          INSERT INTO fontes_recurso (codigo, descricao, grupo, categoria, tipo, ativo)
          VALUES (${f.codigo}, ${f.descricao}, ${f.grupo}, ${f.categoria}, 'stn', true)
          ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao, grupo = EXCLUDED.grupo, categoria = EXCLUDED.categoria, tipo = 'stn'
        `
      }
    })
  } finally {
    await client.end()
  }
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) { console.error('[ERRO] DATABASE_URL ausente'); process.exit(1) }

  const tenantFilter = process.argv.slice(2).find(a => a.startsWith('--tenant='))?.split('=')[1]

  const db = createMasterDatabase(DATABASE_URL)
  const tenants = await db.query.tenants.findMany({
    where: (t, { eq, and, isNull }) =>
      and(eq(t.status, 'active'), isNull(t.deletedAt), tenantFilter ? eq(t.slug, tenantFilter) : undefined),
  })

  console.log(`[seed] Orcamento STN em ${tenants.length} tenant(s)...`)
  for (const tenant of tenants) {
    process.stdout.write(`  --> ${tenant.slug}: `)
    try {
      await seedTenant(DATABASE_URL, tenant.schemaName)
      console.log(`[OK] ${MODALIDADES.length} modalidades + ${FONTES.length} fontes`)
    } catch (err) {
      console.error(`[ERRO] ${(err as Error).message}`)
    }
  }

  process.exit(0)
}

main()
