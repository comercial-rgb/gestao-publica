import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FolhaJobPayload, GerarEmpenhosFolhaPayload } from '../src/queues/folha.js'

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

describe('worker -- gerarEmpenhosFolha smoke', () => {
  let redis: Redis
  let queue: Queue<FolhaJobPayload>

  beforeAll(async () => {
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: null })
    queue = new Queue<FolhaJobPayload>('folha-test-empenhos', { connection: redis })
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    await queue.close()
    await redis.quit()
  })

  it('enfileira job de empenhos', async () => {
    const payload: GerarEmpenhosFolhaPayload = {
      tipo: 'GERAR_EMPENHOS_FOLHA',
      tenantSlug: 'tenant-teste',
      tenantConnectionString: 'postgres://saas:saas@localhost:5435/saas_municipal_test',
      folhaId: 'folha-empenhos-1',
      competencia: '2026-05-01',
      iniciadoPor: 'user',
    }

    const job = await queue.add('gerar-empenhos-folha', payload)

    expect(job.id).toBeTruthy()
    const retrieved = await queue.getJob(job.id!)
    expect(retrieved?.data.tipo).toBe('GERAR_EMPENHOS_FOLHA')
  })
})
