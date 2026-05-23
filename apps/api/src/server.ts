/**
 * Entry point — sobe o servidor HTTP + graceful shutdown.
 */
import { buildApp } from './app.js'
import { env } from './env.js'
import { closeAllConnections } from '@saas-municipal/database'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT })
    app.log.info(`API on http://${env.API_HOST}:${env.API_PORT}`)
  } catch (err) {
    app.log.fatal({ err }, 'falha ao subir o servidor')
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutdown iniciado')
    try {
      await app.close()
      await closeAllConnections()
      app.log.info('shutdown limpo')
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'erro durante shutdown')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
