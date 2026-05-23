// Barrel export — ponto único de import para outros pacotes
export * as publicSchema from './schema/public.js'
export * as tenantSchema from './schema/tenant.js'
export * from './client.js'
export * from './tenancy.js'

// Re-exporta tipos úteis do Drizzle
export { eq, and, or, not, sql, asc, desc, gt, gte, lt, lte, like, ilike, isNull, isNotNull, inArray } from 'drizzle-orm'
