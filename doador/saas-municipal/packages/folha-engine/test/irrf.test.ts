import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import { resolverTabelaIrrf } from '../src/resolvers/index.js'
import { calcularIrrf } from '../src/calculadoras/irrf.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'
const TEST_SCHEMA = `tenant_test_irrf_${Math.random().toString(36).slice(2, 8)}`

describe('calcularIrrf', () => {
  let publicSql: postgres.Sql
  let tenantSql: postgres.Sql
  let publicDb: ReturnType<typeof drizzle>
  let tenantDb: ReturnType<typeof drizzle>

  beforeAll(async () => {
    await provisionTenant(TEST_DATABASE_URL, TEST_SCHEMA)
    publicSql = postgres(TEST_DATABASE_URL, { max: 1 })
    publicDb = drizzle(publicSql)
    await seedFolhaPublico(publicDb)
    tenantSql = postgres(TEST_DATABASE_URL, { max: 1, connection: { search_path: `${TEST_SCHEMA}, public` } })
    tenantDb = drizzle(tenantSql)
  })

  afterAll(async () => {
    if (publicSql) {
      await publicSql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await publicSql.end()
    }
    if (tenantSql) await tenantSql.end()
  })

  // ============================================================
  // 2026 -- Reforma do IR (Lei 15.270/2025)
  // ============================================================

  it('IRRF 2026: renda R$ 4.000 zera pelo REDUTOR Lei 15.270/2025', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2026-05-01T00:00:00Z'),
    })

    const r = calcularIrrf({
      rendaBrutaIrrf: 4000,
      inssDeduzido: 350, // ~ INSS 2026 sobre 4000
      numeroDependentesIr: 0,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    expect(r.valor).toBeCloseTo(0, 2) // redutor zera
    expect(r.cenarioUtilizado).toBe('PROGRESSIVO_COM_REDUTOR')
  })

  it('IRRF 2026: renda R$ 8.000 paga IRRF (acima do limite do redutor)', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2026-05-01T00:00:00Z'),
    })

    const r = calcularIrrf({
      rendaBrutaIrrf: 8000,
      inssDeduzido: 850,
      numeroDependentesIr: 0,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    expect(r.valor).toBeGreaterThan(0)
    // Acima de R$ 7.350 -> redutor zera -> cenario A ou C vence
    expect(['PROGRESSIVO_DEDUCOES', 'SIMPLIFICADO']).toContain(r.cenarioUtilizado)
  })

  it('IRRF 2026: sempre calcula 3 cenarios paralelos (auditoria)', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2026-05-01T00:00:00Z'),
    })

    const r = calcularIrrf({
      rendaBrutaIrrf: 6000,
      inssDeduzido: 700,
      numeroDependentesIr: 2,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    expect(r.cenariosCalculados).toHaveLength(3)
    const nomes = r.cenariosCalculados.map((c) => c.nome).sort()
    expect(nomes).toEqual(['PROGRESSIVO_COM_REDUTOR', 'PROGRESSIVO_DEDUCOES', 'SIMPLIFICADO'])
    r.cenariosCalculados.forEach((c) => {
      if (c.aplicavel) expect(c.valor).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================================
  // Pre-2024 -- apenas cenario A aplicavel
  // ============================================================

  it('IRRF 2022: apenas PROGRESSIVO_DEDUCOES aplicavel', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2022-06-01T00:00:00Z'),
    })

    const r = calcularIrrf({
      rendaBrutaIrrf: 5000,
      inssDeduzido: 500,
      numeroDependentesIr: 0,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    expect(r.cenarioUtilizado).toBe('PROGRESSIVO_DEDUCOES')

    const simplificado = r.cenariosCalculados.find((c) => c.nome === 'SIMPLIFICADO')!
    const redutor = r.cenariosCalculados.find((c) => c.nome === 'PROGRESSIVO_COM_REDUTOR')!
    expect(simplificado.aplicavel).toBe(false)
    expect(redutor.aplicavel).toBe(false)
  })

  // ============================================================
  // Cenarios com dependentes (deducao por dependente)
  // ============================================================

  it('IRRF 2024: 3 dependentes vencem cenario SIMPLIFICADO', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2024-06-01T00:00:00Z'),
    })

    // Renda 4500 com 3 dependentes -> 3 x 189,59 = 568,77 deducao
    // > 528 do desconto simplificado -> cenario A deve vencer
    const r = calcularIrrf({
      rendaBrutaIrrf: 4500,
      inssDeduzido: 450,
      numeroDependentesIr: 3,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    expect(r.cenarioUtilizado).toBe('PROGRESSIVO_DEDUCOES')
    expect(r.deducoesAplicadas.find((d) => d.tipo === 'DEPENDENTE')).toBeDefined()
  })

  it('IRRF 2024: sem dependentes vence SIMPLIFICADO', async () => {
    const tabela = await resolverTabelaIrrf({
      publicDb,
      tenantDb,
      competencia: new Date('2024-06-01T00:00:00Z'),
    })

    const r = calcularIrrf({
      rendaBrutaIrrf: 4500,
      inssDeduzido: 450,
      numeroDependentesIr: 0,
      pensaoAlimenticia: 0,
      servidorMaior65Anos: false,
      tabela,
    })

    // Sem dependentes, R$ 528 do simplificado supera deducoes legais
    expect(r.cenarioUtilizado).toBe('SIMPLIFICADO')
  })
})
