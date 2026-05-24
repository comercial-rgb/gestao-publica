// Barrel export — ponto unico de import para outros pacotes
export * as publicSchema from './schema/public.js'
export * as tenantSchema from './schema/tenant.js'
export {
  vinculoRubricas,
  esocialEventosPendentes,
  type VinculoRubrica,
  type EsocialEventoPendente,
} from './schema/tenant.js'
export * as folhaPublicSchema from './schema/folha-publico.js'
export * as folhaCalculoSchema from './schema/folha-calculo.js'
export * from './client.js'
export * from './tenancy.js'

// Re-exporta tipos úteis do Drizzle
export { eq, and, or, not, sql, asc, desc, gt, gte, lt, lte, like, ilike, isNull, isNotNull, inArray } from 'drizzle-orm'
