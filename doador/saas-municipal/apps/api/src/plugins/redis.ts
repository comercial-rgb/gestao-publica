/**
 * Plugin Redis opcional.
 * Só registra @fastify/redis se REDIS_URL estiver definido no env.
 * Outros plugins (rate-limit, sessions futuras) podem usar app.redis.
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import fastifyRedis from '@fastify/redis'
import { env } from '../env.js'

async function redisPluginFn(app: FastifyInstance) {
  if (!env.REDIS_URL) {
    app.log.warn('REDIS_URL ausente — rate-limit usará store em memória (não recomendado em produção)')
    return
  }

  await app.register(fastifyRedis, {
    url: env.REDIS_URL,
    closeClient: true,
  })

  app.log.info({ redis: env.REDIS_URL.replace(/:[^:@]+@/, ':***@') }, 'Redis conectado')
}

export const redisPlugin = fp(redisPluginFn, {
  name: 'redis-plugin',
  fastify: '5.x',
})
