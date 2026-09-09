/**
 * E2E do ciclo de vida da folha (B35.5).
 *
 * Diferente de `folhas.test.ts` (que so exercita a API isolada), aqui o
 * fluxo atravessa TODAS as camadas com dados reais:
 *
 *   API (validar/fechar)  ->  DB  ->  worker (processarFolhaMensal)  ->  DB  ->  API (consultas)
 *
 * O job do worker e invocado inline (sem BullMQ consumindo a fila) pra que o
 * teste seja deterministico. O enfileiramento real continua sendo exercitado
 * pela rota /fechar, que devolve 202.
 *
 * Cenario da fixture (3 vinculos, 3 regimes):
 *   - RGPS  R$ 1.600,00 + 2 dependentes -> INSS progressivo + salario-familia
 *   - RPPS  R$ 6.500,00 + 1 dependente  -> aliquota linear 14%
 *   - Comissionado R$ 10.500,00         -> teto INSS + IRRF faixa alta
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Job } from 'bullmq'

import { buildApp } from '../../../src/app.js'
import { env } from '../../../src/env.js'
import { provisionTestTenant, queryTenant, type TestTenantHandle } from '../../helpers/db.js'
import { signTestTenantToken, buildTenantCookieHeader } from '../../helpers/auth.js'
import { seedFolhaCalculoCompleto, type FolhaFixtures } from '../../fixtures.js'

const COMPETENCIA_ANO = new Date().getFullYear() // baseline do tenant seeda o ano corrente
const COMPETENCIA_MES = 5
const COMPETENCIA_ISO = `${COMPETENCIA_ANO}-05-01`

describe('folha -- E2E ciclo completo (API + worker)', () => {
  let app: FastifyInstance
  let tenant: TestTenantHandle
  let cookie: string
  let fx: FolhaFixtures
  let folhaId: string

  /** Connection string no mesmo formato que a rota /fechar monta. */
  const connStr = () => `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()

    tenant = await provisionTestTenant()

    // Ativa o modulo 'folha' pro tenant descartavel
    const { createMasterDatabase, publicSchema } = await import('@saas-municipal/database')
    const masterDb = createMasterDatabase(env.DATABASE_URL)
    let mod = await masterDb.query.modules.findFirst({ where: (m, { eq }) => eq(m.slug, 'folha') })
    if (!mod) {
      const [created] = await masterDb
        .insert(publicSchema.modules)
        .values({ slug: 'folha', name: 'folha', category: 'registro', active: true })
        .returning()
      mod = created!
    }
    await masterDb
      .insert(publicSchema.tenantModules)
      .values({ tenantId: tenant.tenantId, moduleId: mod.id })
      .onConflictDoNothing()

    const { invalidateTenantModules } = await import('../../../src/lib/tenant-modules-cache.js')
    invalidateTenantModules(tenant.tenantId)

    fx = await seedFolhaCalculoCompleto({
      schemaName: tenant.schemaName,
      userId: tenant.adminUserId,
      competencia: new Date(`${COMPETENCIA_ISO}T00:00:00.000Z`),
    })

    const token = await signTestTenantToken({
      userId: tenant.adminUserId,
      tenantId: tenant.tenantId,
      schemaName: tenant.schemaName,
      roles: tenant.roles,
      permissions: [
        ...tenant.permissions,
        'folha:read',
        'folha:cadastros',
        'folha:calcular',
        'folha:revisar',
        'folha:encerrar',
      ],
      email: tenant.adminEmail,
    })
    cookie = buildTenantCookieHeader(token)
  }, 120_000)

  afterAll(async () => {
    // Fecha pools do worker ANTES de dropar o schema do tenant
    const { tenantPool } = await import('@saas-municipal/worker/utils/tenant-pool')
    await tenantPool.closeAll()

    const { folhaQueue } = await import('@saas-municipal/worker/queues/folha')
    await folhaQueue.obliterate({ force: true }).catch(() => undefined)
    await folhaQueue.close()

    const { closeConnections } = await import('@saas-municipal/worker/connection')
    await closeConnections()

    await app.close()
    await tenant.dispose()
  }, 60_000)

  const headers = () => ({
    cookie,
    'X-Tenant-Slug': tenant.slug,
    'X-CSRF-Token': 'test-csrf',
    'Content-Type': 'application/json',
  })

  /** Executa o job do worker inline, com um Job falso do BullMQ. */
  async function rodarProcessamento(): Promise<{ totalProcessado: number; totalComErro: number }> {
    const { processarFolhaMensal } = await import(
      '@saas-municipal/worker/jobs/processar-folha-mensal'
    )

    const progressos: number[] = []
    const fakeJob = {
      id: `e2e-${folhaId}`,
      data: {
        tipo: 'PROCESSAR_FOLHA_MENSAL' as const,
        tenantSlug: tenant.schemaName,
        tenantConnectionString: connStr(),
        folhaId,
        competencia: COMPETENCIA_ISO,
        iniciadoPor: tenant.adminUserId,
      },
      updateProgress: async (p: number) => {
        progressos.push(p)
      },
    } as unknown as Job<never>

    const r = await processarFolhaMensal(fakeJob as never)
    expect(progressos.at(-1)).toBe(100)
    return r
  }

  // ============================================================
  // 1. Pre-flight
  // ============================================================

  it('cria a folha da competencia', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/tenant/folha/folhas',
      headers: headers(),
      payload: {
        competenciaMes: COMPETENCIA_MES,
        competenciaAno: COMPETENCIA_ANO,
        tipo: 'mensal',
        descricao: `Folha mensal E2E ${COMPETENCIA_MES}/${COMPETENCIA_ANO}`,
      },
    })

    expect(r.statusCode).toBe(201)
    folhaId = r.json().id
    expect(folhaId).toBeTruthy()
  })

  it('validar aprova a folha: 3 vinculos, sem erros bloqueantes', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/tenant/folha/folhas/${folhaId}/validar`,
      headers: headers(),
      payload: {},
    })

    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.erros).toEqual([])
    expect(b.podeProsseguir).toBe(true)
    expect(b.totalVinculos).toBe(3)
  })

  it('simular calcula holerite sem persistir', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/tenant/folha/folhas/${folhaId}/holerites/simular`,
      headers: headers(),
      payload: { vinculoId: fx.vinculoRppsId },
    })

    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.totais.proventos).toBeCloseTo(6500, 2)

    // Nada foi gravado
    const persistidos = await queryTenant(
      tenant.schemaName,
      'SELECT count(*)::int AS c FROM holerites WHERE folha_id = $1',
      [folhaId],
    )
    expect(persistidos[0]!.c).toBe(0)
  })

  // ============================================================
  // 2. Fechamento (API enfileira) + processamento (worker)
  // ============================================================

  it('fechar move a folha pra calculando e enfileira o job', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/tenant/folha/folhas/${folhaId}/fechar`,
      headers: headers(),
      payload: { ignorarAvisos: false },
    })

    expect(r.statusCode).toBe(202)
    const b = r.json()
    expect(b.status).toBe('ENFILEIRADO')
    expect(b.jobId).toBeTruthy()
    expect(b.progressoWsUrl).toBe(`/folhas/${folhaId}/progresso`)

    const rows = await queryTenant(tenant.schemaName, 'SELECT status FROM folhas WHERE id = $1', [
      folhaId,
    ])
    expect(rows[0]!.status).toBe('calculando')
  })

  it('worker processa os 3 vinculos e conclui a folha', async () => {
    const r = await rodarProcessamento()

    expect(r.totalComErro).toBe(0)
    expect(r.totalProcessado).toBe(3)

    const folha = await queryTenant(
      tenant.schemaName,
      'SELECT status, qtd_servidores, calculo_concluido_em FROM folhas WHERE id = $1',
      [folhaId],
    )
    expect(folha[0]!.status).toBe('calculada')
    expect(folha[0]!.qtd_servidores).toBe(3)
    expect(folha[0]!.calculo_concluido_em).not.toBeNull()

    const holerites = await queryTenant(
      tenant.schemaName,
      'SELECT count(*)::int AS c FROM holerites WHERE folha_id = $1',
      [folhaId],
    )
    expect(holerites[0]!.c).toBe(3)

    // Lancamentos: 1 rubrica pros dois efetivos + 2 pro comissionado
    const lancamentos = await queryTenant(
      tenant.schemaName,
      'SELECT count(*)::int AS c FROM folhas_lancamentos WHERE folha_id = $1',
      [folhaId],
    )
    expect(lancamentos[0]!.c).toBe(4)
  }, 120_000)

  it('registra progresso e log de processamento auditavel', async () => {
    const progresso = await queryTenant(
      tenant.schemaName,
      'SELECT status, total_itens, itens_processados FROM folha_progresso WHERE folha_id = $1 ORDER BY iniciado_em DESC LIMIT 1',
      [folhaId],
    )
    expect(progresso).toHaveLength(1)
    expect(Number(progresso[0]!.total_itens)).toBe(3)
    expect(Number(progresso[0]!.itens_processados)).toBe(3)

    const log = await queryTenant(
      tenant.schemaName,
      'SELECT vinculo_id, versao, hash_sha256 FROM folha_processamento_log WHERE folha_id = $1',
      [folhaId],
    )
    expect(log).toHaveLength(3)
    for (const l of log) {
      // SHA-256 hex
      expect(String(l.hash_sha256)).toMatch(/^[0-9a-f]{64}$/)
      expect(Number(l.versao)).toBe(1)
    }
    // Um hash distinto por vinculo (valores diferentes -> snapshots diferentes)
    expect(new Set(log.map((l) => l.hash_sha256)).size).toBe(3)
  })

  // ============================================================
  // 3. Correcao fiscal dos holerites
  // ============================================================

  it('RPPS aplica aliquota linear de 14% sobre a base', async () => {
    const rows = await queryTenant(
      tenant.schemaName,
      'SELECT snapshot, total_proventos, total_descontos, total_liquido FROM holerites WHERE folha_id = $1 AND vinculo_id = $2',
      [folhaId, fx.vinculoRppsId],
    )
    expect(rows).toHaveLength(1)

    const snap = rows[0]!.snapshot as Record<string, any>
    expect(snap.regimePrevidenciario).toBe('rpps')
    expect(snap.totais.baseInss).toBeCloseTo(6500, 2)
    // 6500 * 0,14 -- RPPS nao tem faixa nem teto neste municipio
    expect(snap.inss.valor).toBeCloseTo(910, 2)
    expect(Number(rows[0]!.total_proventos)).toBeCloseTo(6500, 2)
  })

  it('RGPS de baixa renda recebe salario-familia por dependente', async () => {
    const rows = await queryTenant(
      tenant.schemaName,
      'SELECT snapshot FROM holerites WHERE folha_id = $1 AND vinculo_id = $2',
      [folhaId, fx.vinculoRgpsId],
    )
    const snap = rows[0]!.snapshot as Record<string, any>

    expect(snap.regimePrevidenciario).toBe('rgps')
    expect(snap.salarioFamilia).not.toBeNull()
    expect(snap.salarioFamilia.numeroFilhosElegiveis).toBe(2)
    expect(snap.salarioFamilia.valorPorFilho).toBeGreaterThan(0)
    expect(snap.salarioFamilia.valorTotal).toBeCloseTo(
      snap.salarioFamilia.valorPorFilho * 2,
      2,
    )

    // INSS progressivo: efetivo sempre abaixo da aliquota nominal maxima
    expect(snap.inss.valor).toBeGreaterThan(0)
    expect(snap.inss.valor).toBeLessThan(1600 * 0.14)
  })

  it('comissionado acima do teto contribui mais que o RGPS de baixa renda', async () => {
    const [comissionado, rgps] = await Promise.all([
      queryTenant(
        tenant.schemaName,
        'SELECT snapshot FROM holerites WHERE folha_id = $1 AND vinculo_id = $2',
        [folhaId, fx.vinculoComissionadoId],
      ),
      queryTenant(
        tenant.schemaName,
        'SELECT snapshot FROM holerites WHERE folha_id = $1 AND vinculo_id = $2',
        [folhaId, fx.vinculoRgpsId],
      ),
    ])

    const snapC = comissionado[0]!.snapshot as Record<string, any>
    const snapR = rgps[0]!.snapshot as Record<string, any>

    // Vencimento + gratificacao
    expect(snapC.totais.proventos).toBeCloseTo(10500, 2)
    expect(snapC.rubricas).toHaveLength(2)

    expect(snapC.inss.valor).toBeGreaterThan(snapR.inss.valor)
    // Teto: contribuicao efetiva fica bem abaixo de 14% da base
    expect(snapC.inss.valor).toBeLessThan(10500 * 0.14)
    // Sem dependentes -> sem salario-familia
    expect(snapC.salarioFamilia).toBeNull()
    // Faixa alta -> IRRF devido
    expect(snapC.irrf.valor).toBeGreaterThan(0)
  })

  it('liquido de cada holerite fecha com proventos menos descontos', async () => {
    const rows = await queryTenant(
      tenant.schemaName,
      'SELECT total_proventos, total_descontos, total_liquido FROM holerites WHERE folha_id = $1',
      [folhaId],
    )
    expect(rows).toHaveLength(3)
    for (const h of rows) {
      const proventos = Number(h.total_proventos)
      const descontos = Number(h.total_descontos)
      expect(Number(h.total_liquido)).toBeCloseTo(proventos - descontos, 2)
      expect(Number(h.total_liquido)).toBeGreaterThan(0)
    }
  })

  // ============================================================
  // 4. Consultas pela API
  // ============================================================

  it('GET /holerites lista os 3 holerites da folha', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/tenant/folha/folhas/${folhaId}/holerites`,
      headers: headers(),
    })

    expect(r.statusCode).toBe(200)
    const b = r.json()
    const items = b.items ?? b
    expect(items).toHaveLength(3)
  })

  it('GET /holerites/:vinculoId devolve o snapshot fiscal', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/tenant/folha/folhas/${folhaId}/holerites/${fx.vinculoRppsId}`,
      headers: headers(),
    })

    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.snapshot).toBeTruthy()
    expect(b.snapshot.vinculoId).toBe(fx.vinculoRppsId)
  })

  // ============================================================
  // 5. Determinismo do hash (idempotencia fiscal)
  // ============================================================

  it('reprocessar a mesma competencia reproduz os mesmos hashes', async () => {
    const antes = await queryTenant(
      tenant.schemaName,
      'SELECT vinculo_id, hash_sha256 FROM folha_processamento_log WHERE folha_id = $1 ORDER BY vinculo_id',
      [folhaId],
    )

    // Reabre pra permitir novo processamento e limpa os holerites da rodada anterior
    // (a chave unica folha+vinculo impede regravar).
    await queryTenant(tenant.schemaName, 'DELETE FROM holerites WHERE folha_id = $1', [folhaId])
    await queryTenant(tenant.schemaName, 'DELETE FROM folhas_lancamentos WHERE folha_id = $1', [
      folhaId,
    ])

    await rodarProcessamento()

    const depois = await queryTenant(
      tenant.schemaName,
      'SELECT vinculo_id, hash_sha256 FROM folha_processamento_log WHERE folha_id = $1 AND versao = 1 ORDER BY vinculo_id, hash_sha256',
      [folhaId],
    )

    // 3 vinculos x 2 rodadas
    expect(depois).toHaveLength(6)

    const hashesPorVinculo = new Map<string, Set<string>>()
    for (const row of depois) {
      const vid = String(row.vinculo_id)
      const set = hashesPorVinculo.get(vid) ?? new Set<string>()
      set.add(String(row.hash_sha256))
      hashesPorVinculo.set(vid, set)
    }

    // O hash e do snapshot FISCAL: nao muda entre execucoes
    for (const [vinculoId, hashes] of hashesPorVinculo) {
      expect(hashes.size, `hash mudou entre rodadas do vinculo ${vinculoId}`).toBe(1)
    }

    for (const row of antes) {
      const set = hashesPorVinculo.get(String(row.vinculo_id))
      expect(set?.has(String(row.hash_sha256))).toBe(true)
    }
  }, 120_000)

  // ============================================================
  // 6. Reabertura auditada
  // ============================================================

  it('reabrir grava o rastro exigido pelo TCE', async () => {
    const motivo = 'Divergencia apontada na conferencia da folha E2E'
    const r = await app.inject({
      method: 'POST',
      url: `/tenant/folha/folhas/${folhaId}/reabrir`,
      headers: headers(),
      payload: { motivo, recalcularAposReabertura: false },
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('em_revisao')

    const rows = await queryTenant(
      tenant.schemaName,
      'SELECT status, reaberta_em, reaberta_por, motivo_reabertura FROM folhas WHERE id = $1',
      [folhaId],
    )
    expect(rows[0]!.status).toBe('em_revisao')
    expect(rows[0]!.reaberta_em).not.toBeNull()
    expect(rows[0]!.reaberta_por).toBe(tenant.adminUserId)
    expect(rows[0]!.motivo_reabertura).toBe(motivo)
  })
})
