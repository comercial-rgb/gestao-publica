/**
 * Smoke tests do worker -- valida boot, lock, enfileiramento.
 * Testes E2E completos (com vinculos reais + calculo) ficam pro B35.3B.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FolhaJobPayload, ProcessarFolhaMensalPayload } from '../src/queues/folha.js'

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

describe('worker -- queue + enfileiramento', () => {
  let redis: Redis
  let queue: Queue<FolhaJobPayload>

  beforeAll(async () => {
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: null })
    queue = new Queue<FolhaJobPayload>('folha-test', {
      connection: redis,
    })
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    await queue.close()
    await redis.quit()
  })

  it('enfileira job de processar folha', async () => {
    const payload: ProcessarFolhaMensalPayload = {
      tipo: 'PROCESSAR_FOLHA_MENSAL',
      tenantSlug: 'tenant-teste',
      tenantConnectionString: 'postgres://saas:saas@localhost:5435/saas_municipal_test',
      folhaId: 'folha-1',
      competencia: '2026-05-01',
      iniciadoPor: 'user-teste',
    }

    const job = await queue.add('processar-folha-mensal', payload, {
      jobId: `folha:${payload.tenantSlug}:${payload.folhaId}`,
    })

    expect(job.id).toBeTruthy()

    const retrieved = await queue.getJob(job.id!)
    expect(retrieved).toBeDefined()
    expect(retrieved?.data.tipo).toBe('PROCESSAR_FOLHA_MENSAL')
    expect(retrieved?.data.tenantSlug).toBe('tenant-teste')
  })

  it('jobId deterministico previne duplicacao', async () => {
    const payload: ProcessarFolhaMensalPayload = {
      tipo: 'PROCESSAR_FOLHA_MENSAL',
      tenantSlug: 'tenant-x',
      tenantConnectionString: 'postgres://saas:saas@localhost:5435/test',
      folhaId: 'folha-mesma-x',
      competencia: '2026-05-01',
      iniciadoPor: 'user',
    }

    const jobId = `folha:${payload.tenantSlug}:${payload.folhaId}`
    const j1 = await queue.add('processar-folha-mensal', payload, { jobId })
    const j2 = await queue.add('processar-folha-mensal', payload, { jobId })

    // Mesmo jobId -> BullMQ nao duplica
    expect(j1.id).toBe(j2.id)
  })

  it('lock Redis SETNX funciona', async () => {
    const lockKey = 'test:lock:abc'
    await redis.del(lockKey)

    const first = await redis.set(lockKey, 'worker-1', 'EX', 10, 'NX')
    const second = await redis.set(lockKey, 'worker-2', 'EX', 10, 'NX')

    expect(first).toBe('OK') // pegou o lock
    expect(second).toBeNull() // segundo worker falha

    await redis.del(lockKey)
  })
})
