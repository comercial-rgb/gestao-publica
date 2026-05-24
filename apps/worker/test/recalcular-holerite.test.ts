/**
 * Smoke do job recalcularHolerite -- verifica enfileiramento + lock.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FolhaJobPayload, RecalcularHoleritePayload } from '../src/queues/folha.js'

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

describe('worker -- recalcularHolerite smoke', () => {
  let redis: Redis
  let queue: Queue<FolhaJobPayload>

  beforeAll(async () => {
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: null })
    queue = new Queue<FolhaJobPayload>('folha-test-recalc', { connection: redis })
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    await queue.close()
    await redis.quit()
  })

  it('enfileira job de recalculo', async () => {
    const payload: RecalcularHoleritePayload = {
      tipo: 'RECALCULAR_HOLERITE',
      tenantSlug: 'tenant-teste',
      tenantConnectionString: 'postgres://saas:saas@localhost:5435/saas_municipal_test',
      folhaId: 'folha-1',
      vinculoId: 'vinculo-1',
      competencia: '2026-05-01',
      motivo: 'Teste smoke',
      iniciadoPor: 'user-teste',
    }

    const job = await queue.add('recalcular-holerite', payload)

    expect(job.id).toBeTruthy()
    const retrieved = await queue.getJob(job.id!)
    expect(retrieved?.data.tipo).toBe('RECALCULAR_HOLERITE')
    expect((retrieved?.data as RecalcularHoleritePayload).motivo).toBe('Teste smoke')
  })

  it('lock por vinculo+competencia eh isolado por chave', async () => {
    const k1 = 'folha:lock:vinculo:t1:v1:2026-05-01'
    const k2 = 'folha:lock:vinculo:t1:v2:2026-05-01'
    await redis.del(k1, k2)

    const a = await redis.set(k1, 'w1', 'EX', 10, 'NX')
    const b = await redis.set(k2, 'w1', 'EX', 10, 'NX')
    expect(a).toBe('OK')
    expect(b).toBe('OK') // locks diferentes, ambos funcionam

    await redis.del(k1, k2)
  })
})
