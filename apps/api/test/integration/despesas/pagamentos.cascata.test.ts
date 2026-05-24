import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { buildApp } from '../../../src/app.js'
import { provisionTestTenant, queryTenant, type TestTenantHandle } from '../../helpers/db.js'
import { signTestTenantToken, buildTenantCookieHeader } from '../../helpers/auth.js'
import {
  seedOrcamentoBasico,
  seedDespesaProntaParaPagar,
  type OrcamentoFixtures,
  type DespesaPipelineFixtures,
} from '../../fixtures.js'
import { env } from '../../../src/env.js'

describe('Cascata de pagamento e estorno (Despesas)', () => {
  let app: FastifyInstance
  let tenant: TestTenantHandle
  let orcamento: OrcamentoFixtures
  let pipeline: DespesaPipelineFixtures
  let cookie: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    tenant = await provisionTestTenant()
    // Ensure despesas + orcamento modules exist and are activated for this tenant
    const { createMasterDatabase, publicSchema } = await import('@saas-municipal/database')
    const masterDb = createMasterDatabase(env.DATABASE_URL)
    for (const slug of ['despesas', 'orcamento']) {
      let mod = await masterDb.query.modules.findFirst({ where: (m, { eq }) => eq(m.slug, slug) })
      if (!mod) {
        const [created] = await masterDb.insert(publicSchema.modules).values({ slug, name: slug, category: 'registro', active: true }).returning()
        mod = created!
      }
      await masterDb.insert(publicSchema.tenantModules).values({ tenantId: tenant.tenantId, moduleId: mod.id }).onConflictDoNothing()
    }
    const { invalidateTenantModules } = await import('../../../src/lib/tenant-modules-cache.js')
    invalidateTenantModules(tenant.tenantId)
    orcamento = await seedOrcamentoBasico(tenant.schemaName, tenant.adminUserId)
    pipeline = await seedDespesaProntaParaPagar(tenant.schemaName, tenant.adminUserId, orcamento)

    const token = await signTestTenantToken({
      userId: tenant.adminUserId,
      tenantId: tenant.tenantId,
      tenantSlug: tenant.slug,
      schemaName: tenant.schemaName,
      roles: tenant.roles,
      permissions: tenant.permissions,
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
      await client`DELETE FROM pagamentos_anulacoes WHERE pagamento_id IN (SELECT id FROM pagamentos WHERE ordem_pagamento_id = ${pipeline.opId}::uuid)`
      await client`DELETE FROM pagamentos WHERE ordem_pagamento_id = ${pipeline.opId}::uuid`
      await client`UPDATE ordens_pagamento SET valor_pago = '0', status = 'aprovada', updated_at = NOW() WHERE id = ${pipeline.opId}::uuid`
      await client`UPDATE liquidacoes SET valor_pago = '0', updated_at = NOW() WHERE id = ${pipeline.liquidacaoId}::uuid`
      await client`UPDATE empenhos SET valor_pago = '0', status = 'vigente', updated_at = NOW() WHERE id = ${pipeline.empenhoId}::uuid`
      await client`UPDATE dotacoes SET valor_pago = '0', updated_at = NOW() WHERE id = ${orcamento.dotacaoAId}::uuid`
      await client`DELETE FROM empenhos_eventos WHERE empenho_id = ${pipeline.empenhoId}::uuid AND status_novo IN ('pago_total')`
    } finally {
      await client.end()
    }
  })

  it('pagamento parcial atualiza cascata sem mudar status do empenho', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenant/despesas/pagamentos',
      headers: { cookie, 'X-Tenant-Slug': tenant.slug, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' },
      payload: { ordemPagamentoId: pipeline.opId, dataPagamento: '2026-01-23', valor: 10000, meio: 'pix' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.opStatusNovo).toBe('paga_parcial')
    expect(body.empenhoStatusNovo).toBeNull()

    const op = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM ordens_pagamento WHERE id = $1', [pipeline.opId])
    expect(op[0]!.v).toBe('10000.00')
    expect(op[0]!.status).toBe('paga_parcial')

    const liq = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v FROM liquidacoes WHERE id = $1', [pipeline.liquidacaoId])
    expect(liq[0]!.v).toBe('10000.00')

    const emp = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM empenhos WHERE id = $1', [pipeline.empenhoId])
    expect(emp[0]!.v).toBe('10000.00')
    expect(emp[0]!.status).toBe('vigente')

    const dot = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v FROM dotacoes WHERE id = $1', [orcamento.dotacaoAId])
    expect(dot[0]!.v).toBe('10000.00')

    const eventos = await queryTenant(tenant.schemaName, "SELECT status_novo FROM empenhos_eventos WHERE empenho_id = $1 AND status_novo = 'pago_total'", [pipeline.empenhoId])
    expect(eventos).toHaveLength(0)
  })

  it('pagamento total da OP marca paga_total na OP e mantem empenho vigente quando ha saldo a liquidar', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenant/despesas/pagamentos',
      headers: { cookie, 'X-Tenant-Slug': tenant.slug, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' },
      payload: { ordemPagamentoId: pipeline.opId, dataPagamento: '2026-01-25', valor: 15000, meio: 'pix' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.opStatusNovo).toBe('paga_total')
    expect(body.empenhoStatusNovo).toBeNull()

    const op = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM ordens_pagamento WHERE id = $1', [pipeline.opId])
    expect(op[0]!.v).toBe('15000.00')
    expect(op[0]!.status).toBe('paga_total')

    const emp = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM empenhos WHERE id = $1', [pipeline.empenhoId])
    expect(emp[0]!.v).toBe('15000.00')
    expect(emp[0]!.status).toBe('vigente')

    const dot = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v FROM dotacoes WHERE id = $1', [orcamento.dotacaoAId])
    expect(dot[0]!.v).toBe('15000.00')
  })

  it('estorno reverte cascata completa, OP volta a aprovada', async () => {
    // Setup: pagar 15k
    const pagResponse = await app.inject({
      method: 'POST',
      url: '/tenant/despesas/pagamentos',
      headers: { cookie, 'X-Tenant-Slug': tenant.slug, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' },
      payload: { ordemPagamentoId: pipeline.opId, dataPagamento: '2026-01-25', valor: 15000, meio: 'pix' },
    })
    expect(pagResponse.statusCode).toBe(201)
    const pagBody = pagResponse.json()

    // Estornar
    const estornoResponse = await app.inject({
      method: 'POST',
      url: `/tenant/despesas/pagamentos/${pagBody.id}/estornar`,
      headers: { cookie, 'X-Tenant-Slug': tenant.slug, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' },
      payload: { dataEstorno: '2026-01-28', motivo: 'Estorno automatizado para teste de cobertura da cascata reversa', confirmNumero: pagBody.numero },
    })
    expect(estornoResponse.statusCode).toBe(200)

    const pag = await queryTenant(tenant.schemaName, 'SELECT status FROM pagamentos WHERE id = $1', [pagBody.id])
    expect(pag[0]!.status).toBe('estornado')

    const op = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM ordens_pagamento WHERE id = $1', [pipeline.opId])
    expect(Number(op[0]!.v)).toBe(0)
    expect(op[0]!.status).toBe('aprovada')

    const liq = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v FROM liquidacoes WHERE id = $1', [pipeline.liquidacaoId])
    expect(Number(liq[0]!.v)).toBe(0)

    const emp = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v, status FROM empenhos WHERE id = $1', [pipeline.empenhoId])
    expect(Number(emp[0]!.v)).toBe(0)
    expect(emp[0]!.status).toBe('vigente')

    const dot = await queryTenant(tenant.schemaName, 'SELECT valor_pago::text AS v FROM dotacoes WHERE id = $1', [orcamento.dotacaoAId])
    expect(Number(dot[0]!.v)).toBe(0)

    const anulacao = await queryTenant(tenant.schemaName, 'SELECT valor::text AS v, motivo FROM pagamentos_anulacoes WHERE pagamento_id = $1', [pagBody.id])
    expect(anulacao).toHaveLength(1)
    expect(anulacao[0]!.v).toBe('15000.00')
    expect(String(anulacao[0]!.motivo)).toContain('Estorno automatizado')
  })
})
