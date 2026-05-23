import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and } from '@saas-municipal/database'
import { env } from '../../env.js'

export const tenantFiscalRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
  })

  // ─── GET /tenant/fiscal/exercicios ───────────────────
  app.get(
    '/exercicios',
    {
      preHandler: async (req) => req.requirePermission('fiscal:read'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        response: {
          200: z.array(z.object({
            id: z.string().uuid(),
            ano: z.number(),
            status: z.string(),
            dataInicio: z.string(),
            dataFim: z.string(),
            encerradoEm: z.string().nullable(),
          })),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const rows = await db.query.exercicios.findMany({
        orderBy: (e, { desc }) => desc(e.ano),
      })
      return rows.map((e) => ({
        id: e.id,
        ano: e.ano,
        status: e.status,
        dataInicio: e.dataInicio.toString(),
        dataFim: e.dataFim.toString(),
        encerradoEm: e.encerradoEm?.toISOString() ?? null,
      }))
    },
  )

  // ─── POST /tenant/fiscal/exercicios ──────────────────
  app.post(
    '/exercicios',
    {
      preHandler: async (req) => req.requirePermission('fiscal:abrir_exercicio'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({ ano: z.number().int().min(2000).max(2100) }),
        response: { 201: z.object({ id: z.string().uuid(), ano: z.number() }) },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const { ano } = req.body

      const existing = await db.query.exercicios.findFirst({ where: (e, { eq }) => eq(e.ano, ano) })
      if (existing) throw app.httpErrors.conflict(`Exercício ${ano} já existe`)

      const [exercicio] = await db.insert(tenantSchema.exercicios).values({
        ano,
        dataInicio: `${ano}-01-01`,
        dataFim: `${ano}-12-31`,
        status: 'aberto',
      }).returning()

      if (!exercicio) throw app.httpErrors.internalServerError('Falha ao criar exercício')

      await db.insert(tenantSchema.mesesFiscais).values(
        Array.from({ length: 12 }, (_, i) => {
          const mes = i + 1
          const lastDay = new Date(ano, mes, 0).getDate()
          return {
            exercicioId: exercicio.id,
            mes,
            status: 'aberto' as const,
            dataInicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
            dataFim: `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          }
        }),
      )

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'fiscal.exercicio.criar',
        resource: 'exercicio',
        resourceId: exercicio.id,
        after: { ano },
        ipAddress: req.ip,
      })

      return reply.status(201).send({ id: exercicio.id, ano: exercicio.ano })
    },
  )

  // ─── POST /tenant/fiscal/exercicios/:id/encerrar ─────
  app.post(
    '/exercicios/:id/encerrar',
    {
      preHandler: async (req) => req.requirePermission('fiscal:encerrar_exercicio'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ confirmAno: z.number() }),
        response: { 200: z.object({ status: z.string() }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exercicio = await db.query.exercicios.findFirst({ where: (e, { eq }) => eq(e.id, req.params.id) })
      if (!exercicio) throw app.httpErrors.notFound('Exercício não encontrado')
      if (req.body.confirmAno !== exercicio.ano) {
        throw app.httpErrors.badRequest('Ano de confirmação não confere')
      }
      if (exercicio.status === 'encerrado') {
        throw app.httpErrors.conflict('Exercício já encerrado')
      }

      const mesesAbertos = await db.query.mesesFiscais.findMany({
        where: (m, { eq, and, ne }) => and(eq(m.exercicioId, exercicio.id), ne(m.status, 'fechado')),
      })
      if (mesesAbertos.length > 0) {
        throw app.httpErrors.conflict(
          `Não é possível encerrar: ${mesesAbertos.length} mês(es) ainda aberto(s) ou bloqueado(s)`,
        )
      }

      await db.update(tenantSchema.exercicios).set({
        status: 'encerrado',
        encerradoEm: new Date(),
        encerradoPorUserId: req.tenantAuth!.sub,
        updatedAt: new Date(),
      }).where(eq(tenantSchema.exercicios.id, exercicio.id))

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'fiscal.exercicio.encerrar',
        resource: 'exercicio',
        resourceId: exercicio.id,
        before: { status: exercicio.status },
        after: { status: 'encerrado' },
        ipAddress: req.ip,
      })

      return { status: 'encerrado' }
    },
  )

  // ─── GET /tenant/fiscal/exercicios/:id/meses ─────────
  app.get(
    '/exercicios/:id/meses',
    {
      preHandler: async (req) => req.requirePermission('fiscal:read'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.array(z.object({
            id: z.string().uuid(),
            mes: z.number(),
            status: z.string(),
            dataInicio: z.string(),
            dataFim: z.string(),
            fechadoEm: z.string().nullable(),
            reaberturas: z.number(),
          })),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const rows = await db.query.mesesFiscais.findMany({
        where: (m, { eq }) => eq(m.exercicioId, req.params.id),
        orderBy: (m, { asc }) => asc(m.mes),
      })
      return rows.map((m) => ({
        id: m.id,
        mes: m.mes,
        status: m.status,
        dataInicio: m.dataInicio.toString(),
        dataFim: m.dataFim.toString(),
        fechadoEm: m.fechadoEm?.toISOString() ?? null,
        reaberturas: m.reaberturas,
      }))
    },
  )

  // ─── POST /tenant/fiscal/meses/:id/fechar ────────────
  app.post(
    '/meses/:id/fechar',
    {
      preHandler: async (req) => req.requirePermission('fiscal:fechar_mes'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ status: z.string() }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db.update(tenantSchema.mesesFiscais)
        .set({
          status: 'fechado',
          fechadoEm: new Date(),
          fechadoPorUserId: req.tenantAuth!.sub,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tenantSchema.mesesFiscais.id, req.params.id),
          eq(tenantSchema.mesesFiscais.status, 'aberto'),
        ))
        .returning()

      if (!updated) throw app.httpErrors.conflict('Mês não está aberto ou não existe')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'fiscal.mes.fechar',
        resource: 'mes_fiscal',
        resourceId: updated.id,
        ipAddress: req.ip,
      })

      return { status: 'fechado' }
    },
  )

  // ─── POST /tenant/fiscal/meses/:id/reabrir ───────────
  app.post(
    '/meses/:id/reabrir',
    {
      preHandler: async (req) => req.requirePermission('fiscal:reabrir_mes'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ motivo: z.string().min(20).max(500) }),
        response: { 200: z.object({ status: z.string(), reaberturas: z.number() }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const mesAtual = await db.query.mesesFiscais.findFirst({
        where: (m, { eq }) => eq(m.id, req.params.id),
      })
      if (!mesAtual) throw app.httpErrors.notFound('Mês não encontrado')
      if (mesAtual.status === 'bloqueado') throw app.httpErrors.forbidden('Mês bloqueado pela controladoria')
      if (mesAtual.status === 'aberto') throw app.httpErrors.conflict('Mês já está aberto')

      const [updated] = await db.update(tenantSchema.mesesFiscais)
        .set({
          status: 'aberto',
          fechadoEm: null,
          fechadoPorUserId: null,
          reaberturas: mesAtual.reaberturas + 1,
          observacoes: req.body.motivo,
          updatedAt: new Date(),
        })
        .where(eq(tenantSchema.mesesFiscais.id, req.params.id))
        .returning()

      if (!updated) throw app.httpErrors.internalServerError('Falha ao reabrir')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'fiscal.mes.reabrir',
        resource: 'mes_fiscal',
        resourceId: updated.id,
        after: { motivo: req.body.motivo, reaberturas: updated.reaberturas },
        ipAddress: req.ip,
      })

      return { status: 'aberto', reaberturas: updated.reaberturas }
    },
  )

  // ─── POST /tenant/fiscal/meses/:id/bloquear ──────────
  app.post(
    '/meses/:id/bloquear',
    {
      preHandler: async (req) => req.requirePermission('fiscal:bloquear_mes'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ status: z.string() }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db.update(tenantSchema.mesesFiscais)
        .set({ status: 'bloqueado', updatedAt: new Date() })
        .where(eq(tenantSchema.mesesFiscais.id, req.params.id))
        .returning()

      if (!updated) throw app.httpErrors.notFound('Mês não encontrado')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'fiscal.mes.bloquear',
        resource: 'mes_fiscal',
        resourceId: updated.id,
        ipAddress: req.ip,
      })

      return { status: 'bloqueado' }
    },
  )

  // ─── GET /tenant/fiscal/atual ────────────────────────
  app.get(
    '/atual',
    {
      preHandler: async (req) => req.requirePermission('fiscal:read'),
      schema: {
        tags: ['tenant-fiscal'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        response: {
          200: z.object({
            exercicio: z.object({ id: z.string().uuid(), ano: z.number(), status: z.string() }),
            mes: z.object({ id: z.string().uuid(), mes: z.number(), status: z.string(), dataInicio: z.string(), dataFim: z.string() }),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const { resolverPeriodoFiscal } = await import('../../lib/fiscal.js')
      return resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, new Date())
    },
  )
}
