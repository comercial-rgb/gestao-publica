/**
 * Seed master — dados iniciais do schema public:
 *   - Planos (Bronze, Prata, Ouro)
 *   - Módulos (Receitas, Despesas, Folha, etc)
 *   - Plan ↔ Module
 *   - Super admin inicial (se SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD existirem no .env)
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { hash } from '@node-rs/argon2'
import * as schema from './schema/public.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(__dirname, '../../../.env'), override: true })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[ERRO] DATABASE_URL nao definida no .env')
  process.exit(1)
}

const PLANS = [
  { slug: 'bronze',  name: 'Bronze',  monthlyPrice: '999.00', description: 'Cadastros + 1 módulo' },
  { slug: 'prata',   name: 'Prata',   monthlyPrice: '1999.00', description: 'Cadastros + 3 módulos' },
  { slug: 'ouro',    name: 'Ouro',    monthlyPrice: '3999.00', description: 'Todos os módulos + analytics' },
]

const MODULES = [
  // Camada 1 — Fundação
  { slug: 'cadastros',         name: 'Cadastros Base',           category: 'fundacao' },
  { slug: 'textos_juridicos',  name: 'Textos Jurídicos',         category: 'fundacao' },
  { slug: 'usuarios',          name: 'Usuários e Permissões',    category: 'fundacao' },
  // Camada 2 — Registro
  { slug: 'receitas',          name: 'Receitas',                 category: 'registro' },
  { slug: 'orcamento',         name: 'Orcamento',                category: 'registro' },
  { slug: 'despesas',          name: 'Despesas',                 category: 'registro' },
  { slug: 'folha',             name: 'Folha de Pagamento',       category: 'registro' },
  // Camada 3 — Inteligência
  { slug: 'analise_gerencial', name: 'Análise Gerencial',        category: 'inteligencia' },
  { slug: 'demonstrativos',    name: 'Demonstrativos Fiscais',   category: 'inteligencia' },
  { slug: 'indices',           name: 'Índices Constitucionais',  category: 'inteligencia' },
  { slug: 'verificacoes',      name: 'Verificações Internas',    category: 'inteligencia' },
  { slug: 'audiencia_publica', name: 'Audiência Pública',        category: 'inteligencia' },
]

async function main() {
  console.log('[seed] Seed master iniciando...')

  const client = postgres(DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema, casing: 'snake_case' })

  try {
    // Planos
    for (const plan of PLANS) {
      await db.insert(schema.plans).values(plan).onConflictDoNothing()
    }
    console.log(`   ✓ ${PLANS.length} planos`)

    // Módulos
    for (const mod of MODULES) {
      await db.insert(schema.modules).values(mod).onConflictDoNothing()
    }
    console.log(`   ✓ ${MODULES.length} módulos`)

    // Plan ↔ Module
    // Bronze: cadastros + textos_juridicos + usuarios
    // Prata: + receitas + despesas + folha
    // Ouro: + todos os de inteligência
    const planModulesMap: Record<string, string[]> = {
      bronze: ['cadastros', 'textos_juridicos', 'usuarios'],
      prata:  ['cadastros', 'textos_juridicos', 'usuarios', 'receitas', 'despesas', 'folha'],
      ouro:   MODULES.map((m) => m.slug),
    }

    for (const [planSlug, moduleSlugs] of Object.entries(planModulesMap)) {
      const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.slug, planSlug) })
      if (!plan) continue

      for (const moduleSlug of moduleSlugs) {
        const mod = await db.query.modules.findFirst({ where: (m, { eq }) => eq(m.slug, moduleSlug) })
        if (!mod) continue

        await db
          .insert(schema.planModules)
          .values({ planId: plan.id, moduleId: mod.id, addonPrice: '0' })
          .onConflictDoNothing()
      }
    }
    console.log(`   ✓ vínculos plano↔módulo`)

    // Super admin (opcional)
    const adminEmail = process.env.SEED_ADMIN_EMAIL
    const adminPassword = process.env.SEED_ADMIN_PASSWORD
    if (adminEmail && adminPassword) {
      const passwordHash = await hash(adminPassword, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      })
      await db
        .insert(schema.masterUsers)
        .values({
          email: adminEmail,
          name: 'Super Admin',
          passwordHash,
          role: 'super_admin',
          active: true,
        })
        .onConflictDoNothing()
      console.log(`   ✓ super_admin: ${adminEmail}`)
    } else {
      console.log(`   [AVISO] super_admin nao criado (defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD)`)
    }

    console.log('[OK] Seed master concluido.')
  } catch (err) {
    console.error('[ERRO] Falha no seed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
