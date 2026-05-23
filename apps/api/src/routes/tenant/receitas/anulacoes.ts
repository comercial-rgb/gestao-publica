import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { validarDataArrecadacao } from '../../../lib/fiscal.js'

export const anulacoesRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:anular'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          arrecadacaoId: z.string().uuid(),
          dataAnulacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          valor: z.coerce.number().positive().multipleOf(0.01),
          motivo: z.string().min(20).max(2000),
          documentoAutorizacao: z.string().max(100).optional(),
        }),
        response: {
          201: z.object({ id: z.string().uuid(), saldoRemanescente: z.string() }),
          422: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      // Validar período fiscal
      let mesFiscalId: string
      try {
        const periodo = await validarDataArrecadacao(env.DATABASE_URL, tenant.schemaName, req.body.dataAnulacao)
        mesFiscalId = periodo.mesFiscalId
      } catch (err) {
        return reply.status(422).send({ error: 'PeriodoFiscalFechado', message: (err as Error).message })
      }

      // Buscar arrecadação
      const arrecadacao = await db.query.receitasArrecadacoes.findFirst({
        where: (a, { eq }) => eq(a.id, req.body.arrecadacaoId),
      })
      if (!arrecadacao) throw app.httpErrors.notFound('Arrecadação não encontrada')
      if (arrecadacao.anuladoEm) {
        return reply.status(422).send({ error: 'JaAnulada', message: 'Arrecadação já foi totalmente anulada' })
      }

      // Verificar saldo disponível para anulação
      const anulPrevias = await db.execute(sql`
        SELECT COALESCE(SUM(valor::numeric), 0)::text as total
        FROM receitas_anulacoes WHERE arrecadacao_id = ${req.body.arrecadacaoId}
      `)
      const totalAnuladoPrevio = Number((anulPrevias as unknown as Array<Record<string, string>>)[0]?.total ?? '0')
      const valorOriginal = Number(arrecadacao.valor)
      const saldoDisponivel = valorOriginal - totalAnuladoPrevio

      if (req.body.valor > saldoDisponivel + 0.001) {
        return reply.status(422).send({
          error: 'ValorExcedido',
          message: `Valor de anulação (R$ ${req.body.valor.toFixed(2)}) excede o saldo disponível (R$ ${saldoDisponivel.toFixed(2)})`,
        })
      }

      const valorStr = req.body.valor.toFixed(2)
      const [inserted] = await db.insert(tenantSchema.receitasAnulacoes).values({
        arrecadacaoId: req.body.arrecadacaoId,
        mesFiscalId,
        dataAnulacao: req.body.dataAnulacao,
        valor: valorStr,
        motivo: req.body.motivo,
        documentoAutorizacao: req.body.documentoAutorizacao ?? null,
        createdBy: req.tenantAuth!.sub,
      }).returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao registrar anulação')

      // Se anulação total, marcar arrecadação
      const novoSaldo = saldoDisponivel - req.body.valor
      if (novoSaldo <= 0.001) {
        await db.update(tenantSchema.receitasArrecadacoes)
          .set({ anuladoEm: new Date(), anuladoPorUserId: req.tenantAuth!.sub })
          .where(eq(tenantSchema.receitasArrecadacoes.id, req.body.arrecadacaoId))
      }

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.anulacao.create',
        resource: 'receita_anulacao',
        resourceId: inserted.id,
        after: { valor: valorStr, motivo: req.body.motivo, arrecadacaoId: req.body.arrecadacaoId },
        ipAddress: req.ip,
      })

      return reply.status(201).send({
        id: inserted.id,
        saldoRemanescente: Math.max(0, novoSaldo).toFixed(2),
      })
    },
  )

  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          arrecadacaoId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
        response: {
          200: z.array(z.object({
            id: z.string().uuid(),
            arrecadacaoId: z.string().uuid(),
            dataAnulacao: z.string(),
            valor: z.string(),
            motivo: z.string(),
            documentoAutorizacao: z.string().nullable(),
            createdAt: z.string(),
          })),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const rows = await db.query.receitasAnulacoes.findMany({
        where: req.query.arrecadacaoId
          ? (a, { eq }) => eq(a.arrecadacaoId, req.query.arrecadacaoId!)
          : undefined,
        orderBy: (a, { desc }) => desc(a.createdAt),
        limit: req.query.limit,
      })

      return rows.map((r) => ({
        id: r.id,
        arrecadacaoId: r.arrecadacaoId,
        dataAnulacao: r.dataAnulacao.toString(),
        valor: r.valor,
        motivo: r.motivo,
        documentoAutorizacao: r.documentoAutorizacao,
        createdAt: r.createdAt.toISOString(),
      }))
    },
  )
}
