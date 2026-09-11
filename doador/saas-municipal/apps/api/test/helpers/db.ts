import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@saas-municipal/auth'
import {
  buildSchemaName,
  closeAllConnections,
  closeTenantDatabase,
  createMasterDatabase,
  createTenantDatabase,
  dropTenantSchema,
  provisionTenant,
  publicSchema,
  tenantSchema,
} from '@saas-municipal/database'
import { env } from '../../src/env.js'

export interface TestTenantHandle {
  tenantId: string
  slug: string
  schemaName: string
  adminUserId: string
  adminEmail: string
  adminPassword: string
  roles: string[]
  permissions: string[]
  dispose(): Promise<void>
}

/**
 * Cria um tenant descartável e retorna handles úteis para os testes.
 */
export async function provisionTestTenant(opts: {
  slug?: string
  planSlug?: string
  adminEmail?: string
  adminPassword?: string
} = {}): Promise<TestTenantHandle> {
  const suffix = Math.random().toString(36).slice(2, 8)
  const slug = opts.slug ?? `test-${suffix}`
  const schemaName = buildSchemaName(slug)
  const planSlug = opts.planSlug ?? 'teste'
  const adminEmail = opts.adminEmail ?? `admin@${slug}.test`
  const adminPassword = opts.adminPassword ?? 'TestAdmin@2026!'

  const masterDb = createMasterDatabase(env.DATABASE_URL)

  const plan = await masterDb.query.plans.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.slug, planSlug),
  })
  if (!plan) {
    throw new Error(`Plano "${planSlug}" não existe. Rode pnpm db:bootstrap:test`)
  }

  const cnpjSuffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
  const cnpj = `99999999${cnpjSuffix}`.slice(0, 14)

  const [inserted] = await masterDb
    .insert(publicSchema.tenants)
    .values({
      slug,
      schemaName,
      name: `Test Tenant ${suffix}`,
      cnpj,
      state: 'PR',
      city: 'Test City',
      ibgeCode: '9999999',
      planId: plan.id,
      status: 'pending',
    })
    .returning()

  if (!inserted) throw new Error('Falha ao inserir tenant de teste')

  try {
    await provisionTenant(env.DATABASE_URL, schemaName)

    await masterDb
      .update(publicSchema.tenants)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(publicSchema.tenants.id, inserted.id))

    const planModules = await masterDb.query.planModules.findMany({
      where: (pm, { eq: eqFn }) => eqFn(pm.planId, plan.id),
    })
    for (const pm of planModules) {
      await masterDb
        .insert(publicSchema.tenantModules)
        .values({ tenantId: inserted.id, moduleId: pm.moduleId })
        .onConflictDoNothing()
    }

    const tenantDb = createTenantDatabase(env.DATABASE_URL, schemaName)
    const passwordHash = await hashPassword(adminPassword)

    const [user] = await tenantDb
      .insert(tenantSchema.users)
      .values({
        email: adminEmail,
        name: 'Admin Test',
        passwordHash,
        status: 'active',
      })
      .returning({ id: tenantSchema.users.id })

    if (!user) throw new Error('Falha ao criar usuário admin de teste')

    const adminRole = await tenantDb.query.roles.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.slug, 'admin_municipal'),
    })
    if (!adminRole) throw new Error('Role admin_municipal não encontrada no tenant')

    await tenantDb.insert(tenantSchema.userRoles).values({
      userId: user.id,
      roleId: adminRole.id,
    })

    const permRows = await tenantDb
      .select({ slug: tenantSchema.permissions.slug })
      .from(tenantSchema.permissions)
      .innerJoin(
        tenantSchema.rolePermissions,
        eq(tenantSchema.rolePermissions.permissionId, tenantSchema.permissions.id),
      )
      .innerJoin(tenantSchema.userRoles, eq(tenantSchema.userRoles.roleId, tenantSchema.rolePermissions.roleId))
      .where(eq(tenantSchema.userRoles.userId, user.id))

    const permissions = [...new Set(permRows.map((r) => r.slug))]

    return {
      tenantId: inserted.id,
      slug,
      schemaName,
      adminUserId: user.id,
      adminEmail,
      adminPassword,
      roles: ['admin_municipal'],
      permissions,
      async dispose() {
        await closeTenantDatabase(schemaName)
        await dropTenantSchema(env.DATABASE_URL, schemaName)
        const cleanup = postgres(env.DATABASE_URL, { max: 1 })
        try {
          await cleanup`DELETE FROM tenants WHERE id = ${inserted.id}`
        } finally {
          await cleanup.end()
        }
        await closeAllConnections()
      },
    }
  } catch (err) {
    await dropTenantSchema(env.DATABASE_URL, schemaName).catch(() => undefined)
    await masterDb.delete(publicSchema.tenants).where(eq(publicSchema.tenants.id, inserted.id))
    throw err
  }
}

export async function queryTenant(
  schemaName: string,
  sqlString: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const client = postgres(env.DATABASE_URL, { max: 1 })
  try {
    await client.unsafe(`SET search_path TO "${schemaName}", public`)
    const result = await client.unsafe(sqlString, params as never[])
    return Array.from(result) as Record<string, unknown>[]
  } finally {
    await client.end()
  }
}
