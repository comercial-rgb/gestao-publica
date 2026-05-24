/**
 * @saas-municipal/folha-engine
 *
 * Motor puro de calculo de folha de pagamento municipal (CLT + RPPS).
 *
 * Principios:
 *   - Funcoes puras (sem side-effects alem de leitura DB)
 *   - Testavel isoladamente (nao depende de Fastify, BullMQ ou UI)
 *   - Toda decisao fiscal tem fundamentacao legal embarcada
 *   - Snapshot imutavel com hash SHA-256 (auditoria TCE)
 *   - Multi-tenant via search_path do connection string
 *
 * Construido no B35.2 (folha modulo).
 */

// Tipos
export * from './types.js'

// Erros
export * from './errors.js'

// Utils
export * as decimal from './utils/decimal.js'
export * as data from './utils/data.js'

// Resolvers
export * from './resolvers/index.js'

// Calculadoras
export * from './calculadoras/index.js'

// TODO B35.2C: engine orquestrador
// export { calcularHolerite } from './engine.js'
