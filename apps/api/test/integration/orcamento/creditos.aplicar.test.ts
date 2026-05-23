import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { buildApp } from '../../../src/app.js'
import { env } from '../../../src/env.js'
import { provisionTestTenant, queryTenant, type TestTenantHandle } from '../../helpers/db.js'
import { signTestTenantToken, buildTenantCookieHeader } from '../../helpers/auth.js'
import { seedOrcamentoBasico, seedCreditoAprovado, type OrcamentoFixtures } from '../../fixtures.js'

describe('POST /tenant/orcamento/creditos/:id/aplicar', () => {
  let app: FastifyInstance
  let tenant: TestTenantHandle
  let fixtures: OrcamentoFixtures
  let cookie: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    tenant = await provisionTestTenant()
    fixtures = await seedOrcamentoBasico(tenant.schemaName, tenant.adminUserId)

    const token = await signTestTenantToken({
      userId: tenant.adminUserId,
      tenantId: tenant.tenantId,
      schemaName: tenant.schemaName,
      roles: tenant.roles,
      permissions: tenant.permissions,
      email: tenant.adminEmail,
    })
    cookie = buildTenantCookieHeader(token)
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await tenant.dispose()
  })

  beforeEach(async () => {
    const client = postgres(env.DATABASE_URL, { max: 1 })
    try {
      await client.unsafe(`SET search_path TO "${tenant.schemaName}", public`)
      await client`
        UPDATE dotacoes
        SET valor_atualizado = valor_inicial,
            valor_reservado = '0',
            valor_empenhado = '0',
            valor_liquidado = '0',
            valor_pago = '0'
        WHERE id IN (${fixtures.dotacaoAId}::uuid, ${fixtures.dotacaoBId}::uuid)
      `
      await client`
        DELETE FROM dotacoes_historico_valor
        WHERE dotacao_id IN (${fixtures.dotacaoAId}::uuid, ${fixtures.dotacaoBId}::uuid)
      `
      await client`
        DELETE FROM creditos_orcamentarios WHERE lei_orcamentaria_id = ${fixtures.loaId}::uuid
      `
    } finally {
      await client.end()
    }
  })

  it('aplica crédito válido (1 reforço + 1 anulação), atualiza saldos e grava 2 entradas no histórico', async () => {
    const { creditoId } = await seedCreditoAprovado(
      tenant.schemaName,
      tenant.adminUserId,
      fixtures,
      {
        valorReforcoA: '30000.00',
        valorAnulacaoB: '20000.00',
        numero: 'Decreto HAPPY-001',
      },
    )

    const response = await app.inject({
      method: 'POST',
      url: `/tenant/orcamento/creditos/${creditoId}/aplicar`,
      headers: {
        cookie,
        'X-Tenant-Slug': tenant.slug,
        'X-CSRF-Token': 'test-csrf',
        'Content-Type': 'application/json',
      },
      payload: { confirmNumero: 'Decreto HAPPY-001' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      status: string
      linhasAfetadas: number
      totalDelta: string
    }
    expect(body.status).toBe('aplicado')
    expect(body.linhasAfetadas).toBe(2)
    expect(body.totalDelta).toBe('10000.00')

    const dotA = await queryTenant(
      tenant.schemaName,
      'SELECT valor_atualizado::text as v FROM dotacoes WHERE id = $1',
      [fixtures.dotacaoAId],
    )
    expect(dotA[0]?.v).toBe('130000.00')

    const dotB = await queryTenant(
      tenant.schemaName,
      'SELECT valor_atualizado::text as v FROM dotacoes WHERE id = $1',
      [fixtures.dotacaoBId],
    )
    expect(dotB[0]?.v).toBe('30000.00')

    const historico = await queryTenant(
      tenant.schemaName,
      'SELECT dotacao_id, delta::text, motivo FROM dotacoes_historico_valor WHERE credito_id = $1',
      [creditoId],
    )
    expect(historico).toHaveLength(2)
    expect(
      historico.some((h) => h.delta === '30000.00' || h.delta === '-20000.00'),
    ).toBe(true)
    expect(
      historico.every((h) => String(h.motivo).includes('Decreto HAPPY-001')),
    ).toBe(true)

    const credito = await queryTenant(
      tenant.schemaName,
      'SELECT status, aplicado_em FROM creditos_orcamentarios WHERE id = $1',
      [creditoId],
    )
    expect(credito[0]?.status).toBe('aplicado')
    expect(credito[0]?.aplicado_em).not.toBeNull()
  })

  it('rejeita aplicação com anulação maior que disponível e NÃO commita nada', async () => {
    const { creditoId } = await seedCreditoAprovado(
      tenant.schemaName,
      tenant.adminUserId,
      fixtures,
      {
        valorReforcoA: '30000.00',
        valorAnulacaoB: '99999.00',
        numero: 'Decreto INVALID-001',
      },
    )

    const response = await app.inject({
      method: 'POST',
      url: `/tenant/orcamento/creditos/${creditoId}/aplicar`,
      headers: {
        cookie,
        'X-Tenant-Slug': tenant.slug,
        'X-CSRF-Token': 'test-csrf',
        'Content-Type': 'application/json',
      },
      payload: { confirmNumero: 'Decreto INVALID-001' },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as {
      error: string
      problemas?: Array<{ motivo: string }>
    }
    expect(body.error).toBe('AplicacaoBloqueada')
    expect(body.problemas).toBeDefined()
    expect(body.problemas!.length).toBeGreaterThan(0)
    expect(body.problemas![0]!.motivo.toLowerCase()).toContain('negativo')

    const dotA = await queryTenant(
      tenant.schemaName,
      'SELECT valor_atualizado::text as v FROM dotacoes WHERE id = $1',
      [fixtures.dotacaoAId],
    )
    expect(dotA[0]?.v).toBe('100000.00')

    const historico = await queryTenant(
      tenant.schemaName,
      'SELECT * FROM dotacoes_historico_valor WHERE credito_id = $1',
      [creditoId],
    )
    expect(historico).toHaveLength(0)

    const credito = await queryTenant(
      tenant.schemaName,
      'SELECT status FROM creditos_orcamentarios WHERE id = $1',
      [creditoId],
    )
    expect(credito[0]?.status).toBe('aprovado')
  })

  it('rejeita aplicação se confirmNumero não bate, sem alterar estado', async () => {
    const { creditoId } = await seedCreditoAprovado(
      tenant.schemaName,
      tenant.adminUserId,
      fixtures,
      {
        valorReforcoA: '10000.00',
        valorAnulacaoB: '10000.00',
        numero: 'Decreto REAL-007',
      },
    )

    const response = await app.inject({
      method: 'POST',
      url: `/tenant/orcamento/creditos/${creditoId}/aplicar`,
      headers: {
        cookie,
        'X-Tenant-Slug': tenant.slug,
        'X-CSRF-Token': 'test-csrf',
        'Content-Type': 'application/json',
      },
      payload: { confirmNumero: 'Decreto ERRADO-007' },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as { error: string }
    expect(body.error).toBe('ConfirmacaoIncorreta')

    const dotA = await queryTenant(
      tenant.schemaName,
      'SELECT valor_atualizado::text as v FROM dotacoes WHERE id = $1',
      [fixtures.dotacaoAId],
    )
    expect(dotA[0]?.v).toBe('100000.00')

    const credito = await queryTenant(
      tenant.schemaName,
      'SELECT status FROM creditos_orcamentarios WHERE id = $1',
      [creditoId],
    )
    expect(credito[0]?.status).toBe('aprovado')
  })
})
