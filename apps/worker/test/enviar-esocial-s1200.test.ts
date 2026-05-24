import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FolhaJobPayload, EnviarEsocialS1200Payload } from '../src/queues/folha.js'

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

describe('worker -- enviarEsocialS1200 smoke', () => {
  let redis: Redis
  let queue: Queue<FolhaJobPayload>

  beforeAll(async () => {
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: null })
    queue = new Queue<FolhaJobPayload>('folha-test-esocial', { connection: redis })
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    await queue.close()
    await redis.quit()
  })

  it('enfileira evento S-1200 em ambiente TESTE', async () => {
    const payload: EnviarEsocialS1200Payload = {
      tipo: 'ENVIAR_ESOCIAL_S1200',
      tenantSlug: 'municipio-bronze-test',
      tenantConnectionString: 'postgres://saas:saas@localhost:5435/saas_municipal_test',
      folhaId: 'folha-esocial-1',
      vinculoId: 'vinculo-esocial-1',
      ambiente: 'TESTE',
      iniciadoPor: 'user',
    }

    const job = await queue.add('enviar-esocial-s1200', payload)

    expect(job.id).toBeTruthy()
    const retrieved = await queue.getJob(job.id!)
    expect(retrieved?.data.tipo).toBe('ENVIAR_ESOCIAL_S1200')
    expect((retrieved?.data as EnviarEsocialS1200Payload).ambiente).toBe('TESTE')
  })
})
