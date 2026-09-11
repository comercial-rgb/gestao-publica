/**
 * Plugin WebSocket pro apps/api.
 *
 * Registra @fastify/websocket + abre conexao subscriber dedicada do Redis
 * pra escutar canais pub/sub `folha:progresso:{folhaId}` e replicar pros
 * clientes WS conectados.
 *
 * Autenticacao: cliente envia ?token=<jwt> na URL.
 * Token tem que ser do tipo tenant (mesmo claims do auth-plugin).
 */

import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import websocket from '@fastify/websocket'
import { Redis } from 'ioredis'
import { verifyToken, type TenantTokenPayload } from '@saas-municipal/auth'
import { env } from '../env.js'

// Mapa: folhaId -> set de sockets subscritos
const subscritos = new Map<string, Set<WebSocket>>()

let subscriber: Redis | null = null

async function setupSubscriber(app: FastifyInstance): Promise<void> {
  if (subscriber) return
  if (!app.redis) {
    app.log.warn('Sem Redis -- WebSocket de folha desabilitado')
    return
  }

  // Duplica a conexao Redis existente pra pub/sub dedicado
  const sub = new Redis((app.redis as { options: object }).options)
  subscriber = sub

  // Pattern subscribe pra todos os canais de folha
  await sub.psubscribe('folha:progresso:*')

  sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    // channel = 'folha:progresso:<folhaId>'
    const folhaId = channel.split(':').pop()
    if (!folhaId) return
    const set = subscritos.get(folhaId)
    if (!set || set.size === 0) return
    for (const socket of set) {
      try {
        if (socket.readyState === socket.OPEN) {
          socket.send(message)
        } else {
          set.delete(socket)
        }
      } catch {
        set.delete(socket)
      }
    }
  })

  app.addHook('onClose', async () => {
    if (subscriber) {
      await subscriber.punsubscribe('folha:progresso:*')
      await subscriber.quit()
      subscriber = null
    }
  })

  app.log.info('WebSocket subscriber de folha:progresso:* ativo')
}

async function autenticarWs(req: FastifyRequest): Promise<TenantTokenPayload> {
  const token = (req.query as Record<string, string>)?.token

  if (!token) throw new Error('Token ausente no WS')
  const payload = await verifyToken(token, { secret: env.AUTH_SECRET })
  if ((payload as { typ?: string }).typ !== 'tenant') throw new Error('Token nao e tenant')
  return payload as TenantTokenPayload
}

async function websocketPluginFn(app: FastifyInstance) {
  await app.register(websocket, {
    options: { maxPayload: 1024 * 16 },
  })

  await setupSubscriber(app)

  // Rota: ws://api/folhas/:folhaId/progresso?token=<jwt>
  app.get<{ Params: { folhaId: string } }>(
    '/folhas/:folhaId/progresso',
    { websocket: true },
    async (socket, req) => {
      let tokenPayload: TenantTokenPayload
      try {
        tokenPayload = await autenticarWs(req)
      } catch (err) {
        socket.send(JSON.stringify({ erro: 'unauthorized', msg: String(err) }))
        socket.close(1008, 'unauthorized')
        return
      }

      const { folhaId } = req.params
      app.log.info({ folhaId, userId: (tokenPayload as { sub?: string }).sub }, 'WS conectado')

      // Inscreve o socket no folhaId
      const set = subscritos.get(folhaId) ?? new Set<WebSocket>()
      set.add(socket)
      subscritos.set(folhaId, set)

      // Hello
      socket.send(
        JSON.stringify({ tipo: 'CONNECTED', folhaId, timestamp: new Date().toISOString() }),
      )

      socket.on('close', () => {
        const s = subscritos.get(folhaId)
        if (s) {
          s.delete(socket)
          if (s.size === 0) subscritos.delete(folhaId)
        }
        app.log.info({ folhaId }, 'WS desconectado')
      })
    },
  )
}

export const websocketPlugin = fp(websocketPluginFn, {
  name: 'websocket-plugin',
  fastify: '5.x',
  dependencies: ['redis-plugin'],
})
