/**
 * WebSocket folha:progresso — HELLO + relay Redis pub/sub.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { Redis } from 'ioredis'
import { buildApp } from '../src/app.js'
import { env } from '../src/env.js'
import { signTestTenantToken } from './helpers/auth.js'

const FOLHA_ID = '00000000-0000-4000-8000-000000000001'

function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout aguardando mensagem WS')), timeoutMs)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(String(data))
    })
    ws.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('WS /folhas/:folhaId/progresso', () => {
  let app: FastifyInstance
  let baseUrl: string
  let publisher: Redis

  beforeAll(async () => {
    if (!env.REDIS_URL) {
      throw new Error('REDIS_URL ausente — WebSocket de folha requer Redis')
    }

    app = await buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Falha ao obter porta do servidor de teste')
    }
    baseUrl = `ws://127.0.0.1:${address.port}`

    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
    await publisher.ping()
  }, 60_000)

  afterAll(async () => {
    await publisher?.quit()
    await app?.close()
  })

  it('envia CONNECTED ao autenticar com JWT tenant na URL', async () => {
    const token = await signTestTenantToken({
      userId: '00000000-0000-4000-8000-000000000099',
      tenantId: '00000000-0000-4000-8000-000000000098',
      schemaName: 'tenant_test_ws',
      roles: ['admin'],
      permissions: ['folha:read'],
    })

    const ws = new WebSocket(`${baseUrl}/folhas/${FOLHA_ID}/progresso?token=${encodeURIComponent(token)}`)
    const msgPromise = waitForMessage(ws)

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })

    const raw = await msgPromise
    const msg = JSON.parse(raw) as { tipo: string; folhaId: string }

    expect(msg.tipo).toBe('CONNECTED')
    expect(msg.folhaId).toBe(FOLHA_ID)

    ws.close()
  })

  it('replica mensagem publicada no Redis para o cliente inscrito', async () => {
    const token = await signTestTenantToken({
      userId: '00000000-0000-4000-8000-000000000099',
      tenantId: '00000000-0000-4000-8000-000000000098',
      schemaName: 'tenant_test_ws',
      roles: ['admin'],
      permissions: ['folha:read'],
    })

    const ws = new WebSocket(`${baseUrl}/folhas/${FOLHA_ID}/progresso?token=${encodeURIComponent(token)}`)
    const connectedPromise = waitForMessage(ws)

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })

    await connectedPromise

    const relayPromise = waitForMessage(ws)

    const payload = JSON.stringify({
      folhaId: FOLHA_ID,
      progressoPercentual: 42,
      mensagemAtual: 'Teste integrado',
      timestamp: new Date().toISOString(),
    })

    await new Promise((r) => setTimeout(r, 150))

    await publisher.publish(`folha:progresso:${FOLHA_ID}`, payload)

    const relayed = await relayPromise
    expect(JSON.parse(relayed)).toMatchObject({
      folhaId: FOLHA_ID,
      progressoPercentual: 42,
      mensagemAtual: 'Teste integrado',
    })

    ws.close()
  })
})
