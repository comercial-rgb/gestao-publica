/**
 * Rotas de gestão de tenants — apenas master users.
 *
 *   GET    /admin/tenants             → lista todas
 *   POST   /admin/tenants             → cria + provisiona (schema + migrations + seed)
 *   GET    /admin/tenants/:id         → detalhe
 *   PATCH  /admin/tenants/:id         → atualiza
 *   DELETE /admin/tenants/:id         → soft delete (não dropa schema)
 *   POST   /admin/tenants/:id/archive → drop schema CASCADE
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  createMasterDatabase,
  publicSchema,
  buildSchemaName,
  provisionTenant,
  dropTenantSchema,
  applyTenantMigrationsIncremental,
  listPendingMigrations,
  eq,
  isNull,
  and,
  or,
  lt,
  sql,
} from '@saas-municipal/database'
import { env } from '../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../lib/pagination.js'
import { publishInvalidation } from '../../lib/tenant-modules-cache.js'

const createTenantBody = z.object({
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
  name: z.string().min(3).max(200),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos numéricos'),
  state: z.string().length(2).toUpperCase(),
  city: z.string().min(2).max(100),
  ibgeCode: z.string().regex(/^\d{7}$/, 'Código IBGE deve ter 7 dígitos'),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  planSlug: z.string().optional(),
})

const updateTenantBody = z.object({
  name: z.string().min(3).max(200).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  planId: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'active', 'suspended', 'archived']).optional(),
})

const tenantOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  schemaName: z.string(),
  name: z.string(),
  cnpj: z.string(),
  state: z.string(),
  city: z.string(),
  ibgeCode: z.string(),
  status: z.string(),
  planId: z.string().uuid().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  createdAt: z.string(),
})

export const adminTenantsRoute: FastifyPluginAsyncZod = async (app) => {
  const db = createMasterDatabase(env.DATABASE_URL)

  // Toda rota daqui exige master autenticado
  app.addHook('preHandler', async (req) => {
    await req.authenticateMaster()
  })

  // ─── GET /admin/tenants ─────────────────────────────────
  app.get(
    '/',
    {
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        querystring: z.object({
          status: z.enum(['pending', 'active', 'suspended', 'archived']).optional(),
          state: z.string().length(2).optional(),
          search: z.string().optional(),
        }).merge(paginationQuery),
        response: {
          200: z.object({
            items: z.array(tenantOut),
            pagination: z.object({
              nextCursor: z.string().nullable(),
              limit: z.number(),
            }),
          }),
        },
      },
    },
    async (req) => {
      const { status, state, search, cursor: rawCursor, limit } = req.query
      const cursor = decodeCursor(rawCursor)

      const rows = await db.query.tenants.findMany({
        where: (t, { eq, and, isNull, or, ilike }) => {
          const conds = [isNull(t.deletedAt)]
          if (status) conds.push(eq(t.status, status))
          if (state) conds.push(eq(t.state, state.toUpperCase()))
          if (search) {
            conds.push(
              or(
                ilike(t.name, `%${search}%`),
                ilike(t.slug, `%${search}%`),
                ilike(t.cnpj, `%${search}%`),
              )!,
            )
          }
          if (cursor) {
            conds.push(
              or(
                lt(t.createdAt, new Date(cursor.createdAt)),
                and(eq(t.createdAt, new Date(cursor.createdAt)), lt(t.id, cursor.id)),
              )!,
            )
          }
          return and(...conds)
        },
        orderBy: (t, { desc }) => [desc(t.createdAt), desc(t.id)],
        limit: limit + 1,
      })

      const result = paginatedResponse(rows, limit)
      return {
        items: result.items.map(serializeTenant),
        pagination: result.pagination,
      }
    },
  )

  // ─── POST /admin/tenants ────────────────────────────────
  app.post(
    '/',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        body: createTenantBody,
        response: {
          201: tenantOut.extend({
            provisioning: z.object({
              migrationsApplied: z.number(),
              seedApplied: z.boolean(),
            }),
          }),
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body
      const schemaName = buildSchemaName(body.slug)

      // Resolve planId pelo slug (opcional)
      let planId: string | null = null
      if (body.planSlug) {
        const plan = await db.query.plans.findFirst({
          where: (p, { eq }) => eq(p.slug, body.planSlug!),
        })
        if (!plan) throw app.httpErrors.badRequest(`Plano "${body.planSlug}" não encontrado`)
        planId = plan.id
      }

      // Verifica duplicação
      const exists = await db.query.tenants.findFirst({
        where: (t, { or, eq }) => or(eq(t.slug, body.slug), eq(t.cnpj, body.cnpj)),
      })
      if (exists) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Já existe um tenant com este slug ou CNPJ',
        })
      }

      // 1. Insere o registro como 'pending'
      const [inserted] = await db
        .insert(publicSchema.tenants)
        .values({
          slug: body.slug,
          schemaName,
          name: body.name,
          cnpj: body.cnpj,
          state: body.state,
          city: body.city,
          ibgeCode: body.ibgeCode,
          contactEmail: body.contactEmail ?? null,
          contactPhone: body.contactPhone ?? null,
          planId,
          status: 'pending',
        })
        .returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao inserir tenant')

      // 2. PROVISIONA: cria schema + aplica migrations + seed
      try {
        const result = await provisionTenant(env.DATABASE_URL, schemaName)

        // 3. Marca como ativo
        const [updated] = await db
          .update(publicSchema.tenants)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(publicSchema.tenants.id, inserted.id))
          .returning()

        if (!updated) throw app.httpErrors.internalServerError('Falha ao ativar tenant')

        // 4. Vincula módulos do plano (se houver)
        if (planId) {
          const planModules = await db.query.planModules.findMany({
            where: (pm, { eq }) => eq(pm.planId, planId!),
          })
          for (const pm of planModules) {
            await db
              .insert(publicSchema.tenantModules)
              .values({ tenantId: inserted.id, moduleId: pm.moduleId })
              .onConflictDoNothing()
          }
        }

        await db.insert(publicSchema.auditLog).values({
          actorType: 'master',
          actorId: req.master!.sub,
          tenantId: inserted.id,
          action: 'tenant.provision',
          resource: 'tenant',
          resourceId: inserted.id,
          metadata: { migrationsApplied: result.migrationsApplied, seedApplied: result.seedApplied },
          ipAddress: req.ip,
        })

        return reply.status(201).send({
          ...serializeTenant(updated),
          provisioning: result,
        })
      } catch (err) {
        req.log.error({ err, schemaName }, 'falha no provisioning — fazendo rollback')

        // Rollback: dropa schema (se foi criado) e marca tenant como 'archived'
        await dropTenantSchema(env.DATABASE_URL, schemaName).catch(() => undefined)
        await db
          .update(publicSchema.tenants)
          .set({ status: 'archived', deletedAt: new Date() })
          .where(eq(publicSchema.tenants.id, inserted.id))

        throw app.httpErrors.internalServerError(
          `Provisioning falhou: ${(err as Error).message}`,
        )
      }
    },
  )

  // ─── GET /admin/tenants/:id ─────────────────────────────
  app.get(
    '/:id',
    {
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: tenantOut },
      },
    },
    async (req) => {
      const row = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!row) throw app.httpErrors.notFound('Tenant não encontrado')
      return serializeTenant(row)
    },
  )

  // ─── PATCH /admin/tenants/:id ───────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: updateTenantBody,
        response: { 200: tenantOut },
      },
    },
    async (req) => {
      const [row] = await db
        .update(publicSchema.tenants)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(eq(publicSchema.tenants.id, req.params.id), isNull(publicSchema.tenants.deletedAt)),
        )
        .returning()

      if (!row) throw app.httpErrors.notFound('Tenant não encontrado')
      return serializeTenant(row)
    },
  )

  // ─── DELETE /admin/tenants/:id (soft delete) ────────────
  app.delete(
    '/:id',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const result = await db
        .update(publicSchema.tenants)
        .set({ deletedAt: new Date(), status: 'suspended' })
        .where(
          and(eq(publicSchema.tenants.id, req.params.id), isNull(publicSchema.tenants.deletedAt)),
        )
        .returning({ id: publicSchema.tenants.id })

      if (result.length === 0) throw app.httpErrors.notFound('Tenant não encontrado')

      return reply.status(204).send(null)
    },
  )

  // ─── POST /admin/tenants/:id/archive (drop schema!) ─────
  app.post(
    '/:id/archive',
    {
      preHandler: async (req) => req.requireMasterRole('super_admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ confirmCnpj: z.string() }),
        response: { 200: z.object({ archived: z.boolean(), schemaDropped: z.boolean() }) },
      },
    },
    async (req) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq }) => eq(t.id, req.params.id),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      // Confirmação dupla para evitar acidente
      if (req.body.confirmCnpj !== tenant.cnpj) {
        throw app.httpErrors.badRequest('CNPJ de confirmação não bate')
      }

      await dropTenantSchema(env.DATABASE_URL, tenant.schemaName)

      await db
        .update(publicSchema.tenants)
        .set({ status: 'archived', deletedAt: new Date() })
        .where(eq(publicSchema.tenants.id, tenant.id))

      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: req.master!.sub,
        tenantId: tenant.id,
        action: 'tenant.archive',
        resource: 'tenant',
        resourceId: tenant.id,
        ipAddress: req.ip,
      })

      return { archived: true, schemaDropped: true }
    },
  )

  // ─── GET /admin/tenants/:id/migrations ──────────────────
  app.get(
    '/:id/migrations',
    {
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            schemaName: z.string(),
            pending: z.array(z.string()),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      const pending = await listPendingMigrations(env.DATABASE_URL, tenant.schemaName)
      return { schemaName: tenant.schemaName, pending }
    },
  )

  // ─── POST /admin/tenants/:id/migrate ────────────────────
  app.post(
    '/:id/migrate',
    {
      preHandler: async (req) => req.requireMasterRole('super_admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ dryRun: z.boolean().default(false) }),
        response: {
          200: z.object({
            applied: z.array(z.string()),
            skipped: z.array(z.string()),
            failed: z.array(z.object({ name: z.string(), error: z.string() })),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      const result = await applyTenantMigrationsIncremental(
        env.DATABASE_URL,
        tenant.schemaName,
        { dryRun: req.body.dryRun, appliedBy: req.master!.email },
      )

      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: req.master!.sub,
        tenantId: tenant.id,
        action: req.body.dryRun ? 'tenant.migrate.dryrun' : 'tenant.migrate',
        resource: 'tenant',
        resourceId: tenant.id,
        metadata: {
          applied: result.applied,
          failed: result.failed.map((f) => f.name),
        },
        ipAddress: req.ip,
      })

      return result
    },
  )

  // ─── GET /admin/tenants/:id/modules ──────────────────────
  app.get(
    '/:id/modules',
    {
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            tenant: z.object({ id: z.string().uuid(), name: z.string(), planId: z.string().uuid().nullable() }),
            modules: z.array(z.object({
              id: z.string().uuid(),
              slug: z.string(),
              name: z.string(),
              category: z.string(),
              description: z.string().nullable(),
              isActive: z.boolean(),
              activatedAt: z.string().nullable(),
              deactivatedAt: z.string().nullable(),
              inPlan: z.boolean(),
            })),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      const allModules = await db.query.modules.findMany({
        where: (m, { eq }) => eq(m.active, true),
        orderBy: (m, { asc }) => [asc(m.category), asc(m.name)],
      })

      const tenantModulesRows = await db
        .select()
        .from(publicSchema.tenantModules)
        .where(eq(publicSchema.tenantModules.tenantId, tenant.id))

      const planModulesRows = tenant.planId
        ? await db
            .select({ moduleId: publicSchema.planModules.moduleId })
            .from(publicSchema.planModules)
            .where(eq(publicSchema.planModules.planId, tenant.planId))
        : []

      const inPlanSet = new Set(planModulesRows.map((p) => p.moduleId))
      const tmMap = new Map(tenantModulesRows.map((tm) => [tm.moduleId, tm]))

      return {
        tenant: { id: tenant.id, name: tenant.name, planId: tenant.planId },
        modules: allModules.map((m) => {
          const tm = tmMap.get(m.id)
          return {
            id: m.id,
            slug: m.slug,
            name: m.name,
            category: m.category,
            description: m.description,
            isActive: !!tm && !tm.deactivatedAt,
            activatedAt: tm?.activatedAt.toISOString() ?? null,
            deactivatedAt: tm?.deactivatedAt?.toISOString() ?? null,
            inPlan: inPlanSet.has(m.id),
          }
        }),
      }
    },
  )

  // ─── POST /admin/tenants/:id/modules ─────────────────────
  app.post(
    '/:id/modules',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          moduleId: z.string().uuid(),
          reason: z.string().max(500).optional(),
        }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      const mod = await db.query.modules.findFirst({
        where: (m, { eq, and: a }) => a(eq(m.id, req.body.moduleId), eq(m.active, true)),
      })
      if (!mod) throw app.httpErrors.notFound('Módulo não encontrado ou inativo')

      const existing = await db.query.tenantModules.findFirst({
        where: (tm, { eq, and: a }) => a(eq(tm.tenantId, tenant.id), eq(tm.moduleId, mod.id)),
      })

      if (existing) {
        if (!existing.deactivatedAt) {
          await publishInvalidation(app, tenant.id)
          return reply.status(204).send(null)
        }
        await db
          .update(publicSchema.tenantModules)
          .set({ deactivatedAt: null, activatedAt: new Date() })
          .where(
            and(
              eq(publicSchema.tenantModules.tenantId, tenant.id),
              eq(publicSchema.tenantModules.moduleId, mod.id),
            ),
          )
      } else {
        await db.insert(publicSchema.tenantModules).values({
          tenantId: tenant.id,
          moduleId: mod.id,
        })
      }

      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: req.master!.sub,
        tenantId: tenant.id,
        action: 'tenant.module.activate',
        resource: 'module',
        resourceId: mod.id,
        metadata: { moduleSlug: mod.slug, reason: req.body.reason },
        ipAddress: req.ip,
      })

      await publishInvalidation(app, tenant.id)
      return reply.status(204).send(null)
    },
  )

  // ─── DELETE /admin/tenants/:id/modules/:moduleId ─────────
  app.delete(
    '/:id/modules/:moduleId',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid(), moduleId: z.string().uuid() }),
        body: z.object({ reason: z.string().min(10).max(500) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const result = await db
        .update(publicSchema.tenantModules)
        .set({ deactivatedAt: new Date() })
        .where(
          and(
            eq(publicSchema.tenantModules.tenantId, req.params.id),
            eq(publicSchema.tenantModules.moduleId, req.params.moduleId),
            isNull(publicSchema.tenantModules.deactivatedAt),
          ),
        )
        .returning({ id: publicSchema.tenantModules.tenantId })

      if (result.length === 0) {
        throw app.httpErrors.notFound('Vínculo tenant/módulo não encontrado ou já desativado')
      }

      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: req.master!.sub,
        tenantId: req.params.id,
        action: 'tenant.module.deactivate',
        resource: 'module',
        resourceId: req.params.moduleId,
        metadata: { reason: req.body.reason },
        ipAddress: req.ip,
      })

      await publishInvalidation(app, req.params.id)
      return reply.status(204).send(null)
    },
  )

  // ─── POST /admin/tenants/:id/apply-plan ──────────────────
  app.post(
    '/:id/apply-plan',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          planId: z.string().uuid(),
          replacePlan: z.boolean().default(false),
        }),
        response: {
          200: z.object({
            activated: z.array(z.string()),
            deactivated: z.array(z.string()),
            unchanged: z.array(z.string()),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq, and, isNull }) => and(eq(t.id, req.params.id), isNull(t.deletedAt)),
      })
      if (!tenant) throw app.httpErrors.notFound('Tenant não encontrado')

      const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, req.body.planId) })
      if (!plan) throw app.httpErrors.notFound('Plano não encontrado')

      const planMods = await db
        .select({ moduleId: publicSchema.planModules.moduleId, slug: publicSchema.modules.slug })
        .from(publicSchema.planModules)
        .innerJoin(publicSchema.modules, eq(publicSchema.planModules.moduleId, publicSchema.modules.id))
        .where(eq(publicSchema.planModules.planId, plan.id))

      const tenantMods = await db
        .select({
          moduleId: publicSchema.tenantModules.moduleId,
          slug: publicSchema.modules.slug,
          deactivatedAt: publicSchema.tenantModules.deactivatedAt,
        })
        .from(publicSchema.tenantModules)
        .innerJoin(publicSchema.modules, eq(publicSchema.tenantModules.moduleId, publicSchema.modules.id))
        .where(eq(publicSchema.tenantModules.tenantId, tenant.id))

      const planSet = new Set(planMods.map((p) => p.moduleId))
      const activeTenantSet = new Set(tenantMods.filter((tm) => !tm.deactivatedAt).map((tm) => tm.moduleId))

      const toActivate = planMods.filter((p) => !activeTenantSet.has(p.moduleId))
      const toDeactivate = req.body.replacePlan
        ? tenantMods.filter((tm) => !tm.deactivatedAt && !planSet.has(tm.moduleId))
        : []
      const unchanged = planMods.filter((p) => activeTenantSet.has(p.moduleId))

      for (const m of toActivate) {
        const existing = tenantMods.find((tm) => tm.moduleId === m.moduleId)
        if (existing) {
          await db
            .update(publicSchema.tenantModules)
            .set({ deactivatedAt: null, activatedAt: new Date() })
            .where(and(
              eq(publicSchema.tenantModules.tenantId, tenant.id),
              eq(publicSchema.tenantModules.moduleId, m.moduleId),
            ))
        } else {
          await db.insert(publicSchema.tenantModules).values({
            tenantId: tenant.id,
            moduleId: m.moduleId,
          })
        }
      }

      for (const m of toDeactivate) {
        await db
          .update(publicSchema.tenantModules)
          .set({ deactivatedAt: new Date() })
          .where(and(
            eq(publicSchema.tenantModules.tenantId, tenant.id),
            eq(publicSchema.tenantModules.moduleId, m.moduleId),
          ))
      }

      await db
        .update(publicSchema.tenants)
        .set({ planId: plan.id, updatedAt: new Date() })
        .where(eq(publicSchema.tenants.id, tenant.id))

      await db.insert(publicSchema.auditLog).values({
        actorType: 'master',
        actorId: req.master!.sub,
        tenantId: tenant.id,
        action: 'tenant.plan.apply',
        resource: 'plan',
        resourceId: plan.id,
        metadata: {
          planSlug: plan.slug,
          replacePlan: req.body.replacePlan,
          activated: toActivate.map((m) => m.slug),
          deactivated: toDeactivate.map((m) => m.slug),
        },
        ipAddress: req.ip,
      })

      await publishInvalidation(app, tenant.id)

      return {
        activated: toActivate.map((m) => m.slug),
        deactivated: toDeactivate.map((m) => m.slug),
        unchanged: unchanged.map((m) => m.slug),
      }
    },
  )

  // ─── POST /admin/tenants/:id/modules/invalidate-cache ───
  app.post(
    '/:id/modules/invalidate-cache',
    {
      preHandler: async (req) => req.requireMasterRole('admin'),
      schema: {
        tags: ['admin-tenants'],
        security: [{ bearerAuth: [] }, { cookieAuth: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await publishInvalidation(app, req.params.id)
      return reply.status(204).send(null)
    },
  )
}

function serializeTenant(row: typeof publicSchema.tenants.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    schemaName: row.schemaName,
    name: row.name,
    cnpj: row.cnpj,
    state: row.state,
    city: row.city,
    ibgeCode: row.ibgeCode,
    status: row.status,
    planId: row.planId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    createdAt: row.createdAt.toISOString(),
  }
}
