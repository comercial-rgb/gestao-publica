/**
 * Smoke tests dos resolvers -- confirma que retornam dados corretos
 * pra cada cenario de vigencia (camada federal, override custom, ausencia).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
  resolverRppsAliquota,
  temDescontoSimplificadoAplicavel,
  temRedutorReforma,
} from '../src/resolvers/index.js'
import { TabelaVigenteNaoEncontrada } from '../src/errors.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'

const TEST_SCHEMA = `tenant_test_engine_${Math.random().toString(36).slice(2, 8)}`

describe('resolvers de tabelas fiscais', () => {
  let publicSql: postgres.Sql
  let tenantSql: postgres.Sql
  let publicDb: ReturnType<typeof drizzle>
  let tenantDb: ReturnType<typeof drizzle>

  beforeAll(async () => {
    // Cria schema de tenant temporario com todas as migrations
    await provisionTenant(TEST_DATABASE_URL, TEST_SCHEMA)

    publicSql = postgres(TEST_DATABASE_URL, { max: 1 })
    publicDb = drizzle(publicSql)

    // Garante que seed publico esta aplicado
    await seedFolhaPublico(publicDb)

    // Tenant com search_path apontando pro schema criado
    tenantSql = postgres(TEST_DATABASE_URL, {
      max: 1,
      connection: { search_path: `${TEST_SCHEMA}, public` },
    })
    tenantDb = drizzle(tenantSql)
  })

  afterAll(async () => {
    // Cleanup: dropa o schema de teste
    if (publicSql) {
      await publicSql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await publicSql.end()
    }
    if (tenantSql) {
      await tenantSql.end()
    }
  })

  describe('INSS', () => {
    it('resolve tabela 2026 federal oficial', async () => {
      const tabela = await resolverTabelaInss({
        publicDb,
        tenantDb,
        competencia: new Date('2026-05-01T00:00:00Z'),
      })

      expect(tabela.origem).toBe('FEDERAL_OFICIAL')
      expect(tabela.tetoContribuicao).toBe('8475.55')
      expect(tabela.faixas).toHaveLength(4)
      expect(tabela.faixas[0]!.aliquota).toBe('0.0750')
      expect(tabela.faixas[3]!.aliquota).toBe('0.1400')
    })

    it('resolve tabela 2020 (post-Reforma Previdencia)', async () => {
      const tabela = await resolverTabelaInss({
        publicDb,
        tenantDb,
        competencia: new Date('2020-06-01T00:00:00Z'),
      })

      expect(tabela.origem).toBe('FEDERAL_OFICIAL')
      expect(tabela.tetoContribuicao).toBe('6101.06')
    })

    it('lanca erro se competencia antes da menor vigencia', async () => {
      await expect(() =>
        resolverTabelaInss({
          publicDb,
          tenantDb,
          competencia: new Date('2019-01-01T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(TabelaVigenteNaoEncontrada)
    })
  })

  describe('IRRF', () => {
    it('resolve tabela 2026 com redutor Reforma Lei 15.270/2025', async () => {
      const tabela = await resolverTabelaIrrf({
        publicDb,
        tenantDb,
        competencia: new Date('2026-05-01T00:00:00Z'),
      })

      expect(tabela.redutorBase).toBe('978.62')
      expect(tabela.redutorFator).toBe('0.13314500')
      expect(temRedutorReforma(tabela)).toBe(true)
      expect(temDescontoSimplificadoAplicavel(tabela)).toBe(true)
    })

    it('resolve tabela 2022 sem desconto simplificado nem redutor', async () => {
      const tabela = await resolverTabelaIrrf({
        publicDb,
        tenantDb,
        competencia: new Date('2022-06-01T00:00:00Z'),
      })

      expect(temRedutorReforma(tabela)).toBe(false)
      expect(temDescontoSimplificadoAplicavel(tabela)).toBe(false)
    })

    it('resolve tabela mai/2023 com isencao R$ 2.112', async () => {
      const tabela = await resolverTabelaIrrf({
        publicDb,
        tenantDb,
        competencia: new Date('2023-06-01T00:00:00Z'),
      })

      // Faixa 1 isenta vai ate 2.112,00
      expect(tabela.faixas[0]!.baseFim).toBe('2112.00')
      expect(temDescontoSimplificadoAplicavel(tabela)).toBe(false)
    })
  })

  describe('Salario-familia', () => {
    it('resolve valor 2024', async () => {
      const tabela = await resolverSalarioFamilia({
        publicDb,
        competencia: new Date('2024-06-01T00:00:00Z'),
      })

      expect(tabela.valorPorFilho).toBe('62.04')
      expect(tabela.rendaMaxima).toBe('1819.26')
      expect(tabela.idadeMaximaFilho).toBe(14)
    })
  })

  describe('RPPS aliquotas', () => {
    it('retorna null se tenant nao tem RPPS configurado', async () => {
      const aliquota = await resolverRppsAliquota({
        tenantDb,
        competencia: new Date('2026-05-01T00:00:00Z'),
      })
      expect(aliquota).toBeNull()
    })
  })
})
