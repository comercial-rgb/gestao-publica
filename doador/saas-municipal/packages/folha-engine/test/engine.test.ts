import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import { calcularHolerite, type RubricaParaCalcular } from '../src/engine/index.js'
import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
} from '../src/resolvers/index.js'
import type { ContextoCalculo, RppsAliquotas } from '../src/types.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'
const TEST_SCHEMA = `tenant_test_engine2_${Math.random().toString(36).slice(2, 8)}`

const COMP = new Date('2026-05-01T00:00:00Z')

// ============================================================
// Helpers de fixture (sem dependencia de DB tenant)
// ============================================================

function rubricaVencimento(valor: number): RubricaParaCalcular {
  return {
    rubricaId: 'r-vencimento',
    codigo: 'VENC',
    descricao: 'Vencimento base',
    tipo: 'PROVENTO',
    ordem: 1,
    estrategiaProporcionalidade: 'DIAS_REGISTRADOS',
    valorBase: valor,
    incideInss: true,
    incideIrrf: true,
    incideFgts: true,
    fundamentacao: 'Lei Mun. base salarial',
    codigoEsocial: '1000',
  }
}

const RPPS_14PCT: RppsAliquotas = {
  id: 'rpps-1',
  vigenciaInicio: '2024-01-01',
  vigenciaFim: null,
  aliquotaServidor: '0.1400',
  aliquotaPatronalNormal: '0.2200',
  aliquotaPatronalSuplementar: '0.0500',
  tetoContribuicao: null,
  salarioFamiliaValor: null,
  salarioFamiliaRendaMaxima: null,
  fundamentacaoLegal: 'Lei Mun. 100/2024',
  observacoes: null,
  ativa: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  createdBy: null,
} as RppsAliquotas

describe('engine.calcularHolerite -- cenarios completos', () => {
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

  async function montarContextoMockado(opts: {
    regime: 'rgps' | 'rpps' | 'isento'
    eventos?: ContextoCalculo['eventos']
    dependentes?: ContextoCalculo['dependentes']
    rppsAliquota?: RppsAliquotas | null
  }): Promise<ContextoCalculo> {
    const [tabelaInss, tabelaIrrf, sf] = await Promise.all([
      resolverTabelaInss({ publicDb, tenantDb, competencia: COMP }),
      resolverTabelaIrrf({ publicDb, tenantDb, competencia: COMP }),
      resolverSalarioFamilia({ publicDb, competencia: COMP }),
    ])

    return {
      vinculoId: 'v1',
      pessoaId: 'p1',
      competencia: COMP,
      regimePrevidenciario: opts.regime,
      tabelaInss,
      tabelaIrrf,
      salarioFamiliaTabela: sf,
      rppsAliquota: opts.rppsAliquota ?? null,
      eventos: opts.eventos ?? [],
      dependentes: opts.dependentes ?? [],
      consignacoes: [],
      outrosVinculosDaPessoa: [],
    }
  }

  // ============================================================
  // CENARIO 1: CLT (RGPS) basico
  // ============================================================
  it('CLT R$ 3.000 sem eventos: INSS ~248,61 + IRRF zero (redutor 2026)', async () => {
    const ctx = await montarContextoMockado({ regime: 'rgps' })

    const holerite = calcularHolerite({
      contexto: ctx,
      rubricas: [rubricaVencimento(3000)],
    })

    expect(holerite.totais.proventos).toBe(3000)
    expect(holerite.inss.valor).toBeCloseTo(248.61, 1)
    expect(holerite.irrf.valor).toBe(0) // 2026 com redutor -> zero
    expect(holerite.totais.liquido).toBeCloseTo(2751.39, 1)
    expect(holerite.hashSha256).toHaveLength(64)
  })

  // ============================================================
  // CENARIO 2: RPPS estatutario
  // ============================================================
  it('RPPS R$ 5.000 14% linear: INSS = 700,00', async () => {
    const ctx = await montarContextoMockado({
      regime: 'rpps',
      rppsAliquota: RPPS_14PCT,
    })

    const holerite = calcularHolerite({
      contexto: ctx,
      rubricas: [rubricaVencimento(5000)],
    })

    expect(holerite.totais.proventos).toBe(5000)
    expect(holerite.inss.valor).toBe(700)
    expect(holerite.inss.faixasUtilizadas).toHaveLength(1) // linear (1 faixa so)
    expect(holerite.totais.liquido).toBeCloseTo(5000 - 700 - holerite.irrf.valor, 1)
  })

  // ============================================================
  // CENARIO 3: Servidor ISENTO (estagiario)
  // ============================================================
  it('Servidor ISENTO: INSS = 0', async () => {
    const ctx = await montarContextoMockado({ regime: 'isento' })

    const holerite = calcularHolerite({
      contexto: ctx,
      rubricas: [rubricaVencimento(2000)],
    })

    expect(holerite.inss.valor).toBe(0)
    expect(holerite.inss.faixasUtilizadas).toHaveLength(0)
  })

  // ============================================================
  // CENARIO 4: Admissao dia 12 (proporcionalidade)
  // ============================================================
  it('Admissao dia 12: vencimento proporcional 19/30', async () => {
    const ctx = await montarContextoMockado({
      regime: 'rgps',
      eventos: [
        {
          id: 'e1',
          vinculoId: 'v1',
          competencia: '2026-05-01',
          tipo: 'ADMISSAO',
          dataInicio: '2026-05-12',
          dataFim: null,
          diasComputados: 19,
          documentoComprobatorioUrl: null,
          numeroProtocolo: null,
          observacao: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
        },
      ] as ContextoCalculo['eventos'],
    })

    const holerite = calcularHolerite({
      contexto: ctx,
      rubricas: [rubricaVencimento(3000)],
    })

    const rubricaCalculada = holerite.rubricas[0]!
    expect(rubricaCalculada.fatorProporcionalidade).toBeCloseTo(19 / 30, 3)
    expect(rubricaCalculada.valor).toBeCloseTo(1900.0, 1)
    expect(holerite.totais.proventos).toBeCloseTo(1900.0, 1)
  })

  // ============================================================
  // CENARIO 5: Salario-familia (renda baixa + 2 filhos)
  // ============================================================
  it('Renda 1500 com 2 filhos pequenos: SF = R$ 130', async () => {
    const ctx = await montarContextoMockado({
      regime: 'rgps',
      dependentes: [
        {
          id: 'd1',
          pessoaId: 'p1',
          nome: 'Filho1',
          cpf: null,
          dataNascimento: '2020-01-01',
          parentesco: 'FILHO',
          dependenteIR: false,
          dependenteSalarioFamilia: true,
          dependentePlanoSaude: false,
          invalido: false,
          dataInicioDependencia: '2020-01-01',
          dataFimDependencia: null,
          documentoComprobatorioUrl: null,
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
        },
        {
          id: 'd2',
          pessoaId: 'p1',
          nome: 'Filho2',
          cpf: null,
          dataNascimento: '2018-06-01',
          parentesco: 'FILHO',
          dependenteIR: false,
          dependenteSalarioFamilia: true,
          dependentePlanoSaude: false,
          invalido: false,
          dataInicioDependencia: '2018-06-01',
          dataFimDependencia: null,
          documentoComprobatorioUrl: null,
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
        },
      ] as ContextoCalculo['dependentes'],
    })

    const holerite = calcularHolerite({
      contexto: ctx,
      rubricas: [rubricaVencimento(1500)],
    })

    expect(holerite.salarioFamilia).not.toBeNull()
    expect(holerite.salarioFamilia!.valorTotal).toBe(130)
    expect(holerite.salarioFamilia!.numeroFilhosElegiveis).toBe(2)
    // Total proventos = salario + SF
    expect(holerite.totais.proventos).toBe(1500 + 130)
  })

  // ============================================================
  // CENARIO 6: Snapshot + hash deterministico
  // ============================================================
  it('mesmo input gera calculos deterministicos', async () => {
    const ctx = await montarContextoMockado({ regime: 'rgps' })

    const h1 = calcularHolerite({ contexto: ctx, rubricas: [rubricaVencimento(3000)] })
    const h2 = calcularHolerite({ contexto: ctx, rubricas: [rubricaVencimento(3000)] })

    expect(h1.totais.liquido).toBe(h2.totais.liquido)
    expect(h1.inss.valor).toBe(h2.inss.valor)
    expect(h1.irrf.valor).toBe(h2.irrf.valor)
  })
})
