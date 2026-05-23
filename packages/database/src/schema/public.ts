/**
 * Schema MASTER (public).
 *
 * Contém os metadados da plataforma SaaS:
 * - tenants: cada prefeitura cliente
 * - plans: planos comerciais (Bronze, Prata, Ouro etc)
 * - modules: módulos do sistema (Receitas, Despesas, Folha, etc)
 * - tenant_modules: quais módulos cada tenant tem ativos
 * - master_users: usuários administradores da plataforma SaaS (nossa equipe)
 * - audit_log: auditoria global
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─────────────────────────────────────────────────────────────
// ENUMs
// ─────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum('tenant_status', [
  'pending',   // criada mas schema ainda não foi provisionado
  'active',    // schema provisionado, operando
  'suspended', // inadimplente ou suspensa manualmente
  'archived',  // contrato encerrado
])

export const masterUserRoleEnum = pgEnum('master_user_role', [
  'super_admin',  // tudo
  'admin',        // gestão de tenants, planos, módulos
  'support',      // suporte ao cliente, sem gestão financeira
  'readonly',     // visualização apenas (compliance, auditoria)
])

// ─────────────────────────────────────────────────────────────
// TABELAS
// ─────────────────────────────────────────────────────────────

/**
 * Tenants — uma linha por prefeitura cliente.
 * O schema PostgreSQL correspondente é nomeado conforme schemaName.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identificação
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    schemaName: varchar('schema_name', { length: 63 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    cnpj: varchar('cnpj', { length: 14 }).notNull().unique(),

    // Localização
    state: varchar('state', { length: 2 }).notNull(),     // UF: PR, SP, etc
    city: varchar('city', { length: 100 }).notNull(),
    ibgeCode: varchar('ibge_code', { length: 7 }).notNull(),

    // Contato
    contactEmail: varchar('contact_email', { length: 200 }),
    contactPhone: varchar('contact_phone', { length: 20 }),

    // Comercial
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }),
    contractStartAt: timestamp('contract_start_at', { withTimezone: true }),
    contractEndAt: timestamp('contract_end_at', { withTimezone: true }),

    // Status
    status: tenantStatusEnum('status').notNull().default('pending'),

    // Customização (logo, cores, etc)
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('tenants_status_idx').on(t.status),
    stateIdx: index('tenants_state_idx').on(t.state),
    createdAtIdx: index('tenants_created_at_idx').on(t.createdAt),
  }),
)

/**
 * Plans — planos comerciais do SaaS.
 */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  monthlyPrice: numeric('monthly_price', { precision: 12, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Modules — módulos funcionais do sistema.
 * Cada módulo pode estar incluído em um plano ou ser add-on.
 */
export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),  // 'receitas', 'despesas', 'folha'...
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 60 }).notNull(),  // 'registro', 'inteligencia', 'cadastros'
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * plan_modules — quais módulos estão incluídos em cada plano.
 */
export const planModules = pgTable(
  'plan_modules',
  {
    planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
    addonPrice: numeric('addon_price', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.planId, t.moduleId] }),
  }),
)

/**
 * tenant_modules — módulos efetivamente ativos para cada tenant.
 * (pode diferir do plano por add-ons contratados separadamente).
 */
export const tenantModules = pgTable(
  'tenant_modules',
  {
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.moduleId] }),
    tenantIdIdx: index('tenant_modules_tenant_id_idx').on(t.tenantId),
    activeIdx: index('tenant_modules_active_idx').on(t.tenantId, t.deactivatedAt),
  }),
)

/**
 * Master users — usuários administradores da plataforma SaaS.
 * (nossa equipe interna, não usuários da prefeitura).
 */
export const masterUsers = pgTable(
  'master_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 200 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: masterUserRoleEnum('role').notNull().default('support'),
    active: boolean('active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    twoFactorSecret: text('two_factor_secret'),  // criptografado
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('master_users_email_idx').on(t.email),
  }),
)

/**
 * Refresh tokens (master + tenant).
 * Armazenamos hash, não o token em si. Coluna 'tenantId' fica NULL para master.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id').notNull(),       // pode ser master_user.id ou tenant_users.id
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),  // NULL = master
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId, t.tenantId),
    expiresIdx: index('refresh_tokens_expires_idx').on(t.expiresAt),
  }),
)

/**
 * Audit log global (master + ações cross-tenant).
 * Logs internos de cada tenant ficam dentro do schema do tenant.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: varchar('actor_type', { length: 20 }).notNull(), // 'master' | 'tenant' | 'system'
    actorId: uuid('actor_id'),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    resource: varchar('resource', { length: 100 }),
    resourceId: varchar('resource_id', { length: 100 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_idx').on(t.actorType, t.actorId),
    tenantIdx: index('audit_log_tenant_idx').on(t.tenantId),
    createdIdx: index('audit_log_created_idx').on(t.createdAt),
  }),
)

// ─────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
  modules: many(tenantModules),
}))

export const plansRelations = relations(plans, ({ many }) => ({
  modules: many(planModules),
  tenants: many(tenants),
}))

export const modulesRelations = relations(modules, ({ many }) => ({
  plans: many(planModules),
  tenants: many(tenantModules),
}))

export const planModulesRelations = relations(planModules, ({ one }) => ({
  plan: one(plans, { fields: [planModules.planId], references: [plans.id] }),
  module: one(modules, { fields: [planModules.moduleId], references: [modules.id] }),
}))

export const tenantModulesRelations = relations(tenantModules, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantModules.tenantId], references: [tenants.id] }),
  module: one(modules, { fields: [tenantModules.moduleId], references: [modules.id] }),
}))

// ─────────────────────────────────────────────────────────────
// TIPOS (helpers TypeScript)
// ─────────────────────────────────────────────────────────────

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type Plan = typeof plans.$inferSelect
export type Module = typeof modules.$inferSelect
export type MasterUser = typeof masterUsers.$inferSelect
export type NewMasterUser = typeof masterUsers.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
