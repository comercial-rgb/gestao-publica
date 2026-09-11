import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { provisionTenant } from '@saas-municipal/database/tenancy'

import {
  calcularHolerite,
  type RubricaParaCalcular,
} from '../src/engine/index.js'
import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
} from '../src/resolvers/index.js'
import {
  buildEventoRemuneracao,
  determinarCategoriaEsocial,
  determinarEventoRemuneracao,
  CATEGORIA_ESOCIAL,
} from '../src/esocial/index.js'
import type { ContextoCalculo } from '../src/types.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://saas:saas@localhost:5435/saas_municipal_test'
const TEST_SCHEMA = `tenant_test_esoc_${Math.random().toString(36).slice(2, 8)}`

const COMP = new Date('2026-05-01T00:00:00Z')

const EMPREGADOR = { cnpj: '12345678000190', razaoSocial: 'Municipio Teste' }
const TRABALHADOR = { cpf: '12345678901', nome: 'Joao Silva', dataNascimento: '1980-05-15' }

const RUBRICA_VENC: RubricaParaCalcular = {
  rubricaId: 'r-venc',
  codigo: 'VENCIMENTO',
  descricao: 'Vencimento Base',
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

describe('eSocial -- categoria + evento', () => {
  it('RGPS + EFETIVO -> categoria 101 (empregado geral)', () => {
    expect(
      determinarCategoriaEsocial({ regimePrevidenciario: 'rgps', tipoVinculo: 'EFETIVO' }),
    ).toBe(CATEGORIA_ESOCIAL.EMPREGADO_GERAL)
  })

  it('RPPS + EFETIVO -> categoria 301 (servidor efetivo RPPS)', () => {
    expect(
      determinarCategoriaEsocial({ regimePrevidenciario: 'rpps', tipoVinculo: 'EFETIVO' }),
    ).toBe(CATEGORIA_ESOCIAL.SERVIDOR_EFETIVO_RPPS)
  })

  it('RGPS + COMISSIONADO -> categoria 302', () => {
    expect(
      determinarCategoriaEsocial({ regimePrevidenciario: 'rgps', tipoVinculo: 'COMISSIONADO' }),
    ).toBe(CATEGORIA_ESOCIAL.SERVIDOR_COMISSIONADO_RGPS)
  })

  it('ISENTO -> categoria 901 (estagiario)', () => {
    expect(
      determinarCategoriaEsocial({ regimePrevidenciario: 'isento', tipoVinculo: 'ESTAGIO' }),
    ).toBe(CATEGORIA_ESOCIAL.ESTAGIARIO)
  })

  it('override forca categoria especifica', () => {
    expect(
      determinarCategoriaEsocial({
        regimePrevidenciario: 'rgps',
        tipoVinculo: 'EFETIVO',
        override: CATEGORIA_ESOCIAL.SERVIDOR_MEMBRO_PODER,
      }),
    ).toBe(CATEGORIA_ESOCIAL.SERVIDOR_MEMBRO_PODER)
  })

  it('regime RGPS -> evento S-1200', () => {
    expect(determinarEventoRemuneracao('rgps')).toBe('S-1200')
  })

  it('regime RPPS -> evento S-1202', () => {
    expect(determinarEventoRemuneracao('rpps')).toBe('S-1202')
  })
})

describe('eSocial -- builder de XML S-1200/S-1202', () => {
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

  it('S-1200 gera XML valido com header correto', () => {
    const holerite = calcularHolerite({ contexto, rubricas: [RUBRICA_VENC] })

    const evento = buildEventoRemuneracao({
      holerite,
      regimePrevidenciario: 'rgps',
      empregador: EMPREGADOR,
      trabalhador: TRABALHADOR,
      vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' },
      folha: { idDmDev: 'FOLHA-202605', ideTabRubr: 'TAB001', codLotacao: '1' },
      ambiente: 'TESTE',
    })

    expect(evento.tipoEvento).toBe('S-1200')
    expect(evento.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(evento.xml).toContain('evtRemun')
    expect(evento.xml).toContain('<perApur>2026-05</perApur>')
    expect(evento.xml).toContain('<cpfTrab>12345678901</cpfTrab>')
    expect(evento.xml).toContain('<codCateg>101</codCateg>')
    expect(evento.idEvento).toMatch(/^ID\d{14}/)
  })

  it('S-1202 (RPPS) usa root element evtRmnRPPS', () => {
    const rppsAliquota = {
      id: 'rpps-1', vigenciaInicio: '2024-01-01', vigenciaFim: null,
      aliquotaServidor: '0.1400', aliquotaPatronalNormal: '0.2200', aliquotaPatronalSuplementar: null,
      tetoContribuicao: null, salarioFamiliaValor: null, salarioFamiliaRendaMaxima: null,
      fundamentacaoLegal: 'Lei Mun. teste', observacoes: null, ativa: true,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null,
    } as any
    const ctxRpps: ContextoCalculo = { ...contexto, regimePrevidenciario: 'rpps', rppsAliquota }
    const holerite = calcularHolerite({ contexto: ctxRpps, rubricas: [RUBRICA_VENC] })

    const evento = buildEventoRemuneracao({
      holerite,
      regimePrevidenciario: 'rpps',
      empregador: EMPREGADOR,
      trabalhador: TRABALHADOR,
      vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' },
      folha: { idDmDev: 'FOLHA-202605', ideTabRubr: 'TAB001', codLotacao: '1' },
      ambiente: 'TESTE',
    })

    expect(evento.tipoEvento).toBe('S-1202')
    expect(evento.xml).toContain('evtRmnRPPS')
    expect(evento.xml).toContain('<codCateg>301</codCateg>')
  })

  it('XML contem detVerbas com vencimento + INSS + IRRF (se houver)', () => {
    const holerite = calcularHolerite({ contexto, rubricas: [RUBRICA_VENC] })

    const evento = buildEventoRemuneracao({
      holerite,
      regimePrevidenciario: 'rgps',
      empregador: EMPREGADOR,
      trabalhador: TRABALHADOR,
      vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' },
      folha: { idDmDev: 'FOLHA-202605', ideTabRubr: 'TAB001', codLotacao: '1' },
      ambiente: 'TESTE',
    })

    expect(evento.xml).toContain('<codRubr>1000</codRubr>') // vencimento
    expect(evento.xml).toContain('<vrRubr>3000.00</vrRubr>')

    if (holerite.inss.valor > 0) {
      expect(evento.xml).toContain('<codRubr>9201</codRubr>') // INSS
    }
  })

  it('xmlCompacto remove whitespace entre tags', () => {
    const holerite = calcularHolerite({ contexto, rubricas: [RUBRICA_VENC] })
    const evento = buildEventoRemuneracao({
      holerite,
      regimePrevidenciario: 'rgps',
      empregador: EMPREGADOR,
      trabalhador: TRABALHADOR,
      vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' },
      folha: { idDmDev: 'FOLHA-202605', ideTabRubr: 'TAB001', codLotacao: '1' },
    })

    expect(evento.xmlCompacto).not.toMatch(/>\s+</)
    expect(evento.xmlCompacto.length).toBeLessThan(evento.xml.length)
  })

  it('ambientes diferentes geram tpAmb correto', () => {
    const holerite = calcularHolerite({ contexto, rubricas: [RUBRICA_VENC] })
    const baseParams = {
      holerite,
      regimePrevidenciario: 'rgps' as const,
      empregador: EMPREGADOR,
      trabalhador: TRABALHADOR,
      vinculo: { matricula: '12345', tipoVinculo: 'EFETIVO' as const },
      folha: { idDmDev: 'F', ideTabRubr: 'T', codLotacao: '1' },
    }

    expect(buildEventoRemuneracao({ ...baseParams, ambiente: 'PRODUCAO' }).xml).toContain('<tpAmb>1</tpAmb>')
    expect(buildEventoRemuneracao({ ...baseParams, ambiente: 'PRODUCAO_RESTRITA' }).xml).toContain('<tpAmb>2</tpAmb>')
    expect(buildEventoRemuneracao({ ...baseParams, ambiente: 'TESTE' }).xml).toContain('<tpAmb>3</tpAmb>')
  })
})
