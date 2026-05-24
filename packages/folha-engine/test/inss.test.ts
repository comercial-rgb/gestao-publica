import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import { resolverTabelaInss } from '../src/resolvers/index.js'
import {
  calcularInssRgps,
  calcularInssRpps,
  aplicarTetoAgregadoInss,
  type ContribuicaoVinculo,
} from '../src/calculadoras/inss.js'
import { RppsSemAliquotaVigente } from '../src/errors.js'
import type { RppsAliquotas } from '../src/types.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'
const TEST_SCHEMA = `tenant_test_inss_${Math.random().toString(36).slice(2, 8)}`

describe('calcularInssRgps', () => {
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

  it('INSS 2026 sobre R$ 3.000 = R$ 248,61', async () => {
    const tabela = await resolverTabelaInss({
      publicDb,
      tenantDb,
      competencia: new Date('2026-05-01T00:00:00Z'),
    })
    const r = calcularInssRgps({ base: 3000, tabela })
    expect(r.valor).toBeCloseTo(248.61, 1)
    expect(r.tetoAplicado).toBe(false)
    expect(r.faixasUtilizadas).toHaveLength(3)
  })

  it('INSS 2026 sobre R$ 15.000 trava no teto = R$ 988,08', async () => {
    const tabela = await resolverTabelaInss({
      publicDb,
      tenantDb,
      competencia: new Date('2026-05-01T00:00:00Z'),
    })
    const r = calcularInssRgps({ base: 15000, tabela })
    expect(r.valor).toBeCloseTo(988.08, 1)
    expect(r.tetoAplicado).toBe(true)
    expect(r.base).toBe(8475.55)
  })

  it('INSS 2020 sobre R$ 1.000 = R$ 75,00 (faixa 1 inteira)', async () => {
    const tabela = await resolverTabelaInss({
      publicDb,
      tenantDb,
      competencia: new Date('2020-06-01T00:00:00Z'),
    })
    const r = calcularInssRgps({ base: 1000, tabela })
    expect(r.valor).toBe(75.0)
  })
})

describe('calcularInssRpps', () => {
  it('RPPS 14% linear sobre R$ 5.000 = R$ 700,00', () => {
    const aliquota: RppsAliquotas = {
      id: 'r1',
      vigenciaInicio: '2024-01-01',
      vigenciaFim: null,
      aliquotaServidor: '0.1400',
      aliquotaPatronalNormal: '0.2200',
      aliquotaPatronalSuplementar: '0.0500',
      tetoContribuicao: null,
      salarioFamiliaValor: null,
      salarioFamiliaRendaMaxima: null,
      fundamentacaoLegal: 'Lei Mun. XX/YY',
      observacoes: null,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: null,
    } as RppsAliquotas

    const r = calcularInssRpps({
      base: 5000,
      aliquota,
      competencia: new Date('2026-05-01'),
    })
    expect(r.valor).toBe(700.0)
    expect(r.tetoAplicado).toBe(false)
  })

  it('Lanca erro se RPPS sem aliquota configurada', () => {
    expect(() =>
      calcularInssRpps({
        base: 5000,
        aliquota: null,
        competencia: new Date('2026-05-01'),
      }),
    ).toThrow(RppsSemAliquotaVigente)
  })
})

describe('aplicarTetoAgregadoInss', () => {
  it('Soma abaixo do teto: sem ajuste', () => {
    const contribs: ContribuicaoVinculo[] = [
      { vinculoId: 'v1', regimePrevidenciario: 'rgps', base: 3000, valor: 248.61 },
      { vinculoId: 'v2', regimePrevidenciario: 'rgps', base: 2000, valor: 158.16 },
    ]
    const r = aplicarTetoAgregadoInss(contribs, 988.08)
    expect(r.ajusteAplicado).toBe(false)
    expect(r.contribuicoes[0]!.valor).toBe(248.61)
    expect(r.contribuicoes[1]!.valor).toBe(158.16)
  })

  it('Soma acima do teto: rateia proporcionalmente', () => {
    const contribs: ContribuicaoVinculo[] = [
      { vinculoId: 'v1', regimePrevidenciario: 'rgps', base: 7000, valor: 800.0 },
      { vinculoId: 'v2', regimePrevidenciario: 'rgps', base: 5000, valor: 600.0 },
    ]
    // Total: 1400, teto 988.08
    const r = aplicarTetoAgregadoInss(contribs, 988.08)
    expect(r.ajusteAplicado).toBe(true)
    expect(r.totalDepois).toBeCloseTo(988.08, 2)
    expect(r.excedente).toBeCloseTo(411.92, 2)
    // Soma final == teto exato
    const soma = r.contribuicoes.reduce((s, c) => s + c.valor, 0)
    expect(soma).toBeCloseTo(988.08, 2)
  })

  it('Vinculos RPPS NAO agregam com RGPS', () => {
    const contribs: ContribuicaoVinculo[] = [
      { vinculoId: 'v1', regimePrevidenciario: 'rpps', base: 10000, valor: 1400.0 },
      { vinculoId: 'v2', regimePrevidenciario: 'rgps', base: 3000, valor: 248.61 },
    ]
    const r = aplicarTetoAgregadoInss(contribs, 988.08)
    expect(r.ajusteAplicado).toBe(false) // so 248.61 de RGPS, abaixo do teto
    expect(r.contribuicoes.find((c) => c.regimePrevidenciario === 'rpps')!.valor).toBe(1400.0)
  })
})
