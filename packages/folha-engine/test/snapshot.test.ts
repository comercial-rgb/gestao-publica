import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import {
  calcularHolerite,
  montarSnapshotFiscal,
  montarSnapshotComMetadata,
  type RubricaParaCalcular,
} from '../src/engine/index.js'
import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
} from '../src/resolvers/index.js'
import { hashSnapshotSha256 } from '@saas-municipal/database/utils/hash-snapshot'
import type { ContextoCalculo } from '../src/types.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'
const TEST_SCHEMA = `tenant_test_snap_${Math.random().toString(36).slice(2, 8)}`

const COMP = new Date('2026-05-01T00:00:00Z')

const RUBRICA_TESTE: RubricaParaCalcular = {
  rubricaId: 'r1',
  codigo: 'VENC',
  descricao: 'Vencimento',
  tipo: 'PROVENTO',
  ordem: 1,
  estrategiaProporcionalidade: 'DIAS_REGISTRADOS',
  valorBase: 3000,
  incideInss: true,
  incideIrrf: true,
  incideFgts: true,
  fundamentacao: 'Lei base',
  codigoEsocial: '1000',
}

describe('snapshot fiscal -- idempotencia e determinismo', () => {
  let publicSql: postgres.Sql
  let tenantSql: postgres.Sql
  let publicDb: ReturnType<typeof drizzle>
  let tenantDb: ReturnType<typeof drizzle>
  let contexto: ContextoCalculo

  beforeAll(async () => {
    await provisionTenant(TEST_DATABASE_URL, TEST_SCHEMA)
    publicSql = postgres(TEST_DATABASE_URL, { max: 1 })
    publicDb = drizzle(publicSql)
    await seedFolhaPublico(publicDb)
    tenantSql = postgres(TEST_DATABASE_URL, { max: 1, connection: { search_path: `${TEST_SCHEMA}, public` } })
    tenantDb = drizzle(tenantSql)

    const [tabelaInss, tabelaIrrf, sf] = await Promise.all([
      resolverTabelaInss({ publicDb, tenantDb, competencia: COMP }),
      resolverTabelaIrrf({ publicDb, tenantDb, competencia: COMP }),
      resolverSalarioFamilia({ publicDb, competencia: COMP }),
    ])

    contexto = {
      vinculoId: 'v1',
      pessoaId: 'p1',
      competencia: COMP,
      regimePrevidenciario: 'rgps',
      tabelaInss,
      tabelaIrrf,
      salarioFamiliaTabela: sf,
      rppsAliquota: null,
      eventos: [],
      dependentes: [],
      consignacoes: [],
      outrosVinculosDaPessoa: [],
    }
  })

  afterAll(async () => {
    if (publicSql) {
      await publicSql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await publicSql.end()
    }
    if (tenantSql) await tenantSql.end()
  })

  it('mesmo input gera MESMO hash (idempotencia)', () => {
    const h1 = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE] })
    const h2 = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE] })

    // Hashes IGUAIS -- snapshot fiscal sem timestamps
    expect(h1.hashSha256).toBe(h2.hashSha256)
    expect(h1.hashSha256).toHaveLength(64)
  })

  it('valor base diferente gera hash DIFERENTE', () => {
    const h1 = calcularHolerite({ contexto, rubricas: [{ ...RUBRICA_TESTE, valorBase: 3000 }] })
    const h2 = calcularHolerite({ contexto, rubricas: [{ ...RUBRICA_TESTE, valorBase: 3001 }] })

    expect(h1.hashSha256).not.toBe(h2.hashSha256)
  })

  it('snapshot fiscal NAO contem metadata de execucao', () => {
    const h = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE] })
    const fiscal = montarSnapshotFiscal(h, 'rgps')

    expect(fiscal).not.toHaveProperty('metadata')
    expect(JSON.stringify(fiscal)).not.toContain('calculadoEm')
    expect(JSON.stringify(fiscal)).not.toContain('duracaoMs')
    expect(JSON.stringify(fiscal)).not.toContain('workerId')
  })

  it('snapshot com metadata CONTEM dados de execucao', () => {
    const h = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE], workerId: 'worker-1' })
    const completo = montarSnapshotComMetadata(h, 'rgps')

    expect(completo.metadata).toBeDefined()
    expect(completo.metadata.calculadoEm).toBeTruthy()
    expect(completo.metadata.workerId).toBe('worker-1')
    expect(completo.metadata.duracaoMs).toBeGreaterThanOrEqual(0)
  })

  it('hash do snapshot fiscal e estavel mesmo com workerId diferente', () => {
    const h1 = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE], workerId: 'w1' })
    const h2 = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE], workerId: 'w2' })

    expect(h1.hashSha256).toBe(h2.hashSha256) // workerId so vai na metadata
  })

  it('hashSnapshotSha256 do snapshot fiscal direto bate com h.hashSha256', () => {
    const h = calcularHolerite({ contexto, rubricas: [RUBRICA_TESTE] })
    const fiscal = montarSnapshotFiscal(h, 'rgps')
    const hashManual = hashSnapshotSha256(fiscal)

    expect(hashManual).toBe(h.hashSha256)
  })
})
