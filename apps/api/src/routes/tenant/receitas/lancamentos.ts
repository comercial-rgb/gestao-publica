import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

const lancamentoOut = z.object({
  id: z.string().uuid(),
  exercicioId: z.string().uuid(),
  exercicioAno: z.number(),
  tipoReceitaId: z.string().uuid(),
  naturezaCodigo: z.string(),
  naturezaDescricao: z.string(),
  entidadeNome: z.string(),
  valorPrevistoInicial: z.string(),
  valorAtualizado: z.string(),
  memoriaCalculo: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.string(),
})

const saldoOut = z.object({
  valorPrevistoInicial: z.string(),
  valorAtualizado: z.string(),
  valorArrecadado: z.string(),
  valorAnulado: z.string(),
  valorArrecadadoLiquido: z.string(),
  saldoARealizar: z.string(),
  percentualExecucao: z.number(),
})

export const lancamentosRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          exercicioId: z.string().uuid().optional(),
          exercicioAno: z.coerce.number().int().optional(),
          entidadeId: z.string().uuid().optional(),
        }),
        response: { 200: z.array(lancamentoOut) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const rows = await db
        .select({
          id: tenantSchema.receitasLancamentos.id,
          exercicioId: tenantSchema.receitasLancamentos.exercicioId,
          exercicioAno: tenantSchema.exercicios.ano,
          tipoReceitaId: tenantSchema.receitasLancamentos.tipoReceitaId,
          naturezaCodigo: tenantSchema.receitasNaturezas.codigoCompleto,
          naturezaDescricao: tenantSchema.receitasNaturezas.descricao,
          entidadeNome: tenantSchema.entidades.nome,
          entidadeId: tenantSchema.entidades.id,
          valorPrevistoInicial: tenantSchema.receitasLancamentos.valorPrevistoInicial,
          valorAtualizado: tenantSchema.receitasLancamentos.valorAtualizado,
          memoriaCalculo: tenantSchema.receitasLancamentos.memoriaCalculo,
          ativo: tenantSchema.receitasLancamentos.ativo,
          createdAt: tenantSchema.receitasLancamentos.createdAt,
        })
        .from(tenantSchema.receitasLancamentos)
        .innerJoin(tenantSchema.exercicios, eq(tenantSchema.receitasLancamentos.exercicioId, tenantSchema.exercicios.id))
        .innerJoin(tenantSchema.receitasTipos, eq(tenantSchema.receitasLancamentos.tipoReceitaId, tenantSchema.receitasTipos.id))
        .innerJoin(tenantSchema.receitasNaturezas, eq(tenantSchema.receitasTipos.naturezaId, tenantSchema.receitasNaturezas.id))
        .innerJoin(tenantSchema.entidades, eq(tenantSchema.receitasTipos.entidadeId, tenantSchema.entidades.id))
        .where(
          and(
            req.query.exercicioId ? eq(tenantSchema.receitasLancamentos.exercicioId, req.query.exercicioId) : undefined,
            req.query.exercicioAno ? eq(tenantSchema.exercicios.ano, req.query.exercicioAno) : undefined,
            req.query.entidadeId ? eq(tenantSchema.entidades.id, req.query.entidadeId) : undefined,
          ),
        )

      return rows.map((r) => ({
        id: r.id, exercicioId: r.exercicioId, exercicioAno: r.exercicioAno,
        tipoReceitaId: r.tipoReceitaId, naturezaCodigo: r.naturezaCodigo,
        naturezaDescricao: r.naturezaDescricao, entidadeNome: r.entidadeNome,
        valorPrevistoInicial: r.valorPrevistoInicial, valorAtualizado: r.valorAtualizado,
        memoriaCalculo: r.memoriaCalculo, ativo: r.ativo, createdAt: r.createdAt.toISOString(),
      }))
    },
  )

  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:write'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          exercicioId: z.string().uuid(),
          tipoReceitaId: z.string().uuid(),
          valorPrevistoInicial: z.coerce.number().positive().multipleOf(0.01),
          memoriaCalculo: z.string().max(2000).optional(),
        }),
        response: {
          201: z.object({ id: z.string().uuid() }),
          422: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exercicio = await db.query.exercicios.findFirst({
        where: (e, { eq }) => eq(e.id, req.body.exercicioId),
      })
      if (!exercicio) throw app.httpErrors.notFound('Exercício não encontrado')
      if (exercicio.status === 'encerrado') {
        return reply.status(422).send({ error: 'ExercicioEncerrado', message: 'Exercício encerrado' })
      }

      const tipo = await db.query.receitasTipos.findFirst({
        where: (t, { eq }) => eq(t.id, req.body.tipoReceitaId),
      })
      if (!tipo || !tipo.ativo) throw app.httpErrors.notFound('Tipo de receita não encontrado ou inativo')

      const dup = await db.query.receitasLancamentos.findFirst({
        where: (l, { eq, and: a }) => a(eq(l.exercicioId, req.body.exercicioId), eq(l.tipoReceitaId, req.body.tipoReceitaId)),
      })
      if (dup) throw app.httpErrors.conflict('Já existe lançamento para este tipo neste exercício')

      const valorStr = req.body.valorPrevistoInicial.toFixed(2)
      const [inserted] = await db.insert(tenantSchema.receitasLancamentos).values({
        exercicioId: req.body.exercicioId,
        tipoReceitaId: req.body.tipoReceitaId,
        valorPrevistoInicial: valorStr,
        valorAtualizado: valorStr,
        memoriaCalculo: req.body.memoriaCalculo ?? null,
        ativo: true,
        createdBy: req.tenantAuth!.sub,
      }).returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar lançamento')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.lancamento.create',
        resource: 'receita_lancamento',
        resourceId: inserted.id,
        after: { valor: valorStr },
        ipAddress: req.ip,
      })

      return reply.status(201).send({ id: inserted.id })
    },
  )

  app.get(
    '/:id/saldo',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: saldoOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const lancamento = await db.query.receitasLancamentos.findFirst({
        where: (l, { eq }) => eq(l.id, req.params.id),
      })
      if (!lancamento) throw app.httpErrors.notFound('Lançamento não encontrado')

      const arrecResult = await db.execute(sql`
        SELECT COALESCE(SUM(valor::numeric), 0)::text as total
        FROM receitas_arrecadacoes WHERE lancamento_id = ${req.params.id} AND anulado_em IS NULL
      `)
      const anulResult = await db.execute(sql`
        SELECT COALESCE(SUM(an.valor::numeric), 0)::text as total
        FROM receitas_anulacoes an
        INNER JOIN receitas_arrecadacoes ar ON ar.id = an.arrecadacao_id
        WHERE ar.lancamento_id = ${req.params.id}
      `)

      const valorArrecadado = Number((arrecResult as unknown as Array<Record<string, string>>)[0]?.total ?? '0')
      const valorAnulado = Number((anulResult as unknown as Array<Record<string, string>>)[0]?.total ?? '0')
      const valorAtualizado = Number(lancamento.valorAtualizado)
      const liquido = valorArrecadado - valorAnulado
      const saldo = valorAtualizado - liquido
      const pct = valorAtualizado > 0 ? (liquido / valorAtualizado) * 100 : 0

      return {
        valorPrevistoInicial: lancamento.valorPrevistoInicial,
        valorAtualizado: lancamento.valorAtualizado,
        valorArrecadado: valorArrecadado.toFixed(2),
        valorAnulado: valorAnulado.toFixed(2),
        valorArrecadadoLiquido: liquido.toFixed(2),
        saldoARealizar: saldo.toFixed(2),
        percentualExecucao: Math.round(pct * 100) / 100,
      }
    },
  )

  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('receitas:write'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          valorAtualizado: z.coerce.number().positive().multipleOf(0.01),
          memoriaCalculo: z.string().max(2000).optional(),
          justificativa: z.string().min(10).max(500),
        }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const before = await db.query.receitasLancamentos.findFirst({
        where: (l, { eq }) => eq(l.id, req.params.id),
      })
      if (!before) throw app.httpErrors.notFound('Lançamento não encontrado')

      const novoValor = req.body.valorAtualizado.toFixed(2)
      await db.update(tenantSchema.receitasLancamentos)
        .set({ valorAtualizado: novoValor, memoriaCalculo: req.body.memoriaCalculo ?? before.memoriaCalculo, updatedAt: new Date() })
        .where(eq(tenantSchema.receitasLancamentos.id, req.params.id))

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.lancamento.update',
        resource: 'receita_lancamento',
        resourceId: req.params.id,
        before: { valorAtualizado: before.valorAtualizado },
        after: { valorAtualizado: novoValor, justificativa: req.body.justificativa },
        ipAddress: req.ip,
      })

      return reply.status(204).send(null)
    },
  )
}
